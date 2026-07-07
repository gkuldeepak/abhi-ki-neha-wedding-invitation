/* =============================================================
   gallery.js — layered carousel of memories

   layout() positions each slide by its (circular) distance from the
   current index: the center slide is full-size & gold-rimmed; neighbours
   sit behind it, offset horizontally, scaled down and dimmed. Images stay
   flat & upright (no 3D tilt) for a stable, never-"rotated" look. First
   paint snaps into place (transitions off) so nothing fans in on load.
   Center slide → fullscreen.

   Preserved from the original: dots, keyboard nav, fullscreen overlay,
   cross-fading ambient blur background, canvas average-color tint,
   and pausing Lenis while fullscreen is open.
   ============================================================= */

import { $, $$ } from "./utils.js";

export function initGallery() {
  const imgs    = $$(".gallery-slide-img");
  const dots    = $$(".gallery-dot");
  const wrapper = $(".gallery-slide-wrapper");
  const overlay = $("#gallery-fullscreen");
  const fsImg   = $("#gallery-fs-img");
  const section = $("#our-memories");
  const blurA   = $("#gallery-blur-a");
  const blurB   = $("#gallery-blur-b");
  if (!imgs.length || !overlay || !wrapper) return;

  const N = imgs.length;
  let current = 0, fsOpen = false, blurWhich = "a";

  const bgSrc = (img) => img.currentSrc || img.src;

  /* ---------- Cover-flow layout ------------------------------------ */
  // Signed shortest distance from current on the circular ring.
  const relOf = (i) => {
    let d = i - current;
    if (d > N / 2) d -= N;
    if (d < -N / 2) d += N;
    return d;
  };

  function layout() {
    imgs.forEach((img, i) => {
      const rel = relOf(i);
      const a = Math.abs(rel);
      img.classList.toggle("is-center", rel === 0);
      img.classList.toggle("is-side", rel !== 0 && a <= 2);
      img.classList.toggle("is-hidden", a > 2);

      // Flat, upright images (no 3D rotateY). Depth comes from horizontal
      // offset + scale + dimming only — stable and never looks "rotated".
      const x = rel * 40;                                   // % horizontal spread
      const scale = rel === 0 ? 1 : Math.max(0.7, 0.84 - (a - 1) * 0.12);
      const op = a > 2 ? 0 : rel === 0 ? 1 : Math.max(0.35, 0.75 - (a - 1) * 0.28);
      img.style.transform =
        `translate(-50%, -50%) translateX(${x}%) scale(${scale})`;
      img.style.opacity = op;
      img.style.zIndex = String(100 - a);
      img.setAttribute("aria-hidden", a > 2 ? "true" : "false");
    });
  }

  /* ---------- Ambient blur bg + section tint (from the original) --- */
  function setAmbientBg(src) {
    const [show, hide] = blurWhich === "a" ? [blurB, blurA] : [blurA, blurB];
    show.style.backgroundImage = `url("${src}")`;
    hide.classList.remove("active");
    show.classList.add("active");
    blurWhich = blurWhich === "a" ? "b" : "a";
  }
  function tintSection(img) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 12;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, 12, 12);
      const d = ctx.getImageData(0, 0, 12, 12).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
      const px = d.length / 4;
      section.style.backgroundColor = `rgb(${r/px|0},${g/px|0},${b/px|0})`;
    } catch (_) {}
  }
  function refreshAmbient() {
    const img = imgs[current];
    setAmbientBg(bgSrc(img));
    if (img.complete) tintSection(img);
    else img.addEventListener("load", () => tintSection(img), { once: true });
  }

  /* ---------- Navigation ------------------------------------------- */
  function show(n) {
    current = ((n % N) + N) % N;
    dots.forEach((d, i) => d.classList.toggle("active", i === current));
    layout();
    if (fsOpen) fsImg.src = bgSrc(imgs[current]);
    refreshAmbient();
  }

  /* ---------- Fullscreen ------------------------------------------- */
  const fsClose = $(".gallery-fs-close");
  let lastFocus = null;
  function openFs() {
    lastFocus = document.activeElement;
    fsImg.src = bgSrc(imgs[current]);
    fsImg.alt = imgs[current].alt;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    window.__lenis?.stop();
    fsOpen = true;
    fsClose?.focus();                 // move focus into the dialog
  }
  function closeFs() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    window.__lenis?.start();
    fsOpen = false;
    lastFocus?.focus?.();             // return focus to the trigger
  }

  /* ---------- Wiring ----------------------------------------------- */
  // Prevent buttons from stealing focus on click — a focused control that
  // isn't fully in view makes the browser scroll it into view, which fights
  // Lenis and shows up as a vertical "dip" during navigation.
  $(".gallery-slideshow").addEventListener("mousedown", (e) => {
    if (e.target.closest(".gallery-arrow, .gallery-dot, .gallery-slide-img")) e.preventDefault();
  });

  $(".gallery-prev").addEventListener("click", (e) => { e.stopPropagation(); show(current - 1); });
  $(".gallery-next").addEventListener("click", (e) => { e.stopPropagation(); show(current + 1); });
  dots.forEach((d, i) => d.addEventListener("click", () => show(i)));

  // Click a side slide → bring it to center; click the center → fullscreen.
  // (Images are intentionally NOT focusable: focusing them on click would
  // scroll the page. Keyboard users navigate via the arrows/dots + arrow keys.)
  imgs.forEach((img, i) => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      if (i === current) openFs();
      else show(i);
    });
  });

  $(".gallery-fs-close").addEventListener("click", closeFs);
  $(".gallery-fs-prev").addEventListener("click", (e) => { e.stopPropagation(); show(current - 1); });
  $(".gallery-fs-next").addEventListener("click", (e) => { e.stopPropagation(); show(current + 1); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeFs(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft")  show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
    if (e.key === "Escape" && fsOpen) closeFs();
  });

  window.addEventListener("resize", layout, { passive: true });

  // Initial paint — snap slides into position with transitions OFF so they
  // don't visibly animate/fan-in from center on first load. Re-enable after
  // two frames so navigation still animates smoothly.
  blurA.style.backgroundImage = `url("${bgSrc(imgs[0])}")`;
  wrapper.classList.add("cf-init");
  show(0);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => wrapper.classList.remove("cf-init")));
}
