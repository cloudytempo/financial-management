const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../util');
const COLS = 'id,type,amount::float8 AS amount,month,year,remarks,account_id';
async function validAccount(householdId, value) {
  if (value == null || value === '') return true;
  const id = Number(value);
  return Number.isInteger(id) && (await pool.query('SELECT 1 FROM accounts WHERE id=$1 AND household_id=$2 AND is_active=true', [id, householdId])).rowCount > 0;
}
const ok = (b) => b.type && b.amount !== '' && b.amount != null && Number(b.amount) >= 0 &&
  b.month >= 1 && b.month <= 12 && b.year >= 2000 && b.year <= 2100;

router.get('/', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT e.${COLS.split(',').join(',e.')},a.name AS account_name FROM expenses e
    LEFT JOIN accounts a ON a.id=e.account_id WHERE e.household_id=$1 ORDER BY e.year DESC,e.month DESC,e.type`, [req.household.id]);
  res.json(rows);
}));

router.get('/summary', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT year,month,type,SUM(amount)::float8 AS total FROM expenses WHERE household_id=$1 GROUP BY year,month,type ORDER BY year,month', [req.household.id]);
  res.json(rows);
}));

// Abnormality rule: amount > avg of the same type's other months + max(2 std-dev, 30% of avg); needs >=3 other records.
async function anomaliesFor(householdId) {
  const { rows } = await pool.query(`SELECT ${COLS} FROM expenses WHERE household_id=$1`, [householdId]);
  const byType = {};
  rows.forEach((r) => (byType[r.type.toLowerCase()] ||= []).push(r));
  const out = [];
  for (const list of Object.values(byType)) for (const r of list) {
    const o = list.filter((x) => x.id !== r.id).map((x) => x.amount);
    if (o.length < 3) continue;
    const avg = o.reduce((a, b) => a + b, 0) / o.length;
    const sd = Math.sqrt(o.reduce((a, b) => a + (b - avg) ** 2, 0) / o.length);
    if (avg > 0 && r.amount > avg + Math.max(2 * sd, avg * 0.3))
      out.push({ ...r, average: +avg.toFixed(2), percentAbove: Math.round((r.amount / avg - 1) * 100) });
  }
  return out.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
}
router.get('/anomalies', wrap(async (req, res) => res.json(await anomaliesFor(req.household.id))));

// Bulk import: [{type, amount, month, year, remarks}]. Identical records (same type/month/year/amount) are skipped, so re-importing is safe.
router.post('/import', wrap(async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length || rows.length > 5000) return res.status(400).json({ error: 'Send between 1 and 5000 rows.' });
  const { rows: existing } = await pool.query('SELECT lower(type) AS t, amount::float8 AS a, month, year FROM expenses WHERE household_id=$1', [req.household.id]);
  const seen = new Set(existing.map((e) => `${e.t}|${e.year}|${e.month}|${e.a}`));
  const fresh = []; let skipped = 0, invalid = 0;
  for (const r of rows) {
    if (!ok(r)) { invalid++; continue; }
    const key = `${String(r.type).trim().toLowerCase()}|${r.year}|${r.month}|${Number(r.amount)}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key); fresh.push(r);
  }
  if (fresh.length) await pool.query(
    `INSERT INTO expenses(household_id,type,amount,month,year,remarks)
     SELECT $1, * FROM unnest($2::text[],$3::numeric[],$4::smallint[],$5::smallint[],$6::text[])`,
    [req.household.id, fresh.map((r) => r.type.trim()), fresh.map((r) => r.amount), fresh.map((r) => r.month), fresh.map((r) => r.year), fresh.map((r) => r.remarks || '')]);
  res.json({ inserted: fresh.length, skipped, invalid });
}));

// Bulk import: [{type,amount,month,year,remarks}]. Re-importing is safe: rows already in the database are skipped.
router.post('/import', wrap(async (req, res) => {
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows.slice(0, 5000) : [];
  const key = (r) => [String(r.type).trim().toLowerCase(), +r.month, +r.year, Math.round(Number(r.amount) * 100), (r.remarks || '').trim()].join('|');
  const existing = await pool.query('SELECT type,amount::float8 AS amount,month,year,remarks FROM expenses WHERE household_id=$1', [req.household.id]);
  const seen = new Set(existing.rows.map(key));
  let imported = 0, skipped = 0, invalid = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      if (!ok(r)) { invalid++; continue; }
      if (seen.has(key(r))) { skipped++; continue; }
      await client.query('INSERT INTO expenses(household_id,type,amount,month,year,remarks) VALUES($1,$2,$3,$4,$5,$6)',
        [req.household.id, String(r.type).trim(), r.amount, r.month, r.year, r.remarks || '']);
      imported++;
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ imported, skipped, invalid });
}));

router.post('/', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid expense.' });
  const b = req.body;
  if (!(await validAccount(req.household.id, b.account_id))) return res.status(400).json({ error: 'Choose an active account in this household.' });
  const { rows } = await pool.query(`INSERT INTO expenses(household_id,type,amount,month,year,remarks,account_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
    [req.household.id, b.type.trim(), b.amount, b.month, b.year, b.remarks || '', b.account_id || null]);
  res.status(201).json(rows[0]);
}));

router.put('/:id', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid expense.' });
  const b = req.body;
  if (!(await validAccount(req.household.id, b.account_id))) return res.status(400).json({ error: 'Choose an active account in this household.' });
  const { rows } = await pool.query(`UPDATE expenses SET type=$1,amount=$2,month=$3,year=$4,remarks=$5,account_id=$6 WHERE id=$7 AND household_id=$8 RETURNING ${COLS}`,
    [b.type.trim(), b.amount, b.month, b.year, b.remarks || '', b.account_id || null, req.params.id, req.household.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Not found' });
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM expenses WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));

module.exports = { name: 'expenses', router, anomaliesFor };
