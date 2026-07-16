const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/requireAuth');
const { isInstanceRunning } = require('../jobs/snLogin');

const router = express.Router();
router.use(requireAuth);

function formatInstance(instance) {
  return {
    ...instance,
    enabled: !!instance.enabled,
    isRunning: isInstanceRunning(instance.id),
    last_result_label: instance.last_result || 'never',
  };
}

router.get('/', (req, res) => {
  const instances = db.getAllInstances().map(formatInstance);
  const recentLogs = db.getRecentLogs(30);
  const flash = req.session.flash;
  delete req.session.flash;

  res.render('dashboard', { instances, recentLogs, flash });
});

module.exports = router;
