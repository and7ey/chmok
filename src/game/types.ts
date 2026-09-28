export type Mood = 'tender' | 'flirty' | 'late';

export type Tier = 'base' | 'tease' | 'bold';

export type SpaceKind = 'start' | 'spot' | 'surprise';

export type SpaceId =
  | 'start'
  | 'postcard'
  | 'jukebox'
  | 'memory'
  | 'streetlamp'
  | 'sugar'
  | 'fireside'
  | 'movienight'
  | 'mixtape'
  | 'playlist'
  | 'whisper'
  | 'lavender'
  | 'candlelight'
  | 'mischief'
  | 'firefly'
  | 'moonlight'
  | 'balcony'
  | 'midnight'
  | 'ultimate'
  | 'surprise1'
  | 'surprise2';

export interface Space {
  id: SpaceId;
  name: string;
  kind: SpaceKind;
  /** Цена покупки / база для платы по карте */
  price: number;
  /** Позиция в кольцевой сетке 6x6 (1..6) */
  col: number;
  row: number;
  glyph: string;
}

export interface SpaceTask {
  base: string;
  tease: string;
  bold: string;
}

export type Deck = Record<Mood, Partial<Record<SpaceId, SpaceTask>>>;

export interface FateCard {
  id: string;
  text: string;
  money?: number;
  heat?: number;
  move?: number;
}

export interface PlayerState {
  id: 0 | 1;
  name: string;
  alias: string;
  pos: number;
  coins: number;
  heat: number;
  owned: SpaceId[];
  crown: 'greedy' | 'passionate' | null;
}

export type Phase =
  | 'premise'
  | 'awaiting-roll'
  | 'moving'
  | 'walking'
  | 'buy'
  | 'resolve'
  | 'fate'
  | 'chapter-break'
  | 'gameover';

export interface LogEntry {
  id: number;
  text: string;
  tone: 'neutral' | 'money' | 'heat' | 'story';
}

export interface PendingCard {
  /** Кто получает карту (тот выбирает уровень и платит) */
  playerId: 0 | 1;
  /** Владелец улицы, которому платят */
  ownerId: 0 | 1 | null;
  spaceId: SpaceId;
  /** Плата умножается в финальной главе */
  multiplier: number;
  /** Карта выпала сразу после покупки улицы */
  fromPurchase: boolean;
}

export interface GameState {
  mood: Mood;
  players: [PlayerState, PlayerState];
  current: 0 | 1;
  phase: Phase;
  spaceIndex: number;
  dice: [number, number] | null;
  pending: PendingCard | null;
  fate: FateCard | null;
  chapter: number;
  totalChapters: number;
  roundsLeftInChapter: number;
  roundsPerChapter: number;
  log: LogEntry[];
  logSeq: number;
  seed: number;
  winner: { greedy: 0 | 1 | null; passionate: 0 | 1 | null } | null;
}

export type Action =
  | { type: 'sync'; state: GameState }
  | { type: 'rename'; id: 0 | 1; name: string }
  | { type: 'start' }
  | { type: 'enter-chapter' }
  | { type: 'roll'; value?: [number, number] }
  | { type: 'finish-move' }
  | { type: 'land' }
  | { type: 'buy' }
  | { type: 'decline-buy' }
  | { type: 'resolve-tier'; tier: Tier }
  | { type: 'pay-off' }
  | { type: 'take-fate' };
