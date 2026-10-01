const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { wrap } = require('./util');
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

const issue = (u, household) => ({
  token: jwt.sign({ id: u.id, email: u.email }, SECRET, { expiresIn: '7d' }),
  user: { id: u.id, name: u.name, email: u.email, household },
});

const householdName = (value) => String(value || '').trim();
const validHouseholdPassword = (value) => String(value || '').length >= 8;

async function findHousehold(client, name) {
  return (await client.query('SELECT id,name,password_hash FROM households WHERE lower(name)=lower($1)', [householdName(name)])).rows[0];
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
    if (householdMode === 'join' && (!household || !(await bcrypt.compare(householdPassword, household.password_hash)))) {
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
    }
    await client.query('INSERT INTO household_members(household_id,user_id) VALUES($1,$2)', [household.id, user.id]);
    await client.query('UPDATE users SET active_household_id=$1 WHERE id=$2', [household.id, user.id]);
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
  const household = (await pool.query('SELECT id,name FROM households WHERE id=$1', [rows[0].active_household_id])).rows[0];
  res.json(issue(rows[0], household));
}));

router.get('/households', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT h.id,h.name,(h.id=$1) AS active FROM households h
     JOIN household_members m ON m.household_id=h.id WHERE m.user_id=$2 ORDER BY lower(h.name)`,
    [req.household.id, req.user.id]);
  res.json(rows);
}));

router.get('/households/members', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id,u.name FROM household_members m
     JOIN users u ON u.id=m.user_id WHERE m.household_id=$1 ORDER BY lower(u.name),u.id`,
    [req.household.id]);
  res.json(rows);
}));

router.post('/households/enter', requireAuth, wrap(async (req, res) => {
  const { name, password } = req.body || {};
  const household = await findHousehold(pool, name);
  if (!household || !(await bcrypt.compare(password || '', household.password_hash)))
    return res.status(401).json({ error: 'Household name or password is incorrect.' });
  await pool.query('INSERT INTO household_members(household_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [household.id, req.user.id]);
  await pool.query('UPDATE users SET active_household_id=$1 WHERE id=$2', [household.id, req.user.id]);
  res.json({ id: household.id, name: household.name });
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
    const household = (await pool.query(
      `SELECT h.id,h.name FROM users u JOIN households h ON h.id=u.active_household_id
       JOIN household_members m ON m.household_id=h.id AND m.user_id=u.id WHERE u.id=$1`,
      [req.user.id])).rows[0];
    if (!household) return res.status(403).json({ error: 'Choose a household to continue.' });
    req.household = household;
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
}
module.exports = { router, requireAuth, initAuthSchema };
