const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { getAdminPasswordHash } = require('../config/admin');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/login', (req, res) => {
  if (req.session?.authenticated) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER;
  const adminHash = getAdminPasswordHash();

  if (!adminUser || !adminHash) {
    return res.status(500).render('login', { error: 'Server misconfigured: admin credentials not set' });
  }

  if (username !== adminUser) {
    return res.status(401).render('login', { error: 'Invalid username or password' });
  }

  try {
    const valid = await bcrypt.compare(password, adminHash);
    if (!valid) {
      return res.status(401).render('login', { error: 'Invalid username or password' });
    }
    req.session.authenticated = true;
    req.session.username = username;
    return res.redirect('/');
  } catch {
    return res.status(500).render('login', { error: 'Authentication error' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
