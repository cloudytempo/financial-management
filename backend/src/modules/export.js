const router = require('express').Router();
const pool = require('../db');
const { wrap, logActivity } = require('../util');
const { householdExport } = require('../exporter');

router.get('/', wrap(async (req, res) => {
  const ext = await householdExport(req, res);
  await logActivity(pool, 'data_exported', req.user.id, req.household.id, null, { actor_name: req.user.name, format: ext === 'zip' ? 'CSV' : 'Excel' })
    .catch((e) => console.error(e));
}));

module.exports = { name: 'export', router };
