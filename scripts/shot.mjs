import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || 'http://localhost:5184/#/';
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 1600);
const out = process.argv[5] || '/tmp/cdp-shot.png';

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--remote-debugging-port=0',
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

const parsePort = (stderr) =>
  new Promise((resolve) => {
    stderr.on('data', (buf) => {
      const m = buf.toString().match(/ws:\/\/[^\s]+/);
      if (m) resolve(m[0]);
    });
    setTimeout(() => resolve(null), 6000);
  });

const wsUrl = await parsePort(chrome.stderr);
if (!wsUrl) {
  console.error('no devtools url');
  chrome.kill();
  process.exit(1);
}

const host = wsUrl.replace(/^ws:\/\//, '').replace(/\/.*$/, '');
const pageList = await fetch('http://' + host + '/json/list').then((r) => r.json());
const page = pageList.find((p) => p.type === 'page') || pageList[0];

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
await new Promise((r) => (ws.onopen = r));

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: Number(process.env.DSF || 2),
  mobile: width < 800,
});
const origin = url.split('#')[0].replace(/\/[^/]*$/, '');
await send('Page.navigate', { url: origin + '/#/play' });
await new Promise((r) => setTimeout(r, 1200));
await send('Runtime.evaluate', { expression: "localStorage.setItem('chmok.agreed18','1')" });
const hash = url.includes('#') ? url.slice(url.indexOf('#')) : '#/';
await send('Page.navigate', { url: `${origin}/?r=${Date.now()}${hash}` });
await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 1800)));
if (process.env.DRIVER) {
  const res = await send('Runtime.evaluate', {
    expression: process.env.DRIVER,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('driver:', res.result?.value ?? JSON.stringify(res.exceptionDetails));
  await new Promise((r) => setTimeout(r, Number(process.env.AFTER || 400)));
}

const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    inner: window.innerWidth,
    docScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 8)
      .map((el) => el.tagName + '.' + String(el.className).slice(0, 26) + ' w=' + Math.round(el.getBoundingClientRect().width) + ' right=' + Math.round(el.getBoundingClientRect().right) + ' scrollW=' + el.scrollWidth + ' clientW=' + el.clientWidth),
  })`,
  returnByValue: true,
});
console.log(probe.result.value || JSON.stringify(probe.exceptionDetails));

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);

ws.close();
chrome.kill();
