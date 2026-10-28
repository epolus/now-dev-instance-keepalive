const { chromium } = require('playwright');
const db = require('../db/db');
const { decrypt } = require('../db/crypto');

const runningInstances = new Set();

const DEFAULT_TIMEOUT = parseInt(process.env.LOGIN_TIMEOUT_MS, 10) || 30000;

const USERNAME_SELECTOR =
  '#user_name, input[name="user_name"], input[id*="username"], input[autocomplete="username"]';
const PASSWORD_SELECTOR =
  '#user_password, input[name="user_password"], input[type="password"], input[autocomplete="current-password"]';
const NEXT_SELECTOR =
  '#sysverb_next, button:has-text("Next"), input[type="submit"][value*="Next" i], button[name="next"]';
const LOGIN_SELECTOR =
  '#sysverb_login, button:has-text("Log in"), button:has-text("Sign in"), input[type="submit"][value*="Log" i], button[type="submit"], input[type="submit"]';
const ERROR_SELECTOR =
  '.notification-error, .alert-danger, [class*="error-message"], #error_message, .login-error, [role="alert"]';

function isInstanceRunning(instanceId) {
  return runningInstances.has(instanceId);
}

function cacheDoUrl(instanceUrl) {
  return instanceUrl.replace(/\/+$/, '') + '/cache.do';
}

async function visitCacheDo(page, instanceUrl, timeoutMs) {
  await page.goto(cacheDoUrl(instanceUrl), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
}

async function isLocatorVisible(locator, timeoutMs) {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function readLoginError(page) {
  const errorEl = page.locator(ERROR_SELECTOR).first();
  if (await errorEl.isVisible().catch(() => false)) {
    return (await errorEl.textContent())?.trim() || 'Login failed';
  }
  return null;
}

async function submitCredentials(page, username, password, timeoutMs) {
  const usernameField = page.locator(USERNAME_SELECTOR).first();
  const passwordField = page.locator(PASSWORD_SELECTOR).first();

  await usernameField.waitFor({ state: 'visible', timeout: timeoutMs });
  await usernameField.fill(username);

  let error = await readLoginError(page);
  if (error) {
    return { ok: false, message: error };
  }

  const passwordOnSameScreen = await isLocatorVisible(passwordField, 2000);

  if (!passwordOnSameScreen) {
    const nextButton = page.locator(NEXT_SELECTOR).first();
    await nextButton.waitFor({ state: 'visible', timeout: timeoutMs });
    await nextButton.click();
    await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});

    error = await readLoginError(page);
    if (error) {
      return { ok: false, message: error };
    }

    await passwordField.waitFor({ state: 'visible', timeout: timeoutMs });
  }

  await passwordField.fill(password);

  const loginButton = page.locator(LOGIN_SELECTOR).first();
  await loginButton.waitFor({ state: 'visible', timeout: timeoutMs });
  await loginButton.click();
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});

  error = await readLoginError(page);
  if (error) {
    return { ok: false, message: error };
  }

  return { ok: true };
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

    const submitResult = await submitCredentials(page, username, password, timeoutMs);
    if (!submitResult.ok) {
      return { success: false, message: submitResult.message, duration_ms: Date.now() - start };
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

    const finishSuccess = async (message = 'OK') => {
      try {
        await visitCacheDo(page, instanceUrl, timeoutMs);
        return { success: true, message, duration_ms: Date.now() - start };
      } catch (err) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('Timeout');
        const cacheMsg = isTimeout ? `cache.do timed out after ${timeoutMs}ms` : err.message;
        return { success: true, message: `${message} (cache.do: ${cacheMsg})`, duration_ms: Date.now() - start };
      }
    };

    if (loggedIn) {
      return finishSuccess();
    }

    const usernameField = page.locator(USERNAME_SELECTOR).first();
    if (await usernameField.isVisible().catch(() => false)) {
      return { success: false, message: 'Still on login page after submit', duration_ms: Date.now() - start };
    }

    return finishSuccess();
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
