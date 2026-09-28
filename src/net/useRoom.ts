import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, GameState } from '../game/types';
import { createTransport, type Status, type Transport } from './transport';
import type { AppMsg, Role } from './protocol';

const PING_EVERY = 4000;
const PEER_TIMEOUT = 13000;

export interface Room {
  kind: 'ws' | 'bc' | 'off';
  status: Status;
  peerName: string | null;
  peerPresent: boolean;
  latency: number | null;
  sendState: (state: GameState) => void;
  sendIntent: (action: Action) => void;
  sendChat: (text: string) => void;
}

interface Options {
  room: string;
  role: Role;
  name: string;
  /** только хост: состояние на момент, когда соперник просит синхронизацию */
  hostState: () => GameState | null;
  /** только хост: пришёл ход от соперника */
  onIntent: (action: Action) => void;
  /** только гость: прилетело состояние хоста */
  onState: (state: GameState) => void;
  onChat: (text: string) => void;
}

export function useRoom({ room, role, name, hostState, onIntent, onState, onChat }: Options): Room {
  const transportRef = useRef<Transport | null>(null);
  const rev = useRef(0);
  const lastSeen = useRef(0);
  const cb = useRef({ hostState, onIntent, onState, onChat });
  cb.current = { hostState, onIntent, onState, onChat };

  const [status, setStatus] = useState<Status>('connecting');
  const [kind, setKind] = useState<Room['kind']>('off');
  const [peerName, setPeerName] = useState<string | null>(null);
  const [peerPresent, setPeerPresent] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const t = createTransport(room, role, name);
    transportRef.current = t;
    setKind(t.kind);

    const send = (msg: AppMsg) => t.send(msg);

    t.onStatus = (next) => {
      setStatus(next);
      if (next === 'open') {
        send({ t: 'hello', name, wantRev: rev.current });
        if (role === 'host') {
          const s = cb.current.hostState();
          if (s) send({ t: 'state', rev: rev.current, state: s });
        }
      }
      if (next === 'closed') setPeerPresent(false);
    };

    t.onMessage = (msg) => {
      switch (msg.t) {
        case 'joined':
          setPeerName(msg.peer);
          setPeerPresent(Boolean(msg.peer));
          lastSeen.current = Date.now();
          break;
        case 'peer-present':
          setPeerName(msg.name);
          setPeerPresent(true);
          lastSeen.current = Date.now();
          break;
        case 'peer-left':
          setPeerPresent(false);
          break;
        case 'hello':
          setPeerName(msg.name);
          setPeerPresent(true);
          lastSeen.current = Date.now();
          send({ t: 'hi', name, rev: rev.current });
          if (role === 'host') {
            const s = cb.current.hostState();
            if (s) send({ t: 'state', rev: rev.current, state: s });
          }
          break;
        case 'hi':
          setPeerName(msg.name);
          setPeerPresent(true);
          lastSeen.current = Date.now();
          break;
        case 'state':
          lastSeen.current = Date.now();
          setPeerPresent(true);
          if (role === 'guest' && msg.rev >= rev.current) {
            rev.current = msg.rev;
            cb.current.onState(msg.state);
          }
          break;
        case 'intent':
          lastSeen.current = Date.now();
          if (role === 'host') cb.current.onIntent(msg.action);
          break;
        case 'chat':
          lastSeen.current = Date.now();
          cb.current.onChat(msg.text);
          break;
        case 'ping':
          send({ t: 'pong', at: msg.at });
          break;
        case 'pong':
          lastSeen.current = Date.now();
          setLatency(Math.max(0, Math.round(Date.now() - msg.at)));
          break;
      }
    };

    const pinger = window.setInterval(() => {
      send({ t: 'ping', at: Date.now() });
      if (Date.now() - lastSeen.current > PEER_TIMEOUT) setPeerPresent(false);
    }, PING_EVERY);

    return () => {
      clearInterval(pinger);
      t.onMessage = null;
      t.onStatus = null;
      t.close();
      transportRef.current = null;
    };
  }, [room, role, name]);

  const sendState = useCallback((state: GameState) => {
    rev.current += 1;
    transportRef.current?.send({ t: 'state', rev: rev.current, state });
  }, []);

  const sendIntent = useCallback((action: Action) => {
    transportRef.current?.send({ t: 'intent', action });
  }, []);

  const sendChat = useCallback((text: string) => {
    transportRef.current?.send({ t: 'chat', text });
  }, []);

  return { kind, status, peerName, peerPresent, latency, sendState, sendIntent, sendChat };
}
