// Optional real-browser checks. Start npm start first; requires Chromium on PATH.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(join(tmpdir(), 'frontier-browser-'));
const browser = spawn(process.env.CHROMIUM || 'chromium', ['--headless', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
browser.on('error', error => { console.error(error.message); process.exitCode = 1; });
let ws;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await wait(100); } }
  assert.ok(port, 'Chromium did not start; check CHROMIUM executable and sandbox support');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0; const pending = new Map();
  ws.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { const p = pending.get(data.id); pending.delete(data.id); if (data.error) p.reject(new Error(data.error.message)); else p.resolve(data.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Page.navigate', { url: 'http://127.0.0.1:8000/tests/browser.html' });
  let report = '';
  for (let i = 0; i < 200; i++) { report = await evaluate('document.getElementById("report")?.textContent || ""'); if (report.includes('ALL PASSED') || report.includes('FAIL')) break; await wait(100); }
  console.log(report);
  assert.ok(report.includes('ALL PASSED'), 'Browser checks failed or timed out');
  await send('Page.navigate', { url: 'http://127.0.0.1:8000/' });
  for (let i = 0; i < 100; i++) { if (await evaluate('document.documentElement.dataset.ready === "true"')) break; await wait(100); }
  const theme = await evaluate(`(async () => {
    await document.fonts.ready;
    const css = getComputedStyle(document.body);
    return {
      background: css.backgroundColor, text: css.color,
      bodyFont: css.fontFamily, headingFont: getComputedStyle(document.querySelector('h1')).fontFamily,
      accent: getComputedStyle(document.getElementById('result')).color,
      inter: document.fonts.check('14px Inter'),
      disket: document.fonts.check('14px "Disket Mono"'),
      disketBold: document.fonts.check('700 14px "Disket Mono"'),
      loaded: [...document.fonts].every(face => face.status === 'loaded'),
      badge: document.querySelector('.badge').textContent
    };
  })()`);
  assert.equal(theme.background, 'rgb(11, 11, 11)');
  assert.equal(theme.text, 'rgb(250, 250, 229)');
  assert.equal(theme.accent, 'rgb(255, 71, 0)');
  assert.ok(theme.bodyFont.includes('Inter') && theme.headingFont.includes('Disket Mono'));
  assert.ok(theme.inter && theme.disket && theme.disketBold && theme.loaded, 'Self-hosted fonts failed to load');
  assert.equal(theme.badge, 'EXPERIMENTAL');
  console.log('PASS theme colors, self-hosted fonts, and badge');
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
    assert.equal(overflow, false, `Horizontal overflow at ${width}px`);
    console.log(`PASS responsive layout ${width}px`);
    if (process.env.SCREENSHOT_PREFIX) {
      await evaluate('scrollTo(0, 0)');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`${process.env.SCREENSHOT_PREFIX}-${width}.png`, Buffer.from(shot.data, 'base64'));
    }
    if (width === 1440) {
      const rect = await evaluate('(() => { const c = document.getElementById("preview"); c.scrollIntoView({block:"center"}); const r = c.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,naturalHeight:c.height}; })()');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x + 1, y: rect.y + 1, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + rect.width - 1, y: rect.y + rect.height * 112 / rect.naturalHeight, button: 'left', clickCount: 1 });
      assert.equal(await evaluate('document.getElementById("result").value'), 'EVE FRONTIER');
      await evaluate('document.getElementById("resetCrop").click()');
      assert.equal(await evaluate('document.getElementById("result").value'), 'EVE FRONTIER\nSIGNAL 2048');
      console.log('PASS pointer crop and reset');
    }
  }
} finally {
  ws?.close(); browser.kill();
  await Promise.race([new Promise(resolve => browser.once('exit', resolve)), wait(3000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
