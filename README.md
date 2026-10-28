# ServiceNow Instance Keep-Alive

A self-hosted web app that logs into ServiceNow developer instances on a schedule via real UI login (Playwright/Chromium), preventing hibernation from inactivity.

## Features

- **App login** — Single admin account with bcrypt-hashed password, session cookies, rate-limited login endpoint
- **Instance management** — CRUD for ServiceNow instances with encrypted credential storage (AES-256-GCM)
- **Scheduled keep-alive** — Playwright simulates interactive login on each instance's configured interval
- **Manual actions** — Run now, test login, view recent logs
- **Docker-ready** — Playwright base image with persistent SQLite volume

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:

| Variable | Description |
|----------|-------------|
| `ADMIN_USER` | Admin username for the app |
| `ADMIN_PASSWORD_HASH_B64` | Bcrypt hash, base64-encoded (recommended for Docker) |
| `ADMIN_PASSWORD_HASH` | Plain bcrypt hash (local dev only; problematic with Docker Compose) |
| `SESSION_SECRET` | Random string (32+ chars) for session signing |
| `ENCRYPTION_KEY` | 64-char hex string (32 bytes) for credential encryption |

Generate values:

```bash
# Admin password hash (script prints both plain and docker-compose-safe forms)
npm run hash-password -- your-secure-password

# Encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Docker Compose note:** bcrypt hashes contain `$`, which Docker Compose mis-parses. Use `ADMIN_PASSWORD_HASH_B64` from `npm run hash-password` instead of `ADMIN_PASSWORD_HASH`.

### 2. Run with Docker Compose

```bash
docker compose up -d --build
```

Open http://localhost:3001 (default `HOST_PORT`; set `HOST_PORT=3000` in `.env` if 3000 is free).

### 3. Add a ServiceNow instance

1. Click **Add Instance**
2. Enter name, instance URL (e.g. `https://dev12345.service-now.com`), ServiceNow username/password
3. Set keep-alive interval (default 240 minutes / 4 hours)
4. Click **Test login** to verify credentials
5. Enable the instance — scheduled logins begin automatically

## Local Development

Requires Node.js 20+.

```bash
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env with your values
mkdir -p data
npm run dev
```

## How It Works

Every minute, the scheduler checks enabled instances. If `last_run_at + interval_minutes` has elapsed, a Playwright job:

1. Launches headless Chromium with a fresh browser context
2. Navigates to the instance URL
3. Enters username; if password is on a second screen (newer releases), clicks **Next** then fills password
4. Submits login and verifies success (URL change, `#gsft_main`, nav elements) or captures error text
5. Visits `cache.do` to warm the instance
6. Logs the attempt to SQLite and updates instance status

Concurrent runs for the same instance are prevented via an in-progress guard.

## API / Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/login` | GET/POST | No | App login |
| `/logout` | POST | No | End session |
| `/` | GET | Yes | Dashboard |
| `/instances/new` | GET | Yes | Add instance form |
| `/instances` | POST | Yes | Create instance |
| `/instances/:id/edit` | GET | Yes | Edit instance form |
| `/instances/:id` | POST | Yes | Update instance |
| `/instances/:id/delete` | POST | Yes | Delete instance |
| `/instances/:id/run` | POST | Yes | Trigger login now |
| `/instances/:id/test` | POST | Yes | Test login (waits for result) |

## Environment Variables

See `.env.example` for the full list.

## Data Persistence

SQLite database is stored at `/data/keepalive.db` inside the container, mounted via the `keepalive-data` Docker volume. Rebuilds and restarts preserve instances and logs.

## Security Notes

- ServiceNow passwords are encrypted at rest with AES-256-GCM
- All secrets come from environment variables — never hardcoded
- Login endpoint is rate-limited (10 attempts per 15 minutes)
- Run behind a reverse proxy with HTTPS in production; set `NODE_ENV=production` for secure session cookies

## Docker Notes

The `playwright` npm package version must match the Playwright Docker base image tag (e.g. both `1.61.1`). Mismatches cause `Executable doesn't exist at /ms-playwright/...` errors on login tests.

MIT
