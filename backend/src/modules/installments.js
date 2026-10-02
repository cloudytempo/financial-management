const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../util');
const COLS = 'i.id,i.type,i.name,i.amount::float8 AS amount,i.duration_months,i.due_day,i.start_month,i.start_year,i.account_id,a.name AS account_name';
const ok = (b) => b.type && Number(b.amount) > 0 && b.duration_months >= 1 && b.due_day >= 1 && b.due_day <= 31 &&
  b.start_month >= 1 && b.start_month <= 12 && b.start_year >= 2000;
async function validAccount(householdId, value) {
  if (value == null || value === '') return true;
  const id = Number(value);
  return Number.isInteger(id) && !!(await pool.query('SELECT 1 FROM accounts WHERE id=$1 AND household_id=$2 AND is_active=true', [id, householdId])).rowCount;
}
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dueDate = (y, m0, day) => { // clamps day to month length (31 -> 28/30)
  const last = new Date(y, m0 + 1, 0).getDate();
  return fmtDate(new Date(y, m0, Math.min(day, last)));
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

async function loadAll(householdId) {
  const { rows } = await pool.query(`SELECT ${COLS} FROM installments i LEFT JOIN accounts a ON a.id=i.account_id WHERE i.household_id=$1 ORDER BY i.id`, [householdId]);
  const pays = await pool.query(`SELECT p.installment_id,p.period,p.account_id,a.name AS account_name FROM installment_payments p
    JOIN installments i ON i.id=p.installment_id LEFT JOIN accounts a ON a.id=p.account_id WHERE i.household_id=$1`, [householdId]);
  const today = fmtDate(new Date());
  return rows.map((i) => {
    const payments = new Map(pays.rows.filter((p) => p.installment_id === i.id).map((p) => [p.period, p]));
    const schedule = Array.from({ length: i.duration_months }, (_, k) => {
      const due_date = dueDate(i.start_year, i.start_month - 1 + k, i.due_day);
      const payment = payments.get(k + 1);
      return { period: k + 1, due_date, paid: !!payment, account_id: payment?.account_id ?? null, account_name: payment?.account_name ?? null, overdue: !payment && due_date < today };
    });
    const paid = new Set(payments.keys());
    const next = schedule.find((s) => !s.paid);
    return { ...i, schedule, paid_count: paid.size, progress: Math.round((paid.size / i.duration_months) * 100),
      next_due: next ? next.due_date : null, completed: paid.size >= i.duration_months };
  });
}

router.get('/', wrap(async (req, res) => res.json(await loadAll(req.household.id))));

router.get('/upcoming', wrap(async (req, res) => {
  const days = Number(req.query.days) || 30;
  const today = fmtDate(new Date());
  const out = [];
  for (const i of await loadAll(req.household.id))
    for (const s of i.schedule) {
      const left = daysBetween(today, s.due_date);
      if (!s.paid && left <= days) out.push({ installment_id: i.id, type: i.type, name: i.name, amount: i.amount, period: s.period, of: i.duration_months, due_date: s.due_date, days_left: left });
    }
  res.json(out.sort((a, b) => a.due_date.localeCompare(b.due_date)));
}));

router.get('/summary', wrap(async (req, res) => {
  const by = {};
  for (const i of await loadAll(req.household.id)) {
    const t = (by[i.type] ||= { type: i.type, total: 0, paid: 0, remaining: 0, monthly: 0 });
    t.total += i.amount * i.duration_months; t.paid += i.amount * i.paid_count;
    t.remaining += i.amount * (i.duration_months - i.paid_count);
    if (!i.completed) t.monthly += i.amount;
  }
  res.json(Object.values(by));
}));

router.post('/', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid installment.' });
  const b = req.body;
  if (!(await validAccount(req.household.id, b.account_id))) return res.status(400).json({ error: 'Choose an active account in this household.' });
  await pool.query('INSERT INTO installments(household_id,type,name,amount,duration_months,due_day,start_month,start_year,account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [req.household.id, b.type, b.name || '', b.amount, b.duration_months, b.due_day, b.start_month, b.start_year, b.account_id || null]);
  res.status(201).json({ ok: true });
}));

router.put('/:id', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid installment.' });
  const b = req.body;
  if (!(await validAccount(req.household.id, b.account_id))) return res.status(400).json({ error: 'Choose an active account in this household.' });
  const r = await pool.query('UPDATE installments SET type=$1,name=$2,amount=$3,duration_months=$4,due_day=$5,start_month=$6,start_year=$7,account_id=$8 WHERE id=$9 AND household_id=$10',
    [b.type, b.name || '', b.amount, b.duration_months, b.due_day, b.start_month, b.start_year, b.account_id || null, req.params.id, req.household.id]);
  r.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM installments WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));

// Mark / unmark a month's payment: { period, paid }
router.post('/:id/payments', wrap(async (req, res) => {
  const own = await pool.query('SELECT amount,account_id FROM installments WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  if (!own.rowCount) return res.status(404).json({ error: 'Not found' });
  const { period, paid } = req.body || {};
  if (!Number.isInteger(Number(period)) || Number(period) < 1) return res.status(400).json({ error: 'Invalid installment period.' });
  if (paid) {
    const requestedAccount = Object.prototype.hasOwnProperty.call(req.body, 'account_id') ? req.body.account_id : own.rows[0].account_id;
    const accountId = requestedAccount == null || requestedAccount === '' ? null : Number(requestedAccount);
    if (!(await validAccount(req.household.id, accountId))) return res.status(400).json({ error: 'Choose an active account in this household.' });
    await pool.query(`INSERT INTO installment_payments(installment_id,period,account_id,payment_amount)
      VALUES($1,$2,$3,$4) ON CONFLICT(installment_id,period) DO UPDATE SET account_id=EXCLUDED.account_id,payment_amount=EXCLUDED.payment_amount`,
      [req.params.id, Number(period), accountId, own.rows[0].amount]);
  }
  else await pool.query('DELETE FROM installment_payments WHERE installment_id=$1 AND period=$2', [req.params.id, period]);
  res.json({ ok: true });
}));

module.exports = { name: 'installments', router, loadAll };
