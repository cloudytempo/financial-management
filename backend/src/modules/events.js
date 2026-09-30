const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../util');
const COLS = "id,title,to_char(event_date,'YYYY-MM-DD') AS event_date,notes";

router.get('/', wrap(async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await pool.query(`SELECT ${COLS} FROM events WHERE user_id=$1 AND event_date BETWEEN $2 AND $3 ORDER BY event_date`, [req.user.id, from, to]);
  res.json(rows);
}));
router.post('/', wrap(async (req, res) => {
  const { title, event_date, notes } = req.body || {};
  if (!title || !event_date) return res.status(400).json({ error: 'Title and date are required.' });
  const { rows } = await pool.query(`INSERT INTO events(user_id,title,event_date,notes) VALUES($1,$2,$3,$4) RETURNING ${COLS}`, [req.user.id, title, event_date, notes || '']);
  res.status(201).json(rows[0]);
}));
router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM events WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.status(204).end();
}));

module.exports = { name: 'events', router };
