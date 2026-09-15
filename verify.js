#!/usr/bin/env node
'use strict';
// Tidebeat Race verification harness.
// Launches headless Chromium (SwiftShader GL), loads index.html from a
// file:// URL and drives the game through window.__test. Prints PASS/FAIL
// for each of seven checks and exits non-zero if any fail.

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const INDEX = path.resolve(__dirname, 'index.html');
const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
];
const GLOBAL_TIMEOUT_MS = 120000;

const results = [];
function report(n, desc, ok, detail) {
  results.push(ok);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + ': ' + desc + (detail ? ' (' + detail + ')' : ''));
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const killer = setTimeout(() => {
    console.error('FAIL: global timeout after ' + GLOBAL_TIMEOUT_MS + 'ms');
    browser.close().finally(() => process.exit(1));
  }, GLOBAL_TIMEOUT_MS);

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

    await page.goto(pathToFileURL(INDEX).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__test && window.__test.ready === true, null, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // 1. Clean load.
    const errCount = consoleErrors.length + pageErrors.length;
    report(1, 'Page loads with zero console errors and zero uncaught exceptions', errCount === 0,
      errCount ? [...consoleErrors, ...pageErrors].slice(0, 3).join(' | ') : undefined);

    // 2. Initial state.
    const s0 = await page.evaluate(() => window.__test.state);
    report(2, '__test.state equals "MENU" on load', s0 === 'MENU', 'state=' + s0);

    // 3. startRace() -> COUNTDOWN -> RACING via tick().
    const s3 = await page.evaluate(() => {
      const t = window.__test;
      t.startRace();
      const afterStart = t.state;
      t.tick(1.0);
      const mid = t.state;
      t.tick(2.5);
      return { afterStart, mid, end: t.state };
    });
    report(3, 'startRace() moves state through COUNTDOWN to RACING',
      s3.afterStart === 'COUNTDOWN' && s3.mid === 'COUNTDOWN' && s3.end === 'RACING',
      JSON.stringify(s3));

    // 4. Perfect strokes every 0.5s of simulated time push distance past 1200.
    const t4 = Date.now();
    const r4 = await page.evaluate(() => {
      const t = window.__test;
      let i = 0;
      for (; i < 600 && t.state !== 'FINISHED'; i++) { t.stroke('perfect'); t.tick(0.5); }
      return { distance: t.distance, iterations: i, simSeconds: i * 0.5 };
    });
    const wall4 = Date.now() - t4;
    report(4, 'stroke("perfect") every 0.5s via tick() makes distance exceed 1200', r4.distance > 1200,
      'distance=' + r4.distance.toFixed(1) + ', sim=' + r4.simSeconds + 's, wall=' + wall4 + 'ms');

    // 5. Finished with sane results.
    const r5 = await page.evaluate(() => ({ state: window.__test.state, results: window.__test.results }));
    const res = r5.results;
    const ok5 = r5.state === 'FINISHED' && res && typeof res.time === 'number' && Number.isFinite(res.time) && [1, 2, 3].includes(res.stars);
    report(5, 'state is FINISHED, results.time is a number, results.stars is 1, 2 or 3', ok5,
      'state=' + r5.state + ', results=' + JSON.stringify(res));

    // 6. Rendering performance: 300 animation frames, average under 150ms, no errors.
    const errBefore = consoleErrors.length + pageErrors.length;
    const avg = await page.evaluate(() => new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      function step() { if (++n >= 300) resolve((performance.now() - t0) / 300); else requestAnimationFrame(step); }
      requestAnimationFrame(step);
    }));
    const errDuring = consoleErrors.length + pageErrors.length - errBefore;
    report(6, '300 frames render with no errors and average frame time under 150ms', avg < 150 && errDuring === 0,
      'avg=' + avg.toFixed(1) + 'ms, errors=' + errDuring);

    // 7. reset() returns to a clean MENU.
    const r7 = await page.evaluate(() => {
      window.__test.reset();
      return { state: window.__test.state, distance: window.__test.distance, results: window.__test.results };
    });
    report(7, 'reset() returns state to MENU with distance 0 and results null',
      r7.state === 'MENU' && r7.distance === 0 && r7.results === null, JSON.stringify(r7));
  } catch (e) {
    console.error('FAIL: harness error: ' + (e && e.stack ? e.stack : e));
    results.push(false);
  } finally {
    clearTimeout(killer);
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(failed === 0 ? 'ALL 7 CHECKS PASSED' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 && results.length === 7 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
