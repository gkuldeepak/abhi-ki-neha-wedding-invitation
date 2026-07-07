/* =============================================================
   cursor.js — custom magnetic cursor (desktop / fine-pointer only)
   A gold dot that tracks instantly + a ring that eases behind it,
   expanding over interactive elements. Skipped entirely on touch.
   ============================================================= */

import { isTouch, prefersReducedMotion, lerp, $$ } from "./utils.js";

export function initCursor() {
  if (isTouch() || prefersReducedMotion()) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const dot = document.createElement("div");
  const ring = document.createElement("div");
  dot.className = "cursor-dot";
  ring.className = "cursor-ring";
  document.body.append(dot, ring);
  document.body.classList.add("has-cursor");

  let mx = innerWidth / 2, my = innerHeight / 2;   // mouse target
  let rx = mx, ry = my;                            // ring eased position
  const place = (el, x, y) =>
    (el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`);

  // Seed both at screen center so they're visible before the first move.
  place(dot, mx, my);
  place(ring, rx, ry);

  window.addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    place(dot, mx, my);                            // dot is 1:1 (responsive)
  }, { passive: true });

  // ring trails with inertia
  const loop = () => {
    rx = lerp(rx, mx, 0.18);
    ry = lerp(ry, my, 0.18);
    place(ring, rx, ry);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // grow over interactive targets
  const hoverSel = "a, button, .btn-lux, .gallery-dot, .gallery-arrow, input, [role='button']";
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest(hoverSel)) document.body.classList.add("cursor-hover");
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest(hoverSel)) document.body.classList.remove("cursor-hover");
  });

  // hide when leaving the window
  document.addEventListener("mouseleave", () => { dot.style.opacity = ring.style.opacity = "0"; });
  document.addEventListener("mouseenter", () => { dot.style.opacity = ring.style.opacity = "1"; });
}

/* Magnetic pull for premium buttons — they lean toward the cursor. */
export function initMagnetic() {
  if (isTouch() || prefersReducedMotion()) return;
  $$(".btn-lux, [data-magnetic]").forEach((el) => {
    const strength = 0.35;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * strength;
      const y = (e.clientY - (r.top + r.height / 2)) * strength;
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    el.addEventListener("pointerleave", () => { el.style.transform = ""; });
  });
}
