const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../util');
const COLS = 'id,type,name,amount::float8 AS amount,duration_months,due_day,start_month,start_year';
const ok = (b) => b.type && Number(b.amount) > 0 && b.duration_months >= 1 && b.due_day >= 1 && b.due_day <= 31 &&
  b.start_month >= 1 && b.start_month <= 12 && b.start_year >= 2000;
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dueDate = (y, m0, day) => { // clamps day to month length (31 -> 28/30)
  const last = new Date(y, m0 + 1, 0).getDate();
  return fmtDate(new Date(y, m0, Math.min(day, last)));
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

async function loadAll(userId) {
  const { rows } = await pool.query(`SELECT ${COLS} FROM installments WHERE user_id=$1 ORDER BY id`, [userId]);
  const pays = await pool.query('SELECT p.installment_id, p.period FROM installment_payments p JOIN installments i ON i.id=p.installment_id WHERE i.user_id=$1', [userId]);
  const today = fmtDate(new Date());
  return rows.map((i) => {
    const paid = new Set(pays.rows.filter((p) => p.installment_id === i.id).map((p) => p.period));
    const schedule = Array.from({ length: i.duration_months }, (_, k) => {
      const due_date = dueDate(i.start_year, i.start_month - 1 + k, i.due_day);
      return { period: k + 1, due_date, paid: paid.has(k + 1), overdue: !paid.has(k + 1) && due_date < today };
    });
    const next = schedule.find((s) => !s.paid);
    return { ...i, schedule, paid_count: paid.size, progress: Math.round((paid.size / i.duration_months) * 100),
      next_due: next ? next.due_date : null, completed: paid.size >= i.duration_months };
  });
}

router.get('/', wrap(async (req, res) => res.json(await loadAll(req.user.id))));

router.get('/upcoming', wrap(async (req, res) => {
  const days = Number(req.query.days) || 30;
  const today = fmtDate(new Date());
  const out = [];
  for (const i of await loadAll(req.user.id))
    for (const s of i.schedule) {
      const left = daysBetween(today, s.due_date);
      if (!s.paid && left <= days) out.push({ installment_id: i.id, type: i.type, name: i.name, amount: i.amount, period: s.period, of: i.duration_months, due_date: s.due_date, days_left: left });
    }
  res.json(out.sort((a, b) => a.due_date.localeCompare(b.due_date)));
}));

router.get('/summary', wrap(async (req, res) => {
  const by = {};
  for (const i of await loadAll(req.user.id)) {
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
  await pool.query('INSERT INTO installments(user_id,type,name,amount,duration_months,due_day,start_month,start_year) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [req.user.id, b.type, b.name || '', b.amount, b.duration_months, b.due_day, b.start_month, b.start_year]);
  res.status(201).json({ ok: true });
}));

router.put('/:id', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'Invalid installment.' });
  const b = req.body;
  const r = await pool.query('UPDATE installments SET type=$1,name=$2,amount=$3,duration_months=$4,due_day=$5,start_month=$6,start_year=$7 WHERE id=$8 AND user_id=$9',
    [b.type, b.name || '', b.amount, b.duration_months, b.due_day, b.start_month, b.start_year, req.params.id, req.user.id]);
  r.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM installments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.status(204).end();
}));

// Mark / unmark a month's payment: { period, paid }
router.post('/:id/payments', wrap(async (req, res) => {
  const own = await pool.query('SELECT 1 FROM installments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!own.rowCount) return res.status(404).json({ error: 'Not found' });
  const { period, paid } = req.body;
  if (paid) await pool.query('INSERT INTO installment_payments(installment_id,period) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, period]);
  else await pool.query('DELETE FROM installment_payments WHERE installment_id=$1 AND period=$2', [req.params.id, period]);
  res.json({ ok: true });
}));

module.exports = { name: 'installments', router };
