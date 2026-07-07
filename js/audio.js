/* =============================================================
   audio.js — background soundtrack (no visible control)

   Goal: play audibly the moment the page opens. Browsers permit that
   only when the site already has autoplay privilege (e.g. on a refresh
   after the visitor has engaged, or once a gesture happens). So:
     1. try to play WITH SOUND immediately on load, and
     2. if the browser blocks it, play muted right away and unmute on the
        very first user interaction (a click, key, tap, or intro "Enter").
   The track loops for the whole visit; there is no mute button.
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
  audio.volume = 0;
  let on = false;

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

  const unmute = () => {
    if (on) return;
    on = true;
    audio.muted = false;
    audio.volume = 0;
    audio.play().then(() => fadeVol(0.5)).catch(() => { on = false; });
  };

  // Unmute on the first user interaction anywhere (Enter counts). One-shot.
  const evs = ["pointerdown", "keydown", "touchstart"];
  const kick = () => { unmute(); evs.forEach((ev) => document.removeEventListener(ev, kick)); };
  const armGesture = () =>
    evs.forEach((ev) => document.addEventListener(ev, kick, { passive: true }));

  // 1) Try to play WITH SOUND right at startup.
  audio.muted = false;
  audio.play()
    .then(() => { on = true; fadeVol(0.5); })   // allowed → audible immediately
    .catch(() => {                              // blocked → muted now, unmute on gesture
      audio.muted = true;
      audio.play().catch(() => {});
      armGesture();
    });

  // Exposed for the intro's Enter handler (explicit unmute).
  return { start: unmute };
}
