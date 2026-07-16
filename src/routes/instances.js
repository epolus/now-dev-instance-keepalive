const { URL } = require('url');
const express = require('express');
const db = require('../db/db');
const { encrypt } = require('../db/crypto');
const { requireAuth } = require('../middleware/requireAuth');
const { runLoginForInstance, isInstanceRunning } = require('../jobs/snLogin');
const { scheduleInstance, unscheduleInstance } = require('../jobs/scheduler');

const router = express.Router();
router.use(requireAuth);

function normalizeUrl(url) {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized.replace(/\/+$/, '');
}

function validateInstanceInput(body, requirePassword = true) {
  const errors = [];
  const name = (body.name || '').trim();
  const instance_url = (body.instance_url || '').trim();
  const username = (body.username || '').trim();
  const password = body.password || '';
  const interval_minutes = parseInt(body.interval_minutes, 10) || 240;
  const enabled = body.enabled === 'on' || body.enabled === true || body.enabled === '1';

  if (!name) errors.push('Name is required');
  if (!instance_url) errors.push('Instance URL is required');
  if (!username) errors.push('Username is required');
  if (requirePassword && !password) errors.push('Password is required');

  if (instance_url) {
    try {
      const parsed = new URL(normalizeUrl(instance_url));
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push('Instance URL must use http or https');
      }
    } catch {
      errors.push('Instance URL is not valid');
    }
  }

  if (interval_minutes < 5 || interval_minutes > 1440) {
    errors.push('Interval must be between 5 and 1440 minutes');
  }

  return {
    errors,
    data: { name, instance_url: normalizeUrl(instance_url), username, password, interval_minutes, enabled },
  };
}

router.get('/instances/new', (req, res) => {
  res.render('instance-form', {
    instance: { interval_minutes: 240, enabled: true },
    errors: [],
    isEdit: false,
  });
});

router.get('/instances/:id/edit', (req, res) => {
  const instance = db.getInstanceById(req.params.id);
  if (!instance) {
    return res.status(404).render('error', { message: 'Instance not found' });
  }
  res.render('instance-form', { instance, errors: [], isEdit: true });
});

router.post('/instances', (req, res) => {
  const { errors, data } = validateInstanceInput(req.body);
  if (errors.length) {
    return res.status(400).render('instance-form', {
      instance: { ...data, enabled: data.enabled },
      errors,
      isEdit: false,
    });
  }

  const id = db.createInstance({
    ...data,
    encrypted_password: encrypt(data.password),
  });

  scheduleInstance(db.getInstanceById(id));
  res.redirect('/');
});

router.post('/instances/:id', (req, res) => {
  const instance = db.getInstanceById(req.params.id);
  if (!instance) {
    return res.status(404).render('error', { message: 'Instance not found' });
  }

  const hasPassword = !!(req.body.password || '').trim();
  const { errors, data } = validateInstanceInput(req.body, hasPassword);
  if (errors.length) {
    return res.status(400).render('instance-form', {
      instance: { ...instance, ...data },
      errors,
      isEdit: true,
    });
  }

  const updateData = {
    name: data.name,
    instance_url: data.instance_url,
    username: data.username,
    interval_minutes: data.interval_minutes,
    enabled: data.enabled,
  };
  if (hasPassword) {
    updateData.encrypted_password = encrypt(data.password);
  }

  db.updateInstance(instance.id, updateData);

  unscheduleInstance(instance.id);
  scheduleInstance(db.getInstanceById(instance.id));
  res.redirect('/');
});

router.post('/instances/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  unscheduleInstance(id);
  db.deleteInstance(id);
  res.redirect('/');
});

router.post('/instances/:id/run', async (req, res) => {
  const instance = db.getInstanceById(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  if (isInstanceRunning(instance.id)) {
    return res.status(409).json({ error: 'Login already in progress for this instance' });
  }

  runLoginForInstance(instance, 'manual').catch((err) => {
    console.error(`Manual run failed for instance ${instance.id}:`, err.message);
  });

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ ok: true, message: 'Login job started' });
  }
  res.redirect('/');
});

router.post('/instances/:id/test', async (req, res) => {
  const instance = db.getInstanceById(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  if (isInstanceRunning(instance.id)) {
    return res.status(409).json({ error: 'Login already in progress for this instance' });
  }

  try {
    const result = await runLoginForInstance(instance, 'test');
    if (req.headers.accept?.includes('application/json')) {
      return res.json(result);
    }
    req.session.flash = result.success
      ? `Test login succeeded for ${instance.name}`
      : `Test login failed for ${instance.name}: ${result.message}`;
    res.redirect('/');
  } catch (err) {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: err.message });
    }
    req.session.flash = `Test login error: ${err.message}`;
    res.redirect('/');
  }
});

module.exports = router;
