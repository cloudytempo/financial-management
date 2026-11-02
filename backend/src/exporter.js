const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const pool = require('./db');

const NUMERIC_OIDS = new Set([20, 1700]); // bigint, numeric: pg returns these as strings
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getHours() || d.getMinutes() || d.getSeconds() ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : day;
};

// Each query becomes one sheet (xlsx) or one file (csv); never select password hashes.
async function collect(queries, params) {
  const sheets = [];
  for (const [name, sql] of queries) {
    const r = await pool.query(sql, params);
    const cols = r.fields.map((f) => ({ name: f.name, numeric: NUMERIC_OIDS.has(f.dataTypeID) }));
    const rows = r.rows.map((row) => cols.map((c) => {
      const v = row[c.name];
      if (v == null) return null;
      if (v instanceof Date) return stamp(v);
      if (c.numeric) return Number(v);
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    }));
    sheets.push({ name, cols: cols.map((c) => c.name), rows });
  }
  return sheets;
}

// Excel evaluates CSV cells that start with these characters as formulas; phone-like values are left as-is.
const csvCell = (v) => {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s()-]+$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (s) => '\uFEFF' + [s.cols, ...s.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

async function render(sheets, format) {
  if (format === 'csv') {
    const zip = new JSZip();
    for (const s of sheets) zip.file(s.name + '.csv', toCsv(s));
    return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), type: 'application/zip', ext: 'zip' };
  }
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow(s.cols).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of s.rows) ws.addRow(row);
    ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(10, String(s.cols[i]).length + 2)); });
  }
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}

const send = (res, out, prefix) => res.set({
  'Content-Type': out.type,
  'Content-Disposition': `attachment; filename="${prefix}-${new Date().toISOString().slice(0, 10)}.${out.ext}"`,
  'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
}).send(out.buffer);

const parseFormat = (q) => (q === 'csv' ? 'csv' : 'xlsx');

const HOUSEHOLD_QUERIES = [
  ['members', `SELECT u.name,u.email,u.phone,to_char(u.birthday,'YYYY-MM-DD') AS birthday,m.joined_at,(h.created_by=u.id) AS is_owner
    FROM household_members m JOIN users u ON u.id=m.user_id JOIN households h ON h.id=m.household_id WHERE m.household_id=$1 ORDER BY m.joined_at`],
  ['accounts', 'SELECT * FROM accounts WHERE household_id=$1 ORDER BY id'],
  ['account_transfers', 'SELECT * FROM account_transfers WHERE household_id=$1 ORDER BY id'],
  ['income', 'SELECT * FROM income WHERE household_id=$1 ORDER BY id'],
  ['expenses', 'SELECT * FROM expenses WHERE household_id=$1 ORDER BY id'],
  ['budgets', 'SELECT * FROM budgets WHERE household_id=$1 ORDER BY id'],
  ['bills', 'SELECT * FROM bills WHERE household_id=$1 ORDER BY id'],
  ['bill_payments', 'SELECT p.* FROM bill_payments p JOIN bills b ON b.id=p.bill_id WHERE b.household_id=$1 ORDER BY p.id'],
  ['bill_splits', 'SELECT * FROM bill_splits WHERE household_id=$1 ORDER BY id'],
  ['bill_split_shares', 'SELECT s.* FROM bill_split_shares s JOIN bill_splits b ON b.id=s.split_id WHERE b.household_id=$1 ORDER BY s.id'],
  ['installments', 'SELECT * FROM installments WHERE household_id=$1 ORDER BY id'],
  ['installment_payments', 'SELECT p.* FROM installment_payments p JOIN installments i ON i.id=p.installment_id WHERE i.household_id=$1 ORDER BY p.installment_id,p.period'],
  ['goals', 'SELECT * FROM goals WHERE household_id=$1 ORDER BY id'],
  ['contacts', 'SELECT c.*,EXISTS(SELECT 1 FROM contact_qr q WHERE q.contact_id=c.id) AS has_qr FROM contacts c WHERE c.household_id=$1 ORDER BY c.id'],
  ['events', 'SELECT * FROM events WHERE household_id=$1 ORDER BY id'],
];

const SYSTEM_QUERIES = [
  ['users', 'SELECT id,name,email,phone,is_active,is_banned,active_household_id,created_at FROM users ORDER BY id'],
  ['households', 'SELECT id,name,public_id,address,is_active,created_by,created_at FROM households ORDER BY id'],
  ['household_members', 'SELECT household_id,user_id,joined_at FROM household_members ORDER BY household_id,user_id'],
  ['household_bans', 'SELECT id,household_id,user_id,banned_by,reason,created_at FROM household_bans ORDER BY id'],
  ['household_reports', 'SELECT * FROM household_reports ORDER BY id'],
  ['household_activity', 'SELECT * FROM household_activity ORDER BY id'],
];

exports.householdExport = async (req, res) => {
  const out = await render(await collect(HOUSEHOLD_QUERIES, [req.household.id]), parseFormat(req.query.format));
  send(res, out, 'homint-household');
  return out.ext;
};
exports.systemExport = async (req, res) => {
  const out = await render(await collect(SYSTEM_QUERIES, []), parseFormat(req.query.format));
  send(res, out, 'homint-system');
  return out.ext;
};
