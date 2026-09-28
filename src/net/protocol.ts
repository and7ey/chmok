import type { Action, GameState } from '../game/types';

export type Role = 'host' | 'guest';

/** Хост всегда ведёт players[0], гость — players[1]. */
export const playerIdOf = (role: Role): 0 | 1 => (role === 'host' ? 0 : 1);

/** Без I/O/L и цифр 0/1 — код переписывают со слуха. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const makeCode = (len = 4): string =>
  Array.from({ length: len }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export const normCode = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/** Всё, что летает между двумя браузерами. Ретранслятор эти сообщения не разбирает. */
export type AppMsg =
  | { t: 'hello'; name: string; wantRev: number }
  | { t: 'hi'; name: string; rev: number }
  | { t: 'state'; rev: number; state: GameState }
  | { t: 'intent'; action: Action }
  | { t: 'chat'; text: string }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number };

/** Управляющие сообщения ретранслятора. */
export type SrvMsg =
  | { t: 'join'; code: string; role: Role; name: string }
  | { t: 'joined'; code: string; role: Role; peer: string | null }
  | { t: 'peer-present'; name: string }
  | { t: 'peer-left' }
  | { t: 'full'; code: string }
  | { t: 'error'; code: string; reason: string };

export type NetMsg = AppMsg | SrvMsg;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function decode(raw: string): NetMsg | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.t !== 'string') return null;
  return data as unknown as NetMsg;
}

/**
 * Гость не может ходить за хоста и не трогает фазовые таймеры.
 * Редьюсер и так сторожит фазу, здесь — сторожит «кто это прислал».
 */
export function intentAllowed(state: GameState, actor: 0 | 1, action: Action): boolean {
  switch (action.type) {
    // Начало главы ничего не решает за соперника — пусть жмут оба.
    case 'start':
    case 'enter-chapter':
      return true;
    case 'roll':
      return state.phase === 'awaiting-roll' && state.current === actor;
    case 'buy':
    case 'decline-buy':
      return state.phase === 'buy' && state.current === actor;
    case 'take-fate':
      return state.phase === 'fate' && state.current === actor;
    case 'resolve-tier':
    case 'pay-off':
      return state.phase === 'resolve' && state.pending?.playerId === actor;
    default:
      return false;
  }
}
