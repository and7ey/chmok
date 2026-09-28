import * as THREE from 'three';
import type { Space } from '../../game/types';

const INK = '#2b1233';
const CREAM = '#f8ead0';

export function canvas2d(w: number, h: number) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d')!;
  return { el, ctx };
}

export function toTexture(el: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Разбивает строку по словам; breakWords дорезает слово по буквам, если оно шире плитки. null — если не влезает в maxLines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number, breakWords: boolean) {
  const chunks: string[] = [];
  for (const word of text.split(' ')) {
    if (!breakWords || ctx.measureText(word).width <= max) {
      chunks.push(word);
      continue;
    }
    let cur = '';
    for (const ch of word) {
      if (cur && ctx.measureText(cur + ch).width > max) {
        chunks.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) chunks.push(cur);
  }

  const lines: string[] = [];
  let line = '';
  for (const c of chunks) {
    const next = line ? `${line} ${c}` : c;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = c;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) return null;
  return lines.every((l) => ctx.measureText(l).width <= max) ? lines : null;
}

/**
 * Наибольший кегль, при котором название остаётся внутри плитки.
 * Сначала переносы только по пробелам — резать слово по буквам хуже, чем уменьшить шрифт.
 */
function fitName(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number) {
  const sizes = [31, 28, 26, 24, 22, 20, 18];
  const fits = (lines: string[] | null, size: number) =>
    lines && lines.length * size * 1.12 <= maxH ? { lines, size, lh: size * 1.12 } : null;
  for (const pass of [false, true] as const) {
    for (const size of sizes) {
      ctx.font = `700 ${size}px Inter, Arial, sans-serif`;
      const ok = fits(wrap(ctx, text, maxW, 3, pass), size);
      if (ok) return ok;
    }
  }
  const size = 16;
  ctx.font = `700 ${size}px Inter, Arial, sans-serif`;
  return { lines: wrap(ctx, text, maxW, 3, true) ?? [], size, lh: size * 1.12 };
}

export type TileState = 'idle' | 'current' | 'selected';

export function tileFace(space: Space, owner: 0 | 1 | null, state: TileState) {
  const { el, ctx } = canvas2d(256, 256);

  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  if (space.kind === 'start') {
    bg.addColorStop(0, '#ffd7e6');
    bg.addColorStop(1, '#ffeccd');
  } else if (space.kind === 'surprise') {
    bg.addColorStop(0, '#e6d8ff');
    bg.addColorStop(1, '#f8ead0');
  } else {
    bg.addColorStop(0, CREAM);
    bg.addColorStop(1, '#efdcb8');
  }
  ctx.fillStyle = bg;
  rr(ctx, 6, 6, 244, 244, 26);
  ctx.fill();

  ctx.fillStyle =
    owner === 0
      ? '#5fe3b0'
      : owner === 1
        ? '#ffb93b'
        : space.kind === 'surprise'
          ? '#9a6bff'
          : space.kind === 'start'
            ? '#ff4d8d'
            : 'rgba(43,18,51,0.16)';
  rr(ctx, 26, 18, 204, owner === null ? 9 : 14, 6);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(43,18,51,0.5)';
  ctx.font = '30px "Apple Color Emoji", "Segoe UI Emoji", Arial';
  ctx.fillText(space.glyph, 128, 68);

  const { lines, size, lh } = fitName(ctx, space.name.toUpperCase(), 214, 118);
  ctx.fillStyle = INK;
  ctx.font = `700 ${size}px Inter, Arial, sans-serif`;
  const first = 137 - ((lines.length - 1) * lh) / 2 + size * 0.35;
  lines.forEach((l, i) => ctx.fillText(l, 128, first + i * lh));

  if (space.price > 0) {
    ctx.font = '600 26px Inter, Arial, sans-serif';
    ctx.fillStyle = 'rgba(43,18,51,0.62)';
    ctx.fillText(String(space.price), 128, 228);
  } else {
    ctx.font = '700 21px Inter, Arial, sans-serif';
    ctx.fillStyle = 'rgba(43,18,51,0.52)';
    ctx.fillText(space.kind === 'start' ? 'СТАРТ' : 'СЮРПРИЗ', 128, 228);
  }

  if (state !== 'idle') {
    ctx.strokeStyle = state === 'current' ? '#ffb93b' : '#ff4d8d';
    ctx.lineWidth = 11;
    rr(ctx, 11, 11, 234, 234, 22);
    ctx.stroke();
  }

  return el;
}

export function signFace(text: string) {
  const { el, ctx } = canvas2d(512, 192);
  const bg = ctx.createLinearGradient(0, 0, 512, 192);
  bg.addColorStop(0, '#ff4d8d');
  bg.addColorStop(1, '#ff8fb0');
  ctx.fillStyle = bg;
  rr(ctx, 8, 8, 496, 176, 84);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '700 92px Fredoka, Inter, Arial, sans-serif';
  ctx.fillText(text, 256, 128);
  return el;
}

export function stripes(a: string, b: string, count = 8) {
  const { el, ctx } = canvas2d(256, 256);
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = b;
  for (let i = 0; i < count; i += 2) {
    ctx.fillRect((i * 256) / count, 0, 256 / count, 256);
  }
  return el;
}

export function checker() {
  const { el, ctx } = canvas2d(128, 64);
  ctx.fillStyle = '#fff6e4';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = INK;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 4; y++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  return el;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.27, 0.27],
    [0.73, 0.73],
  ],
  3: [
    [0.27, 0.27],
    [0.5, 0.5],
    [0.73, 0.73],
  ],
  4: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  5: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.5, 0.5],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  6: [
    [0.27, 0.25],
    [0.73, 0.25],
    [0.27, 0.5],
    [0.73, 0.5],
    [0.27, 0.75],
    [0.73, 0.75],
  ],
};

export function diceFace(value: number) {
  const { el, ctx } = canvas2d(128, 128);
  const bg = ctx.createLinearGradient(0, 0, 128, 128);
  bg.addColorStop(0, '#fffdfa');
  bg.addColorStop(1, '#efe2cc');
  ctx.fillStyle = bg;
  rr(ctx, 4, 4, 120, 120, 26);
  ctx.fill();
  ctx.fillStyle = '#ff4d8d';
  for (const [px, py] of PIPS[value]) {
    ctx.beginPath();
    ctx.arc(px * 128, py * 128, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  return el;
}
