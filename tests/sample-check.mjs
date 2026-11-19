// Local regression probe: SAMPLE_IMAGE=/path/to/image.png node tests/sample-check.mjs
// The supplied image is read locally and never added to the repository or uploaded.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
assert.ok(process.env.SAMPLE_IMAGE, 'Usage: SAMPLE_IMAGE=/path/to/image.png node tests/sample-check.mjs');
const profile = await mkdtemp(join(tmpdir(), 'frontier-sample-'));
const browser = spawn(process.env.CHROMIUM || 'chromium', ['--headless', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await wait(100); } }
  assert.ok(port, 'Chromium did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0; const pending = new Map();
  ws.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { const p = pending.get(data.id); pending.delete(data.id); if (data.error) p.reject(new Error(data.error.message)); else p.resolve(data.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Page.navigate', { url: 'http://127.0.0.1:8000/' });
  for (let i = 0; i < 100; i++) { if (await evaluate('document.documentElement.dataset.ready === "true"')) break; await wait(100); }
  const data = (await readFile(process.env.SAMPLE_IMAGE)).toString('base64');
  const diagnostics = await evaluate(`(async () => {
    const blob = await (await fetch('data:image/png;base64,${data}')).blob();
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'local-sample.png', {type:'image/png'}));
    const upload = document.getElementById('upload'); upload.files = transfer.files; upload.dispatchEvent(new Event('change'));
    for(let i=0;i<100;i++) { if (document.getElementById('sourceLabel').textContent === 'local-sample.png') break; await new Promise(r=>setTimeout(r,30)); }
    const image = new Image(); image.src = URL.createObjectURL(blob); await image.decode();
    const c = document.createElement('canvas'); c.width=image.width;c.height=image.height; const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
    const {binarize} = await import('./decoder.js'); const mask = binarize(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height,150,'auto');
    const rows=[];let start=-1;for(let y=0;y<=c.height;y++){let sum=0;for(let x=0;x<c.width;x++)sum+=mask.data[y*c.width+x]||0;if(sum&&start<0)start=y;if(!sum&&start>=0){rows.push([start,y]);start=-1;}}
    URL.revokeObjectURL(image.src);
    return { text:document.getElementById('result').value,status:document.getElementById('status').textContent, rows, size:[c.width,c.height] };
  })()`);
  console.log(JSON.stringify(diagnostics, null, 2));
  assert.equal(diagnostics.text.split('\n').length, 2, 'The two distinct text sizes must remain separate lines');
  assert.ok(diagnostics.text.split('\n')[1].replace(/[?\s]/g, '').length > 20, 'Small line must contain recognizable glyphs');
  console.log('PASS real-image two-line segmentation');
} finally {
  ws?.close(); browser.kill();
  await Promise.race([new Promise(resolve => browser.once('exit', resolve)), wait(3000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
