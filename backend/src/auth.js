const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { wrap, lockDown } = require('./util');
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

const issue = (u, household) => ({
  token: jwt.sign({ id: u.id, email: u.email }, SECRET, { expiresIn: '7d' }),
  user: { id: u.id, name: u.name, email: u.email, household },
});

const householdName = (value) => String(value || '').trim();
const validHouseholdPassword = (value) => String(value || '').length >= 8;
const recordActivity = (client, type, actorId, householdId, subjectId = null, details = {}) =>
  client.query('INSERT INTO household_activity(activity_type,actor_user_id,household_id,subject_user_id,details) VALUES($1,$2,$3,$4,$5)',
    [type, actorId, householdId, subjectId, details]);

async function findHousehold(client, name) {
  return (await client.query('SELECT id,name,password_hash,created_by,is_active FROM households WHERE lower(name)=lower($1)', [householdName(name)])).rows[0];
}

async function initAuthSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS households (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL,
    created_by INT REFERENCES users ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS households_name_unique ON households (lower(name))');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS active_household_id INT REFERENCES households ON DELETE SET NULL');
  await pool.query(`CREATE TABLE IF NOT EXISTS household_members (
    household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users ON DELETE CASCADE, joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (household_id,user_id))`);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true');
  await pool.query('ALTER TABLE households ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true');
  await pool.query(`CREATE TABLE IF NOT EXISTS household_activity (
    id BIGSERIAL PRIMARY KEY, activity_type TEXT NOT NULL, actor_user_id INT REFERENCES users ON DELETE SET NULL,
    household_id INT REFERENCES households ON DELETE SET NULL, subject_user_id INT REFERENCES users ON DELETE SET NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS household_reports (
    id BIGSERIAL PRIMARY KEY, household_id INT REFERENCES households ON DELETE SET NULL,
    household_name TEXT NOT NULL, reporter_user_id INT REFERENCES users ON DELETE SET NULL,
    reporter_name TEXT NOT NULL, reported_user_id INT REFERENCES users ON DELETE SET NULL,
    reported_name TEXT NOT NULL, description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
    admin_note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ)`);
  await pool.query('CREATE INDEX IF NOT EXISTS household_activity_created_idx ON household_activity(created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS household_reports_status_created_idx ON household_reports(status,created_at DESC)');
  await pool.query(`INSERT INTO household_activity(activity_type,actor_user_id,household_id,subject_user_id,details,created_at)
    SELECT 'user_registered',u.id,u.active_household_id,u.id,jsonb_build_object('email',u.email),u.created_at FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM household_activity a WHERE a.activity_type='user_registered' AND a.subject_user_id=u.id)`);
  await pool.query(`INSERT INTO household_activity(activity_type,actor_user_id,household_id,subject_user_id,details,created_at)
    SELECT 'household_created',h.created_by,h.id,NULL,jsonb_build_object('household_name',h.name),h.created_at FROM households h
    WHERE NOT EXISTS (SELECT 1 FROM household_activity a WHERE a.activity_type='household_created' AND a.household_id=h.id)`);
  await pool.query(`INSERT INTO household_activity(activity_type,actor_user_id,household_id,subject_user_id,details,created_at)
    SELECT 'member_joined',m.user_id,m.household_id,m.user_id,jsonb_build_object('household_name',h.name),m.joined_at
    FROM household_members m JOIN users u ON u.id=m.user_id JOIN households h ON h.id=m.household_id
    WHERE u.is_active=true AND u.active_household_id=h.id AND h.is_active=true
    AND NOT EXISTS (SELECT 1 FROM household_activity a WHERE a.activity_type='member_joined' AND a.household_id=h.id AND a.subject_user_id=u.id)`);

  const users = (await pool.query('SELECT id,name,password_hash FROM users WHERE active_household_id IS NULL')).rows;
  for (const user of users) {
    let name = `${user.name}'s Household`;
    let suffix = 1;
    while (await findHousehold(pool, name)) name = `${user.name}'s Household ${++suffix}`;
    const household = (await pool.query(
      'INSERT INTO households(name,password_hash,created_by) VALUES($1,$2,$3) RETURNING id',
      [name, user.password_hash, user.id])).rows[0];
    await pool.query('INSERT INTO household_members(household_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [household.id, user.id]);
    await pool.query('UPDATE users SET active_household_id=$1 WHERE id=$2', [household.id, user.id]);
  }

  const tables = ['expenses', 'income', 'budgets', 'bills', 'installments', 'goals', 'contacts', 'events'];
  for (const table of tables) {
    const exists = (await pool.query('SELECT to_regclass($1) AS name', [`public.${table}`])).rows[0].name;
    if (!exists) continue;
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS household_id INT REFERENCES households ON DELETE CASCADE`);
    const hasUserId = (await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='user_id'`,
      [table])).rowCount > 0;
    if (hasUserId) {
      await pool.query(`UPDATE ${table} d SET household_id=u.active_household_id FROM users u WHERE d.user_id=u.id AND d.household_id IS NULL`);
      await pool.query(`ALTER TABLE ${table} ALTER COLUMN user_id DROP NOT NULL`);
    }
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN household_id SET NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_household_idx ON ${table} (household_id)`);
  }
  await pool.query('ALTER TABLE households ENABLE ROW LEVEL SECURITY');
  await pool.query('ALTER TABLE household_members ENABLE ROW LEVEL SECURITY');
  await lockDown(pool, ['household_activity', 'household_reports']);
}

router.post('/signup', wrap(async (req, res) => {
  const { name, email, password, householdMode, householdName: requestedName, householdPassword } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8)
    return res.status(400).json({ error: 'Name, valid email and a password of 8+ characters are required.' });
  if (!['create', 'join'].includes(householdMode) || !householdName(requestedName) || !validHouseholdPassword(householdPassword))
    return res.status(400).json({ error: 'Choose a household and enter its password (8+ characters).' });
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let household = await findHousehold(client, requestedName);
    if (householdMode === 'create' && household) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A household with that name already exists.' });
    }
    if (householdMode === 'join' && (!household || !household.is_active || !(await bcrypt.compare(householdPassword, household.password_hash)))) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Household name or password is incorrect.' });
    }
    const { rows } = await client.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',
      [name.trim(), email.toLowerCase(), hash]);
    const user = rows[0];
    if (householdMode === 'create') {
      const householdHash = await bcrypt.hash(householdPassword, 12);
      household = (await client.query(
        'INSERT INTO households(name,password_hash,created_by) VALUES($1,$2,$3) RETURNING id,name',
        [householdName(requestedName), householdHash, user.id])).rows[0];
      await recordActivity(client, 'household_created', user.id, household.id, null, { household_name: household.name });
    }
    await client.query('INSERT INTO household_members(household_id,user_id) VALUES($1,$2)', [household.id, user.id]);
    await client.query('UPDATE users SET active_household_id=$1 WHERE id=$2', [household.id, user.id]);
    await recordActivity(client, 'user_registered', user.id, household.id, user.id, { email: user.email });
    await recordActivity(client, 'member_joined', user.id, household.id, user.id, { household_name: household.name });
    await client.query('COMMIT');
    res.status(201).json(issue(user, { id: household.id, name: household.name }));
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already registered.' });
    throw e;
  } finally {
    client.release();
  }
}));

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase()]);
  const ok = rows[0] && (await bcrypt.compare(password || '', rows[0].password_hash));
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });
  if (!rows[0].is_active) {
    const token = jwt.sign({ id: rows[0].id, purpose: 'reactivation' }, SECRET, { expiresIn: '15m' });
    return res.json({ reactivationRequired: true, token, user: { id: rows[0].id, name: rows[0].name, email: rows[0].email } });
  }
  const household = (await pool.query('SELECT id,name,created_by FROM households WHERE id=$1 AND is_active=true', [rows[0].active_household_id])).rows[0] || null;
  res.json(issue(rows[0], household));
}));

router.post('/reactivate', wrap(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  let payload;
  try { payload = jwt.verify(token || '', SECRET); } catch { return res.status(401).json({ error: 'Activation session expired. Sign in again.' }); }
  if (payload.purpose !== 'reactivation') return res.status(401).json({ error: 'Invalid activation session.' });
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query('UPDATE users SET password_hash=$1,is_active=true WHERE id=$2 AND is_active=false RETURNING id,name,email,active_household_id', [hash, payload.id]);
  if (!result.rowCount) return res.status(400).json({ error: 'This account is already active or no longer exists.' });
  const household = (await pool.query('SELECT id,name,created_by FROM households WHERE id=$1 AND is_active=true', [result.rows[0].active_household_id])).rows[0] || null;
  res.json(issue(result.rows[0], household));
}));

router.get('/households', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT h.id,h.name,(h.id=$1) AS active FROM households h
     JOIN household_members m ON m.household_id=h.id WHERE m.user_id=$2 AND h.is_active=true ORDER BY lower(h.name)`,
    [req.household ? req.household.id : null, req.user.id]);
  res.json(rows);
}));

router.get('/households/members', requireAuth, wrap(async (req, res) => {
  if (!req.household) return res.json([]);
  const { rows } = await pool.query(
    `SELECT u.id,u.name,(h.created_by=u.id) AS is_owner FROM household_members m
    JOIN users u ON u.id=m.user_id JOIN households h ON h.id=m.household_id AND h.is_active=true
    WHERE m.household_id=$1 AND u.active_household_id=$1 AND u.is_active=true ORDER BY lower(u.name),u.id`,
    [req.household.id]);
  res.json(rows);
}));

router.post('/households/members/:id/report', requireAuth, requireHousehold, wrap(async (req, res) => {
  const description = String(req.body && req.body.description || '').trim();
  if (description.length < 10 || description.length > 2000) return res.status(400).json({ error: 'Explain the concern in 10 to 2000 characters.' });
  const target = (await pool.query(`SELECT u.id,u.name FROM users u JOIN household_members m ON m.user_id=u.id
    WHERE u.id=$1 AND m.household_id=$2 AND u.active_household_id=$2 AND u.is_active=true`, [req.params.id, req.household.id])).rows[0];
  if (!target || target.id === req.user.id) return res.status(404).json({ error: 'Active household member not found.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO household_reports(household_id,household_name,reporter_user_id,reporter_name,reported_user_id,reported_name,description)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [req.household.id, req.household.name, req.user.id, req.user.name || 'Member', target.id, target.name, description]);
    await recordActivity(client, 'member_reported', req.user.id, req.household.id, target.id, { reported_name: target.name });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.status(201).json({ ok: true });
}));

router.post('/households/owner', requireAuth, requireHousehold, wrap(async (req, res) => {
  const nextOwnerId = Number(req.body && req.body.user_id);
  if (!Number.isInteger(nextOwnerId) || nextOwnerId === req.user.id) return res.status(400).json({ error: 'Choose another active household member.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const household = (await client.query('SELECT created_by FROM households WHERE id=$1 AND is_active=true FOR UPDATE', [req.household.id])).rows[0];
    if (!household || household.created_by !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the current household owner can transfer ownership.' });
    }
    const target = (await client.query(`SELECT u.name FROM users u JOIN household_members m ON m.user_id=u.id
      WHERE u.id=$1 AND m.household_id=$2 AND u.active_household_id=$2 AND u.is_active=true`, [nextOwnerId, req.household.id])).rows[0];
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The new owner must be an active member of this household.' });
    }
    await client.query('UPDATE households SET created_by=$1 WHERE id=$2', [nextOwnerId, req.household.id]);
    await recordActivity(client, 'ownership_transferred', req.user.id, req.household.id, nextOwnerId, { owner_name: target.name });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true });
}));

router.post('/households/enter', requireAuth, wrap(async (req, res) => {
  const { name, password } = req.body || {};
  const household = await findHousehold(pool, name);
  if (!household || !household.is_active || !(await bcrypt.compare(password || '', household.password_hash)))
    return res.status(401).json({ error: 'Household name or password is incorrect.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (req.household && req.household.id !== household.id)
      await recordActivity(client, 'member_left', req.user.id, req.household.id, req.user.id, { destination_household: household.name });
    const membership = await client.query('INSERT INTO household_members(household_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [household.id, req.user.id]);
    await client.query('UPDATE users SET active_household_id=$1 WHERE id=$2', [household.id, req.user.id]);
    if (membership.rowCount || !req.household || req.household.id !== household.id)
      await recordActivity(client, 'member_joined', req.user.id, household.id, req.user.id, { household_name: household.name });
    const assigned = await client.query('UPDATE households SET created_by=$1 WHERE id=$2 AND created_by IS NULL RETURNING id', [req.user.id, household.id]);
    if (assigned.rowCount) await recordActivity(client, 'ownership_assigned', req.user.id, household.id, req.user.id, { owner_name: req.user.name || 'Member', household_name: household.name });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ id: household.id, name: household.name, created_by: household.created_by });
}));

router.post('/households', requireAuth, wrap(async (req, res) => {
  const { name, password } = req.body || {};
  if (!householdName(name) || !validHouseholdPassword(password))
    return res.status(400).json({ error: 'Household name and password of 8+ characters are required.' });
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const household = (await client.query(
      'INSERT INTO households(name,password_hash,created_by) VALUES($1,$2,$3) RETURNING id,name',
      [householdName(name), hash, req.user.id])).rows[0];
    await client.query('INSERT INTO household_members(household_id,user_id) VALUES($1,$2)', [household.id, req.user.id]);
    await client.query('UPDATE users SET active_household_id=$1 WHERE id=$2', [household.id, req.user.id]);
    await recordActivity(client, 'household_created', req.user.id, household.id, null, { household_name: household.name });
    await recordActivity(client, 'member_joined', req.user.id, household.id, req.user.id, { household_name: household.name });
    await client.query('COMMIT');
    res.status(201).json(household);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'A household with that name already exists.' });
    throw e;
  } finally {
    client.release();
  }
}));

// Reset by existing email (the account username) + new password, as requested.
router.post('/reset-password', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if ((password || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const hash = await bcrypt.hash(password, 12);
  const r = await pool.query('UPDATE users SET password_hash=$1 WHERE email=$2', [hash, (email || '').toLowerCase().trim()]);
  if (!r.rowCount) return res.status(404).json({ error: 'No account found with that email.' });
  res.json({ ok: true });
}));

async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), SECRET);
    if (req.user.purpose || req.user.scope) return res.status(401).json({ error: 'Please sign in again.' });
    const account = (await pool.query(
      `SELECT u.id,u.name,u.email,u.is_active,
       CASE WHEN m.user_id IS NOT NULL THEN h.id END AS household_id,
       CASE WHEN m.user_id IS NOT NULL THEN h.name END AS household_name,
       CASE WHEN m.user_id IS NOT NULL THEN h.created_by END AS household_owner_id
       FROM users u LEFT JOIN households h ON h.id=u.active_household_id AND h.is_active=true
       LEFT JOIN household_members m ON m.household_id=h.id AND m.user_id=u.id WHERE u.id=$1`,
      [req.user.id])).rows[0];
    if (!account || !account.is_active) return res.status(401).json({ error: 'Account is deactivated.' });
    req.household = account.household_id ? { id: account.household_id, name: account.household_name, created_by: account.household_owner_id } : null;
    req.user = { ...req.user, name: account.name, email: account.email };
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
}
function requireHousehold(req, res, next) {
  if (!req.household) return res.status(409).json({ error: 'Choose an active household to continue.' });
  next();
}
module.exports = { router, requireAuth, requireHousehold, initAuthSchema };
