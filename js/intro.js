/* =============================================================
   intro.js — cinematic startup sequence (Three.js particle system)

   Beats (all driven by one clock, see TIMELINE below):
     void → glowing particle → galaxy → heart constellation →
     mandala/petals → couple initials → portal fly-through → hero

   Design notes:
   • One Points cloud is REUSED across beats. Each beat snapshots the
     current positions as `base`, sets a `target`, and eases base→target.
     This gives smooth morphs without spawning/destroying geometry.
   • A subset of points ("hero stars") peels off during the constellation
     beat to trace a heart curve; LineSegments connect them.
   • Fully skippable and self-disabling under prefers-reduced-motion.
   ============================================================= */

import { deviceTier, cappedDPR, hasWebGL, prefersReducedMotion,
         norm, lerp, easeInOutCubic, easeOutExpo, $ } from "./utils.js";

const TIMELINE = {
  birth:        [0.0, 1.1],   // core ignites, cloud blooms from a point
  galaxy:       [1.1, 3.3],   // spiral galaxy forms & rotates
  constellation:[3.3, 5.3],   // heart constellation connects
  mandala:      [5.3, 7.6],   // petals bloom into a mandala
  initials:     [7.6, 9.0],   // mandala dims, initials resolve
};
const READY_AT = 9.0;         // when the "Enter" prompt appears

/**
 * Boot the intro.
 * @param {object} opts
 * @param {() => void} opts.onEnter  called when user commits (Enter/Skip):
 *                                    start audio + reveal the site.
 */
export async function initIntro({ onEnter }) {
  const overlay = $(".intro");
  if (!overlay) return;

  // Commit exactly once, then tear the intro down.
  let committed = false;
  const commit = (withPortal) => {
    if (committed) return;
    committed = true;
    try { sessionStorage.setItem("introSeen", "1"); } catch (_) {}
    finish(withPortal);
  };

  // ---- Skip conditions --------------------------------------------
  // • reduced-motion / no WebGL / ?intro=0 → never play
  // • Otherwise: play once per session, BUT a page refresh always replays it.
  //   (Navigation Timing tells us whether this load was a reload.)
  const forceSkip = new URLSearchParams(location.search).get("intro") === "0";
  const isReload = (() => {
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav && nav.type) return nav.type === "reload";
      return performance.navigation && performance.navigation.type === 1; // legacy
    } catch (_) { return false; }
  })();
  const seen = (() => { try { return sessionStorage.getItem("introSeen"); } catch (_) { return null; } })();

  if (prefersReducedMotion() || !hasWebGL() || forceSkip || (seen && !isReload)) {
    overlay.remove();
    document.body.classList.remove("intro-active");
    onEnter?.();
    return;
  }

  const skipBtn  = $(".intro__skip", overlay);
  const enterWrap= $(".intro__enter", overlay);
  const enterBtn = $(".intro__enter-btn", overlay);
  const titleEl  = $(".intro__title", overlay);
  const portalEl = $(".intro__portal", overlay);
  const canvas   = $(".intro__canvas", overlay);

  let THREE;
  try {
    THREE = await import("three");
  } catch (e) {
    // Three.js failed to load — don't trap the user behind a black screen.
    overlay.remove();
    document.body.classList.remove("intro-active");
    onEnter?.();
    return;
  }

  /* ---------- Tier-scaled particle budget --------------------------- */
  const tier = deviceTier();
  const COUNT = tier === "high" ? 5000 : tier === "mid" ? 2600 : 1400;
  const HEART = Math.min(240, Math.floor(COUNT * 0.06)); // stars tracing the heart

  /* ---------- Renderer / scene / camera ----------------------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === "high", alpha: true });
  renderer.setPixelRatio(cappedDPR(tier === "high" ? 2 : 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const resize = () => {
    const w = overlay.clientWidth, h = overlay.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  /* ---------- Soft round sprite (glow dot) -------------------------- */
  const sprite = (() => {
    const s = 64, c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d").createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,245,220,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    const ctx = c.getContext("2d");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();

  /* ---------- Precompute morph targets ------------------------------ */
  const rand = mulberry32(20261124);            // deterministic layout
  const gauss = () => (rand() + rand() + rand() - 1.5) * 0.9;

  const originPos = new Float32Array(COUNT * 3);   // tight core at birth
  const galaxyPos = new Float32Array(COUNT * 3);
  const mandalaPos= new Float32Array(COUNT * 3);
  const heartPos  = new Float32Array(COUNT * 3);   // heart targets for hero stars
  const colGalaxy = new Float32Array(COUNT * 3);
  const colMandala= new Float32Array(COUNT * 3);

  const cGoldCore = [1.0, 0.95, 0.8];
  const cGoldEdge = [0.83, 0.66, 0.22];
  const cRose     = [0.95, 0.35, 0.6];
  const cBlueCore = [0.75, 0.85, 1.0];

  const GAL_R = 9, ARMS = 3, SPIN = 3.4;
  const heartIdx = new Set();
  for (let k = 0; k < HEART; k++) heartIdx.add(Math.floor((k / HEART) * COUNT));

  let hStar = 0;
  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;

    // birth: micro-sphere at center
    originPos[i3]   = gauss() * 0.06;
    originPos[i3+1] = gauss() * 0.06;
    originPos[i3+2] = gauss() * 0.06;

    // galaxy: logarithmic-ish spiral arms
    const dist = Math.pow(rand(), 0.6) * GAL_R;
    const arm = (i % ARMS) * ((Math.PI * 2) / ARMS);
    const ang = dist * (SPIN / GAL_R) + arm;
    const spread = dist * 0.14;
    galaxyPos[i3]   = Math.cos(ang) * dist + gauss() * spread;
    galaxyPos[i3+1] = Math.sin(ang) * dist + gauss() * spread;
    galaxyPos[i3+2] = gauss() * 0.8;
    // galaxy color: bluish core → gold rim
    const tRad = dist / GAL_R;
    mix(colGalaxy, i3, cBlueCore, cGoldEdge, tRad);

    // mandala: radial petals with k-fold symmetry
    const rings = 7;
    const ring = ((i % rings) + 1) / rings;
    const pang = (i / COUNT) * Math.PI * 2 * 6;
    const petals = 12;
    const rr = ring * GAL_R * 0.62 * (0.62 + 0.38 * Math.abs(Math.sin(petals * pang)));
    mandalaPos[i3]   = Math.cos(pang) * rr;
    mandalaPos[i3+1] = Math.sin(pang) * rr;
    mandalaPos[i3+2] = Math.sin(petals * pang) * 0.6;
    // mandala color: gold center, rose petal tips
    const tip = Math.abs(Math.sin(petals * pang));
    mix(colMandala, i3, cGoldCore, cRose, tip * (0.4 + 0.6 * ring));

    // heart curve targets (only for hero stars)
    if (heartIdx.has(i)) {
      const t = (hStar / HEART) * Math.PI * 2;
      hStar++;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = 13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t);
      heartPos[i3]   = hx * 0.34;
      heartPos[i3+1] = hy * 0.34 + 0.6;
      heartPos[i3+2] = 0;
    }
  }

  /* ---------- Points object ----------------------------------------- */
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(originPos);        // live positions
  const col = new Float32Array(colGalaxy);        // live colors
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: tier === "high" ? 0.13 : 0.17,
    map: sprite, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  /* ---------- Heart constellation lines ----------------------------- */
  const heroList = [...heartIdx].sort((a, b) => a - b);
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(heroList.length * 2 * 3); // segment pairs
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xf6d992, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);

  /* ---------- Morph bookkeeping ------------------------------------- */
  // `base` = positions at the start of the current beat; we lerp base→target.
  let base = new Float32Array(originPos);
  let target = galaxyPos;
  let beat = "birth";
  const snapshot = () => base.set(pos);
  const setBeat = (name, tgt) => { beat = name; snapshot(); target = tgt; };

  // Heart stars need their own target during the constellation beat.
  let baseHeart = null;

  /* ---------- Clock + main loop ------------------------------------- */
  let start = null, raf = 0, running = true;
  function frame(now) {
    if (!running) return;
    if (start === null) start = now;
    const t = (now - start) / 1000;   // seconds since intro began
    step(t);
    raf = requestAnimationFrame(frame);
  }

  function step(t) {
    // Global fade-in of the whole cloud during birth
    mat.opacity = Math.min(1, norm(t, 0.05, 1.0));

    // --- Beat sequencing (snapshot on entry) ---
    if (t >= TIMELINE.galaxy[0] && beat === "birth")            setBeat("galaxy", galaxyPos);
    if (t >= TIMELINE.constellation[0] && beat === "galaxy")  { setBeat("constellation", galaxyPos); baseHeart = snapHeart(); }
    if (t >= TIMELINE.mandala[0] && beat === "constellation")   setBeat("mandala", mandalaPos);
    if (t >= TIMELINE.initials[0] && beat === "mandala")        setBeat("initials", mandalaPos);

    // --- Per-beat easing progress ---
    if (beat === "birth") {
      const p = easeOutExpo(norm(t, TIMELINE.birth[0], TIMELINE.birth[1]));
      morphAll(p, originPos, galaxyPos, colGalaxy, colGalaxy);
    } else if (beat === "galaxy") {
      const p = easeInOutCubic(norm(t, TIMELINE.galaxy[0], TIMELINE.galaxy[1]));
      morphAll(p, base, galaxyPos, col, colGalaxy);
      points.rotation.z = t * 0.12;
    } else if (beat === "constellation") {
      const p = easeInOutCubic(norm(t, TIMELINE.constellation[0], TIMELINE.constellation[1]));
      // hero stars fly to the heart; the rest gently hold
      morphHeart(p);
      lineMat.opacity = Math.max(0, norm(p, 0.45, 1)) * 0.9;
      updateHeartLines();
      points.rotation.z += 0.0005;
    } else if (beat === "mandala") {
      const p = easeInOutCubic(norm(t, TIMELINE.mandala[0], TIMELINE.mandala[1]));
      morphAll(p, base, mandalaPos, base === col ? col : colGalaxy, colMandala);
      // fade the heart lines back out as petals take over
      lineMat.opacity = (1 - p) * 0.9;
      points.rotation.z = 0.12 * TIMELINE.galaxy[1] + p * 0.4;
    } else if (beat === "initials") {
      const p = easeInOutCubic(norm(t, TIMELINE.initials[0], TIMELINE.initials[1]));
      // mandala breathes inward & dims; initials fade up over it
      points.scale.setScalar(lerp(1, 0.82, p));
      mat.opacity = lerp(1, 0.35, p);
      points.rotation.z += 0.004;
      if (p > 0.35) titleEl.classList.add("reveal");
    }

    // Slow cinematic camera drift for parallax depth
    camera.position.x = Math.sin(t * 0.18) * 0.7;
    camera.position.y = Math.cos(t * 0.14) * 0.4;
    camera.lookAt(0, 0, 0);

    // Reveal the "Enter" prompt once the sequence has resolved
    if (t >= READY_AT) enterWrap.classList.add("show");

    renderer.render(scene, camera);
  }

  /* ---- morph helpers ---------------------------------------------- */
  function morphAll(p, from, to, colFrom, colTo) {
    for (let i = 0; i < pos.length; i++) pos[i] = lerp(from[i], to[i], p);
    if (colFrom !== colTo) for (let i = 0; i < col.length; i++) col[i] = lerp(colFrom[i], colTo[i], p);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  function snapHeart() {
    const arr = new Float32Array(heroList.length * 3);
    heroList.forEach((idx, n) => {
      arr[n*3] = pos[idx*3]; arr[n*3+1] = pos[idx*3+1]; arr[n*3+2] = pos[idx*3+2];
    });
    return arr;
  }
  function morphHeart(p) {
    heroList.forEach((idx, n) => {
      const i3 = idx * 3;
      pos[i3]   = lerp(baseHeart[n*3],   heartPos[i3],   p);
      pos[i3+1] = lerp(baseHeart[n*3+1], heartPos[i3+1], p);
      pos[i3+2] = lerp(baseHeart[n*3+2], heartPos[i3+2], p);
    });
    geo.attributes.position.needsUpdate = true;
  }
  function updateHeartLines() {
    // Connect consecutive hero stars into a continuous heart outline
    for (let n = 0; n < heroList.length; n++) {
      const a = heroList[n] * 3;
      const b = heroList[(n + 1) % heroList.length] * 3;
      const o = n * 6;
      linePos[o]   = pos[a];   linePos[o+1] = pos[a+1]; linePos[o+2] = pos[a+2];
      linePos[o+3] = pos[b];   linePos[o+4] = pos[b+1]; linePos[o+5] = pos[b+2];
    }
    lineGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- Commit / teardown ------------------------------------- */
  function finish(withPortal) {
    if (withPortal && portalEl) portalEl.classList.add("fire");
    onEnter?.();

    // Stop the beat loop immediately so it can't fight the dolly render.
    running = false;
    cancelAnimationFrame(raf);

    // Quick camera dolly "into the portal" while the overlay fades.
    const t0 = performance.now();
    const startZ = camera.position.z, startOp = mat.opacity;
    const dolly = (now) => {
      const k = Math.min(1, (now - t0) / 900);
      camera.position.z = lerp(startZ, 2, easeOutExpo(k));
      camera.lookAt(0, 0, 0);
      mat.opacity = lerp(startOp, 0, k);
      renderer.render(scene, camera);
      if (k < 1) requestAnimationFrame(dolly);
    };
    if (!prefersReducedMotion()) requestAnimationFrame(dolly);

    overlay.classList.add("done");
    document.body.classList.remove("intro-active");

    // Free GPU resources after the fade-out transition completes.
    setTimeout(() => {
      window.removeEventListener("resize", resize);
      geo.dispose(); mat.dispose(); lineGeo.dispose(); lineMat.dispose();
      sprite.dispose(); renderer.dispose();
      overlay.remove();
    }, 1300);
  }

  /* ---------- Wire controls ----------------------------------------- */
  skipBtn?.addEventListener("click", () => commit(false));
  enterBtn?.addEventListener("click", () => commit(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") commit(false);
    if (e.key === "Enter") commit(true);
  });

  raf = requestAnimationFrame(frame);
}

/* ---- tiny utilities ------------------------------------------------- */
function mix(out, i3, a, b, t) {
  out[i3]   = a[0] + (b[0] - a[0]) * t;
  out[i3+1] = a[1] + (b[1] - a[1]) * t;
  out[i3+2] = a[2] + (b[2] - a[2]) * t;
}
/** Seeded PRNG so the layout is identical every load (no layout pop). */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
