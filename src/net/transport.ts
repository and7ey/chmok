import { rtcTransport } from './p2p';
import { decode, type NetMsg, type Role } from './protocol';

export type Status = 'connecting' | 'open' | 'closed';
export type Kind = 'ws' | 'rtc' | 'bc';

export interface Transport {
  readonly kind: Kind;
  readonly room: string;
  send(msg: NetMsg): void;
  close(): void;
  onMessage: ((msg: NetMsg) => void) | null;
  onStatus: ((status: Status) => void) | null;
}

const RELAY_KEY = 'chmok.relay';

type Link = Kind | 'off';

/** Как называем канал связи в плашках интерфейса. */
export const linkLabel = (link: Link) =>
  ({ ws: 'онлайн', rtc: 'напрямую', bc: 'локально', off: 'связь' })[link];
export const linkHint = (link: Link) =>
  ({ ws: 'через ретранслятор', rtc: 'напрямую, без сервера', bc: 'локально: две вкладки', off: 'ищем канал…' })[link];

/** Адрес ретранслятора: ?relay=wss://host, затем localStorage, затем VITE_RELAY_URL. */
export function relayUrl(): string {
  const fromQuery = new URLSearchParams(location.search).get('relay');
  if (fromQuery) {
    localStorage.setItem(RELAY_KEY, fromQuery);
    return fromQuery;
  }
  return localStorage.getItem(RELAY_KEY) || import.meta.env.VITE_RELAY_URL || '';
}

/**
 * Без явного ретранслятора соединяемся напрямую через WebRTC: работает между
 * устройствами и ничего не хранит. BroadcastChannel — запасной вариант для
 * браузеров без RTCPeerConnection.
 */
export function transportKind(): Kind {
  if (relayUrl()) return 'ws';
  return typeof RTCPeerConnection === 'function' ? 'rtc' : 'bc';
}

function wsTransport(room: string, role: Role, name: string): Transport {
  const url = `${relayUrl()}?room=${encodeURIComponent(room)}&role=${role}&name=${encodeURIComponent(name)}`;
  const t: Transport & { socket: WebSocket | null; timer: number | null; tries: number; dead: boolean } = {
    kind: 'ws',
    room,
    socket: null,
    timer: null,
    tries: 0,
    dead: false,
    onMessage: null,
    onStatus: null,
    send(msg) {
      if (t.socket?.readyState === WebSocket.OPEN) t.socket.send(JSON.stringify(msg));
    },
    close() {
      t.dead = true;
      if (t.timer !== null) clearTimeout(t.timer);
      t.socket?.close();
      t.socket = null;
    },
  };

  const open = () => {
    const socket = new WebSocket(url);
    t.socket = socket;
    t.onStatus?.('connecting');
    socket.onopen = () => {
      t.tries = 0;
      t.onStatus?.('open');
    };
    socket.onmessage = (ev) => {
      const msg = decode(String(ev.data));
      if (msg) t.onMessage?.(msg);
    };
    socket.onclose = () => {
      t.onStatus?.('closed');
      if (t.dead) return;
      t.tries += 1;
      if (t.tries > 12) return;
      t.timer = window.setTimeout(open, Math.min(8000, 400 * 2 ** Math.min(4, t.tries)));
    };
    socket.onerror = () => socket.close();
  };

  open();
  return t;
}

function bcTransport(room: string, role: Role): Transport {
  const toHost = new BroadcastChannel(`chmok:${room}:to-host`);
  const toGuest = new BroadcastChannel(`chmok:${room}:to-guest`);
  const inbox = role === 'host' ? toHost : toGuest;
  const outbox = role === 'host' ? toGuest : toHost;
  const id = Math.random().toString(36).slice(2);
  const t: Transport = {
    kind: 'bc',
    room,
    onMessage: null,
    onStatus: null,
    send(msg) {
      outbox.postMessage({ __id: id, msg });
    },
    close() {
      toHost.close();
      toGuest.close();
    },
  };
  inbox.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { __id?: string; msg?: NetMsg } | null;
    if (!data?.msg || data.__id === id) return;
    t.onMessage?.(data.msg);
  };
  // канал открывается сразу, есть ли соперник — уже дело протокола (hello/hi)
  setTimeout(() => t.onStatus?.('open'), 0);
  return t;
}

export function createTransport(room: string, role: Role, name: string): Transport {
  const kind = transportKind();
  if (kind === 'ws') return wsTransport(room, role, name);
  if (kind === 'rtc') return rtcTransport(room);
  return bcTransport(room, role);
}

interface Pooled extends Transport {
  owners: number;
  park: number | null;
  status: Status;
  detach(): void;
}

const pool = new Map<string, Pooled>();
const PARK_MS = 5000;

/**
 * Лобби и игра — одна и та же комната: транспорт переживает смену экрана.
 * Иначе хост выходит из лобби, рвёт своё соединение, а гость остаётся с
 * мёртвым пиром — WebRTC этого не прощает, в отличие от BroadcastChannel.
 * Имя в ключ не входит: псевдоним хост меняет уже в лобби, а переименование
 * не стоит разрыва пары.
 */
export function acquireTransport(room: string, role: Role, name: string): Transport {
  const key = `${room}|${role}`;
  let held = pool.get(key);
  if (!held) {
    const inner = createTransport(room, role, name);
    const self: Pooled = {
      kind: inner.kind,
      room: inner.room,
      owners: 0,
      park: null,
      status: 'connecting',
      onMessage: null,
      onStatus: null,
      send: (msg) => inner.send(msg),
      close: () => release(self),
      detach: () => {
        self.onMessage = null;
        self.onStatus = null;
        pool.delete(key);
        inner.onMessage = null;
        inner.onStatus = null;
        inner.close();
      },
    };
    inner.onMessage = (msg) => self.onMessage?.(msg);
    inner.onStatus = (status) => {
      self.status = status;
      self.onStatus?.(status);
    };
    pool.set(key, self);
    held = self;
  }
  if (held.park !== null) {
    clearTimeout(held.park);
    held.park = null;
  }
  held.owners += 1;
  // Новый владелец уже открытой комнаты обязан поздороваться сам.
  if (held.status === 'open') queueMicrotask(() => held.onStatus?.('open'));
  return held;
}

function release(p: Pooled): void {
  p.owners -= 1;
  if (p.owners > 0) return;
  p.park = window.setTimeout(() => {
    p.park = null;
    if (p.owners > 0) return;
    p.detach();
  }, PARK_MS);
}
