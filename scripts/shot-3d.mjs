// Быстрая проверка 3D-сцены в headless Chrome: бросает кубики и снимает кадры в scripts/shots/.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = process.env.APP_URL || 'http://localhost:5183';
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  ['--headless=new', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', '--window-size=1400,1100', 'about:blank'],
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
const conn = new WebSocket(browserWs);
const pending = new Map();
let seq = 0;
conn.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Page.screencastFrame') {
    if (casting) frames.push(m.params.data);
    conn.send(JSON.stringify({ id: ++seq, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
  }
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
});
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    conn.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
await new Promise((r) => conn.addEventListener('open', r));

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, undefined);
const call = (method, params) => send(method, params, sessionId);

/**
 * Отсчёт кадров через screencast: captureScreenshot в headless идёт секунды
 * и для шага в 185 мс слепой — а так видно всю анимацию целиком.
 */
const frames = [];
let casting = false;
const castStart = async () => {
  frames.length = 0;
  casting = true;
  await call('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1000, everyNthFrame: 2 });
};
const castStop = async (tag, keep = 12) => {
  casting = false;
  await call('Page.stopScreencast');
  const step = Math.max(1, Math.floor(frames.length / keep));
  const picked = frames.filter((_, i) => i % step === 0).slice(0, keep);
  picked.forEach((f, i) =>
    writeFileSync(`${OUT}cast-${tag}-${String(i).padStart(2, '0')}.jpg`, Buffer.from(f, 'base64')),
  );
  console.log(`касты ${tag}: кадров ${frames.length}, сохранено ${picked.length}`);
};

const js = async (expression) => {
  const out = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return out.result?.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name, zoomOn) => {
  const params = { format: 'png' };
  if (zoomOn) {
    const r = await js(`(() => { const b=document.querySelector('${zoomOn}').getBoundingClientRect(); return JSON.stringify({x:b.x,y:b.y,w:b.width,h:b.height}) })()`);
    const { x, y, w, h } = JSON.parse(r);
    params.clip = { x, y, width: w, height: h, scale: 2 };
  }
  const { data } = await call('Page.captureScreenshot', params);
  writeFileSync(`${OUT}${name}.png`, Buffer.from(data, 'base64'));
  console.log('shot:', name);
};
/** Клик по первой кнопке внутри контейнера, чей текст подходит под регулярку. */
const click = (containerSel, re) =>
  js(`(() => { const b=[...document.querySelectorAll(${JSON.stringify(containerSel)} + ' button')].find(x=>new RegExp(${JSON.stringify(re)}).test(x.textContent)); if(!b) return 'НЕТ'; b.click(); return b.textContent.trim().slice(0,26) })()`);

await call('Page.enable');
await call('Page.navigate', { url: `${APP}/#/` });
await wait(4000);
await js(`localStorage.setItem('chmok.agreed18','1')`);
await wait(6000);
await shot('01-landing');

await call('Page.navigate', { url: `${APP}/#/play` });
await wait(2500);
console.log('гейт:', await click('body', 'Мне есть 18'));
await wait(600);
console.log('режим:', await click('body', 'Вдвоём за экраном'));
await wait(900);
await js(`(() => {
  const set=(sel,v)=>{const i=document.querySelector(sel);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}));};
  set('#p1','Аня'); set('#p2','Витя');
})()`);
await wait(400);
console.log('старт:', await click('body', 'Начать первую главу'));
await wait(1200);
await shot('02-premise');
console.log('вперёд:', await click('.modal__box', 'Вперёд'));
await wait(3000);
await shot('03-board');
console.log('игроки:', await js(`[...document.querySelectorAll('.player')].map(p=>p.innerText.replace(/\\n+/g,' ')).join(' ;; ')`));

const chip = () => js(`[...document.querySelectorAll('.board3d__chip')].map(c=>c.innerText.replace(/\\n+/g,' ')).join(' | ')`);
/** Ждём нужной фазы по чипу над полем: снимки в headless идут секунды, таймеры не работают. */
const waitChip = async (re, ms = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const c = await chip();
    if (new RegExp(re).test(c)) return c;
    await wait(120);
  }
  return 'ТАЙМАУТ';
};

await castStart();
console.log('бросок:', await click('.panel', 'Бросить кубики'));
console.log('чип:', await waitChip('прыгают'));
await shot('04-dice', '.board3d');
/** Screencast в headless отдаёт единицы кадров — снимаем ход серии PNG: сам снимок идёт ~1 с, этого хватает на фазы. */
for (let i = 0; i < 8 && !(await js(`!!document.querySelector('.modal__box')`)); i++) {
  await shot(`04-turn-${i}`, '.board3d');
}
await castStop('turn');
console.log('чип:', await chip());
await shot('05-arrival', '.board3d');
for (let i = 0; i < 40 && !(await js(`!!document.querySelector('.modal__box')`)); i++) await wait(150);
await shot('06-card', '.board3d');
console.log('карта:', await js(`document.querySelector('.modal__box')?.innerText.replace(/\\n+/g,' | ') || document.querySelector('.panel')?.innerText.replace(/\\n+/g,' | ')`));
console.log('журнал:', await js(`[...document.querySelectorAll('.log__row')].slice(0,5).map(r=>r.innerText).join(' ;; ')`));

let bought = false;
let rolls = 0;
for (let i = 0; i < 70; i++) {
  const done = await js(`(() => {
    const box = document.querySelector('.modal__box');
    const panel = [...document.querySelectorAll('.panel')].find(p => p.querySelector('button'));
    const scope = box && !box.className.includes('locked') ? box : panel && !panel.className.includes('locked') ? panel : null;
    if (!scope) return 'none';
    const want = ['Вперёд','Бросить кубики','Выкупить','Принять как есть'];
    const btns = [...scope.querySelectorAll('button')].filter(b => !b.disabled);
    const tier = btns.find(b => b.className.includes('tier'));
    const hit = want.map(w => btns.find(b => b.textContent.trim().startsWith(w))).find(Boolean) || tier;
    if (!hit) return 'none';
    const label = hit.textContent.trim().slice(0, 24);
    hit.click();
    return label;
  })()`);
  await wait(620);
  if (done === 'Бросить кубики' && rolls < 4) {
    /** Снимаем во время ходьбы: после открытия карточки поле под размытием, а камера ведёт фишку всю дорогу. */
    console.log('чип:', await waitChip('='));
    await shot(`1${++rolls}-walk`, '.board3d');
  }
  if (done.startsWith('Выкупить') && !bought) {
    bought = true;
    await wait(900);
    console.log('уровень:', await click('.modal__box', 'База'));
    await wait(3000);
    await shot('08-house', '.board3d');
    console.log('журнал:', await js(`[...document.querySelectorAll('.log__row')].slice(0,4).map(r=>r.innerText).join(' ;; ')`));
  }
  if (done === 'Следующая глава') {
    await wait(400);
    await shot('09-after-break');
    break;
  }
  if (await js(`!!document.body.innerText.match(/Короны розданы|обе короны|Ровная ничья/)`)) break;
}
chrome.kill();
process.exit(0);
