import { BOARD } from '../../game/board';

export const GRID = 6;
export const STEP = 1.5;
export const TILE = 1.34;
/** Верх плитки: на этой высоте стоят фишки, иначе они проваливаются в поле. */
export const TILE_TOP = 0.17;
export const BOARD_W = GRID * STEP + 0.9;
/** Всё, что стоит в центре, не должно выходить за эту границу, иначе залезет на плитки. */
export const HUB_LIMIT = 2.9;

const half = (GRID + 1) / 2;

export const cellXZ = (col: number, row: number): [number, number] => [
  (col - half) * STEP,
  (row - half) * STEP,
];

export const CELL_XZ: [number, number][] = BOARD.map((s) => cellXZ(s.col, s.row));

/** Точка на кольце по дробному индексу — по ней идут фишки. */
export function ringPoint(f: number): [number, number] {
  const n = CELL_XZ.length;
  const i = ((Math.floor(f) % n) + n) % n;
  const j = (i + 1) % n;
  const t = f - Math.floor(f);
  const [ax, az] = CELL_XZ[i];
  const [bx, bz] = CELL_XZ[j];
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

/**
 * Текст плитки читают с внешней стороны поля, как на настоящей MONOPOLY:
 * поворачиваем плитку по её главной оси, чтобы камера с любой стороны
 * видела надпись прямой, а не вверх ногами.
 */
export function tileYaw(x: number, z: number) {
  if (Math.abs(x) > Math.abs(z)) return Math.sign(x) * (Math.PI / 2);
  return z < 0 ? Math.PI : 0;
}

export const OWNER_COLOR: Record<0 | 1, string> = { 0: '#5fe3b0', 1: '#ffb93b' };
