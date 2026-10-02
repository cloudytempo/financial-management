const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { wrap, lockDown, logActivity, notify, randomCode } = require('./util');
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

const issue = (u, household) => ({
  token: jwt.sign({ id: u.id, email: u.email }, SECRET, { expiresIn: '7d' }),
  user: { id: u.id, name: u.name, email: u.email, household },
});

const householdName = (value) => String(value || '').trim();
const validHouseholdPassword = (value) => String(value || '').length >= 8;
const recordActivity = logActivity;
const COMPLAINT_CATEGORIES = ['Harassment', 'Inappropriate behavior', 'Financial dispute', 'Property damage', 'Rule violation', 'Other'];
const BIRTHDAY_MARKER = 'auto_birthday';

async function findHouseholdByCode(client, publicId) {
  return (await client.query('SELECT id,name,public_id,address,password_hash,created_by,is_active FROM households WHERE public_id=$1', [String(publicId || '').trim().toUpperCase()])).rows[0];
}
async function findHouseholdByName(client, name) {
  return (await client.query('SELECT id,name,public_id,address,password_hash,created_by,is_active FROM households WHERE lower(name)=lower($1)', [householdName(name)])).rows[0];
}
async function uniqueHouseholdCode(client) {
  for (let i = 0; i < 20; i++) {
    const code = randomCode(8);
    if (!(await client.query('SELECT 1 FROM households WHERE public_id=$1', [code])).rowCount) return code;
  }
  throw new Error('Could not generate a unique household code.');
}
// Upserts (or removes) the auto-generated birthday calendar entry for a user, visible to the whole household.
async function syncBirthdayEvent(client, user, householdId) {
  await client.query(`DELETE FROM events WHERE household_id=$1 AND type='Birthday' AND notes=$2`, [householdId, `${BIRTHDAY_MARKER}:${user.id}`]);
  if (!user.birthday) return;
  const [, m, d] = String(user.birthday).split('-').map(Number);
  const now = new Date();
  let year = now.getFullYear();
  if (new Date(year, m - 1, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year += 1;
  const date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  await client.query(`INSERT INTO events(household_id,title,type,event_date,notes) VALUES($1,$2,'Birthday',$3,$4)`,
    [householdId, `${user.name}'s birthday`, date, `${BIRTHDAY_MARKER}:${user.id}`]);
}

async function initAuthSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS households (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL,
    created_by INT REFERENCES users ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query('DROP INDEX IF EXISTS households_name_unique');
  await pool.query('CREATE INDEX IF NOT EXISTS households_name_idx ON households (lower(name))');
  await pool.query('ALTER TABLE households ADD COLUMN IF NOT EXISTS public_id TEXT');
  await pool.query('ALTER TABLE households ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT \'\'');
  for (const row of (await pool.query('SELECT id FROM households WHERE public_id IS NULL')).rows) {
    await pool.query('UPDATE households SET public_id=$1 WHERE id=$2', [await uniqueHouseholdCode(pool), row.id]);
  }
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS households_public_id_unique ON households (public_id)');
  await pool.query('ALTER TABLE households ALTER COLUMN public_id SET NOT NULL');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS active_household_id INT REFERENCES households ON DELETE SET NULL');
  await pool.query(`CREATE TABLE IF NOT EXISTS household_members (
    household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users ON DELETE CASCADE, joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (household_id,user_id))`);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT \'\'');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT \'\'');
  await pool.query('ALTER TABLE households ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true');
  await pool.query(`CREATE TABLE IF NOT EXISTS household_bans (
    id BIGSERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users ON DELETE CASCADE, banned_by INT REFERENCES users ON DELETE SET NULL,
    reason TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(household_id,user_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_notifications (
    id BIGSERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users ON DELETE CASCADE, type TEXT NOT NULL,
    message TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb, read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query('CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON user_notifications(user_id,created_at DESC)');
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
  await pool.query('ALTER TABLE household_reports ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT \'Other\'');
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
    const name = `${user.name}'s Household`;
    const household = (await pool.query(
      'INSERT INTO households(name,password_hash,created_by,public_id) VALUES($1,$2,$3,$4) RETURNING id',
      [name, user.password_hash, user.id, await uniqueHouseholdCode(pool)])).rows[0];
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
  await lockDown(pool, ['household_activity', 'household_reports', 'household_bans', 'user_notifications']);
}

router.post('/signup', wrap(async (req, res) => {
  const { name, email, password, householdMode, householdName: requestedName, householdId: requestedCode, householdPassword, householdAddress } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8)
    return res.status(400).json({ error: 'Name, valid email and a password of 8+ characters are required.' });
  if (!['create', 'join'].includes(householdMode) || !validHouseholdPassword(householdPassword))
    return res.status(400).json({ error: 'Choose a household and enter its password (8+ characters).' });
  if (householdMode === 'create' && !householdName(requestedName))
    return res.status(400).json({ error: 'A household name is required.' });
  if (householdMode === 'join' && !String(requestedCode || '').trim())
    return res.status(400).json({ error: 'Enter the household ID to join.' });
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let household = null;
    if (householdMode === 'join') {
      household = await findHouseholdByCode(client, requestedCode);
      if (!household || !household.is_active || !(await bcrypt.compare(householdPassword, household.password_hash))) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Household ID or password is incorrect.' });
      }
    }
    const { rows } = await client.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',
      [name.trim(), email.toLowerCase(), hash]);
    const user = rows[0];
    if (householdMode === 'join') {
      const banned = await client.query('SELECT 1 FROM household_bans WHERE household_id=$1 AND user_id=$2', [household.id, user.id]);
      if (banned.rowCount) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'You are banned from this household.' }); }
    }
    if (householdMode === 'create') {
      const householdHash = await bcrypt.hash(householdPassword, 12);
      household = (await client.query(
        'INSERT INTO households(name,password_hash,created_by,public_id,address) VALUES($1,$2,$3,$4,$5) RETURNING id,name,public_id,address',
        [householdName(requestedName), householdHash, user.id, await uniqueHouseholdCode(client), String(householdAddress || '').trim()])).rows[0];
      await recordActivity(client, 'household_created', user.id, household.id, null, { household_name: household.name });
    }
    await client.query('INSERT INTO household_members(household_id,user_id) VALUES($1,$2)', [household.id, user.id]);
    await client.query('UPDATE users SET active_household_id=$1 WHERE id=$2', [household.id, user.id]);
    await recordActivity(client, 'user_registered', user.id, household.id, user.id, { email: user.email });
    await recordActivity(client, 'member_joined', user.id, household.id, user.id, { household_name: household.name });
    if (householdMode === 'join') {
      const others = (await client.query('SELECT user_id FROM household_members WHERE household_id=$1 AND user_id<>$2', [household.id, user.id])).rows;
      for (const other of others) await notify(client, other.user_id, 'member_joined', `${user.name} joined your household.`, { household_name: household.name, user_name: user.name });
    }
    await client.query('COMMIT');
    res.status(201).json(issue(user, { id: household.id, name: household.name, public_id: household.public_id, address: household.address }));
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
  if (rows[0].is_banned) return res.status(403).json({ error: 'Your account has been banned. Contact support for more information.' });
  if (!rows[0].is_active) {
    const token = jwt.sign({ id: rows[0].id, purpose: 'reactivation' }, SECRET, { expiresIn: '15m' });
    return res.json({ reactivationRequired: true, token, user: { id: rows[0].id, name: rows[0].name, email: rows[0].email } });
  }
  const household = (await pool.query('SELECT id,name,created_by,public_id,address FROM households WHERE id=$1 AND is_active=true', [rows[0].active_household_id])).rows[0] || null;
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
  const household = (await pool.query('SELECT id,name,created_by,public_id,address FROM households WHERE id=$1 AND is_active=true', [result.rows[0].active_household_id])).rows[0] || null;
  res.json(issue(result.rows[0], household));
}));

router.get('/households', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT h.id,h.name,h.public_id,h.address,(h.id=$1) AS active FROM households h
     JOIN household_members m ON m.household_id=h.id WHERE m.user_id=$2 AND h.is_active=true ORDER BY lower(h.name)`,
    [req.household ? req.household.id : null, req.user.id]);
  res.json(rows);
}));

router.get('/households/members', requireAuth, wrap(async (req, res) => {
  if (!req.household) return res.json([]);
  const { rows } = await pool.query(
    `SELECT u.id,u.name,u.email,u.phone,to_char(u.birthday,'YYYY-MM-DD') AS birthday,u.bio,(h.created_by=u.id) AS is_owner FROM household_members m
    JOIN users u ON u.id=m.user_id JOIN households h ON h.id=m.household_id AND h.is_active=true
    WHERE m.household_id=$1 AND u.active_household_id=$1 AND u.is_active=true ORDER BY lower(u.name),u.id`,
    [req.household.id]);
  res.json(rows);
}));

router.post('/households/members/:id/report', requireAuth, requireHousehold, wrap(async (req, res) => {
  const description = String(req.body && req.body.description || '').trim();
  const category = COMPLAINT_CATEGORIES.includes(req.body && req.body.category) ? req.body.category : 'Other';
  if (description.length < 10 || description.length > 2000) return res.status(400).json({ error: 'Explain the concern in 10 to 2000 characters.' });
  const target = (await pool.query(`SELECT u.id,u.name FROM users u JOIN household_members m ON m.user_id=u.id
    WHERE u.id=$1 AND m.household_id=$2 AND u.active_household_id=$2 AND u.is_active=true`, [req.params.id, req.household.id])).rows[0];
  if (!target || target.id === req.user.id) return res.status(404).json({ error: 'Active household member not found.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO household_reports(household_id,household_name,reporter_user_id,reporter_name,reported_user_id,reported_name,description,category)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [req.household.id, req.household.name, req.user.id, req.user.name || 'Member', target.id, target.name, description, category]);
    await recordActivity(client, 'member_reported', req.user.id, req.household.id, target.id, { reported_name: target.name, category });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.status(201).json({ ok: true });
}));

router.get('/households/members/complaint-categories', requireAuth, wrap(async (_req, res) => res.json(COMPLAINT_CATEGORIES)));

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
    await notify(client, nextOwnerId, 'ownership_assigned', `You are now the owner of ${req.household.name}.`, { household_name: req.household.name });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true });
}));

router.put('/households/password', requireAuth, requireHousehold, wrap(async (req, res) => {
  const password = String(req.body && req.body.password || '');
  if (!validHouseholdPassword(password)) return res.status(400).json({ error: 'Household password must be at least 8 characters.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const household = (await client.query('SELECT created_by FROM households WHERE id=$1 AND is_active=true FOR UPDATE', [req.household.id])).rows[0];
    if (!household || household.created_by !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the household owner can change the password.' }); }
    const hash = await bcrypt.hash(password, 12);
    await client.query('UPDATE households SET password_hash=$1 WHERE id=$2', [hash, req.household.id]);
    await recordActivity(client, 'household_password_changed', req.user.id, req.household.id, null, { household_name: req.household.name });
    const members = (await client.query('SELECT user_id FROM household_members WHERE household_id=$1 AND user_id<>$2', [req.household.id, req.user.id])).rows;
    for (const member of members) await notify(client, member.user_id, 'household_password_changed', `The password for ${req.household.name} was changed by the owner.`, { household_name: req.household.name });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true });
}));

router.put('/households/address', requireAuth, requireHousehold, wrap(async (req, res) => {
  const address = String(req.body && req.body.address || '').trim().slice(0, 300);
  const household = (await pool.query('SELECT created_by FROM households WHERE id=$1 AND is_active=true', [req.household.id])).rows[0];
  if (!household || household.created_by !== req.user.id) return res.status(403).json({ error: 'Only the household owner can update the address.' });
  await pool.query('UPDATE households SET address=$1 WHERE id=$2', [address, req.household.id]);
  res.json({ ok: true, address });
}));

// Owner removes a member; optionally bans them from rejoining this household.
router.post('/households/members/:id/remove', requireAuth, requireHousehold, wrap(async (req, res) => {
  const targetId = Number(req.params.id);
  const ban = !!(req.body && req.body.ban);
  const reason = String(req.body && req.body.reason || '').trim().slice(0, 500);
  if (!Number.isInteger(targetId) || targetId === req.user.id) return res.status(400).json({ error: 'Choose another active household member.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const household = (await client.query('SELECT created_by,name FROM households WHERE id=$1 AND is_active=true FOR UPDATE', [req.household.id])).rows[0];
    if (!household || household.created_by !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the household owner can remove members.' }); }
    const target = (await client.query(`SELECT u.id,u.name FROM users u JOIN household_members m ON m.user_id=u.id
      WHERE u.id=$1 AND m.household_id=$2 AND u.active_household_id=$2 AND u.is_active=true`, [targetId, req.household.id])).rows[0];
    if (!target) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Active household member not found.' }); }
    await client.query('DELETE FROM household_members WHERE household_id=$1 AND user_id=$2', [req.household.id, target.id]);
    await client.query('UPDATE users SET active_household_id=NULL WHERE id=$1', [target.id]);
    if (ban) await client.query(`INSERT INTO household_bans(household_id,user_id,banned_by,reason) VALUES($1,$2,$3,$4)
      ON CONFLICT(household_id,user_id) DO UPDATE SET banned_by=EXCLUDED.banned_by,reason=EXCLUDED.reason,created_at=now()`, [req.household.id, target.id, req.user.id, reason]);
    await recordActivity(client, ban ? 'member_banned' : 'member_removed', req.user.id, req.household.id, target.id, { subject_name: target.name, household_name: household.name, reason });
    await notify(client, target.id, ban ? 'banned' : 'removed', ban
      ? `You have been banned from ${household.name} and may not rejoin.`
      : `You have been removed from ${household.name}.`, { household_name: household.name, reason });
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true });
}));

router.get('/households/activity', requireAuth, requireHousehold, wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT a.id,a.activity_type,a.created_at,a.details,
    COALESCE(actor.name,a.details->>'actor_name','Former member') AS actor_name,
    COALESCE(subject.name,a.details->>'subject_name','') AS subject_name
    FROM household_activity a LEFT JOIN users actor ON actor.id=a.actor_user_id LEFT JOIN users subject ON subject.id=a.subject_user_id
    WHERE a.household_id=$1 ORDER BY a.created_at DESC LIMIT 200`, [req.household.id]);
  res.json(rows);
}));

router.get('/notifications', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id,type,message,details,read,created_at FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json(rows);
}));
router.post('/notifications/read-all', requireAuth, wrap(async (req, res) => {
  await pool.query('UPDATE user_notifications SET read=true WHERE user_id=$1 AND read=false', [req.user.id]);
  res.json({ ok: true });
}));
router.post('/notifications/:id/read', requireAuth, wrap(async (req, res) => {
  await pool.query('UPDATE user_notifications SET read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

router.put('/profile', requireAuth, wrap(async (req, res) => {
  const phone = String(req.body && req.body.phone || '').trim().slice(0, 30);
  const bio = String(req.body && req.body.bio || '').trim().slice(0, 500);
  const birthdayRaw = req.body && req.body.birthday;
  const birthday = birthdayRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw) ? birthdayRaw : null;
  if (birthdayRaw && !birthday) return res.status(400).json({ error: 'Enter a valid birthday.' });
  const client = await pool.connect();
  let user;
  try {
    await client.query('BEGIN');
    user = (await client.query(`UPDATE users SET phone=$1,bio=$2,birthday=$3 WHERE id=$4 RETURNING id,name,phone,bio,to_char(birthday,'YYYY-MM-DD') AS birthday`,
      [phone, bio, birthday, req.user.id])).rows[0];
    if (req.household) await syncBirthdayEvent(client, user, req.household.id);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json(user);
}));

router.post('/households/enter', requireAuth, wrap(async (req, res) => {
  const { householdId: code, password } = req.body || {};
  const household = await findHouseholdByCode(pool, code);
  if (!household || !household.is_active || !(await bcrypt.compare(password || '', household.password_hash)))
    return res.status(401).json({ error: 'Household ID or password is incorrect.' });
  const banned = await pool.query('SELECT 1 FROM household_bans WHERE household_id=$1 AND user_id=$2', [household.id, req.user.id]);
  if (banned.rowCount) return res.status(403).json({ error: 'You are banned from this household.' });
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
    if (membership.rowCount) {
      const others = (await client.query('SELECT user_id FROM household_members WHERE household_id=$1 AND user_id<>$2', [household.id, req.user.id])).rows;
      for (const other of others) await notify(client, other.user_id, 'member_joined', `${req.user.name || 'A member'} joined your household.`, { household_name: household.name });
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ id: household.id, name: household.name, created_by: household.created_by, public_id: household.public_id, address: household.address });
}));

router.post('/households', requireAuth, wrap(async (req, res) => {
  const { name, password, address } = req.body || {};
  if (!householdName(name) || !validHouseholdPassword(password))
    return res.status(400).json({ error: 'Household name and password of 8+ characters are required.' });
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const household = (await client.query(
      'INSERT INTO households(name,password_hash,created_by,public_id,address) VALUES($1,$2,$3,$4,$5) RETURNING id,name,public_id,address',
      [householdName(name), hash, req.user.id, await uniqueHouseholdCode(client), String(address || '').trim()])).rows[0];
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
      `SELECT u.id,u.name,u.email,u.is_active,u.is_banned,
       CASE WHEN m.user_id IS NOT NULL THEN h.id END AS household_id,
       CASE WHEN m.user_id IS NOT NULL THEN h.name END AS household_name,
       CASE WHEN m.user_id IS NOT NULL THEN h.public_id END AS household_public_id,
       CASE WHEN m.user_id IS NOT NULL THEN h.address END AS household_address,
       CASE WHEN m.user_id IS NOT NULL THEN h.created_by END AS household_owner_id
       FROM users u LEFT JOIN households h ON h.id=u.active_household_id AND h.is_active=true
       LEFT JOIN household_members m ON m.household_id=h.id AND m.user_id=u.id WHERE u.id=$1`,
      [req.user.id])).rows[0];
    if (!account || !account.is_active) return res.status(401).json({ error: 'Account is deactivated.' });
    if (account.is_banned) return res.status(403).json({ error: 'Your account has been banned.' });
    req.household = account.household_id ? { id: account.household_id, name: account.household_name, public_id: account.household_public_id, address: account.household_address, created_by: account.household_owner_id } : null;
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
