exports.wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const pad = (n) => String(n).padStart(2, '0');
exports.fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
exports.todayStr = () => exports.fmtDate(new Date());
exports.daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
// Row-level security keeps Supabase's public Data API away from our tables (harmless on plain Postgres).
exports.lockDown = async (pool, tables) => { for (const t of tables) await pool.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`); };
