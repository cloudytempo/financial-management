exports.wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const pad = (n) => String(n).padStart(2, '0');
exports.fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
exports.todayStr = () => exports.fmtDate(new Date());
exports.daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
// Row-level security keeps Supabase's public Data API away from our tables (harmless on plain Postgres).
exports.lockDown = async (pool, tables) => { for (const t of tables) await pool.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`); };
exports.logActivity = (client, type, actorId, householdId, subjectId = null, details = {}) =>
  client.query('INSERT INTO household_activity(activity_type,actor_user_id,household_id,subject_user_id,details) VALUES($1,$2,$3,$4,$5)',
    [type, actorId, householdId, subjectId, details]);
exports.notify = (client, userId, type, message, details = {}) =>
  client.query('INSERT INTO user_notifications(user_id,type,message,details) VALUES($1,$2,$3,$4)', [userId, type, message, details]);
// Short, human-friendly, unambiguous household join code (no 0/O/1/I).
exports.randomCode = (len = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};
