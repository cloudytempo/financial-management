const express = require('express');
const router = express.Router();
const pool = require('../db');
const { wrap, lockDown } = require('../util');
const COLS = 'id,name,phone,category,notes,favorite';
const CATS = ['Family', 'Emergency', 'Utilities', 'Services', 'Work', 'Other'];
const ok = (b) => b.name && /^[+0-9()\-\s]{3,20}$/.test(b.phone || '') && CATS.includes(b.category || 'Other');

const QR_MAX_BYTES = 150 * 1024;
const QR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
// Checks the real file signature, since the Content-Type header is client-controlled.
const sniff = (b) => {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};
const rawImage = express.raw({ type: QR_TYPES, limit: QR_MAX_BYTES });
const qrBody = (req, res, next) => rawImage(req, res, (e) =>
  e ? res.status(e.status === 413 ? 413 : 400).json({ error: e.status === 413 ? 'The QR image is too large.' : 'Invalid image upload.' }) : next());

router.get('/', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLS}, EXISTS(SELECT 1 FROM contact_qr q WHERE q.contact_id=contacts.id) AS has_qr FROM contacts WHERE household_id=$1 ORDER BY favorite DESC, lower(name)`, [req.household.id]);
  res.json(rows);
}));
router.post('/emergency-seed', wrap(async (req, res) => {
  const have = new Set((await pool.query('SELECT phone FROM contacts WHERE household_id=$1', [req.household.id])).rows.map((r) => r.phone));
  const seeds = [['Police / Ambulance', '999'], ['Fire (Bomba)', '994'], ['Mobile emergency', '112']];
  let added = 0;
  for (const [n, p] of seeds) if (!have.has(p)) { await pool.query("INSERT INTO contacts(household_id,name,phone,category,favorite) VALUES($1,$2,$3,'Emergency',true)", [req.household.id, n, p]); added++; }
  res.json({ added });
}));
router.post('/', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'A name and a valid phone number are required.' });
  const b = req.body;
  const { rows } = await pool.query(`INSERT INTO contacts(household_id,name,phone,category,notes,favorite) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
    [req.household.id, b.name.trim(), b.phone.trim(), b.category || 'Other', b.notes || '', !!b.favorite]);
  res.status(201).json(rows[0]);
}));
router.put('/:id', wrap(async (req, res) => {
  if (!ok(req.body)) return res.status(400).json({ error: 'A name and a valid phone number are required.' });
  const b = req.body;
  const r = await pool.query('UPDATE contacts SET name=$1,phone=$2,category=$3,notes=$4,favorite=$5 WHERE id=$6 AND household_id=$7',
    [b.name.trim(), b.phone.trim(), b.category || 'Other', b.notes || '', !!b.favorite, req.params.id, req.household.id]);
  r.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));
router.put('/:id/qr', qrBody, wrap(async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ error: 'Choose a PNG, JPEG or WebP image.' });
  const mime = sniff(body);
  if (!mime || mime !== req.headers['content-type']) return res.status(400).json({ error: 'Choose a PNG, JPEG or WebP image.' });
  const own = await pool.query('SELECT 1 FROM contacts WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  if (!own.rowCount) return res.status(404).json({ error: 'Not found' });
  await pool.query(`INSERT INTO contact_qr(contact_id,household_id,mime,data) VALUES($1,$2,$3,$4)
    ON CONFLICT (contact_id) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data, updated_at=now()`, [req.params.id, req.household.id, mime, body]);
  res.json({ ok: true });
}));
router.get('/:id/qr', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT mime,data FROM contact_qr WHERE contact_id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.set({ 'Content-Type': rows[0].mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-cache' }).send(rows[0].data);
}));
router.delete('/:id/qr', wrap(async (req, res) => {
  await pool.query('DELETE FROM contact_qr WHERE contact_id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));
router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM contacts WHERE id=$1 AND household_id=$2', [req.params.id, req.household.id]);
  res.status(204).end();
}));

const init = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    name TEXT NOT NULL, phone TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Other', notes TEXT DEFAULT '',
    favorite BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS contact_qr (
    contact_id INT PRIMARY KEY REFERENCES contacts ON DELETE CASCADE, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    mime TEXT NOT NULL, data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await lockDown(pool, ['contacts', 'contact_qr']);
};
module.exports = { name: 'contacts', router, init };
