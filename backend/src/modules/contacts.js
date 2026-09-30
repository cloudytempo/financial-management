const router = require('express').Router();
const pool = require('../db');
const { wrap, lockDown } = require('../util');
const COLS = 'id,name,phone,category,notes,favorite';
const CATS = ['Family', 'Emergency', 'Utilities', 'Services', 'Work', 'Other'];
const ok = (b) => b.name && /^[+0-9()\-\s]{3,20}$/.test(b.phone || '') && CATS.includes(b.category || 'Other');

router.get('/', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLS} FROM contacts WHERE user_id=$1 ORDER BY favorite DESC, lower(name)`, [req.user.id]);
  res.json(rows);
}));
router.post('/emergency-seed', wrap(async (req, res) => {
  const have = new Set((await pool.query('SELECT phone FROM contacts WHERE user_id=$1', [req.user.id])).rows.map((r) => r.phone));
  const seeds = [['Police / Ambulance', '999'], ['Fire (Bomba)', '994'], ['Mobile emergency', '112']];
  let added = 0;
  for (const [n, p] of seeds) if (!have.has(p)) { await pool.query("INSERT INTO contacts(user_id,name,phone,category,favorite) VALUES($1,$2,$3,'Emergency',true)", [req.user.id, n, p]); added++; }
  res.json({ added });
}));
router.post('/', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'A name and a valid phone number are required.' });
  const b = req.body;
  const { rows } = await pool.query(`INSERT INTO contacts(user_id,name,phone,category,notes,favorite) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
    [req.user.id, b.name.trim(), b.phone.trim(), b.category || 'Other', b.notes || '', !!b.favorite]);
  res.status(201).json(rows[0]);
}));
router.put('/:id', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'A name and a valid phone number are required.' });
  const b = req.body;
  const r = await pool.query('UPDATE contacts SET name=$1,phone=$2,category=$3,notes=$4,favorite=$5 WHERE id=$6 AND user_id=$7',
    [b.name.trim(), b.phone.trim(), b.category || 'Other', b.notes || '', !!b.favorite, req.params.id, req.user.id]);
  r.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));
router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM contacts WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.status(204).end();
}));

const init = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
    name TEXT NOT NULL, phone TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Other', notes TEXT DEFAULT '',
    favorite BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`);
  await lockDown(pool, ['contacts']);
};
module.exports = { name: 'contacts', router, init };
