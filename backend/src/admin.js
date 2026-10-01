const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { wrap, lockDown } = require('./util');
const SECRET = process.env.JWT_SECRET;
const adminAuthRouter = express.Router();
const adminRouter = express.Router();
const emailValue = (value) => String(value || '').trim().toLowerCase();
const adminEmail = () => emailValue(process.env.ADMIN_EMAIL || 'admin@homint.com');

async function initAdminSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS system_admins (
    id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await lockDown(pool, ['system_admins']);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('System admin login is not bootstrapped: set ADMIN_PASSWORD in the server environment.');
    return;
  }
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await pool.query('INSERT INTO system_admins(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING', [adminEmail(), hash]);
}

adminAuthRouter.post('/login', wrap(async (req, res) => {
  const email = emailValue(req.body && req.body.email);
  const password = String(req.body && req.body.password || '');
  const admin = (await pool.query('SELECT id,email,password_hash,is_active FROM system_admins WHERE email=$1', [email])).rows[0];
  if (!admin || !admin.is_active || !(await bcrypt.compare(password, admin.password_hash)))
    return res.status(401).json({ error: 'Incorrect admin email or password.' });
  const token = jwt.sign({ id: admin.id, email: admin.email, scope: 'system_admin' }, SECRET, { expiresIn: '4h' });
  res.json({ token, user: { id: admin.id, email: admin.email } });
}));

async function requireAdmin(req, res, next) {
  try {
    const payload = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), SECRET);
    if (payload.scope !== 'system_admin') return res.status(403).json({ error: 'Admin access required.' });
    const admin = (await pool.query('SELECT id,email FROM system_admins WHERE id=$1 AND is_active=true', [payload.id])).rows[0];
    if (!admin) return res.status(401).json({ error: 'Admin account is inactive.' });
    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ error: 'Admin session expired. Sign in again.' });
  }
}

adminRouter.get('/dashboard', wrap(async (_req, res) => {
  const users = (await pool.query(`SELECT count(*)::int AS total,count(*) FILTER (WHERE is_active)::int AS active,
    count(*) FILTER (WHERE created_at >= date_trunc('day',now()))::int AS today,
    count(*) FILTER (WHERE created_at >= date_trunc('week',now()))::int AS this_week,
    count(*) FILTER (WHERE created_at >= date_trunc('month',now()))::int AS this_month FROM users`)).rows[0];
  const households = (await pool.query(`SELECT count(*)::int AS total,count(*) FILTER (WHERE is_active)::int AS active,
    count(*) FILTER (WHERE created_at >= date_trunc('day',now()))::int AS today,
    count(*) FILTER (WHERE created_at >= date_trunc('week',now()))::int AS this_week,
    count(*) FILTER (WHERE created_at >= date_trunc('month',now()))::int AS this_month FROM households`)).rows[0];
  const trend = await pool.query(`SELECT days.day::date AS date,
    (SELECT count(*)::int FROM users u WHERE u.created_at >= days.day AND u.created_at < days.day + interval '1 day') AS users,
    (SELECT count(*)::int FROM households h WHERE h.created_at >= days.day AND h.created_at < days.day + interval '1 day') AS households
    FROM generate_series(date_trunc('day',now()) - interval '29 days',date_trunc('day',now()),interval '1 day') AS days(day) ORDER BY days.day`);
  const activity = await pool.query(`SELECT a.id,a.activity_type,a.created_at,a.details,
    a.actor_user_id,COALESCE(actor.name,a.details->>'actor_name','Former member') AS actor_name,
    a.subject_user_id,COALESCE(subject.name,a.details->>'subject_name','') AS subject_name,
    a.household_id,COALESCE(h.name,a.details->>'household_name','Deleted household') AS household_name
    FROM household_activity a LEFT JOIN users actor ON actor.id=a.actor_user_id
    LEFT JOIN users subject ON subject.id=a.subject_user_id LEFT JOIN households h ON h.id=a.household_id
    ORDER BY a.created_at DESC LIMIT 12`);
  const reportCount = (await pool.query("SELECT count(*)::int AS open FROM household_reports WHERE status IN ('open','reviewing')")).rows[0];
  res.json({ users, households, trend: trend.rows, activity: activity.rows, open_reports: reportCount.open });
}));

adminRouter.get('/users', wrap(async (_req, res) => {
  const { rows } = await pool.query(`SELECT u.id,u.name,u.email,u.is_active,u.created_at,h.name AS household_name,
    (SELECT count(*)::int FROM household_members m JOIN households mh ON mh.id=m.household_id
    JOIN users linked_user ON linked_user.id=m.user_id
    WHERE m.user_id=u.id AND mh.is_active=true AND linked_user.is_active=true AND linked_user.active_household_id=mh.id) AS household_count
    FROM users u LEFT JOIN households h ON h.id=u.active_household_id ORDER BY u.created_at DESC,u.id DESC`);
  res.json(rows);
}));
adminRouter.put('/users/:id', wrap(async (req, res) => {
  const name = String(req.body && req.body.name || '').trim();
  const email = emailValue(req.body && req.body.email);
  if (!name || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
    return res.status(400).json({ error: 'Enter a valid name and email.' });
  let result;
  try { result = await pool.query('UPDATE users SET name=$1,email=$2 WHERE id=$3 RETURNING id,name,email,is_active', [name, email, req.params.id]); }
  catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'That email is already assigned to another user.' }); throw e; }
  if (!result.rowCount) return res.status(404).json({ error: 'User not found.' });
  res.json(result.rows[0]);
}));
adminRouter.post('/users/:id/deactivate', wrap(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('SELECT id,name,is_active,active_household_id FROM users WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'User not found.' }); }
    if (!user.is_active) { await client.query('COMMIT'); return res.json({ ok: true }); }
    if (user.active_household_id) {
      const household = (await client.query('SELECT id,name,created_by FROM households WHERE id=$1 FOR UPDATE', [user.active_household_id])).rows[0];
      await client.query('DELETE FROM household_members WHERE household_id=$1 AND user_id=$2', [user.active_household_id, user.id]);
      await client.query(`INSERT INTO household_activity(activity_type,actor_user_id,household_id,subject_user_id,details)
        VALUES('member_left',NULL,$1,$2,$3)`, [user.active_household_id, user.id, { actor_name: 'System admin', subject_name: user.name, household_name: household && household.name, reason: 'account_deactivated' }]);
      if (household && household.created_by === user.id) {
        const successor = (await client.query(`SELECT u.id,u.name FROM household_members m JOIN users u ON u.id=m.user_id
          WHERE m.household_id=$1 AND u.is_active=true AND u.active_household_id=$1 ORDER BY m.joined_at,u.id LIMIT 1`, [household.id])).rows[0];
        await client.query('UPDATE households SET created_by=$1 WHERE id=$2', [successor ? successor.id : null, household.id]);
        if (successor) await client.query(`INSERT INTO household_activity(activity_type,actor_user_id,household_id,subject_user_id,details)
          VALUES('ownership_transferred',NULL,$1,$2,$3)`, [household.id, successor.id, { actor_name: 'System admin', owner_name: successor.name, reason: 'owner_deactivated' }]);
      }
    }
    await client.query('UPDATE users SET is_active=false,active_household_id=NULL WHERE id=$1', [user.id]);
    await client.query(`INSERT INTO household_activity(activity_type,actor_user_id,subject_user_id,details)
      VALUES('user_deactivated',NULL,$1,$2)`, [user.id, { actor_name: 'System admin', subject_name: user.name }]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true, require_password_change: true });
}));

adminRouter.get('/households', wrap(async (_req, res) => {
  const { rows } = await pool.query(`SELECT h.id,h.name,h.is_active,h.created_at,h.created_by AS owner_id,u.name AS owner_name,
    (SELECT count(*)::int FROM household_members m JOIN users mu ON mu.id=m.user_id
     WHERE m.household_id=h.id AND mu.is_active=true AND mu.active_household_id=h.id) AS member_count
    FROM households h LEFT JOIN users u ON u.id=h.created_by ORDER BY h.created_at DESC,h.id DESC`);
  res.json(rows);
}));
adminRouter.put('/households/:id', wrap(async (req, res) => {
  const name = String(req.body && req.body.name || '').trim();
  if (!name || name.length > 100) return res.status(400).json({ error: 'Household name is required (maximum 100 characters).' });
  let result;
  try { result = await pool.query('UPDATE households SET name=$1 WHERE id=$2 RETURNING id,name,is_active', [name, req.params.id]); }
  catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'That household name is already in use.' }); throw e; }
  if (!result.rowCount) return res.status(404).json({ error: 'Household not found.' });
  res.json(result.rows[0]);
}));
adminRouter.post('/households/:id/deactivate', wrap(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const household = (await client.query('SELECT id,name,is_active FROM households WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!household) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Household not found.' }); }
    if (!household.is_active) { await client.query('COMMIT'); return res.json({ ok: true }); }
    const members = await client.query(`SELECT u.id,u.name FROM household_members m JOIN users u ON u.id=m.user_id
      WHERE m.household_id=$1 AND u.active_household_id=$1`, [household.id]);
    for (const member of members.rows) {
      await client.query(`INSERT INTO household_activity(activity_type,actor_user_id,household_id,subject_user_id,details)
        VALUES('member_left',NULL,$1,$2,$3)`, [household.id, member.id, { actor_name: 'System admin', subject_name: member.name, household_name: household.name, reason: 'household_deactivated' }]);
    }
    await client.query('UPDATE users SET active_household_id=NULL WHERE active_household_id=$1', [household.id]);
    await client.query('DELETE FROM household_members WHERE household_id=$1', [household.id]);
    await client.query('UPDATE households SET is_active=false,created_by=NULL WHERE id=$1', [household.id]);
    await client.query(`INSERT INTO household_activity(activity_type,household_id,details)
      VALUES('household_deactivated',$1,$2)`, [household.id, { actor_name: 'System admin', household_name: household.name, removed_members: members.rowCount }]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true });
}));
adminRouter.post('/households/:id/activate', wrap(async (req, res) => {
  const result = await pool.query('UPDATE households SET is_active=true WHERE id=$1 RETURNING id', [req.params.id]);
  result.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Household not found.' });
}));

adminRouter.get('/activity', wrap(async (_req, res) => {
  const { rows } = await pool.query(`SELECT a.id,a.activity_type,a.created_at,a.details,
    COALESCE(actor.name,a.details->>'actor_name','Former member') AS actor_name,
    COALESCE(subject.name,a.details->>'subject_name','') AS subject_name,
    COALESCE(h.name,a.details->>'household_name','Deleted household') AS household_name
    FROM household_activity a LEFT JOIN users actor ON actor.id=a.actor_user_id
    LEFT JOIN users subject ON subject.id=a.subject_user_id LEFT JOIN households h ON h.id=a.household_id
    ORDER BY a.created_at DESC LIMIT 300`);
  res.json(rows);
}));
adminRouter.get('/reports', wrap(async (_req, res) => {
  const { rows } = await pool.query(`SELECT id,household_id,household_name,reporter_name,reported_name,description,status,admin_note,created_at,resolved_at
    FROM household_reports ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,created_at DESC LIMIT 500`);
  res.json(rows);
}));
adminRouter.put('/reports/:id', wrap(async (req, res) => {
  const status = String(req.body && req.body.status || '');
  const note = String(req.body && req.body.admin_note || '').trim();
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status) || note.length > 2000)
    return res.status(400).json({ error: 'Choose a valid report status and a note under 2000 characters.' });
  const result = await pool.query(`UPDATE household_reports SET status=$1,admin_note=$2,
    resolved_at=CASE WHEN $1 IN ('resolved','dismissed') THEN now() ELSE NULL END WHERE id=$3 RETURNING id,status,admin_note`,
    [status, note, req.params.id]);
  result.rowCount ? res.json(result.rows[0]) : res.status(404).json({ error: 'Report not found.' });
}));

module.exports = { adminAuthRouter, adminRouter, initAdminSchema, requireAdmin };
