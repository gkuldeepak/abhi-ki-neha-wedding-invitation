/* =============================================================
   hero.js — living cinematic hero backdrop (Three.js)

   Layers (all additive, depth-sorted back→front):
     • drifting nebula plane (slow rotation, warm gradient)
     • golden dust particles rising & wrapping
     • rose petals tumbling down
   Interaction:
     • mouse parallax on desktop (camera offset)
     • device-orientation parallax on mobile (gyroscope)
   Performance:
     • particle budget scales with deviceTier()
     • render loop PAUSES when the hero scrolls out of view
     • also feeds the DOM content parallax via CSS vars --mx/--my
   ============================================================= */

import { deviceTier, cappedDPR, hasWebGL, prefersReducedMotion,
         isTouch, lerp, clamp, createFpsGovernor, $ } from "./utils.js";

export async function initHero() {
  const hero = $(".hero");
  const canvas = $(".hero__canvas");
  const content = $(".hero__content");
  if (!hero || !canvas) return;

  // No WebGL / reduced motion → keep the static poster + graded overlay.
  if (!hasWebGL() || prefersReducedMotion()) return;

  let THREE;
  try { THREE = await import("three"); }
  catch (_) { return; }

  const tier = deviceTier();
  const DUST   = tier === "high" ? 900 : tier === "mid" ? 500 : 260;
  const PETALS = tier === "high" ? 70  : tier === "mid" ? 42  : 22;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setPixelRatio(cappedDPR(tier === "high" ? 2 : 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 16;

  const world = new THREE.Group();           // parallax pivot
  scene.add(world);

  const resize = () => {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  /* ---------- Nebula: warm gradient plane, slow drift --------------- */
  const nebulaTex = radialTexture(THREE, [
    [0.0, "rgba(120,70,150,0.55)"],   // violet core
    [0.4, "rgba(80,40,90,0.28)"],
    [0.7, "rgba(30,20,40,0.10)"],
    [1.0, "rgba(0,0,0,0)"],
  ]);
  const nebula = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshBasicMaterial({ map: nebulaTex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 })
  );
  nebula.position.z = -12;
  world.add(nebula);

  const nebula2 = nebula.clone();
  nebula2.material = nebula.material.clone();
  nebula2.material.map = radialTexture(THREE, [
    [0.0, "rgba(212,175,55,0.35)"],   // gold aurora patch
    [0.5, "rgba(150,110,30,0.12)"],
    [1.0, "rgba(0,0,0,0)"],
  ]);
  nebula2.position.set(9, 5, -10);
  nebula2.scale.setScalar(0.7);
  world.add(nebula2);

  /* ---------- Golden dust: rising, wrapping ------------------------- */
  const dustTex = dotTexture(THREE);
  const dustGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DUST * 3);
  const dVel = new Float32Array(DUST);       // upward speed per particle
  const SPAN = 26;
  for (let i = 0; i < DUST; i++) {
    dPos[i*3]   = (Math.random() - 0.5) * SPAN;
    dPos[i*3+1] = (Math.random() - 0.5) * SPAN;
    dPos[i*3+2] = (Math.random() - 0.5) * 10;
    dVel[i] = 0.006 + Math.random() * 0.014;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.14, map: dustTex, color: 0xf6d992, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  world.add(dust);

  /* ---------- Rose petals: tumbling down ---------------------------- */
  const petalTex = petalTexture(THREE);
  const petalGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PETALS * 3);
  const pData = [];                          // per-petal motion params
  for (let i = 0; i < PETALS; i++) {
    pPos[i*3]   = (Math.random() - 0.5) * SPAN;
    pPos[i*3+1] = (Math.random() - 0.5) * SPAN;
    pPos[i*3+2] = (Math.random() - 0.5) * 8;
    pData.push({
      fall: 0.01 + Math.random() * 0.02,
      swayAmp: 0.6 + Math.random() * 1.2,
      swayFreq: 0.3 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
    });
  }
  petalGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const petals = new THREE.Points(petalGeo, new THREE.PointsMaterial({
    size: 0.5, map: petalTex, color: 0xf39bc0, transparent: true,
    opacity: 0.85, depthWrite: false, blending: THREE.NormalBlending,
  }));
  world.add(petals);

  /* ---------- Parallax input (mouse + gyroscope) -------------------- */
  let targX = 0, targY = 0, curX = 0, curY = 0;
  if (!isTouch()) {
    window.addEventListener("pointermove", (e) => {
      targX = (e.clientX / window.innerWidth - 0.5) * 2;
      targY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  } else if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", (e) => {
      targX = clamp((e.gamma || 0) / 30, -1, 1);
      targY = clamp((e.beta || 0) / 45 - 0.6, -1, 1);
    }, { passive: true });
  }

  /* ---------- Pause when hero is off-screen ------------------------- */
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.02 })
    .observe(hero);

  /* ---------- Adaptive quality governor ----------------------------- */
  // If frames slip below ~50fps, shed particles + pixel ratio (once or
  // twice) so the hero holds up on weaker GPUs. drawRange hides points
  // cheaply; the update loops below also honor the reduced counts.
  let dustDraw = DUST, petalDraw = PETALS;
  const governor = createFpsGovernor({
    targetFps: 50,
    onDowngrade: (level) => {
      const f = level === 1 ? 0.6 : 0.35;
      dustDraw  = Math.max(60, Math.floor(DUST * f));
      petalDraw = Math.max(8,  Math.floor(PETALS * f));
      dustGeo.setDrawRange(0, dustDraw);
      petalGeo.setDrawRange(0, petalDraw);
      renderer.setPixelRatio(level === 2 ? 1 : Math.min(cappedDPR(1.25), 1.25));
      if (level === 2) nebula2.visible = false;   // drop the gold aurora layer
    },
  });

  /* ---------- Main loop --------------------------------------------- */
  let raf = 0, last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;   // skip rendering while scrolled away

    const t = now / 1000;

    // Smooth parallax easing → camera + DOM content
    curX = lerp(curX, targX, 0.05);
    curY = lerp(curY, targY, 0.05);
    world.rotation.y = curX * 0.12;
    world.rotation.x = curY * 0.08;
    camera.position.x = curX * 1.2;
    camera.position.y = -curY * 1.0;
    camera.lookAt(0, 0, 0);
    if (content) {
      content.style.setProperty("--mx", (-curX).toFixed(3));
      content.style.setProperty("--my", (-curY).toFixed(3));
    }

    // Dust rises & wraps around the top (only the active draw range)
    for (let i = 0; i < dustDraw; i++) {
      dPos[i*3+1] += dVel[i];
      dPos[i*3]   += Math.sin(t * 0.3 + i) * 0.002;
      if (dPos[i*3+1] > SPAN / 2) { dPos[i*3+1] = -SPAN / 2; dPos[i*3] = (Math.random()-0.5)*SPAN; }
    }
    dustGeo.attributes.position.needsUpdate = true;

    // Petals fall & sway
    for (let i = 0; i < petalDraw; i++) {
      const d = pData[i];
      pPos[i*3+1] -= d.fall;
      pPos[i*3]   += Math.sin(t * d.swayFreq + d.phase) * d.swayAmp * 0.02;
      if (pPos[i*3+1] < -SPAN / 2) { pPos[i*3+1] = SPAN / 2; pPos[i*3] = (Math.random()-0.5)*SPAN; }
    }
    petalGeo.attributes.position.needsUpdate = true;

    // Nebula slow life
    nebula.rotation.z  = t * 0.008;
    nebula2.rotation.z = -t * 0.012;
    nebula2.material.opacity = 0.6 + Math.sin(t * 0.4) * 0.2;

    renderer.render(scene, camera);
    governor(dt);   // sample only active (visible) frames
  }
  raf = requestAnimationFrame(frame);

  // Pause the loop entirely when the tab is hidden (battery friendly).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
}

/* ---- procedural textures (no image requests) ----------------------- */
function radialTexture(THREE, stops) {
  const s = 256, c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  return t;
}
function dotTexture(THREE) {
  return radialTexture(THREE, [
    [0, "rgba(255,255,255,1)"],
    [0.3, "rgba(255,240,200,0.8)"],
    [1, "rgba(255,255,255,0)"],
  ]);
}
function petalTexture(THREE) {
  const s = 64, c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  ctx.translate(s/2, s/2);
  ctx.rotate(-0.5);
  const g = ctx.createLinearGradient(0, -s/2, 0, s/2);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(1, "rgba(241,120,170,0.9)");
  ctx.fillStyle = g;
  // simple petal: two mirrored quadratic curves
  ctx.beginPath();
  ctx.moveTo(0, -s*0.42);
  ctx.quadraticCurveTo(s*0.32, 0, 0, s*0.42);
  ctx.quadraticCurveTo(-s*0.32, 0, 0, -s*0.42);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}
