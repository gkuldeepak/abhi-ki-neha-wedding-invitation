/* =============================================================
   audio.js — background soundtrack (no visible control)

   Browsers forbid audible sound before any user interaction, but they
   always allow MUTED playback. So the track starts muted on load (running
   silently), and on the FIRST user gesture — a click, key, tap, or the
   intro's "Enter" — we unmute AND call play() inside that gesture (Safari/
   iOS require the play() call to happen in the gesture to unlock sound),
   then fade the volume in. Loops for the whole visit; no mute button.
   ============================================================= */

import { $ } from "./utils.js";

const TRACKS = [
  "audio/Shubh aangan.mp3",
  "audio/Matthe Te Chamkan.mp3",
  "audio/Rajasthani Wedding Invitation.mp3",
  "audio/Aaj Sajeya x Kudmayi (Knockwell Official Mashup)  Wedding Mashup  Rocky Aur Rani Kii Prem Kahaani.mp3",
];

export function initAudio() {
  const audio = $("#audioPlayer");
  if (!audio) return { start() {} };

  audio.src = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  audio.loop = true;
  audio.muted = true;
  audio.volume = 0;
  let on = false;        // audible + confirmed playing
  let arming = false;    // a play() attempt is in flight (prevents overlap)

  /** Fade the volume in (the track keeps looping underneath). */
  const fadeVol = (target, ms = 900) => {
    const from = audio.volume, t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      audio.volume = from + (target - from) * k;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Muted autoplay right away — always permitted — so the track is running.
  audio.play().catch(() => {});

  // capture-phase so a child's stopPropagation() can't hide the gesture
  const evs = ["pointerdown", "keydown", "touchstart", "click"];
  const opts = { capture: true, passive: true };
  const cleanup = () => evs.forEach((ev) => document.removeEventListener(ev, kick, opts));

  /** Go audible. MUST run inside a user gesture (Safari/iOS unlock rule).
      `arming` blocks overlapping play() calls (which would abort each
      other); `on`/cleanup happen only once playback truly succeeds. */
  const unmute = () => {
    if (on || arming) return;
    arming = true;
    audio.muted = false;
    audio.volume = 0;
    audio.play()
      .then(() => { on = true; arming = false; fadeVol(0.5); cleanup(); })
      .catch(() => { arming = false; });
  };

  // First interaction anywhere unlocks sound (the intro "Enter" is one).
  function kick() { unmute(); }
  evs.forEach((ev) => document.addEventListener(ev, kick, opts));

  // Exposed for the intro's Enter handler (explicit unlock).
  return { start: unmute };
}
