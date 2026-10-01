const express = require('express');
const { router: authRouter, requireAuth, requireHousehold, initAuthSchema } = require('./auth');
const { adminAuthRouter, adminRouter, initAdminSchema, requireAdmin } = require('./admin');
const modules = require('./modules');
const pool = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/admin-auth', adminAuthRouter);
app.use('/api/admin', requireAdmin, adminRouter);
// Records a household activity entry for successful writes in a module, so owners can see "recent activity" per household.
const activityLogger = (moduleName) => (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    pool.query('INSERT INTO household_activity(activity_type,actor_user_id,household_id,details) VALUES($1,$2,$3,$4)',
      ['module_action', req.user.id, req.household.id, { module: moduleName, method: req.method, actor_name: req.user.name }]).catch((e) => console.error(e));
  });
  next();
};
// Modular: each module exports { name, router } and is mounted at /api/<name>
for (const m of modules) app.use('/api/' + m.name, requireAuth, requireHousehold, activityLogger(m.name), m.router);
// Single-service hosting (e.g. Render): serve the built Angular app from ./public when it exists.
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
if (require('fs').existsSync(pub)) {
  app.use(express.static(pub));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(pub, 'index.html')));
} else {
  console.warn('Frontend build not found in ./public: this container was built from backend/Dockerfile, not the root Dockerfile.');
}
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });
(async () => {
  await initAuthSchema();
  await initAdminSchema();
  for (const m of modules) if (m.init) await m.init(); // lets a module create its own tables on existing databases
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('API on :' + PORT + ' – modules:', modules.map((m) => m.name).join(', ')));
})().catch((e) => { console.error(e); process.exit(1); });
