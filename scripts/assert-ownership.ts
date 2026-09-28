import { spaceIndex } from '../src/game/board';
import { makeInitial, reducer, canPayOff } from '../src/game/engine';
import type { Action, GameState, Mood, Tier } from '../src/game/types';

const tiers: Tier[] = ['base', 'tease', 'bold'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const assert = (cond: boolean, msg: string, s: GameState) => {
  if (!cond) {
    console.error('FAIL:', msg, JSON.stringify({ phase: s.phase, pending: s.pending, players: s.players.map((p) => ({ n: p.name, pos: p.pos, owned: p.owned })) }));
    process.exit(1);
  }
};

let purchaseCards = 0;
let rentCards = 0;

for (const mood of ['tender', 'flirty', 'late'] as Mood[]) {
  for (let game = 0; game < 40; game++) {
    let s = makeInitial(mood, ['Мария', 'Андрей'], 6);
    let steps = 0;
    while (s.phase !== 'gameover' && steps < 5000) {
      steps += 1;
      let action: Action | null = null;
      const before = s.phase;
      switch (s.phase) {
        case 'premise': action = { type: 'start' }; break;
        case 'awaiting-roll': action = { type: 'roll' }; break;
        case 'moving': action = { type: 'finish-move' }; break;
        case 'walking': action = { type: 'land' }; break;
        case 'buy': action = Math.random() < 0.7 ? { type: 'buy' } : { type: 'decline-buy' }; break;
        case 'resolve':
          action = Math.random() < 0.15 && canPayOff(s, s.pending!) ? { type: 'pay-off' } : { type: 'resolve-tier', tier: pick(tiers) };
          break;
        case 'fate': action = { type: 'take-fate' }; break;
        case 'chapter-break': action = { type: 'enter-chapter' }; break;
      }
      const wasBuy = before === 'buy';
      s = reducer(s, action!);

      if (s.phase === 'resolve' && s.pending) {
        const p = s.pending;
        assert(
          s.players[p.ownerId!].owned.includes(p.spaceId),
          `owner of ${p.spaceId} is not in owner.owned (ownerId=${p.ownerId})`,
          s,
        );
        assert(s.players[p.playerId].id === p.playerId, 'payer id mismatch', s);
        if (p.fromPurchase) {
          purchaseCards += 1;
          assert(wasBuy, 'fromPurchase card appeared without a buy right before', s);
        } else {
          rentCards += 1;
          assert(
            s.players[p.playerId].pos === spaceIndex(p.spaceId),
            `payer is not standing on ${p.spaceId} (pos=${s.players[p.playerId].pos})`,
            s,
          );
          assert(p.playerId !== p.ownerId, 'rent card against own street', s);
        }
      }
    }
    assert(s.phase === 'gameover', 'game did not finish', s);
  }
}
console.log(JSON.stringify({ purchaseCards, rentCards, verdict: 'invariants hold' }));
