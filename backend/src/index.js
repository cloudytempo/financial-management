const express = require('express');
const { router: authRouter, requireAuth, initAuthSchema } = require('./auth');
const modules = require('./modules');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
// Modular: each module exports { name, router } and is mounted at /api/<name>
for (const m of modules) app.use('/api/' + m.name, requireAuth, m.router);
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
  for (const m of modules) if (m.init) await m.init(); // lets a module create its own tables on existing databases
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('API on :' + PORT + ' – modules:', modules.map((m) => m.name).join(', ')));
})().catch((e) => { console.error(e); process.exit(1); });
