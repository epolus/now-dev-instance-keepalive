const { chromium } = require('playwright');
const db = require('../db/db');
const { decrypt } = require('../db/crypto');

const runningInstances = new Set();

const DEFAULT_TIMEOUT = parseInt(process.env.LOGIN_TIMEOUT_MS, 10) || 30000;

function isInstanceRunning(instanceId) {
  return runningInstances.has(instanceId);
}

async function performServiceNowLogin(instanceUrl, username, password, timeoutMs = DEFAULT_TIMEOUT) {
  let browser;
  const start = Date.now();

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    const loginUrl = instanceUrl.endsWith('/') ? instanceUrl : instanceUrl + '/';
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const usernameField = page.locator('#user_name, input[name="user_name"], input[type="text"][name*="user"]').first();
    const passwordField = page.locator('#user_password, input[name="user_password"], input[type="password"]').first();
    const submitButton = page.locator('#sysverb_login, button[type="submit"], input[type="submit"]').first();

    await usernameField.waitFor({ state: 'visible', timeout: timeoutMs });
    await passwordField.waitFor({ state: 'visible', timeout: timeoutMs });

    await usernameField.fill(username);
    await passwordField.fill(password);
    await submitButton.click();

    await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});

    const errorEl = page.locator(
      '.notification-error, .alert-danger, [class*="error-message"], #error_message, .login-error'
    ).first();
    if (await errorEl.isVisible().catch(() => false)) {
      const errorText = (await errorEl.textContent())?.trim() || 'Login failed';
      return { success: false, message: errorText, duration_ms: Date.now() - start };
    }

    const currentUrl = page.url();
    const postLoginIndicators = [
      page.locator('#gsft_main'),
      page.locator('[data-type="navbar"]'),
      page.locator('.navbar-header'),
      page.locator('#nav_header'),
      page.locator('[class*="sn-polaris-nav"]'),
    ];

    const stillOnLogin = currentUrl.includes('login.do') || currentUrl.includes('/login');
    let loggedIn = !stillOnLogin;

    if (!loggedIn) {
      for (const indicator of postLoginIndicators) {
        if (await indicator.isVisible().catch(() => false)) {
          loggedIn = true;
          break;
        }
      }
    }

    if (loggedIn) {
      return { success: true, message: 'OK', duration_ms: Date.now() - start };
    }

    if (await usernameField.isVisible().catch(() => false)) {
      return { success: false, message: 'Still on login page after submit', duration_ms: Date.now() - start };
    }

    return { success: true, message: 'OK', duration_ms: Date.now() - start };
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('Timeout');
    return {
      success: false,
      message: isTimeout ? `Login timed out after ${timeoutMs}ms` : err.message,
      duration_ms: Date.now() - start,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function runLoginForInstance(instance, trigger = 'scheduled') {
  if (runningInstances.has(instance.id)) {
    return { success: false, message: 'Login already in progress', duration_ms: 0 };
  }

  runningInstances.add(instance.id);
  console.log(`[${trigger}] Starting login for instance "${instance.name}" (${instance.instance_url})`);

  try {
    const password = decrypt(instance.encrypted_password);
    const result = await performServiceNowLogin(
      instance.instance_url,
      instance.username,
      password
    );

    db.insertLoginLog({
      instance_id: instance.id,
      success: result.success,
      message: result.message,
      duration_ms: result.duration_ms,
    });

    const now = new Date().toISOString();
    const nextRun = new Date(Date.now() + instance.interval_minutes * 60 * 1000).toISOString();

    db.updateInstanceRunStatus(instance.id, {
      last_run_at: now,
      last_result: result.success ? 'success' : 'fail',
      next_run_at: nextRun,
    });

    console.log(
      `[${trigger}] Login for "${instance.name}": ${result.success ? 'SUCCESS' : 'FAIL'} - ${result.message} (${result.duration_ms}ms)`
    );

    return result;
  } finally {
    runningInstances.delete(instance.id);
  }
}

module.exports = { runLoginForInstance, isInstanceRunning, performServiceNowLogin };
