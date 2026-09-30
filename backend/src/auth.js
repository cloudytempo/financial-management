const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { wrap } = require('./util');
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

const issue = (u) => ({
  token: jwt.sign({ id: u.id, email: u.email }, SECRET, { expiresIn: '7d' }),
  user: { id: u.id, name: u.name, email: u.email },
});

router.post('/signup', wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8)
    return res.status(400).json({ error: 'Name, valid email and a password of 8+ characters are required.' });
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',
      [name.trim(), email.toLowerCase(), hash]);
    res.status(201).json(issue(rows[0])); // every new user gets full access
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already registered.' });
    throw e;
  }
}));

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase()]);
  const ok = rows[0] && (await bcrypt.compare(password || '', rows[0].password_hash));
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });
  res.json(issue(rows[0]));
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

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
}
module.exports = { router, requireAuth };
