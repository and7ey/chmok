import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { makeInitial, reducer } from '../game/engine';
import type { Action, GameState, Mood } from '../game/types';
import { DICE_ROLL_MS, prefersReducedMotion, walkMs } from '../components/three/capabilities';
import { intentAllowed, playerIdOf, type Role } from './protocol';
import { useRoom, type Room } from './useRoom';

export interface SessionConfig {
  mood: Mood;
  names: [string, string];
  rounds: number;
}

export interface NetParams {
  room: string;
  role: Role;
  name: string;
}

export interface ChatLine {
  id: number;
  from: 'me' | 'peer';
  text: string;
}

export type Seat = 'solo' | 'host' | 'guest';

/** Хост держит редьюсер, гость шлёт намерения и показывает прилетевшее состояние. */
export function useGame(cfg: SessionConfig, net: NetParams | null) {
  const seat: Seat = net ? net.role : 'solo';
  const isGuest = seat === 'guest';
  const me = net ? playerIdOf(net.role) : 0;
  const peer = (1 - me) as 0 | 1;

  const [local, advance] = useReducer(reducer, cfg, (c) => makeInitial(c.mood, c.names, c.rounds));
  const [remote, setRemote] = useState<GameState | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);

  const chatSeq = useRef(0);
  const shown = useRef<GameState | null>(local);
  const landAt = useRef(0);
  const hold = useRef<number | null>(null);
  const queued = useRef<GameState | null>(null);
  shown.current = isGuest ? remote : local;

  const put = (state: GameState | null) => {
    landAt.current = 0;
    queued.current = null;
    setRemote(state);
  };

  const log = (from: 'me' | 'peer', text: string) => {
    chatSeq.current += 1;
    const line = { id: chatSeq.current, from, text };
    setChat((c) => [...c.slice(-40), line]);
  };

  const room = useRoom({
    room: net?.room ?? 'solo',
    role: net?.role ?? 'host',
    name: net?.name ?? '',
    hostState: () => (isGuest ? null : local),
    onIntent: (action) => {
      const s = shown.current;
      if (s && intentAllowed(s, peer, action)) advance(action);
    },
    onState: (state) => {
      const prev = shown.current;
      if (state.phase === 'walking' && prev?.phase !== 'walking' && !prefersReducedMotion()) {
        // Фишка рисует путь сама: карточку держим до прибытия.
        const steps = state.dice ? state.dice[0] + state.dice[1] : 0;
        landAt.current = Date.now() + walkMs(steps);
      }
      const wait = landAt.current - Date.now();
      if (wait > 0 && state.phase !== 'moving' && state.phase !== 'walking') {
        // Держим самое свежее, пока фишка доходит: промежуточные состояния не нужны.
        queued.current = state;
        if (hold.current === null) {
          hold.current = window.setTimeout(() => {
            hold.current = null;
            put(queued.current);
          }, wait);
        }
        return;
      }
      if (state.phase !== 'walking') put(state);
      else setRemote(state);
    },
    onChat: (text) => log('peer', text),
  });

  const { sendState, sendIntent, sendChat } = room;

  useEffect(() => {
    if (seat === 'host') sendState(local);
  }, [seat, local, sendState]);

  // Имя второго игрока приходит из лобби вместе с приветствием гостя.
  useEffect(() => {
    if (seat === 'host' && room.peerName) advance({ type: 'rename', id: 1, name: room.peerName });
  }, [seat, room.peerName]);

  useEffect(
    () => () => {
      if (hold.current !== null) clearTimeout(hold.current);
    },
    [],
  );

  const dispatch = useCallback(
    (action: Action) => {
      if (!isGuest) {
        advance(action);
        return;
      }
      const s = shown.current;
      if (s && intentAllowed(s, me, action)) sendIntent(action);
    },
    [isGuest, me, sendIntent],
  );

  const say = useCallback(
    (text: string) => {
      const clean = text.trim().slice(0, 200);
      if (!clean) return;
      sendChat(clean);
      log('me', clean);
    },
    [sendChat],
  );

  return { state: isGuest ? remote : local, dispatch, room, seat, me, chat, say };
}

/** Косметика хода ведёт только хост: у гостья таймеров нет, он ждёт состояние. */
export function useMoveTimers(
  state: GameState | null,
  dispatch: (a: Action) => void,
  host: boolean,
  animated: boolean,
) {
  const steps = state?.dice ? state.dice[0] + state.dice[1] : 0;

  useEffect(() => {
    if (!host || state?.phase !== 'moving') return;
    const t = setTimeout(() => dispatch({ type: 'finish-move' }), DICE_ROLL_MS);
    return () => clearTimeout(t);
  }, [host, state?.phase, dispatch]);

  useEffect(() => {
    if (!host || state?.phase !== 'walking') return;
    const t = setTimeout(() => dispatch({ type: 'land' }), animated ? walkMs(steps) + 2500 : 620);
    return () => clearTimeout(t);
  }, [host, state?.phase, steps, animated, dispatch]);
}

export type { Room };
