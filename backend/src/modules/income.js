const router = require('express').Router();
const pool = require('../db');
const { wrap, lockDown } = require('../util');
const COLS = 'id,source,amount::float8 AS amount,month,year,remarks,recurring';
const ok = (b) => b.source && b.amount !== '' && b.amount != null && Number(b.amount) >= 0 && b.month >= 1 && b.month <= 12 && b.year >= 2000 && b.year <= 2100;

router.get('/', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLS} FROM income WHERE user_id=$1 ORDER BY year DESC, month DESC, source`, [req.user.id]);
  res.json(rows);
}));
router.get('/summary', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT year,month,source,SUM(amount)::float8 AS total FROM income WHERE user_id=$1 GROUP BY year,month,source ORDER BY year,month', [req.user.id]);
  res.json(rows);
}));
// Copy last month's recurring income (e.g. salary) into the given month, skipping sources already present.
router.post('/carry', wrap(async (req, res) => {
  const { month, year } = req.body || {};
  if (!(month >= 1 && month <= 12 && year >= 2000)) return res.status(400).json({ error: 'Invalid month.' });
  const py = month === 1 ? year - 1 : year, pm = month === 1 ? 12 : month - 1;
  const prev = await pool.query('SELECT source,amount,remarks FROM income WHERE user_id=$1 AND year=$2 AND month=$3 AND recurring', [req.user.id, py, pm]);
  const cur = await pool.query('SELECT lower(source) AS s FROM income WHERE user_id=$1 AND year=$2 AND month=$3', [req.user.id, year, month]);
  const have = new Set(cur.rows.map((r) => r.s));
  let added = 0;
  for (const r of prev.rows) {
    if (have.has(r.source.toLowerCase())) continue;
    await pool.query('INSERT INTO income(user_id,source,amount,month,year,remarks,recurring) VALUES($1,$2,$3,$4,$5,$6,true)', [req.user.id, r.source, r.amount, month, year, r.remarks]);
    added++;
  }
  res.json({ added });
}));
router.post('/', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid income.' });
  const b = req.body;
  const { rows } = await pool.query(`INSERT INTO income(user_id,source,amount,month,year,remarks,recurring) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
    [req.user.id, b.source.trim(), b.amount, b.month, b.year, b.remarks || '', !!b.recurring]);
  res.status(201).json(rows[0]);
}));
router.put('/:id', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid income.' });
  const b = req.body;
  const { rows } = await pool.query(`UPDATE income SET source=$1,amount=$2,month=$3,year=$4,remarks=$5,recurring=$6 WHERE id=$7 AND user_id=$8 RETURNING ${COLS}`,
    [b.source.trim(), b.amount, b.month, b.year, b.remarks || '', !!b.recurring, req.params.id, req.user.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Not found' });
}));
router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM income WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.status(204).end();
}));

const init = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS income (
    id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
    source TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12), year SMALLINT NOT NULL,
    remarks TEXT DEFAULT '', recurring BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`);
  await lockDown(pool, ['income']);
};
module.exports = { name: 'income', router, init };
