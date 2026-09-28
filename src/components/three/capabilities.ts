/** Не тянет three.js — отсюда пользуются и ленивой сценой, и игрой, чтобы понять, есть ли анимация фишек. */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

/** Хронометраж хода: кубики прыгают → фишка идёт по кольцу → пауза → карточка. */
export const DICE_ROLL_MS = 1150;
export const WALK_STEP_MS = 185;
export const ARRIVE_BEAT_MS = 450;

export const walkMs = (steps: number) => steps * WALK_STEP_MS + ARRIVE_BEAT_MS;

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
