/* =============================================================
   utils.js — shared helpers: device tiering, reduced-motion,
   DOM/easing utilities. No dependencies.
   ============================================================= */

/** True when the user asked the OS to minimize motion. */
export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Coarse pointer (touch) — used to skip cursor/hover-only effects. */
export const isTouch = () =>
  window.matchMedia("(pointer: coarse)").matches;

/** User asked to save data, or is on a slow connection. */
export function saveData() {
  const c = navigator.connection;
  return !!(c && (c.saveData || /2g/.test(c.effectiveType || "")));
}

/**
 * Adaptive performance tier. Drives particle counts, pixel ratio caps
 * and shader complexity so the "full cinematic" path still holds 60fps
 * on weaker phones.
 *   'high'   — desktop / powerful device
 *   'mid'    — decent tablet / mid phone
 *   'low'    — weak phone / low core count / data-saver
 */
export function deviceTier() {
  if (saveData()) return "low";
  const mem = navigator.deviceMemory || 4;         // GB (heuristic)
  const cores = navigator.hardwareConcurrency || 4;
  const touch = isTouch();
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 640;

  if (!touch && cores >= 8 && mem >= 8) return "high";
  if (touch && (mem <= 2 || cores <= 4 || smallScreen)) return "low";
  return "mid";
}

/**
 * Adaptive FPS governor. Feed it dt (seconds) each frame; when the rolling
 * average frame time stays above the budget, it fires onDowngrade() once
 * per level so a render loop can shed work (fewer particles, lower DPR).
 * @param {object} o
 * @param {number} [o.targetFps=50]  downgrade below this sustained fps
 * @param {number} [o.window=90]     frames to average before judging
 * @param {number} [o.maxLevels=2]   how many times it may downgrade
 * @param {(level:number)=>void} o.onDowngrade
 */
export function createFpsGovernor({ targetFps = 50, window: win = 90, maxLevels = 2, onDowngrade }) {
  const budget = 1 / targetFps;
  let ema = 1 / 60, frames = 0, level = 0;
  return (dt) => {
    ema = ema * 0.9 + dt * 0.1;            // smooth out spikes
    if (++frames < win) return;
    if (ema > budget && level < maxLevels) {
      level++;
      frames = 0;
      ema = 1 / 60;                         // reset so we re-measure post-downgrade
      onDowngrade?.(level);
    }
  };
}

/** Cap devicePixelRatio so retina phones don't render 3× the pixels. */
export const cappedDPR = (max = 2) => Math.min(window.devicePixelRatio || 1, max);

/** Does the browser support WebGL at all? Falls back gracefully if not. */
export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (_) { return false; }
}

/* ---- Math / easing -------------------------------------------------- */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Normalize x within [a,b] → [0,1], clamped. */
export const norm = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

export const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutQuart = (t) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** $ / $$ shorthand. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Lazy-load an ES module from a URL (used to defer Three.js off the
 * critical path). Returns the module namespace.
 */
export const importModule = (url) => import(/* @vite-ignore */ url);
