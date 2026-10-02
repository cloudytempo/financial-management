const router = require('express').Router();
const pool = require('../db');
const { wrap, lockDown } = require('../util');

// Effective limit for a month = the latest limit set on or before that month, per category.
async function statusFor(householdId, year, month) {
  const now = new Date();
  const b = await pool.query(`SELECT DISTINCT ON (lower(category)) category, amount::float8 AS amount FROM budgets
    WHERE household_id=$1 AND (effective_year*12+effective_month) <= $2 ORDER BY lower(category), effective_year DESC, effective_month DESC`, [householdId, year * 12 + month]);
  const e = await pool.query('SELECT lower(type) AS k, MIN(type) AS type, SUM(amount)::float8 AS spent FROM expenses WHERE household_id=$1 AND year=$2 AND month=$3 GROUP BY lower(type)', [householdId, year, month]);
  const spent = new Map(e.rows.map((r) => [r.k, r.spent]));
  const isCur = year === now.getFullYear() && month === now.getMonth() + 1;
  const dim = new Date(year, month, 0).getDate(), day = isCur ? now.getDate() : dim;
  const rows = b.rows.map((r) => {
    const s = spent.get(r.category.toLowerCase()) || 0, pct = Math.round((s / r.amount) * 100);
    return { category: r.category, limit: r.amount, spent: s, remaining: r.amount - s, pct, status: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok',
      projected: isCur ? Math.round((s / day) * dim * 100) / 100 : null };
  }).sort((a, c) => c.pct - a.pct);
  const budgeted = new Set(b.rows.map((r) => r.category.toLowerCase()));
  const totalLimit = rows.reduce((a, r) => a + r.limit, 0), totalSpent = rows.reduce((a, r) => a + r.spent, 0);
  return { year, month, rows, totalLimit, totalSpent,
    unbudgeted: e.rows.filter((r) => !budgeted.has(r.k) && r.spent > 0).map((r) => ({ category: r.type, spent: r.spent })),
    safePerDay: isCur ? Math.max(0, (totalLimit - totalSpent) / (dim - day + 1)) : null };
}
router.get('/status', wrap(async (req, res) => {
  const now = new Date();
  const year = +req.query.year || now.getFullYear(), month = +req.query.month || now.getMonth() + 1;
  res.json(await statusFor(req.household.id, year, month));
}));

router.post('/', wrap(async (req, res) => {
  const { category, amount, year, month } = req.body || {};
  if (!category || !(Number(amount) > 0) || !(month >= 1 && month <= 12) || !(year >= 2000)) return res.status(400).json({ error: 'Category and a limit above 0 are required.' });
  await pool.query('DELETE FROM budgets WHERE household_id=$1 AND lower(category)=lower($2) AND effective_year=$3 AND effective_month=$4', [req.household.id, category.trim(), year, month]);
  await pool.query('INSERT INTO budgets(household_id,category,amount,effective_year,effective_month) VALUES($1,$2,$3,$4,$5)', [req.household.id, category.trim(), amount, year, month]);
  res.status(201).json({ ok: true });
}));
router.delete('/:category', wrap(async (req, res) => {
  await pool.query('DELETE FROM budgets WHERE household_id=$1 AND lower(category)=lower($2)', [req.household.id, req.params.category]);
  res.status(204).end();
}));

const init = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    category TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    effective_year SMALLINT NOT NULL, effective_month SMALLINT NOT NULL CHECK (effective_month BETWEEN 1 AND 12), created_at TIMESTAMPTZ DEFAULT now())`);
  await lockDown(pool, ['budgets']);
};
module.exports = { name: 'budgets', router, init, statusFor };
