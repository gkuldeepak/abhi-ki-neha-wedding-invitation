/* =============================================================
   background.js — shared cosmic backdrop behind the whole page

   A single fixed <canvas> starfield that ties every section into one
   continuous "night sky", giving the site cohesion once the light
   Home/Story sections are repainted dark. Cheap 2D canvas:
     • parallax star layers (depth)
     • a few slow golden embers rising (wedding warmth)
   Reduced-motion → a static star field (drawn once, no loop).
   Per-section accent backgrounds (petals, bokeh, aurora) are pure CSS.
   ============================================================= */

import { prefersReducedMotion, deviceTier, cappedDPR, createFpsGovernor } from "./utils.js";

export function initBackgrounds() {
  const canvas = document.createElement("canvas");
  canvas.id = "space-field";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  const tier = deviceTier();
  const reduce = prefersReducedMotion();
  const STARS  = tier === "high" ? 220 : tier === "mid" ? 140 : 90;
  const EMBERS = reduce ? 0 : (tier === "high" ? 22 : 12);

  let w = 0, h = 0, dpr = cappedDPR(1.5);
  const stars = [];
  const embers = [];

  function build() {
    stars.length = 0; embers.length = 0;
    for (let i = 0; i < STARS; i++) {
      const depth = Math.random();            // 0 far … 1 near
      stars.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.4 + depth * 1.3,
        base: 0.25 + Math.random() * 0.6,      // base brightness
        tw: Math.random() * Math.PI * 2,        // twinkle phase
        tws: 0.6 + Math.random() * 1.4,         // twinkle speed
        depth,
      });
    }
    for (let i = 0; i < EMBERS; i++) {
      embers.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.8 + Math.random() * 1.6,
        vy: 0.15 + Math.random() * 0.35,
        drift: Math.random() * Math.PI * 2,
      });
    }
  }

  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (reduce) drawStatic();
  }

  function drawStatic() {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      ctx.globalAlpha = s.base;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let raf = 0, t = 0, last = 0;
  let starDraw = STARS, emberDraw = EMBERS;
  // Shed stars/embers if the backdrop can't keep up on a weak device.
  const governor = createFpsGovernor({
    targetFps: 50,
    onDowngrade: (level) => {
      const f = level === 1 ? 0.6 : 0.35;
      starDraw  = Math.max(40, Math.floor(STARS * f));
      emberDraw = Math.floor(EMBERS * f);
    },
  });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? (now - last) / 1000 : 0.016;
    last = now;
    t += 0.016;
    ctx.clearRect(0, 0, w, h);

    // twinkling stars
    for (let i = 0; i < starDraw; i++) {
      const s = stars[i];
      const a = s.base * (0.6 + 0.4 * Math.sin(t * s.tws + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.depth > 0.7 ? "#fff6e0" : "#ffffff";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }

    // rising golden embers with a soft glow
    for (let i = 0; i < emberDraw; i++) {
      const e = embers[i];
      e.y -= e.vy;
      e.x += Math.sin(t * 0.5 + e.drift) * 0.2;
      if (e.y < -5) { e.y = h + 5; e.x = Math.random() * w; }
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 6);
      g.addColorStop(0, "rgba(246,217,146,0.9)");
      g.addColorStop(1, "rgba(246,217,146,0)");
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 6, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    governor(dt);
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();

  if (!reduce) {
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { last = 0; raf = requestAnimationFrame(frame); }
    });
  }

  // Per-section CSS accents (animation lives in css/sections.css).
  if (!reduce) initSectionAccents(tier);
}

/**
 * Inject lightweight, GPU-animated accent elements into specific sections:
 *   • Home  → floating "diya"/bokeh glows
 *   • Story → drifting rose petals
 * All motion is CSS keyframes on transform/opacity (compositor-only).
 */
function initSectionAccents(tier) {
  const many = tier === "high";

  const spawn = (sel, cls, count) => {
    const host = document.querySelector(sel);
    if (!host) return;
    const layer = document.createElement("div");
    layer.className = "fx-layer";
    layer.setAttribute("aria-hidden", "true");
    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = cls;
      // deterministic-ish spread using index so it looks intentional
      const left = (i * 37) % 100;
      const delay = -((i * 1.7) % 12);
      const dur = 9 + (i % 5) * 2.5;
      const scale = 0.6 + ((i * 13) % 70) / 100;
      el.style.left = left + "%";
      el.style.animationDelay = delay + "s";
      el.style.animationDuration = dur + "s";
      el.style.setProperty("--s", scale.toFixed(2));
      layer.appendChild(el);
    }
    host.prepend(layer);
  };

  spawn("#home",  "diya",  many ? 14 : 8);
  spawn("#story", "petal", many ? 16 : 9);
}

