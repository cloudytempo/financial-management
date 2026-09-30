const express = require('express');
const { router: authRouter, requireAuth } = require('./auth');
const modules = require('./modules');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
// Modular: each module exports { name, router } and is mounted at /api/<name>
for (const m of modules) app.use('/api/' + m.name, requireAuth, m.router);
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });
(async () => {
  for (const m of modules) if (m.init) await m.init(); // lets a module create its own tables on existing databases
  app.listen(3000, () => console.log('API on :3000 – modules:', modules.map((m) => m.name).join(', ')));
})().catch((e) => { console.error(e); process.exit(1); });
