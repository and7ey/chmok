import type { Space, SpaceId } from './types';

/**
 * Кольцевое поле 6x6: 20 полей по периметру, индексы 0..19 по часовой стрелке.
 * Индекс 0 — «Свидание» (Старт), правый нижний угол.
 */
const ring = (count: number): { col: number; row: number }[] => {
  const size = 6;
  const cells: { col: number; row: number }[] = [];
  for (let c = size; c >= 1; c--) cells.push({ col: c, row: size }); // низ, справа налево
  for (let r = size - 1; r >= 1; r--) cells.push({ col: 1, row: r }); // лево, снизу вверх
  for (let c = 2; c <= size; c++) cells.push({ col: c, row: 1 }); // верх, слева направо
  for (let r = 2; r <= size - 1; r++) cells.push({ col: size, row: r }); // право, сверху вниз
  return cells.slice(0, count);
};

type Row = [SpaceId, string, number, string];

const rows: Row[] = [
  ['start', 'Свидание', 0, '✦'],
  ['postcard', 'Открыточный переулок', 80, '✉'],
  ['jukebox', 'Площадка «Джукбокс»', 95, '♫'],
  ['memory', 'Улица Воспоминаний', 110, '❝'],
  ['streetlamp', 'Фонарный тупик', 125, '☾'],
  ['surprise1', 'Сюрприз', 0, '?'],
  ['sugar', 'Сахарная линия', 140, '❁'],
  ['fireside', 'Каминный двор', 155, '≈'],
  ['movienight', 'Киноуголок', 170, '▶'],
  ['mixtape', 'Микстейп-миля', 185, '⧗'],
  ['playlist', 'Плейлист-сквер', 200, '≡'],
  ['whisper', 'Улица Шёпота', 215, '◦'],
  ['lavender', 'Лавандовый особняк', 230, '❀'],
  ['candlelight', 'Свечной дворик', 245, '✧'],
  ['mischief', 'Озорная миля', 260, '✿'],
  ['firefly', 'Светлячковое поле', 275, '✺'],
  ['moonlight', 'Лунный люкс', 290, '☽'],
  ['balcony', 'Балкон с видом', 305, '⌂'],
  ['midnight', 'Полуночный особняк', 320, '★'],
  ['surprise2', 'Сюрприз', 0, '?'],
];

export const BOARD: Space[] = ring(rows.length).map((pos, i) => {
  const [id, name, price, glyph] = rows[i];
  return {
    id,
    name,
    price,
    glyph,
    kind: id === 'start' ? 'start' : id.startsWith('surprise') ? 'surprise' : 'spot',
    ...pos,
  };
});

export const SPACE_COUNT = BOARD.length;

export const SPOTS: Space[] = BOARD.filter((s) => s.kind === 'spot');

export const spaceById = (id: SpaceId): Space => BOARD.find((s) => s.id === id)!;

export const spaceIndex = (id: SpaceId): number => BOARD.findIndex((s) => s.id === id);
