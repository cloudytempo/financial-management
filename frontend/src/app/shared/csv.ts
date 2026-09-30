import { MONTHS } from './util';

// Minimal RFC-4180 parser: quoted fields, embedded commas/newlines, BOM.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export interface ImportRow { type: string; amount: number; month: number; year: number; remarks: string; }

// Accepts our CSV (Type,Amount,Month,Year,Remarks) or a raw export of the Belanjawanku sheet (Expenses,Amount,Description,Month,MonthNum,Year).
export function mapExpenseRows(text: string): { records: ImportRow[]; blank: number } {
  const rows = parseCsv(text);
  if (!rows.length) return { records: [], blank: 0 };
  const h = rows[0].map((x) => x.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...n: string[]) => h.findIndex((x) => n.includes(x));
  const [iT, iA, iM, iMn, iY, iR] = [col('type', 'expenses', 'expense', 'category'), col('amount'), col('month'), col('monthnum'), col('year'), col('remarks', 'description', 'note', 'notes')];
  const records: ImportRow[] = []; let blank = 0;
  for (const r of rows.slice(1)) {
    const raw = (r[iA] ?? '').replace(/[^0-9.\-]/g, '');
    if (raw === '') { blank++; continue; }
    let month = +(iMn >= 0 ? r[iMn] : r[iM]);
    if (!month) month = MONTHS.findIndex((m) => m.toLowerCase() === (r[iM] || '').trim().slice(0, 3).toLowerCase()) + 1;
    const rec = { type: (r[iT] || '').trim(), amount: +raw, month, year: +r[iY], remarks: (r[iR] || '').trim() };
    if (rec.type && rec.month >= 1 && rec.month <= 12 && rec.year >= 2000 && !isNaN(rec.amount)) records.push(rec);
  }
  return { records, blank };
}
