import { BOARD, SPACE_COUNT } from './board';
import { DECK, FATE, START_COINS, PASS_START, HOME_BONUS, chapterAt } from './story';
import type { Action, GameState, Mood, PendingCard, PlayerState, SpaceId, Tier } from './types';

/** Цена карты относительно стоимости локации и тепло за смелость */
export const TIERS: Record<Tier, { label: string; factor: number; heat: number }> = {
  base: { label: 'База', factor: 1, heat: 0 },
  tease: { label: 'Дразнить', factor: 0.5, heat: 1 },
  bold: { label: 'Смелее', factor: 0.25, heat: 2 },
};

export const PAYOFF_FACTOR = 1.5;

const norm = (i: number) => ((i % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT;

const other = (id: 0 | 1): 0 | 1 => (id === 0 ? 1 : 0);

const rand = (state: GameState) => {
  let t = (state.seed + state.logSeq * 2654435761) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 2246822507) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 3266489917) >>> 0;
  state.logSeq += 1;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
};

const say = (
  state: GameState,
  text: string,
  tone: 'neutral' | 'money' | 'heat' | 'story' = 'neutral',
) => {
  state.log.unshift({ id: state.logSeq++, text, tone });
  if (state.log.length > 60) state.log.length = 60;
};

export const netWorth = (p: PlayerState) =>
  p.coins + p.owned.reduce((sum, id) => sum + (BOARD.find((s) => s.id === id)?.price ?? 0), 0);

export const chargeFor = (spaceId: SpaceId, tier: Tier, multiplier: number) =>
  Math.round(((BOARD.find((s) => s.id === spaceId)?.price ?? 0) * TIERS[tier].factor * multiplier) / 5) * 5;

export const payoffCost = (pending: PendingCard) =>
  Math.round((chargeFor(pending.spaceId, 'base', pending.multiplier) * PAYOFF_FACTOR) / 5) * 5;

export const canPayOff = (state: GameState, pending: PendingCard) =>
  state.players[pending.playerId].coins >= payoffCost(pending);

export const taskOf = (mood: Mood, spaceId: SpaceId, tier: Tier): string =>
  DECK[mood][spaceId]?.[tier] ?? 'Партнёры молча смотрят друг на друга десять секунд.';

export const makeInitial = (
  mood: Mood,
  names: [string, string],
  roundsPerChapter: number,
  totalChapters = 3,
): GameState => {
  const mk = (id: 0 | 1): PlayerState => ({
    id,
    name: names[id].trim() || (id === 0 ? 'Игрок 1' : 'Игрок 2'),
    alias: '',
    pos: 0,
    coins: START_COINS,
    heat: 0,
    owned: [],
    crown: null,
  });
  return {
    mood,
    players: [mk(0), mk(1)],
    current: 0,
    phase: 'premise',
    spaceIndex: 0,
    dice: null,
    pending: null,
    fate: null,
    chapter: 1,
    totalChapters,
    roundsLeftInChapter: roundsPerChapter,
    roundsPerChapter,
    log: [],
    logSeq: 1,
    seed: Math.floor(Math.random() * 2 ** 31),
    winner: null,
  };
};

const setAliases = (state: GameState) => {
  const [a, b] = chapterAt(state.mood, state.chapter).aliases;
  state.players[0].alias = a;
  state.players[1].alias = b;
};

const transfer = (state: GameState, from: 0 | 1, to: 0 | 1 | null, amount: number) => {
  const payer = state.players[from];
  const paid = Math.min(payer.coins, Math.max(0, amount));
  payer.coins -= paid;
  if (to !== null) state.players[to].coins += paid;
  return paid;
};

const multiplierFor = (state: GameState) => (state.chapter === state.totalChapters ? 2 : 1);

const endGame = (state: GameState) => {
  const [a, b] = state.players;
  const greedy: 0 | 1 = netWorth(b) > netWorth(a) ? 1 : 0;
  const passionate: 0 | 1 = b.heat > a.heat ? 1 : 0;
  state.players[greedy].crown = 'greedy';
  state.players[passionate].crown = 'passionate';
  state.winner = { greedy, passionate };
  state.phase = 'gameover';
  say(state, 'Занавес. Считаем короны.', 'story');
};

const finishTurn = (state: GameState) => {
  state.dice = null;
  state.pending = null;
  state.fate = null;
  state.roundsLeftInChapter -= 1;
  if (state.roundsLeftInChapter <= 0) {
    if (state.chapter >= state.totalChapters) return endGame(state);
    state.phase = 'chapter-break';
    return;
  }
  state.current = other(state.current);
  state.phase = 'awaiting-roll';
};

const land = (state: GameState, playerId: 0 | 1, depth = 0) => {
  const player = state.players[playerId];
  const space = BOARD[player.pos];
  state.spaceIndex = player.pos;

  if (space.kind === 'surprise' && depth === 0) {
    const pool = FATE[state.mood];
    state.fate = pool[Math.min(pool.length - 1, Math.floor(rand(state) * pool.length))];
    state.phase = 'fate';
    return;
  }

  if (space.kind === 'spot') {
    const owner = state.players.find((p) => p.owned.includes(space.id));
    if (!owner) {
      if (player.coins >= space.price) {
        state.phase = 'buy';
        say(state, `${player.name} стоит перед «${space.name}» — можно выкупить.`, 'story');
        return;
      }
      say(state, `${player.name} не может выкупить «${space.name}»: не хватает монет.`, 'money');
      return finishTurn(state);
    }
    if (owner.id === playerId) {
      player.coins += HOME_BONUS;
      say(state, `${player.name} дома, на «${space.name}»: бонус +${HOME_BONUS}.`, 'money');
      return finishTurn(state);
    }
    state.pending = {
      playerId,
      ownerId: owner.id,
      spaceId: space.id,
      multiplier: multiplierFor(state),
      fromPurchase: false,
    };
    say(state, `${player.name} попадает на чужую улицу «${space.name}» — владелец: ${owner.name}.`, 'story');
    state.phase = 'resolve';
    return;
  }

  player.coins += PASS_START;
  say(state, `${player.name} на «Свидание» — забирает ${PASS_START}.`, 'money');
  finishTurn(state);
};

export function reducer(state: GameState, action: Action): GameState {
  // Гость принимает состояние хоста как истину — клонировать старый стейт незачем.
  if (action.type === 'sync') return action.state;

  const next: GameState = structuredClone(state);

  switch (action.type) {
    case 'rename': {
      const name = action.name.trim().slice(0, 16);
      if (!name || next.players[action.id].name === name) return next;
      next.players[action.id].name = name;
      return next;
    }

    case 'start': {
      if (next.phase !== 'premise') return next;
      setAliases(next);
      say(next, chapterAt(next.mood, 1).title, 'story');
      next.phase = 'awaiting-roll';
      return next;
    }

    case 'roll': {
      if (next.phase !== 'awaiting-roll') return next;
      const d =
        action.value ?? [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      next.dice = [Math.min(6, Math.max(1, d[0])), Math.min(6, Math.max(1, d[1]))];
      next.phase = 'moving';
      return next;
    }

    case 'finish-move': {
      if (next.phase !== 'moving' || !next.dice) return next;
      const player = next.players[next.current];
      const steps = next.dice[0] + next.dice[1];
      const from = player.pos;
      player.pos = norm(from + steps);
      say(next, `${player.name} выбрасывает ${next.dice[0]} + ${next.dice[1]} = ${steps}.`);
      if (from !== 0 && player.pos <= from) {
        player.coins += PASS_START;
        say(next, `${player.name} огибает поле и проходит «Свидание»: +${PASS_START}.`, 'money');
      }
      next.phase = 'walking';
      return next;
    }

    case 'land': {
      if (next.phase !== 'walking') return next;
      land(next, next.current);
      return next;
    }

    case 'buy': {
      if (next.phase !== 'buy') return next;
      const buyer = next.players[next.current];
      const space = BOARD[buyer.pos];
      const paid = transfer(next, buyer.id, null, space.price);
      buyer.owned.push(space.id);
      say(next, `${buyer.name} выкупает «${space.name}» за ${paid} и выдаёт партнёру карту.`, 'money');
      next.pending = {
        playerId: other(buyer.id),
        ownerId: buyer.id,
        spaceId: space.id,
        multiplier: multiplierFor(next),
        fromPurchase: true,
      };
      next.phase = 'resolve';
      return next;
    }

    case 'decline-buy': {
      if (next.phase !== 'buy') return next;
      say(next, `«${BOARD[next.players[next.current].pos].name}» остаётся свободной.`);
      finishTurn(next);
      return next;
    }

    case 'resolve-tier': {
      if (next.phase !== 'resolve' || !next.pending) return next;
      const pending = next.pending;
      const payer = next.players[pending.playerId];
      const tier = action.tier;
      const paid = transfer(next, payer.id, pending.ownerId, chargeFor(pending.spaceId, tier, pending.multiplier));
      payer.heat += TIERS[tier].heat;
      say(
        next,
        `${payer.name} берёт «${TIERS[tier].label}» и платит ${paid}${
          TIERS[tier].heat ? `, +${TIERS[tier].heat} жара` : ''
        }.`,
        TIERS[tier].heat ? 'heat' : 'money',
      );
      say(next, `Задание: ${taskOf(next.mood, pending.spaceId, tier)}`, 'story');
      finishTurn(next);
      return next;
    }

    case 'pay-off': {
      if (next.phase !== 'resolve' || !next.pending || !canPayOff(next, next.pending)) return next;
      const pending = next.pending;
      const payer = next.players[pending.playerId];
      const paid = transfer(next, payer.id, pending.ownerId, payoffCost(pending));
      say(next, `${payer.name} откупается за ${paid} и пропускает задание.`, 'money');
      finishTurn(next);
      return next;
    }

    case 'take-fate': {
      if (next.phase !== 'fate' || !next.fate) return next;
      const player = next.players[next.current];
      const card = next.fate;
      if (card.money) {
        player.coins = Math.max(0, player.coins + card.money);
        say(next, `${card.text} (${card.money > 0 ? '+' : ''}${card.money} монет)`, 'money');
      } else if (card.heat) {
        player.heat += card.heat;
        say(next, `${card.text} (+${card.heat} жара)`, 'heat');
      } else if (card.move) {
        player.pos = norm(player.pos + card.move);
        say(next, `${card.text} (${card.move > 0 ? '+' : ''}${card.move} полей)`);
        land(next, player.id, 1);
        return next;
      } else {
        say(next, card.text);
      }
      finishTurn(next);
      return next;
    }

    case 'enter-chapter': {
      if (next.phase !== 'chapter-break') return next;
      next.chapter += 1;
      next.roundsLeftInChapter = next.roundsPerChapter;
      next.current = other(next.current);
      setAliases(next);
      say(next, chapterAt(next.mood, next.chapter).title, 'story');
      next.phase = 'awaiting-roll';
      return next;
    }

    default:
      return next;
  }
}
