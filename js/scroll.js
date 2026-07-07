/* =============================================================
   scroll.js — cinematic scroll: Lenis inertia + GSAP ScrollTrigger

   Responsibilities:
   • Lenis smooth/inertia scrolling, synced to GSAP's ticker
   • Anchor links (nav + hero CTA) route through lenis.scrollTo
   • Premium reveals for [data-reveal] (rise + blur-clear + scale, staggered)
   • Depth parallax for [data-parallax] (speed via the attribute value)
   • Timeline line that "draws" on scroll + nodes that ignite
   • Section-entrance grade so each section emerges from the dark

   Degrades cleanly: if GSAP/Lenis are missing or the user prefers
   reduced motion, returns false and main.js falls back to a plain
   IntersectionObserver reveal + native scrolling.
   ============================================================= */

import { prefersReducedMotion, saveData, $, $$ } from "./utils.js";

export function initScroll() {
  const reduce = prefersReducedMotion();
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;

  // Without GSAP (or with reduced motion) we don't own reveals.
  if (reduce || !gsap || !ST) return false;
  gsap.registerPlugin(ST);

  /* ---------- Lenis smooth scroll ----------------------------------- */
  // Skip Lenis on data-saver / slow links — native scroll is cheaper.
  let lenis = null;
  if (window.Lenis && !saveData()) {
    lenis = new window.Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out
      smoothWheel: true,
      touchMultiplier: 1.4,
    });
    // Drive Lenis from GSAP's ticker so scroll + animation share one clock.
    lenis.on("scroll", ST.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis;   // let the gallery pause scroll during fullscreen
  }

  // Route in-page anchors through Lenis (native smooth scroll is bypassed).
  const scrollTo = (target) => {
    if (lenis) lenis.scrollTo(target, { offset: -10, duration: 1.2 });
    else document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
  };
  $$('a[href^="#"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (href.length < 2) return;
    a.addEventListener("click", (e) => {
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      scrollTo(href);
    });
  });

  /* ---------- Reveal: rise + blur-clear + scale, batched ------------ */
  gsap.set("[data-reveal]", { opacity: 0, y: 42, filter: "blur(10px)", scale: 0.985 });
  ST.batch("[data-reveal]", {
    start: "top 88%",
    onEnter: (els) =>
      gsap.to(els, {
        opacity: 1, y: 0, filter: "blur(0px)", scale: 1,
        duration: 1.0, ease: "expo.out", stagger: 0.12, overwrite: true,
        // release the filter/transform layers once the reveal settles
        onComplete: () => gsap.set(els, { clearProps: "filter,willChange,scale" }),
      }),
  });

  /* ---------- Depth parallax ---------------------------------------- */
  // [data-parallax="0.2"] → element drifts at 20% of scroll within its view.
  $$("[data-parallax]").forEach((el) => {
    const speed = parseFloat(el.dataset.parallax) || 0.15;
    gsap.to(el, {
      yPercent: -speed * 100,
      ease: "none",
      scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
    });
  });

  /* ---------- Timeline: draw the line + ignite the nodes ------------ */
  const timeline = $(".timeline");
  if (timeline) {
    // A gradient "progress" line we can scrub (the ::before is not animatable).
    const line = document.createElement("span");
    line.className = "timeline-progress";
    timeline.appendChild(line);
    gsap.fromTo(line, { scaleY: 0 }, {
      scaleY: 1, ease: "none", transformOrigin: "top",
      scrollTrigger: { trigger: timeline, start: "top 70%", end: "bottom 80%", scrub: true },
    });
    $$(".timeline > li").forEach((li) => {
      ST.create({
        trigger: li, start: "top 78%",
        onEnter: () => li.classList.add("lit"),
        onLeaveBack: () => li.classList.remove("lit"),
      });
    });
  }

  /* ---------- Hero drifts up & fades on scroll ---------------------- */
  // Animate the --sy CSS var (composited into the transform alongside the
  // mouse-parallax vars) + opacity — never the transform itself.
  const heroContent = $(".hero__content");
  if (heroContent) {
    gsap.set(heroContent, { "--sy": "0px" });   // seed the var so GSAP can tween it
    gsap.to(heroContent, {
      "--sy": "140px", opacity: 0.12, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
  }

  /* ---------- Scroll progress bar ---------------------------------- */
  const bar = document.createElement("div");
  bar.id = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  ST.create({
    start: 0, end: "max",
    onUpdate: (self) => { bar.style.transform = `scaleX(${self.progress})`; },
  });

  /* ---------- Section-entrance light sweeps + dividers ------------- */
  $$("[data-section-fx], .section-divider").forEach((el) => {
    ST.create({
      trigger: el, start: "top 82%",
      onEnter: () => el.classList.add("fx-in"),
    });
  });

  // Recompute positions once fonts/images settle.
  window.addEventListener("load", () => ST.refresh());
  return true;
}
