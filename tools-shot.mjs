// Headless screenshot via Chrome DevTools Protocol (node >= 22, no deps).
// usage: node tools-shot.mjs <out.png> <url> [width] [height] [waitMs]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
const [out, url, w = '1920', h = '1080', wait = '2500', js = ''] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const dir = mkdtempSync('/tmp/vhc-');
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60; i++) {
  try { const j = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const p = j.find(t => t.type === 'page'); if (p) { ws = p.webSocketDebuggerUrl; break; } } catch {}
  await sleep(250);
}
if (!ws) { console.error('no chrome'); chrome.kill('SIGKILL'); process.exit(1); }
const sock = new WebSocket(ws); let id = 0; const pend = new Map(); const logs = [];
sock.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(m.params.type)) logs.push(m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description).join(' ')); };
await new Promise(r => sock.onopen = r);
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(+wait);
if (js) { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true }); if (r.result?.exceptionDetails) console.log('JS error', JSON.stringify(r.result.exceptionDetails.exception?.description)); await sleep(800); }
const m = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(m.result.data, 'base64'));
logs.forEach(l => console.log(l));
console.log('saved', out);
sock.close(); chrome.kill('SIGKILL'); process.exit(0);
