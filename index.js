const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const { generateRegistrationData, humanDelay, randomInt } = require('./utils/randomData');
const { generatePaymentReceipt } = require('./utils/paymentGenerator');
const { appendRecord, ensureCsvFile } = require('./utils/csv');

const BASE_URL = 'https://estralisfest2026.vercel.app';
const usedEvents = new Set();
const TOR_ARG = process.argv.find(a => a.startsWith('--tor-ports'));
const TOR_PORTS = TOR_ARG ? TOR_ARG.split('=')[1]?.split(',').map(Number).filter(Boolean) : (process.argv.includes('--tor') ? [9050] : []);
const args = process.argv.slice(2);
const LIST_EVENTS = args.includes('--list-events');
const EVENT_IDX_ARG = args.find(a => a.startsWith('--event-idx'));
const EVENT_IDX = EVENT_IDX_ARG ? parseInt(EVENT_IDX_ARG.split('=')[1] || args[args.indexOf('--event-idx') + 1], 10) : null;
const DIRS = ['uploads', 'logs', 'generated_receipts', 'screenshots'];
for (const d of DIRS) {
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const LOG_FILE = path.join(__dirname, 'logs', `run_${Date.now()}.log`);
const ONGOING_FILE = path.join(__dirname, 'logs', 'ongoing.json');

function writeOngoing(entries) {
  try { fs.writeFileSync(ONGOING_FILE, JSON.stringify(entries), 'utf-8'); } catch {}
}

function removeOngoing(entry) {
  try {
    const prev = JSON.parse(fs.readFileSync(ONGOING_FILE, 'utf-8') || '[]');
    writeOngoing(prev.filter(e => !(e.name === entry.name && e.email === entry.email)));
  } catch {}
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function snap(page, name) {
  const file = path.join(__dirname, 'screenshots', `${name}_${Date.now()}.png`);
  try { await page.screenshot({ path: file, fullPage: false }); } catch {}
  return file;
}

async function fillField(page, placeholder, value, label) {
  log(`  → ${label}: ${value}`);
  const input = page.locator(`input[placeholder*="${placeholder}" i], textarea[placeholder*="${placeholder}" i]`).first();
  await input.waitFor({ state: 'visible', timeout: 8000 });
  await input.fill(value);
  await page.waitForTimeout(randomInt(80, 200));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function runRegistration(browser, regIndex, totalCount) {
  const regData = generateRegistrationData();
  let eventName = 'Unknown';

  const ctxOpts = {
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  if (TOR_PORTS.length) {
    const port = TOR_PORTS[regIndex % TOR_PORTS.length];
    ctxOpts.proxy = { server: `socks5://127.0.0.1:${port}` };
  }
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const apiCalls = [];
  page.on('response', r => {
    const u = r.url();
    if (u.includes('estralis') && u.includes('/api/')) {
      apiCalls.push({ url: u, status: r.status() });
    }
  });

  const tag = `[${regIndex + 1}${isFinite(totalCount) ? '/' + totalCount : ''}]`;

  let ongoingEntry = { name: regData.fullName, email: regData.email, event: 'Loading...', startedAt: new Date().toISOString() };
  try {
    const prev = JSON.parse(fs.readFileSync(ONGOING_FILE, 'utf-8') || '[]');
    prev.push(ongoingEntry);
    writeOngoing(prev);
  } catch {}

  try {
    log(`${tag} ▶ ${regData.fullName} | ${regData.email}`);

    log(`${tag} 🌐 Loading site...`);
    await page.goto(BASE_URL + '#events', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    log(`${tag} ✅ Page loaded`);

    const skipEvents = ['DJ NIGHT', 'BATTLE OF BANDS', 'CLASSICAL GROUP', 'WESTERN GROUP', 'BGMI', 'FASHION', 'TREASURE HUNT'];
    let eventSeeds = [];

    log(`${tag} 🔍 Finding event cards...`);

    let card = null;
    let modal = null;
    const maxRetries = EVENT_IDX !== null ? 1 : 10;

    for (let retryEvent = 0; retryEvent < maxRetries; retryEvent++) {
      if (retryEvent > 0) {
        log(`${tag} 🔄 Trying another event...`);
        if (modal) await page.evaluate(() => {
          const c = document.querySelector('.fixed.inset-0');
          if (c) c.querySelector('button')?.click();
        });
        await page.waitForTimeout(500);
      }

      const cards = page.locator('text=Access Protocol');
      await cards.first().waitFor({ state: 'attached', timeout: 30000 });

      if (eventSeeds.length === 0) {
        if (EVENT_IDX !== null) {
          let n;
          try {
            const p = cards.nth(EVENT_IDX).locator('xpath=ancestor::div[contains(@class,"border-l")]');
            n = await p.locator('h3').first().textContent({ timeout: 2000 });
          } catch { n = ''; }
          eventSeeds.push({ idx: EVENT_IDX, name: n.trim() || `Event ${EVENT_IDX + 1}` });
        } else {
          for (let i = 0; i < await cards.count(); i++) {
            let n;
            try {
              const p = cards.nth(i).locator('xpath=ancestor::div[contains(@class,"border-l")]');
              n = await p.locator('h3').first().textContent({ timeout: 1000 });
            } catch { n = ''; }
            if (!skipEvents.some(c => n.toUpperCase().includes(c)) && !usedEvents.has(n.toUpperCase())) eventSeeds.push({ idx: i, name: n || `Event ${i + 1}` });
          }
        }
      }

      if (eventSeeds.length === 0) throw new Error('No suitable events');
      const pick = eventSeeds.splice(randomInt(0, eventSeeds.length - 1), 1)[0];
      card = cards.nth(pick.idx);
      try {
        const parent = card.locator('xpath=ancestor::div[contains(@class,"border-l")]');
        eventName = await parent.locator('h3').first().textContent({ timeout: 2000 });
      } catch { eventName = pick.name; }
      log(`${tag} 🎯 ${EVENT_IDX !== null ? `Targeting` : `Trying`}: "${eventName}"`);
      ongoingEntry.event = eventName;
      try {
        const prev = JSON.parse(fs.readFileSync(ONGOING_FILE, 'utf-8') || '[]');
        const idx = prev.findIndex(e => e.name === ongoingEntry.name && e.email === ongoingEntry.email);
        if (idx >= 0) prev[idx].event = eventName;
        writeOngoing(prev);
      } catch {}

      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await card.click({ force: true, noWaitAfter: true });
      await page.waitForTimeout(2000);

      modal = page.locator('.fixed.inset-0').filter({ has: page.locator('text=Read Protocol') }).first();
      await modal.waitFor({ state: 'attached', timeout: 10000 });
      log(`${tag} ✅ Modal opened for "${eventName}"`);
      break;
    }

    log(`${tag} ✅ Modal confirmed (${eventName})`);

    log(`${tag} 📜 Scrolling modal before clicking anything...`);
    for (let s = 0; s < 15; s++) {
      await page.evaluate(() => {
        const modal = [...document.querySelectorAll('*')].find(e => e.classList.contains('fixed') && e.classList.contains('inset-0'));
        if (!modal) return;
        for (const el of modal.querySelectorAll('*')) {
          const style = window.getComputedStyle(el);
          if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
            el.scrollTop += 150;
          }
        }
      });
      await page.waitForTimeout(80);
    }
    log(`${tag} ✅ Scrolled modal`);

    log(`${tag} 📖 Clicking "Read Protocol"...`);
    try {
      const rpBtn = page.locator('.fixed.inset-0 button', { hasText: 'Read Protocol' }).first();
      await rpBtn.waitFor({ state: 'visible', timeout: 5000 });
      await rpBtn.click({ noWaitAfter: true });
    } catch {
      log(`${tag}   Normal click failed, trying evaluate fallback...`);
      await page.evaluate(() => {
        const modal = [...document.querySelectorAll('*')].find(e => e.classList.contains('fixed') && e.classList.contains('inset-0'));
        if (!modal) return;
        const btn = [...modal.querySelectorAll('button')].find(b => b.textContent.toLowerCase().includes('read protocol'));
        if (btn) btn.click();
      });
    }
    await page.waitForTimeout(2000);

    const afterUrl = page.url();
    const afterTitle = await page.title();
    log(`${tag}   After Read Protocol → URL: ${afterUrl} | Title: ${afterTitle}`);

    const modalAfter = await page.locator('.fixed.inset-0').count();
    log(`${tag}   Modals open: ${modalAfter}`);

    await snap(page, `read_protocol_${regIndex}`);

    const bodyText = await page.locator('body').innerText();
    log(`${tag}   Body preview: ${bodyText.slice(0, 300).replace(/\n/g, ' ')}`);

    log(`${tag} 📜 Scrolling for "Confirm Registry"...`);
    let clicked = false;
    for (let attempt = 0; attempt < 20 && !clicked; attempt++) {
      await page.evaluate(() => {
        const modal = [...document.querySelectorAll('*')].find(e => e.classList.contains('fixed') && e.classList.contains('inset-0'));
        if (modal) {
          for (const el of modal.querySelectorAll('*')) {
            const style = window.getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
              el.scrollTop += 200;
            }
          }
        }
        window.scrollBy(0, 300);
      });
      await page.waitForTimeout(150);

      const m = [...(await page.locator('.fixed.inset-0').count() > 0 ? [page.locator('.fixed.inset-0').first()] : [])];
      const btn = page.locator('button', { hasText: 'Confirm Registry' }).first();
      if (await btn.count() > 0) {
        log(`${tag}   Found Confirm Registry (attempt ${attempt + 1})`);
        try { await btn.click({ timeout: 3000, force: true, noWaitAfter: true }); } catch {
          await btn.evaluate(b => b.click());
        }
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      log(`${tag} ❌ Confirm Registry not found — full debug...`);
      await snap(page, `debug_noconfirm_${regIndex}`);

      const dump = await page.evaluate(() => {
        const modals = [...document.querySelectorAll('.fixed.inset-0')];
        const allBtns = [...document.querySelectorAll('button')].map(b => ({
          text: b.textContent.trim().slice(0, 60),
          visible: b.offsetHeight > 0,
        }));
        return { modalCount: modals.length, allButtons: allBtns, bodySample: document.body.innerText.slice(0, 2000) };
      });
      log(`${tag}   Modals: ${dump.modalCount}`);
      log(`${tag}   All buttons: ${JSON.stringify(dump.allButtons)}`);
      log(`${tag}   Body: ${dump.bodySample.slice(0, 800)}`);

      const text = dump.bodySample || '';
      if (text.toUpperCase().includes('SOLD OUT') || text.toUpperCase().includes('SOLD_OUT')) {
        throw new Error('Event is SOLD OUT');
      }
      throw new Error('Confirm Registry not found anywhere');
    }
    log(`${tag} ✅ "Confirm Registry" clicked`);
    await page.waitForTimeout(1000);

    log(`${tag} 📝 Filling form fields...`);
    const visInputs = await page.evaluate(() =>
      [...document.querySelectorAll('input')].filter(i => i.offsetHeight > 0).map(i => i.placeholder)
    );
    for (const placeholder of visInputs) {
      if (/member|file/i.test(placeholder)) continue;
      const ph = placeholder.toLowerCase();
      if (/college|institution/.test(ph)) {
        await fillField(page, placeholder, regData.college, 'College');
      } else if (/email/.test(ph)) {
        await fillField(page, placeholder, regData.email, 'Email');
      } else if (/phone|mobile/.test(ph)) {
        await fillField(page, placeholder, regData.phone, 'Phone');
      } else if (/sem|year/.test(ph)) {
        await fillField(page, placeholder, regData.semester, 'Semester');
      } else if (/cse|branch|stream/.test(ph)) {
        await fillField(page, placeholder, regData.branch, 'Branch');
      } else if (/name/.test(ph) && !/team/.test(ph) && !/college/.test(ph) && !/linkedin/.test(ph)) {
        await fillField(page, placeholder, regData.fullName, 'Name');
      } else if (/linkedin/.test(ph)) {
        continue;
      } else if (/team.*(name|squad)/.test(ph)) {
        await fillField(page, placeholder, `Team ${regData.fullName.split(' ')[0]}${randomInt(10, 99)}`, 'Team name');
      }
    }

    log(`${tag} 🔘 Clicking "CONTINUE TO PAYMENT" (trigger)...`);
    try {
      await page.locator('button', { hasText: 'CONTINUE TO PAYMENT' }).first().click({ timeout: 5000, noWaitAfter: true });
    } catch {}
    await page.waitForTimeout(1500);

    log(`${tag} 📤 Submitting form...`);
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit();
    });
    await page.waitForTimeout(3000);

    if (apiCalls.length > 0) {
      for (const c of apiCalls) log(`${tag}   API: ${c.url} → ${c.status}`);
    }

    log(`${tag} 🔍 Checking for payment upload section...`);
    await snap(page, `after_submit_${regIndex}`);

    const afterSubmitDebug = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')].map(i => ({ t: i.type, p: i.placeholder, n: i.name }));
      return { inputs, text: document.body.innerText.slice(0, 1000) };
    });
    log(`${tag}   Inputs after submit: ${JSON.stringify(afterSubmitDebug.inputs)}`);

    const hasPayInputs = afterSubmitDebug.inputs.some(i => i.t === 'file') && afterSubmitDebug.inputs.some(i => /utr/i.test(i.p));
    if (hasPayInputs) {
      log(`${tag} 💳 Payment upload section found!`);

      let amount = '₹299';
      const body = await page.locator('body').innerText();
      const amtMatch = body.match(/(?:₹|Rs\.?|INR)\s*(\d{2,})/i);
      if (amtMatch && parseInt(amtMatch[1]) >= 50) amount = `₹${amtMatch[1]}`;

      const receiptPath = await generatePaymentReceipt({
        amount, utr: regData.utr, senderUpi: regData.senderUpi,
        transactionId: regData.transactionId, senderName: regData.fullName, phone: regData.phone,
      });

      await page.locator('input[type="file"]').first().setInputFiles(receiptPath);
      await page.waitForTimeout(400);
      log(`${tag} ✅ Receipt uploaded`);

      const utrInp = page.locator('input[placeholder*="UTR" i]').first();
      await utrInp.fill(regData.utr);
      log(`${tag} ✅ UTR entered: ${regData.utr}`);

      log(`${tag} 🔘 Clicking "SUBMIT REGISTRATION"...`);
      try {
        await page.locator('button', { hasText: /SUBMIT REGISTRATION|SUBMIT|COMPLETE/i }).first().click({ timeout: 8000, noWaitAfter: true });
      } catch {
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find(el => /submit|complete/i.test(el.textContent));
          if (b) b.click();
        });
      }
      await page.waitForTimeout(3000);
      await snap(page, `submitted_${regIndex}`);

      const finalText = await page.locator('body').innerText();
      let ref = finalText.match(/(?:reference|ticket|registration|id)\s*[:\s#]*\s*([A-Z0-9]{6,})/i)?.[1] || '';
      appendRecord({
        eventName: eventName.trim(), fullName: regData.fullName, email: regData.email,
        phone: regData.phone, college: regData.college, branch: regData.branch,
        semester: regData.semester, utr: regData.utr, senderUpi: regData.senderUpi,
        payeeUpi: regData.payeeUpi, referenceNumber: ref, status: 'SUCCESS',
      });
      if (EVENT_IDX === null) usedEvents.add(eventName.trim().toUpperCase());
      log(`${tag} ✅✅✅ SUCCESS — ${regData.fullName}${ref ? ' Ref:' + ref : ''}`);
      removeOngoing(ongoingEntry);
      await snap(page, `ok_${regIndex}`);
      return true;
    }

    if (EVENT_IDX === null) usedEvents.add(eventName.trim().toUpperCase());
    const hasRef = afterSubmitDebug.text.match(/(?:reference|ticket|registration|id)\s*[:\s#]*\s*([A-Z0-9]{6,})/i);
    const ref = hasRef?.[1] || '';

    log(`${tag} ✅ SUCCESS${ref ? ' Ref:' + ref : ''}`);
    appendRecord({
      eventName: eventName.trim(), fullName: regData.fullName, email: regData.email,
      phone: regData.phone, college: regData.college, branch: regData.branch,
      semester: regData.semester, utr: regData.utr, senderUpi: regData.senderUpi,
      payeeUpi: regData.payeeUpi, referenceNumber: ref, status: 'SUCCESS',
    });
    log(`${tag} ✅✅✅ DONE — ${regData.fullName}`);
    removeOngoing(ongoingEntry);
    await snap(page, `ok_${regIndex}`);
    return true;
  } catch (err) {
    log(`${tag} ❌❌❌ FAILED — ${err.message}`);
    removeOngoing(ongoingEntry);
    await snap(page, `fail_${regIndex}`);
    appendRecord({
      eventName: eventName.trim(), fullName: regData.fullName, email: regData.email,
      phone: regData.phone, college: regData.college, branch: regData.branch,
      semester: regData.semester, utr: regData.utr, senderUpi: regData.senderUpi,
      payeeUpi: regData.payeeUpi, referenceNumber: '', status: 'FAILURE',
    });
    return false;
  } finally {
    await context.close();
  }
}

async function runPool(total, concurrency, fn) {
  let idx = 0;
  let done = 0;
  let ok = 0;
  const infinite = !isFinite(total);

  async function worker(wid) {
    while (true) {
      const i = idx++;
      if (!infinite && i >= total) return;
      const start = Date.now();
      log(`[W${wid}] Task ${i + 1}${infinite ? '' : '/' + total}`);
      try {
        const r = await fn(i);
        if (r) ok++;
      } catch (e) {
        log(`[W${wid}] ❌ ${e.message}`);
      }
      done++;
      log(`[W${wid}] ${done} done${infinite ? '' : '/' + total} (${ok} OK) — ${((Date.now() - start) / 1000).toFixed(1)}s`);
    }
  }

  const n = infinite ? concurrency : Math.min(concurrency, total);
  log(`[POOL] ${n} workers for ${infinite ? 'INFINITE' : total} tasks`);
  await Promise.all(Array.from({ length: n }, (_, i) => worker(i + 1)));
  return ok;
}

(async () => {
  if (LIST_EVENTS) {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.goto(BASE_URL + '#events', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const cards = page.locator('text=Access Protocol');
    const count = await cards.count();
    const names = [];
    for (let i = 0; i < count; i++) {
      let n;
      try {
        const p = cards.nth(i).locator('xpath=ancestor::div[contains(@class,"border-l")]');
        n = await p.locator('h3').first().textContent({ timeout: 2000 });
      } catch { n = ''; }
      names.push({ idx: i, name: (n || `Event ${i + 1}`).trim() });
    }
    console.log('\nAvailable events:');
    console.log('───'.repeat(12));
    names.forEach(({ idx, name }) => console.log(`  ${String(idx + 1).padEnd(2)}${name}`));
    console.log(`\nTotal: ${count} events`);
    await browser.close();
    process.exit(0);
  }

  const INFINITE = args.includes('--infinite');
  const countIdx = args.find(a => /^\d+$/.test(a));
  const COUNT = INFINITE ? Infinity : (countIdx ? parseInt(countIdx) : fs.readFileSync(path.join(__dirname, 'NAMES.TXT'), 'utf-8').split('\n').filter(l => l.trim()).length);
  const PARALLEL = parseInt(args.find(a => a.startsWith('--parallel') || a.startsWith('-p'))?.split('=')[1] || args[args.indexOf('--parallel') + 1] || args[args.indexOf('-p') + 1] || '5', 10);
  const HEADLESS = args.includes('--headful') ? false : true;

  log(`═`.repeat(50));
  log(`ESTRALIS-BOT — ${INFINITE ? 'INFINITE' : COUNT} regs | ${PARALLEL} parallel | Headless: ${HEADLESS}${EVENT_IDX !== null ? ' | Event:' + EVENT_IDX : ''}`);
  log(`═`.repeat(50));

  ensureCsvFile();

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  process.on('SIGINT', async () => { await browser.close(); process.exit(0); });
  process.on('SIGTERM', async () => { await browser.close(); process.exit(0); });

  const start = Date.now();
  const succeeded = await runPool(COUNT, PARALLEL, (i) => runRegistration(browser, i, COUNT));

  await browser.close();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`═`.repeat(50));
  log(`DONE — ${succeeded} succeeded in ${elapsed}s${isFinite(COUNT) ? ' (' + COUNT + ' total)' : ''}`);
  log(`═`.repeat(50));
})();
