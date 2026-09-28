import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = process.env.APP_URL || 'http://localhost:5183';
const RELAY = process.env.RELAY || '';

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-first-run',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--remote-debugging-port=0',
    '--window-size=1280,900',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

const findWs = (stderr) =>
  new Promise((resolve) => {
    stderr.on('data', (b) => {
      const m = b.toString().match(/ws:\/\/[^\s]+/);
      if (m) resolve(m[0]);
    });
    setTimeout(() => resolve(null), 8000);
  });

const browserWs = await findWs(chrome.stderr);
if (!browserWs) {
  console.error('no devtools url');
  chrome.kill();
  process.exit(1);
}

const host = browserWs.replace(/^ws:\/\//, '').replace(/\/.*$/, '');
const conn = new WebSocket(browserWs);
const pending = new Map();
let mid = 0;
const problems = new Map();
conn.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id !== undefined) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p?.reject(new Error(JSON.stringify(msg.error)));
    else p?.resolve(msg.result);
  } else if (msg.sessionId && (msg.method === 'Runtime.exceptionThrown' || msg.method === 'Log.entryAdded')) {
    const list = problems.get(msg.sessionId) || [];
    problems.set(msg.sessionId, list);
    const d = msg.params.exceptionDetails?.exception?.description || msg.params.entry?.text;
    if (d) list.push(d.slice(0, 300));
  }
});
await new Promise((r) => conn.addEventListener('open', r));

const raw = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++mid;
    pending.set(id, { resolve, reject });
    conn.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

/** Отдельная flattened-сессия на каждую вкладку: createTarget + attachToTarget. */
const newPage = async (url) => {
  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
  const page = {
    sessionId,
    call: (method, params) => raw(method, params, sessionId),
    async js(expression) {
      const r = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'js error');
      return r.result.value;
    },
    async open(url) {
      await this.call('Page.navigate', { url });
      await this.waitJs('!!document.getElementById("root")?.children.length');
    },
    async waitJs(expr, ms = 20000) {
      const t0 = Date.now();
      for (;;) {
        if (await this.js(`!!(${expr})`)) return true;
        if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${expr}`);
        await new Promise((r) => setTimeout(r, 60));
      }
    },
    async text() {
      return this.js('document.body.innerText');
    },
    /** CSS text-transform поднимает регистр, поэтому сравниваем в lower-case. */
    async has(part) {
      return this.js(`document.body.innerText.toLowerCase().includes(${JSON.stringify(part.toLowerCase())})`);
    },
    async waitHas(part, ms = 20000) {
      const t0 = Date.now();
      for (;;) {
        if (await this.has(part)) return true;
        if (Date.now() - t0 > ms) throw new Error(`timeout waiting for text "${part}"`);
        await new Promise((r) => setTimeout(r, 80));
      }
    },
    /** Клик по подстроке в тексте кнопки/ссылки — селекторы в этом UI хрупкие. */
    async clickText(part) {
      const ok = await this.js(`(() => {
        const el = [...document.querySelectorAll('button, a')].find(e => e.textContent.includes(${JSON.stringify(part)}));
        if (!el || el.disabled) return false; el.click(); return true;
      })()`);
      if (!ok) throw new Error(`no clickable element with "${part}"`);
      return true;
    },
    async type(sel, value) {
      return this.js(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return false;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
    },
    issues: () => problems.get(sessionId) || [],
    async shot(path) {
      await this.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      const { data } = await this.call('Page.captureScreenshot', { format: 'png' });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, Buffer.from(data, 'base64'));
      return path;
    },
  };
  await page.call('Page.enable');
  await page.call('Runtime.enable');
  await page.call('Log.enable');
  await page.open(url);
  pages.push(page);
  return page;
};

const log = (...a) => console.log(...a);
const pages = [];
process.on('uncaughtException', async (e) => {
  log('FAIL:', e.message);
  for (const p of pages) {
    log('--- page text:', (await p.text().catch(() => '(dead)')).slice(0, 300).replace(/\n+/g, ' | '));
    for (const i of p.issues()) log('--- page error:', i);
  }
  chrome.kill();
  process.exit(1);
});
setTimeout(() => {
  log('WATCHDOG: scenario did not finish in 300s');
  chrome.kill();
  process.exit(1);
}, 300000);
const base = RELAY ? `${APP}/?relay=${encodeURIComponent(RELAY)}#/play` : `${APP}/#/play`;
log('mode:', RELAY ? 'ws relay' : 'broadcast channel');

/** Нажимает первую доступную кнопку хода на этой странице; locked-контейнер не считаем. */
const ACT = `(() => {
  const box = document.querySelector('.modal__box');
  const panel = [...document.querySelectorAll('.panel')].find(p => p.querySelector('button'));
  const scope = box && !box.className.includes('locked') ? box
    : panel && !panel.className.includes('locked') ? panel : null;
  if (!scope) return 'none';
  const want = ['Вперёд','Бросить кубики','Выкупить','Оставить свободной','Принять как есть','Следующая глава'];
  const btns = [...scope.querySelectorAll('button')].filter(b => !b.disabled);
  const tier = btns.find(b => b.className.includes('tier'));
  const hit = want.map(w => btns.find(b => b.textContent.includes(w))).find(Boolean) || tier;
  if (!hit) return 'none';
  const label = hit.textContent.trim().slice(0, 34);
  hit.click();
  return label;
})()`;

const gate = async (p) => {
  if (await p.has('мне есть 18')) await p.clickText('Мне есть 18');
};

if (process.env.SOLO) {
  log('mode: hot-seat regression');
  const solo = await newPage(`${APP}/#/play`);
  await solo.waitHas('вдвоём за экраном');
  await gate(solo);
  await solo.clickText('Вдвоём за экраном');
  await solo.waitJs("!!document.querySelector('#p1')");
  await solo.type('#p1', 'Аня');
  await solo.type('#p2', 'Витя');
  await solo.clickText('Начать главу 1');
  await solo.waitJs("!!document.querySelector('.log')");
  const pressed = new Set();
  for (let i = 0; i < 70; i++) {
    const a = await solo.js(ACT);
    if (a !== 'none') pressed.add(a);
    await new Promise((r) => setTimeout(r, 900));
    if (await solo.has('короны розданы')) break;
  }
  const text = await solo.js("document.querySelector('.log')?.innerText || ''");
  log('solo pressed:', [...pressed].slice(0, 12).join(' · '));
  log('solo journal lines:', text.split('\n').filter(Boolean).length, '| finished:', await solo.has('обе короны'));
  log('solo errors:', solo.issues().join(' || ') || 'нет');
  chrome.kill();
  process.exit(0);
}

const host_ = await newPage(base);
await host_.waitHas('создать комнату');
await gate(host_);
await host_.clickText('Создать комнату');
await host_.waitJs("!!document.querySelector('#myname')");
const roomCode = await host_.js("document.querySelector('.card .h2')?.textContent.trim()");
const invite = await host_.js("[...document.querySelectorAll('p')].map(p=>p.textContent).find(t=>t.includes('#/play?room='))");
log('host code:', roomCode, '| invite:', invite);

const guestUrl = (invite || `${APP}/#/play?room=${roomCode}&as=guest`).replace(/^http:\/\/localhost:\d+/, APP);
const guest_ = await newPage(guestUrl);
await gate(guest_);

if (await guest_.js("!!document.querySelector('#code')")) {
  await guest_.type('#code', roomCode);
  await guest_.type('#gname', 'Мария');
  await guest_.clickText('Войти');
}
log('guest joined');

await host_.waitHas('в комнате', 60000);
log('host sees peer:', (await host_.text()).match(/[^\n]*в комнате[^\n]*/)?.[0]);

await host_.type('#myname', 'Андрей');
await host_.clickText('Начать главу 1');
await host_.waitJs("!!document.querySelector('.log')");
log('host in game');

await guest_.waitJs("!!document.querySelector('.log')", 25000);
log('guest in game');
log('guest head:', (await guest_.text()).match(/[^\n]*(онлайн|локально)[^\n]*/)?.[0]);

// переписка
await guest_.js(`(() => { const i = document.querySelector('.panel form input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'привет из гостя'); i.dispatchEvent(new Event('input',{bubbles:true})); i.closest('form').requestSubmit(); return true; })()`);
await host_.waitHas('привет из гостя', 12000);
log('host got the chat message');

const journal = (p) => p.js("document.querySelector('.log')?.innerText || ''");
const coins = (p) => p.js("[...document.querySelectorAll('.player__coins')].map(e=>e.textContent).join('/')");

// гость перезагружает страницу посреди партии — обязан вернуться в то же состояние
await guest_.open(guestUrl);
await guest_.waitJs("!!document.querySelector('.log')", 25000);
await new Promise((r) => setTimeout(r, 1800));
const resync =
  (await journal(guest_)).split('\n').slice(-3).join('|') === (await journal(host_)).split('\n').slice(-3).join('|');
log('guest resynced after reload:', resync, '| coins:', await coins(host_), await coins(guest_));

// играем до финала: каждый ходит, когда очередь до него дошла
const seen = { host: new Set(), guest: new Set() };
let last = '';
for (let i = 0; i < 90; i++) {
  const h = await host_.js(ACT);
  if (h !== 'none') { seen.host.add(h); last = 'host: ' + h; }
  await new Promise((r) => setTimeout(r, 700));
  const g = await guest_.js(ACT);
  if (g !== 'none') { seen.guest.add(g); last = 'guest: ' + g; }
  await new Promise((r) => setTimeout(r, 900));
  if (await host_.has('короны розданы') || await host_.has('обе короны')) break;
}
log('last moves:', last);
log('host pressed:', [...seen.host].join(' · '));
log('guest pressed:', [...seen.guest].join(' · '));

const jh = await journal(host_);
const jg = await journal(guest_);
const same = jh.split('\n').slice(-6).join('|') === jg.split('\n').slice(-6).join('|');
log('journals in sync (last 6 lines):', same);
log('coins host page:', await coins(host_), '| guest page:', await coins(guest_));
if (!same) {
  log('--- host journal ---\n' + jh.slice(0, 700));
  log('--- guest journal ---\n' + jg.slice(0, 700));
}

await host_.shot('/tmp/net-host.png');
await guest_.shot('/tmp/net-guest.png');
log('screenshots: /tmp/net-host.png /tmp/net-guest.png');

chrome.kill();
process.exit(0);
