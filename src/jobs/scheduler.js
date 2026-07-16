const cron = require('node-cron');
const db = require('../db/db');
const { runLoginForInstance } = require('./snLogin');

let tickTask = null;

function isDue(instance) {
  if (!instance.enabled) return false;

  if (!instance.last_run_at) {
    return true;
  }

  const lastRun = new Date(instance.last_run_at).getTime();
  const intervalMs = (instance.interval_minutes || 240) * 60 * 1000;
  return Date.now() >= lastRun + intervalMs;
}

function computeNextRunAt(instance) {
  if (!instance.enabled) return null;
  const base = instance.last_run_at ? new Date(instance.last_run_at).getTime() : Date.now();
  return new Date(base + (instance.interval_minutes || 240) * 60 * 1000).toISOString();
}

async function tick() {
  const instances = db.getEnabledInstances();
  for (const instance of instances) {
    if (isDue(instance)) {
      runLoginForInstance(instance, 'scheduled').catch((err) => {
        console.error(`Scheduled login failed for instance ${instance.id}:`, err.message);
      });
    }
  }
}

function scheduleInstance(instance) {
  if (!instance) return;

  const nextRun = computeNextRunAt(instance);
  db.updateInstanceRunStatus(instance.id, {
    last_run_at: instance.last_run_at,
    last_result: instance.last_result,
    next_run_at: nextRun,
  });

  if (instance.enabled) {
    console.log(`Instance "${instance.name}" scheduled every ${instance.interval_minutes} min`);
  }
}

function unscheduleInstance(_instanceId) {
  // Jobs are driven by the global tick; nothing to tear down per instance.
}

function initScheduler() {
  if (tickTask) return;

  const instances = db.getEnabledInstances();
  console.log(`Initializing scheduler for ${instances.length} enabled instance(s)`);

  for (const instance of instances) {
    scheduleInstance(instance);
  }

  tickTask = cron.schedule('* * * * *', tick);
  setTimeout(tick, 5000);
}

function stopScheduler() {
  if (tickTask) {
    tickTask.stop();
    tickTask = null;
  }
}

module.exports = { scheduleInstance, unscheduleInstance, initScheduler, stopScheduler, isDue, computeNextRunAt };
