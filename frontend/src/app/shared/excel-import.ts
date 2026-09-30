import readXlsxFile from 'read-excel-file';

export interface ImportRow { type: string; amount: number; month: number; year: number; remarks: string; }
export interface ParseResult { rows: ImportRow[]; blanks: number; invalid: number; sheet: string; }

const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const find = (h: string[], names: string[]) => h.findIndex((x) => names.includes(x));

/** Maps sheet rows (first row = headers) to expense records. Empty amounts are skipped, zeros are kept. */
export function mapRows(data: any[][], sheet = ''): ParseResult {
  const head = (data[0] || []).map((c) => String(c ?? '').trim().toLowerCase());
  const iType = find(head, ['expenses', 'expense', 'type']);
  const iAmt = find(head, ['amount']);
  const iRem = find(head, ['description', 'remarks', 'remark', 'note', 'notes']);
  const iMonN = find(head, ['monthnum', 'month number']);
  const iMon = iMonN >= 0 ? iMonN : find(head, ['month']);
  const iYear = find(head, ['year']);
  if ([iType, iAmt, iMon, iYear].some((i) => i < 0))
    throw new Error('Could not find the columns Expenses, Amount, Month/MonthNum and Year in that sheet.');

  const out: ImportRow[] = []; let blanks = 0, invalid = 0;
  for (const r of data.slice(1)) {
    const type = String(r[iType] ?? '').trim();
    if (!type) continue;
    if (r[iAmt] == null || r[iAmt] === '') { blanks++; continue; }
    const amount = Number(r[iAmt]);
    const mRaw = r[iMon];
    const month = typeof mRaw === 'number' ? mRaw : MONTH_NAMES.indexOf(String(mRaw ?? '').trim().toLowerCase()) + 1;
    const year = Number(r[iYear]);
    if (!isFinite(amount) || amount < 0 || !(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) { invalid++; continue; }
    out.push({ type, amount: Math.round(amount * 100) / 100, month, year, remarks: iRem >= 0 ? String(r[iRem] ?? '').trim() : '' });
  }
  return { rows: out, blanks, invalid, sheet };
}

/** Reads an .xlsx file in the browser. Uses the "All Expenses" sheet when present, otherwise the first sheet. */
export async function parseExcel(file: File): Promise<ParseResult> {
  const sheets = (await readXlsxFile(file, { getSheets: true } as any)) as unknown as { name: string }[];
  const name = (sheets.find((s) => /all expenses/i.test(s.name)) || sheets[0])?.name;
  const data = (await readXlsxFile(file, { sheet: name } as any)) as any[][];
  return mapRows(data, name);
}
