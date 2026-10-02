const router = require('express').Router();
const pool = require('../db');
const { wrap, lockDown } = require('../util');
const COLS = `id,name,target_amount::float8 AS target_amount,saved_amount::float8 AS saved_amount,
  to_char(target_date,'YYYY-MM-DD') AS target_date,status,last_progress_at`;
const STALE_MONTHS = 2; // remind when an ongoing goal has had no progress change for this long
const ok = (b) => b.name && Number(b.target_amount) > 0 && Number(b.saved_amount || 0) >= 0 &&
  /^\d{4}-\d{2}-\d{2}$/.test(b.target_date || '') && ['Ongoing', 'Complete'].includes(b.status);

function enrich(g) {
  const months = Math.floor((Date.now() - new Date(g.last_progress_at).getTime()) / (30.4 * 864e5));
  const today = new Date().toISOString().slice(0, 10);
  return { ...g, progress: Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100)),
    months_since_update: months,
    stale: g.status === 'Ongoing' && months >= STALE_MONTHS,
    overdue: g.status === 'Ongoing' && g.target_date < today };
}
const list = async (householdId) => (await pool.query(`SELECT ${COLS} FROM goals WHERE household_id=$1 ORDER BY status DESC, target_date`, [householdId])).rows.map(enrich);

router.get('/', wrap(async (req, res) => res.json(await list(req.household.id))));
router.get('/reminders', wrap(async (req, res) => res.json((await list(req.household.id)).filter((g) => g.stale || g.overdue))));
router.get('/summary', wrap(async (req, res) => {
  const g = await list(req.household.id);
  res.json({ complete: g.filter((x) => x.status === 'Complete').length, ongoing: g.filter((x) => x.status === 'Ongoing').length });
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body; if (!ok(b)) return res.status(400).json({ error: 'Invalid goal.' });
  const saved = b.status === 'Complete' ? b.target_amount : b.saved_amount || 0;
  await pool.query('INSERT INTO goals(household_id,name,target_amount,saved_amount,target_date,status) VALUES($1,$2,$3,$4,$5,$6)',
    [req.household.id, b.name.trim(), b.target_amount, saved, b.target_date, b.status]);
  res.status(201).json({ ok: true });
}));

// Progress clock resets only when saved amount or status actually changes.
router.put('/:id', wrap(async (req, res) => {
  const b = req.body; if (!ok(b)) return res.status(400).json({ error: 'Invalid goal.' });
  const cur = (await pool.query(`SELECT ${COLS} FROM goals WHERE id=$1 AND household_id=$2`, [req.params.id, req.household.id])).rows[0];
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const saved = b.status === 'Complete' ? Math.max(Number(b.saved_amount || 0), Number(b.target_amount)) : Number(b.saved_amount || 0);
  const changed = saved !== cur.saved_amount || b.status !== cur.status;
  await pool.query(`UPDATE goals SET name=$1,target_amount=$2,saved_amount=$3,target_date=$4,status=$5${changed ? ',last_progress_at=now()' : ''} WHERE id=$6 AND household_id=$7`,
    [b.name.trim(), b.target_amount, saved, b.target_date, b.status, req.params.id, req.household.id]);
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM goals WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));

const init = async () => { await pool.query(`CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
  name TEXT NOT NULL, target_amount NUMERIC(12,2) NOT NULL CHECK (target_amount > 0),
  saved_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  target_date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'Ongoing' CHECK (status IN ('Ongoing','Complete')),
  last_progress_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now())`);
  await lockDown(pool, ['goals']); };

module.exports = { name: 'goals', router, init, list };
