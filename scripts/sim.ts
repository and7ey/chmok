import { BOARD } from '../src/game/board';
import { canPayOff, chargeFor, makeInitial, netWorth, reducer, taskOf, TIERS } from '../src/game/engine';
import type { Action, GameState, Mood, Tier } from '../src/game/types';

const tiers: Tier[] = ['base', 'tease', 'bold'];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const check = (s: GameState, where: string) => {
  for (const p of s.players) {
    if (!Number.isFinite(p.coins) || p.coins < 0) throw new Error(`${where}: coins=${p.coins} (${p.name})`);
    if (!Number.isFinite(p.heat) || p.heat < 0) throw new Error(`${where}: heat=${p.heat}`);
    if (p.pos < 0 || p.pos >= BOARD.length) throw new Error(`${where}: pos=${p.pos}`);
    if (new Set(p.owned).size !== p.owned.length) throw new Error(`${where}: duplicate owned`);
  }
  const both = s.players[0].owned.filter((id) => s.players[1].owned.includes(id));
  if (both.length) throw new Error(`${where}: ${both[0]} owned by both`);
};

const simulate = (mood: Mood, rounds: number) => {
  let s = makeInitial(mood, ['Аня', 'Борь'], rounds);
  let steps = 0;
  const seen = new Set<string>();

  while (s.phase !== 'gameover' && steps < 4000) {
    steps += 1;
    seen.add(s.phase);
    let action: Action | null = null;

    switch (s.phase) {
      case 'premise':
        action = { type: 'start' };
        break;
      case 'awaiting-roll':
        action = { type: 'roll' };
        break;
      case 'moving':
        action = { type: 'finish-move' };
        break;
      case 'walking':
        action = { type: 'land' };
        break;
      case 'buy':
        action = Math.random() < 0.7 ? { type: 'buy' } : { type: 'decline-buy' };
        break;
      case 'resolve': {
        const pending = s.pending!;
        if (Math.random() < 0.15 && canPayOff(s, pending)) action = { type: 'pay-off' };
        else {
          const tier = pick(tiers);
          const cost = chargeFor(pending.spaceId, tier, pending.multiplier);
          if (s.players[pending.playerId].coins < cost && tier !== 'base') {
            action = { type: 'resolve-tier', tier: 'base' };
          } else {
            action = { type: 'resolve-tier', tier };
          }
        }
        break;
      }
      case 'fate':
        action = { type: 'take-fate' };
        break;
      case 'chapter-break':
        action = { type: 'enter-chapter' };
        break;
      default:
        action = null;
    }

    if (!action) throw new Error(`stuck in phase ${s.phase}`);
    const sig = JSON.stringify([s.phase, s.chapter, s.roundsLeftInChapter, s.current, s.players.map((p) => [p.coins, p.pos, p.heat, p.owned.length, p.alias])]);
    s = reducer(s, action);
    check(s, `${s.phase} after ${action.type}`);
    if (sig === JSON.stringify([s.phase, s.chapter, s.roundsLeftInChapter, s.current, s.players.map((p) => [p.coins, p.pos, p.heat, p.owned.length, p.alias])]))
      throw new Error(`action ${action.type} changed nothing in phase ${s.phase}`);
    if (s.phase === 'resolve' && s.pending) {
      const t = taskOf(s.mood, s.pending.spaceId, 'bold');
      if (!t) throw new Error(`empty task for ${s.pending.spaceId}`);
    }
  }

  if (s.phase !== 'gameover') throw new Error(`game did not finish in ${steps} steps (phase ${s.phase})`);
  return {
    mood,
    steps,
    phases: [...seen].sort().join(','),
    p1: { coins: s.players[0].coins, net: netWorth(s.players[0]), heat: s.players[0].heat, owned: s.players[0].owned.length },
    p2: { coins: s.players[1].coins, net: netWorth(s.players[1]), heat: s.players[1].heat, owned: s.players[1].owned.length },
    greedy: s.winner && s.players[s.winner.greedy].name,
    passionate: s.winner && s.players[s.winner.passionate].name,
    log: s.log.length,
    tiers: Object.keys(TIERS).length,
  };
};

for (const mood of ['tender', 'flirty', 'late'] as Mood[]) {
  for (const rounds of [4, 6, 9]) {
    console.log(JSON.stringify(simulate(mood, rounds)));
  }
}
