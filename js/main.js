/* =============================================================
   main.js — entry point / orchestrator

   Boot order:
   1. audio (prepared, silent) + gallery + cursor + reveal + venue + nav
      → the whole site is ready & interactive behind the intro overlay
   2. intro plays; on Enter/Skip it starts the audio and reveals the hero
   3. hero WebGL initializes (lazy — only after intro so it doesn't
      compete for the GPU during the sequence)
   ============================================================= */

import { $, $$, prefersReducedMotion } from "./utils.js";
import { initIntro } from "./intro.js";
import { initHero } from "./hero.js";
import { initAudio } from "./audio.js";
import { initCursor, initMagnetic } from "./cursor.js";
import { initGallery } from "./gallery.js";
import { initScroll } from "./scroll.js";
import { initBackgrounds } from "./background.js";

/* ---- Scroll reveal: [data-reveal] fades/rises into view ------------ */
function initReveal() {
  const items = $$("[data-reveal]");
  if (!items.length) return;
  if (prefersReducedMotion()) { items.forEach((el) => el.classList.add("in-view")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  items.forEach((el) => io.observe(el));
}

/* ---- Info venue background cross-fade (ported from inline) --------- */
function initVenueSlideshow() {
  const section = $("#info");
  if (!section) return;
  const images = ["venue/rr1.webp","venue/rr2.webp","venue/rr3.webp","venue/rr4.webp",
                  "venue/rr5.webp","venue/rr6.webp","venue/rr7.webp"];
  const slides = images.map((src, i) => {
    const d = document.createElement("div");
    d.className = "venue-bg-slide" + (i === 0 ? " active" : "");
    d.style.backgroundImage = `url(${src})`;
    section.appendChild(d);
    return d;
  });
  let cur = 0;
  setInterval(() => {
    slides[cur].classList.remove("active");
    cur = (cur + 1) % slides.length;
    slides[cur].classList.add("active");
  }, 4000);
}

/* ---- Offcanvas nav closes when a link is tapped ------------------- */
function initNav() {
  $$("#offcanvasNavbar .nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      const el = $("#offcanvasNavbar");
      const inst = window.bootstrap?.Offcanvas.getInstance(el);
      inst?.hide();
    });
  });
}

/* ---- Countdown (simplyCountdown is a global from its <script>) ----- */
function initCountdown() {
  if (typeof window.simplyCountdown !== "function") return;
  window.simplyCountdown(".simply-countdown", {
    year: 2026, month: 11, day: 24, hours: 0,
    words: {
      days:    { singular: "day",    plural: "days" },
      hours:   { singular: "hour",   plural: "hours" },
      minutes: { singular: "minute", plural: "minutes" },
      seconds: { singular: "second", plural: "seconds" },
    },
    plural: true,
  });
}

/* ---- Boot --------------------------------------------------------- */
function boot() {
  window.__appBooted = true;   // clears the HTML failsafe timer

  // The site must always begin at the hero. Stop the browser from
  // restoring a prior scroll position on refresh — hidden behind the
  // intro, it would reveal a mid-page spot (e.g. the gallery) the moment
  // "Enter" is pressed.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const audio = initAudio();
  initGallery();
  initVenueSlideshow();
  initNav();
  initBackgrounds();   // shared starfield + per-section animated layers
  initCursor();
  initMagnetic();

  // Intro drives the reveal. onEnter → start music, wake the hero, build
  // the countdown (so its assemble animation plays as the hero appears),
  // and start the scroll choreography now that scrolling is unlocked.
  initIntro({
    onEnter: () => {
      window.scrollTo(0, 0);          // reveal the hero, never mid-page
      audio.start();
      initCountdown();
      initHero();
      const scrollHandled = initScroll();
      if (!scrollHandled) initReveal();   // IO fallback when GSAP absent
      window.__lenis?.scrollTo(0, { immediate: true });
    },
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
