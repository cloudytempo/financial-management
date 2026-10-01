const router = require('express').Router();
const pool = require('../db');
const { wrap, lockDown } = require('../util');
const COLS = 'id,source,amount::float8 AS amount,month,year,remarks,recurring,account_id';
async function validAccount(householdId, value) {
  if (value == null || value === '') return true;
  const id = Number(value);
  return Number.isInteger(id) && (await pool.query('SELECT 1 FROM accounts WHERE id=$1 AND household_id=$2 AND is_active=true', [id, householdId])).rowCount > 0;
}
const ok = (b) => b.source && b.amount !== '' && b.amount != null && Number(b.amount) >= 0 && b.month >= 1 && b.month <= 12 && b.year >= 2000 && b.year <= 2100;

router.get('/', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT i.${COLS.split(',').join(',i.')},a.name AS account_name FROM income i
    LEFT JOIN accounts a ON a.id=i.account_id WHERE i.household_id=$1 ORDER BY i.year DESC,i.month DESC,i.source`, [req.household.id]);
  res.json(rows);
}));
router.get('/summary', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT year,month,source,SUM(amount)::float8 AS total FROM income WHERE household_id=$1 GROUP BY year,month,source ORDER BY year,month', [req.household.id]);
  res.json(rows);
}));
// Copy last month's recurring income (e.g. salary) into the given month, skipping sources already present.
router.post('/carry', wrap(async (req, res) => {
  const { month, year } = req.body || {};
  if (!(month >= 1 && month <= 12 && year >= 2000)) return res.status(400).json({ error: 'Invalid month.' });
  const py = month === 1 ? year - 1 : year, pm = month === 1 ? 12 : month - 1;
  const prev = await pool.query('SELECT source,amount,remarks,account_id FROM income WHERE household_id=$1 AND year=$2 AND month=$3 AND recurring', [req.household.id, py, pm]);
  const cur = await pool.query('SELECT lower(source) AS s FROM income WHERE household_id=$1 AND year=$2 AND month=$3', [req.household.id, year, month]);
  const have = new Set(cur.rows.map((r) => r.s));
  let added = 0;
  for (const r of prev.rows) {
    if (have.has(r.source.toLowerCase())) continue;
    await pool.query('INSERT INTO income(household_id,source,amount,month,year,remarks,recurring,account_id) VALUES($1,$2,$3,$4,$5,$6,true,$7)', [req.household.id, r.source, r.amount, month, year, r.remarks, r.account_id]);
    added++;
  }
  res.json({ added });
}));
router.post('/', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid income.' });
  const b = req.body;
  if (!(await validAccount(req.household.id, b.account_id))) return res.status(400).json({ error: 'Choose an active account in this household.' });
  const { rows } = await pool.query(`INSERT INTO income(household_id,source,amount,month,year,remarks,recurring,account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLS}`,
    [req.household.id, b.source.trim(), b.amount, b.month, b.year, b.remarks || '', !!b.recurring, b.account_id || null]);
  res.status(201).json(rows[0]);
}));
router.put('/:id', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid income.' });
  const b = req.body;
  if (!(await validAccount(req.household.id, b.account_id))) return res.status(400).json({ error: 'Choose an active account in this household.' });
  const { rows } = await pool.query(`UPDATE income SET source=$1,amount=$2,month=$3,year=$4,remarks=$5,recurring=$6,account_id=$7 WHERE id=$8 AND household_id=$9 RETURNING ${COLS}`,
    [b.source.trim(), b.amount, b.month, b.year, b.remarks || '', !!b.recurring, b.account_id || null, req.params.id, req.household.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Not found' });
}));
router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM income WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));

const init = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS income (
    id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    source TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12), year SMALLINT NOT NULL,
    remarks TEXT DEFAULT '', recurring BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`);
  await lockDown(pool, ['income']);
};
module.exports = { name: 'income', router, init };
