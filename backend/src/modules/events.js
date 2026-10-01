const router = require('express').Router();
const pool = require('../db');
const { wrap, lockDown, fmtDate } = require('../util');
const TYPES = ['Personal', 'Work', 'Family', 'Appointment', 'Birthday', 'Payment', 'Travel', 'Other'];
const COLS = "id,title,type,to_char(event_date,'YYYY-MM-DD') AS event_date,to_char(event_time,'HH24:MI') AS event_time,notes";
const ORDER = 'ORDER BY event_date, event_time NULLS FIRST, id';

router.get('/', wrap(async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await pool.query(`SELECT ${COLS} FROM events WHERE household_id=$1 AND event_date BETWEEN $2 AND $3 ${ORDER}`, [req.household.id, from, to]);
  res.json(rows);
}));
// Agenda: everything from today onward for the next N days (default 60).
router.get('/upcoming', wrap(async (req, res) => {
  const from = new Date(), to = new Date(); to.setDate(to.getDate() + (Number(req.query.days) || 60));
  const { rows } = await pool.query(`SELECT ${COLS} FROM events WHERE household_id=$1 AND event_date BETWEEN $2 AND $3 ${ORDER}`, [req.household.id, fmtDate(from), fmtDate(to)]);
  res.json(rows);
}));
router.post('/', wrap(async (req, res) => {
  const { title, event_date, event_time, notes, type } = req.body || {};
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(event_date || '')) return res.status(400).json({ error: 'Title and date are required.' });
  const { rows } = await pool.query(`INSERT INTO events(household_id,title,type,event_date,event_time,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
    [req.household.id, title.trim(), TYPES.includes(type) ? type : 'Personal', event_date, event_time || null, notes || '']);
  res.status(201).json(rows[0]);
}));
router.put('/:id', wrap(async (req, res) => {
  const { title, event_date, event_time, notes, type } = req.body || {};
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(event_date || '')) return res.status(400).json({ error: 'Title and date are required.' });
  const r = await pool.query('UPDATE events SET title=$1,type=$2,event_date=$3,event_time=$4,notes=$5 WHERE id=$6 AND household_id=$7',
    [title.trim(), TYPES.includes(type) ? type : 'Personal', event_date, event_time || null, notes || '', req.params.id, req.household.id]);
  r.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));
router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM events WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));

const init = async () => {
  await pool.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TIME');
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Personal'");
  await lockDown(pool, ['events']);
};
module.exports = { name: 'events', router, init };
