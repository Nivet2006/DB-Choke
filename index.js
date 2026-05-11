
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const { generateRegistrationData, humanDelay, randomInt } = require('./utils/randomData');
const { generatePaymentReceipt } = require('./utils/paymentGenerator');
const { appendRecord, ensureCsvFile } = require('./utils/csv');
const { spawnTorInstances, rotateCircuit, ensureSystemTor } = require('./utils/torManager');

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

const cliCount = args.find((a) => /^\d+$/.test(a));
const COUNT = cliCount
  ? parseInt(cliCount, 10)
  : fs.readFileSync(path.join(__dirname, 'NAMES.TXT'), 'utf-8').split('\n').filter(l => l.trim()).length;
const PARALLEL = parseInt(getArg('--parallel') || getArg('-p'), 10) || 1;
const PROXY_MODE = getArg('--proxy') || 'none';
const HEADLESS = hasFlag('--headful') ? false : process.env.HEADLESS !== 'false';
const IS_INFINITE = hasFlag('--infinite') || hasFlag('--infinity');

const DIRS = ['uploads', 'logs', 'generated_receipts', 'screenshots', 'logos'];
for (const dir of DIRS) {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const LOG_FILE = path.join(__dirname, 'logs', `run_${Date.now()}.log`);
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

const BASE_URL = 'https://estralisfest2026.vercel.app/';

let torInstances = [];
let torCleanup = null;
let proxyList = [];
let proxyIndex = 0;

function loadProxyList() {
  const proxyFile = path.join(__dirname, 'proxies.txt');
  if (!fs.existsSync(proxyFile)) {
    log('[PROXY] proxies.txt not found — create it with one proxy per line');
    process.exit(1);
  }
  const proxies = fs.readFileSync(proxyFile, 'utf-8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  log(`[PROXY] Loaded ${proxies.length} proxies from proxies.txt`);
  return proxies;
}

function getProxy(workerIndex) {
  if (PROXY_MODE === 'tor' && torInstances.length > 0) {
    const inst = torInstances[workerIndex % torInstances.length];
    return { server: `socks5://127.0.0.1:${inst.port}` };
  }
  if (PROXY_MODE === 'file') {
    if (proxyList.length === 0) proxyList = loadProxyList();
    const proxy = proxyList[proxyIndex % proxyList.length];
    proxyIndex++;
    return { server: proxy };
  }
  return null;
}

function rotateWorkerIP(workerIndex) {
  if (PROXY_MODE === 'tor' && torInstances.length > 0) {
    const inst = torInstances[workerIndex % torInstances.length];
    if (inst.controlPort) rotateCircuit(inst.controlPort);
  }
}

async function snap(page, name) {
  const file = path.join(__dirname, 'screenshots', `${name}_${Date.now()}.png`);
  try { await page.screenshot({ path: file, fullPage: false }); } catch {}
  return file;
}async function scrollModalToBottom(page) {
  await page.evaluate(() => {
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const style = window.getComputedStyle(el);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 50
      ) {
        el.scrollTop = el.scrollHeight;
      }
    }
  });
  await page.waitForTimeout(10);
}

async function scrollModalGradually(page) {
  await page.evaluate(() => {
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const style = window.getComputedStyle(el);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 50
      ) {
        el.scrollTop = el.scrollHeight;
      }
    }
  });
  await page.waitForTimeout(10);
}

async function clickByText(page, text) {
  const selectors = [
    `text="${text}"`,
    `button:has-text("${text}")`,
    `a:has-text("${text}")`,
    `[role="button"]:has-text("${text}")`,
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      await el.click({ timeout: 8000 });
      return true;
    } catch { continue; }
  }

  const clicked = await page.evaluate((t) => {
    const btns = [...document.querySelectorAll('button, a, div, span')];
    const btn = btns.find((b) => b.textContent.toUpperCase().includes(t.toUpperCase()) && b.offsetParent !== null);
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
  if (clicked) return true;
  throw new Error(`Element not found: "${text}"`);
}

async function fillByPlaceholder(page, placeholder, value) {
  const input = page.locator(`input[placeholder*="${placeholder}" i], textarea[placeholder*="${placeholder}" i]`).first();
  await input.waitFor({ state: 'visible', timeout: 5000 });
  await input.fill(value);
}

async function runRegistration(browser, regIndex, totalCount, targetEventIndex = null) {
  const regData = generateRegistrationData();
  let eventName = 'Unknown Event';

  const ctxOpts = {
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const proxy = getProxy(regIndex);
  if (proxy) ctxOpts.proxy = proxy;

  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  const tag = `[${regIndex + 1}/${totalCount}]`;

  try {
    log(`${tag} ▶ Starting — ${regData.fullName} | ${regData.email}${proxy ? ' | Proxy: ' + proxy.server : ''}`);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(page, 100, 300);

    await clickByText(page, 'Events');
    await humanDelay(page, 100, 300);
    await page.waitForTimeout(200);

    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(100);

    const accessBtns = page.locator('text="Access Protocol"');
    const btnCount = await accessBtns.count();
    if (btnCount === 0) throw new Error('No Access Protocol buttons');
    const btnIdx = targetEventIndex !== null ? (targetEventIndex % btnCount) : randomInt(0, Math.min(btnCount - 1, 5));

    try {
      const card = accessBtns.nth(btnIdx).locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"event")]');
      eventName = await card.locator('h2, h3, [class*="title"]').first().textContent({ timeout: 1500 });
    } catch { eventName = `Event ${btnIdx + 1}`; }

    await accessBtns.nth(btnIdx).scrollIntoViewIfNeeded();
    await humanDelay(page, 50, 150);
    await accessBtns.nth(btnIdx).click();
    await humanDelay(page, 150, 350);

    await page.waitForTimeout(200);
    await scrollModalGradually(page);
    await humanDelay(page, 50, 150);
    try { await clickByText(page, 'Read Protocol'); } catch {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button,a,div')].find((e) => e.textContent.toLowerCase().includes('read protocol'));
        if (b) b.click();
      });
    }
    await humanDelay(page, 150, 350);

    await scrollModalGradually(page);
    await scrollModalToBottom(page);
    await humanDelay(page, 100, 300);

    let confirmed = false;
    for (let attempt = 0; attempt < 5 && !confirmed; attempt++) {
      await scrollModalToBottom(page);
      await page.waitForTimeout(150);
      confirmed = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button,a,div,span')].find(
          (e) => e.textContent.trim().toUpperCase().includes('CONFIRM REGISTRY') && e.offsetParent !== null
        );
        if (b) { b.scrollIntoView({ block: 'center' }); b.click(); return true; }
        return false;
      });
      if (!confirmed) {
        try {
          const btn = page.locator('text=/confirm registry/i').first();
          await btn.scrollIntoViewIfNeeded({ timeout: 1000 });
          await btn.click({ timeout: 2000 });
          confirmed = true;
        } catch { await page.waitForTimeout(200); }
      }
    }
    if (!confirmed) throw new Error('Could not click Confirm Registry');
    await humanDelay(page, 150, 350);

    await page.waitForTimeout(400);
    await fillByPlaceholder(page, 'Name', regData.fullName);
    await humanDelay(page, 50, 150);
    await fillByPlaceholder(page, 'email', regData.email);
    await humanDelay(page, 50, 150);
    await fillByPlaceholder(page, 'Phone', regData.phone);
    await humanDelay(page, 50, 150);
    await fillByPlaceholder(page, 'College', regData.college);
    await humanDelay(page, 50, 150);
    await fillByPlaceholder(page, 'Sem', regData.semester);
    await humanDelay(page, 50, 150);
    await fillByPlaceholder(page, 'CSE', regData.branch);
    await humanDelay(page, 50, 150);

    await scrollModalToBottom(page);
    await page.waitForTimeout(200);
    try { await clickByText(page, 'CONTINUE TO PAYMENT'); } catch {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button,a,div')].find((e) => e.textContent.toUpperCase().includes('CONTINUE TO PAYMENT'));
        if (b) b.click();
      });
    }
    await humanDelay(page, 400, 800);

    let scrapedAmount = '₹299';
    try {
      const pageText = await page.innerText('body');

      const amountMatch = pageText.match(/(?:₹|Rs\.?|INR)\s*(\d+)/i) || pageText.match(/(\d+)\s*(?:INR|rupees)/i);
      if (amountMatch) {
        scrapedAmount = `₹${amountMatch[1]}`;
        log(`${tag} [PAYMENT] Dynamically scraped payment amount: ${scrapedAmount}`);
      } else {
        log(`${tag} [PAYMENT] Could not scrape amount, defaulting to ${scrapedAmount}`);
      }
    } catch (scErr) {
      log(`${tag} [PAYMENT] Error scraping amount: ${scErr.message}, defaulting to ${scrapedAmount}`);
    }

    const receiptPath = await generatePaymentReceipt({
      amount: scrapedAmount,
      utr: regData.utr,
      senderUpi: regData.senderUpi,
      transactionId: regData.transactionId,
      senderName: regData.fullName,
      phone: regData.phone,
    });

    await page.waitForTimeout(400);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 5000 });
    await fileInput.setInputFiles(receiptPath);
    await humanDelay(page, 100, 300);

    await fillByPlaceholder(page, 'UTR', regData.utr);
    await humanDelay(page, 50, 150);

    try { await clickByText(page, 'COMPLETE REGISTRY'); } catch {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button,a,div')].find((e) => e.textContent.toUpperCase().includes('COMPLETE'));
        if (b) b.click();
      });
    }
    await page.waitForTimeout(1200);

    await snap(page, `ok_${regIndex}`);

    let referenceNumber = '';
    try {
      const txt = await page.textContent('body');
      const m = txt.match(/(?:reference|ticket|registration|id)[:\s#]*([A-Z0-9-]+)/i);
      if (m) referenceNumber = m[1];
    } catch {}

    appendRecord({
      eventName: eventName.trim(), fullName: regData.fullName, email: regData.email,
      phone: regData.phone, college: regData.college, branch: regData.branch,
      semester: regData.semester, utr: regData.utr, senderUpi: regData.senderUpi,
      payeeUpi: regData.payeeUpi, referenceNumber, status: 'SUCCESS',
    });

    log(`${tag} ✅ SUCCESS — ${regData.fullName}`);
    return true;
  } catch (err) {
    log(`${tag} ❌ FAILED — ${err.message}`);
    await snap(page, `fail_${regIndex}`);
    appendRecord({
      eventName: eventName.trim(), fullName: regData.fullName, email: regData.email,
      phone: regData.phone, college: regData.college, branch: regData.branch,
      semester: regData.semester, utr: regData.utr, senderUpi: regData.senderUpi,
      payeeUpi: regData.payeeUpi, referenceNumber: '', status: `FAILED: ${err.message.slice(0, 80)}`,
    });
    return false;
  } finally {
    await context.close();
  }
}

async function runPool(total, concurrency, taskFn) {
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= total) return;

      try {
        await taskFn(index);
      } catch (err) {
        log(`[POOL] Worker error on task ${index}: ${err.message}`);
      }

      completed++;
      log(`[POOL] Progress: ${completed}/${total} completed`);

      if (PROXY_MODE === 'tor') {
        rotateWorkerIP(index);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  const workers = [];
  const actualConcurrency = Math.min(concurrency, total);
  for (let i = 0; i < actualConcurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
}

async function runEventRegistrations(browser, eventIndex, targetCount) {
  let successful = 0;
  while (successful < targetCount) {
    const needed = targetCount - successful;
    log(`[SCHEDULER] Event ${eventIndex + 1} needs ${needed} more successes to reach ${targetCount}`);
    let currentBatchSuccess = 0;
    await runPool(needed, PARALLEL, async (index) => {
      const success = await runRegistration(browser, successful + index, targetCount, eventIndex);
      if (success) {
        currentBatchSuccess++;
      }
    });
    successful += currentBatchSuccess;
    if (successful < targetCount) {
      log(`[SCHEDULER] Completed batch. Event ${eventIndex + 1} has ${successful}/${targetCount} successes.`);
    }
  }
}

(async () => {
  log(`\n${'═'.repeat(60)}`);
  log(`DATABASE CHOCKE ft. SNAKEKING — 5 Events | ${PARALLEL} parallel | Proxy: ${PROXY_MODE} | Headless: ${HEADLESS}`);
  log(`${'═'.repeat(60)}`);

  ensureCsvFile();

  if (PROXY_MODE === 'tor') {
    const workerCount = PARALLEL;
    log(`[TOR] Spawning ${workerCount} isolated Tor instances...`);
    const result = await spawnTorInstances(workerCount);
    torInstances = result.instances;
    torCleanup = result.cleanup;
    log(`[TOR] ${torInstances.length} Tor instances ready`);
  } else if (PROXY_MODE === 'file') {
    proxyList = loadProxyList();
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const startTime = Date.now();

  const cleanup = async () => {
    if (torCleanup) torCleanup();
    await browser.close();
  };
  process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
  process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });

  const FLAG_PATH = path.join(__dirname, 'logs', 'infinite_mode.flag');
  if (IS_INFINITE) {
    fs.writeFileSync(FLAG_PATH, 'true');
  } else {
    try { if (fs.existsSync(FLAG_PATH)) fs.unlinkSync(FLAG_PATH); } catch (e) {}
  }

  try {
    const rounds = [600, 300];
    let loopCount = 0;
    while (true) {
      loopCount++;
      if (IS_INFINITE) {
        log(`\n[SCHEDULER] ♾️ INFINITE LOOP RUNNING — BATCH ROUND ${loopCount}`);
      }
      for (let r = 0; r < (IS_INFINITE ? 1 : rounds.length); r++) {
        const batchSize = IS_INFINITE ? 99999 : rounds[r];
        log(`[SCHEDULER] Starting Round ${IS_INFINITE ? loopCount : r + 1} with ${batchSize} registrations per event`);

        for (let eventIndex = 0; eventIndex < 5; eventIndex++) {
          log(`[SCHEDULER] Event ${eventIndex + 1}/5 | Target batch: ${batchSize}`);
          await runEventRegistrations(browser, eventIndex, batchSize);

          if (eventIndex < 4 || r < rounds.length - 1 || IS_INFINITE) {
            log(`[SCHEDULER] Waiting 30 seconds before starting the next set of events...`);
            await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
          }
        }
      }
      if (!IS_INFINITE) break;
    }
  } finally {
    try { if (fs.existsSync(FLAG_PATH)) fs.unlinkSync(FLAG_PATH); } catch (e) {}
    await cleanup();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`\n${'═'.repeat(60)}`);
  log(`DONE — All rounds completed in ${elapsed}s`);
  log(`CSV: ${path.join(__dirname, 'output.csv')}`);
  log(`${'═'.repeat(60)}`);
})();
