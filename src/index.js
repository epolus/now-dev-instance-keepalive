require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const instanceRoutes = require('./routes/instances');
const { initScheduler, stopScheduler } = require('./jobs/scheduler');
const db = require('./db/db');

const { hasAdminCredentials } = require('./config/admin');

function validateEnv() {
  const required = ['ADMIN_USER', 'SESSION_SECRET', 'ENCRYPTION_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (!hasAdminCredentials()) {
    missing.push('ADMIN_PASSWORD_HASH or ADMIN_PASSWORD_HASH_B64');
  }
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.ENCRYPTION_KEY.length !== 64) {
    console.error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    process.exit(1);
  }
}

validateEnv();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(authRoutes);
app.use(instanceRoutes);
app.use(dashboardRoutes);

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('error', { message: 'Internal server error' });
});

db.getDb();

const server = app.listen(PORT, () => {
  console.log(`ServiceNow Keep-Alive running on http://localhost:${PORT}`);
  initScheduler();
});

function shutdown() {
  console.log('Shutting down...');
  stopScheduler();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
