const router = require('express').Router();
const pool = require('../db');
const { wrap, lockDown, fmtDate, todayStr, daysBetween } = require('../util');
const COLS = "b.id,b.name,b.category,b.amount::float8 AS amount,b.frequency,to_char(b.first_due,'YYYY-MM-DD') AS first_due,b.status,b.autopay,b.add_expense,b.account_id,a.name AS account_name";
const ok = (b) => b.name && b.amount !== '' && b.amount != null && Number(b.amount) >= 0 && ['monthly', 'quarterly', 'yearly'].includes(b.frequency) &&
  /^\d{4}-\d{2}-\d{2}$/.test(b.first_due || '') && ['active', 'paused', 'cancelled'].includes(b.status || 'active');
async function validAccount(householdId, value) {
  if (value == null || value === '') return true;
  const id = Number(value);
  return Number.isInteger(id) && !!(await pool.query('SELECT 1 FROM accounts WHERE id=$1 AND household_id=$2 AND is_active=true', [id, householdId])).rowCount;
}
const PER_MONTH = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
const PER_YEAR = { monthly: 12, quarterly: 4, yearly: 1 };

const nextDay = (s) => { const [y, m, d] = s.split('-').map(Number); return fmtDate(new Date(y, m - 1, d + 1)); };
// First billing date on or after `start`, following the bill's frequency, anchored on first_due.
function nextCycle(b, start) {
  const [, fm, fd] = b.first_due.split('-').map(Number);
  const [sy, sm] = start.split('-').map(Number);
  for (let k = 0; k < 30; k++) {
    const idx = sy * 12 + (sm - 1) + k, y = Math.floor(idx / 12), m0 = idx % 12, m = m0 + 1;
    const hit = b.frequency === 'monthly' || (b.frequency === 'quarterly' && (((m - fm) % 3) + 3) % 3 === 0) || (b.frequency === 'yearly' && m === fm);
    if (!hit) continue;
    const d = fmtDate(new Date(y, m0, Math.min(fd, new Date(y, m0 + 1, 0).getDate())));
    if (d >= start) return d;
  }
}

async function loadAll(householdId) {
  const { rows } = await pool.query(`SELECT ${COLS} FROM bills b LEFT JOIN accounts a ON a.id=b.account_id WHERE b.household_id=$1 ORDER BY b.id`, [householdId]);
  const p = await pool.query("SELECT bp.bill_id, to_char(MAX(bp.due_date),'YYYY-MM-DD') AS last_due, COUNT(*)::int AS paid_count FROM bill_payments bp JOIN bills b ON b.id=bp.bill_id WHERE b.household_id=$1 GROUP BY bp.bill_id", [householdId]);
  const last = new Map(p.rows.map((r) => [r.bill_id, r]));
  const today = todayStr();
  return rows.map((b) => {
    const l = last.get(b.id);
    const start = l && nextDay(l.last_due) > b.first_due ? nextDay(l.last_due) : b.first_due;
    const next_due = nextCycle(b, start);
    const days_left = daysBetween(today, next_due);
    return { ...b, last_paid_for: l ? l.last_due : null, paid_count: l ? l.paid_count : 0, next_due, days_left, overdue: b.status === 'active' && days_left < 0,
      monthly_cost: b.status === 'active' ? b.amount * PER_MONTH[b.frequency] : 0, yearly_cost: b.status === 'active' ? b.amount * PER_YEAR[b.frequency] : 0 };
  });
}

router.get('/', wrap(async (req, res) => res.json((await loadAll(req.household.id)).sort((a, b) => a.next_due.localeCompare(b.next_due)))));
router.get('/upcoming', wrap(async (req, res) => {
  const days = Number(req.query.days) || 30;
  res.json((await loadAll(req.household.id)).filter((b) => b.status === 'active' && b.days_left <= days).sort((a, b) => a.next_due.localeCompare(b.next_due)));
}));
router.get('/summary', wrap(async (req, res) => {
  const all = (await loadAll(req.household.id)).filter((b) => b.status === 'active');
  const by = {};
  all.forEach((b) => { const k = b.category || 'Other'; by[k] = (by[k] || 0) + b.monthly_cost; });
  res.json({ count: all.length, monthly: all.reduce((a, b) => a + b.monthly_cost, 0), yearly: all.reduce((a, b) => a + b.yearly_cost, 0),
    by: Object.entries(by).map(([category, monthly]) => ({ category, monthly })) });
}));

router.get('/splits', wrap(async (req, res) => {
  const splits = await pool.query(`SELECT id,name,total_amount::float8 AS total_amount,to_char(due_date,'YYYY-MM-DD') AS due_date
    FROM bill_splits WHERE household_id=$1 ORDER BY due_date,id`, [req.household.id]);
  const shares = await pool.query(`SELECT s.id,s.split_id,s.name,s.amount::float8 AS amount,s.paid
    FROM bill_split_shares s JOIN bill_splits b ON b.id=s.split_id WHERE b.household_id=$1 ORDER BY s.id`, [req.household.id]);
  const bySplit = new Map();
  for (const share of shares.rows) {
    const list = bySplit.get(share.split_id) || [];
    list.push(share);
    bySplit.set(share.split_id, list);
  }
  res.json(splits.rows.map((split) => ({ ...split, shares: bySplit.get(split.id) || [] })));
}));
router.post('/splits', wrap(async (req, res) => {
  const { name, total_amount, due_date, people } = req.body || {};
  const cleanPeople = Array.isArray(people) ? people.map((person) => String(person).trim()).filter(Boolean) : [];
  const due = new Date(`${due_date}T00:00:00Z`);
  if (!String(name || '').trim() || String(name).trim().length > 100 || !Number.isFinite(Number(total_amount)) || Number(total_amount) <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(due_date || '') || Number.isNaN(due.valueOf()) || due.toISOString().slice(0, 10) !== due_date ||
    cleanPeople.length < 2 || cleanPeople.length > 30 || cleanPeople.some((person) => person.length > 80))
    return res.status(400).json({ error: 'Enter a bill name, amount, due date and at least two participants.' });
  const cents = Math.round(Number(total_amount) * 100);
  if (cents < cleanPeople.length || cents > 999999999999)
    return res.status(400).json({ error: 'The total must cover at least MYR 0.01 per person and fit the supported amount range.' });
  const base = Math.floor(cents / cleanPeople.length), remainder = cents % cleanPeople.length;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const split = (await client.query(`INSERT INTO bill_splits(household_id,name,total_amount,due_date) VALUES($1,$2,$3,$4) RETURNING id`,
      [req.household.id, String(name).trim(), cents / 100, due_date])).rows[0];
    for (const [index, person] of cleanPeople.entries()) {
      await client.query('INSERT INTO bill_split_shares(split_id,name,amount) VALUES($1,$2,$3)',
        [split.id, person, (base + (index < remainder ? 1 : 0)) / 100]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}));
router.post('/splits/:id/shares/:shareId/toggle', wrap(async (req, res) => {
  const paid = req.body && req.body.paid;
  if (!['true', 'false'].includes(String(paid)) || !/^\d+$/.test(req.params.id) || !/^\d+$/.test(req.params.shareId))
    return res.status(400).json({ error: 'Invalid share.' });
  const result = await pool.query(`UPDATE bill_split_shares s SET paid=$1 FROM bill_splits b
    WHERE s.id=$2 AND s.split_id=b.id AND b.id=$3 AND b.household_id=$4`, [paid === true || paid === 'true', req.params.shareId, req.params.id, req.household.id]);
  result.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));
router.delete('/splits/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM bill_splits WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));

router.post('/', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid bill.' });
  const b = req.body;
  if (!(await validAccount(req.household.id, b.account_id))) return res.status(400).json({ error: 'Choose an active account in this household.' });
  await pool.query('INSERT INTO bills(household_id,name,category,amount,frequency,first_due,status,autopay,add_expense,account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [req.household.id, b.name.trim(), (b.category || '').trim(), b.amount, b.frequency, b.first_due, b.status || 'active', !!b.autopay, !!b.add_expense, b.account_id || null]);
  res.status(201).json({ ok: true });
}));
router.put('/:id', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid bill.' });
  const b = req.body;
  if (!(await validAccount(req.household.id, b.account_id))) return res.status(400).json({ error: 'Choose an active account in this household.' });
  const r = await pool.query('UPDATE bills SET name=$1,category=$2,amount=$3,frequency=$4,first_due=$5,status=$6,autopay=$7,add_expense=$8,account_id=$9 WHERE id=$10 AND household_id=$11',
    [b.name.trim(), (b.category || '').trim(), b.amount, b.frequency, b.first_due, b.status || 'active', !!b.autopay, !!b.add_expense, b.account_id || null, req.params.id, req.household.id]);
  r.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));
router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM bills WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));

// Mark the current cycle paid. If the bill is set to "record as expense", a matching expense is created in the same transaction.
router.post('/:id/pay', wrap(async (req, res) => {
  const bill = (await loadAll(req.household.id)).find((b) => b.id === +req.params.id);
  if (!bill) return res.status(404).json({ error: 'Not found' });
  const amount = req.body && req.body.amount !== '' && req.body.amount != null ? Number(req.body.amount) : bill.amount;
  const requestedAccount = req.body && Object.prototype.hasOwnProperty.call(req.body, 'account_id') ? req.body.account_id : bill.account_id;
  const accountId = requestedAccount == null || requestedAccount === '' ? null : Number(requestedAccount);
  if (!(await validAccount(req.household.id, accountId)))
    return res.status(400).json({ error: 'Choose an active account in this household.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let expId = null;
    if (bill.add_expense) {
      const [y, m] = bill.next_due.split('-').map(Number);
      expId = (await client.query('INSERT INTO expenses(household_id,type,amount,month,year,remarks,account_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [req.household.id, bill.category || bill.name, amount, m, y, 'Bill: ' + bill.name, accountId])).rows[0].id;
    }
    await client.query('INSERT INTO bill_payments(bill_id,due_date,paid_on,amount,expense_id,account_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [bill.id, bill.next_due, todayStr(), amount, expId, accountId]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true });
}));
router.post('/:id/undo', wrap(async (req, res) => {
  const own = await pool.query('SELECT 1 FROM bills WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  if (!own.rowCount) return res.status(404).json({ error: 'Not found' });
  const last = (await pool.query('SELECT id,expense_id FROM bill_payments WHERE bill_id=$1 ORDER BY due_date DESC LIMIT 1', [req.params.id])).rows[0];
  if (last) {
    if (last.expense_id) await pool.query('DELETE FROM expenses WHERE id=$1 AND household_id=$2', [last.expense_id, req.household.id]);
    await pool.query('DELETE FROM bill_payments WHERE id=$1', [last.id]);
  }
  res.json({ ok: true });
}));

const init = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly','yearly')),
    first_due DATE NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
    autopay BOOLEAN NOT NULL DEFAULT false, add_expense BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bill_payments (
    id SERIAL PRIMARY KEY, bill_id INT NOT NULL REFERENCES bills ON DELETE CASCADE,
    due_date DATE NOT NULL, paid_on DATE NOT NULL, amount NUMERIC(12,2) NOT NULL, expense_id INT, UNIQUE (bill_id, due_date))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bill_splits (
    id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    name TEXT NOT NULL, total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0), due_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bill_split_shares (
    id SERIAL PRIMARY KEY, split_id INT NOT NULL REFERENCES bill_splits ON DELETE CASCADE,
    name TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), paid BOOLEAN NOT NULL DEFAULT false)`);
  await lockDown(pool, ['bills', 'bill_payments', 'bill_splits', 'bill_split_shares']);
};
module.exports = { name: 'bills', router, init, loadAll };
