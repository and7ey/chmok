import { decode, type NetMsg, type Role } from './protocol';

export type Status = 'connecting' | 'open' | 'closed';

export interface Transport {
  readonly kind: 'ws' | 'bc';
  readonly room: string;
  send(msg: NetMsg): void;
  close(): void;
  onMessage: ((msg: NetMsg) => void) | null;
  onStatus: ((status: Status) => void) | null;
}

const RELAY_KEY = 'chmok.relay';

/** Адрес ретранслятора: ?relay=wss://host, затем localStorage, затем VITE_RELAY_URL. */
export function relayUrl(): string {
  const fromQuery = new URLSearchParams(location.search).get('relay');
  if (fromQuery) {
    localStorage.setItem(RELAY_KEY, fromQuery);
    return fromQuery;
  }
  return localStorage.getItem(RELAY_KEY) || import.meta.env.VITE_RELAY_URL || '';
}

/** Без ретранслятора играем в двух вкладках одного браузера — тот же протокол, без сервера. */
export function transportKind(): 'ws' | 'bc' {
  return relayUrl() ? 'ws' : 'bc';
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
  return transportKind() === 'ws' ? wsTransport(room, role, name) : bcTransport(room, role);
}
