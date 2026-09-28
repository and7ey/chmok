import { decode, type NetMsg } from './protocol';
import type { Status, Transport } from './transport';

/**
 * Соединение напрямую, без сервера: пиры находят друг друга через публичные
 * WebTorrent-трекеры (Trystero), а ходы идут по зашифрованному WebRTC-каналу.
 * Канал ровно один и он всегда один и тот же — иначе стороны разминутся.
 */
interface RtcRoom {
  makeAction(namespace: string): RtcAction;
  onPeerJoin: ((id: string) => void) | null;
  onPeerLeave: ((id: string) => void) | null;
  leave(): Promise<void>;
}

interface RtcAction {
  send(data: string, options?: { target?: string }): Promise<void>;
  onMessage: ((data: unknown, context: { peerId: string }) => void) | null;
}

const APP_ID = 'chmok-room';

export function rtcTransport(code: string): Transport {
  let onMessage: ((msg: NetMsg) => void) | null = null;
  let onStatus: ((status: Status) => void) | null = null;
  let peer: string | null = null;
  let standby: string | null = null;
  let action: RtcAction | null = null;
  let room: Promise<RtcRoom> | null = null;

  const adopt = (id: string) => {
    peer = id;
    standby = null;
    onStatus?.('open');
  };

  const start = async () => {
    const { defaultRelayUrls, joinRoom } = await import('@trystero-p2p/torrent');
    const r = joinRoom(
      {
        appId: APP_ID,
        // Берём все трекеры сразу: часть из публичных мертва, и выборка «3 из
        // 5» по appId может выбросить единственные живые. Список один и тот же
        // на обеих сторонах, поэтому стороны не разминутся.
        relayConfig: { urls: defaultRelayUrls, redundancy: defaultRelayUrls.length },
      },
      code,
    ) as RtcRoom;
    room = Promise.resolve(r);
    action = r.makeAction('net');
    action.onMessage = (data, context) => {
      // Гость перезагрузил страницу: новый пир мог объявиться раньше, чем
      // трекер сообщил об уходе старого. Берём его, как только он подаст голос.
      if (peer !== context.peerId) {
        if (peer && context.peerId !== standby) return;
        adopt(context.peerId);
      }
      const msg = decode(typeof data === 'string' ? data : JSON.stringify(data));
      if (msg) onMessage?.(msg);
    };
    r.onPeerJoin = (id) => {
      if (!peer) adopt(id);
      else if (id !== peer) standby = id;
    };
    r.onPeerLeave = (id) => {
      if (id === standby) {
        standby = null;
        return;
      }
      if (id !== peer) return;
      if (standby) adopt(standby);
      else {
        peer = null;
        onStatus?.('closed');
      }
    };
  };
  void start().catch(() => onStatus?.('closed'));

  return {
    kind: 'rtc',
    room: code,
    get onMessage() {
      return onMessage;
    },
    set onMessage(fn) {
      onMessage = fn;
    },
    get onStatus() {
      return onStatus;
    },
    set onStatus(fn) {
      onStatus = fn;
    },
    send(msg) {
      if (!peer) return;
      action?.send(JSON.stringify(msg), { target: peer }).catch(() => {});
    },
    close() {
      peer = null;
      standby = null;
      action = null;
      void room?.then((r) => r.leave()).catch(() => {});
      room = null;
    },
  };
}
