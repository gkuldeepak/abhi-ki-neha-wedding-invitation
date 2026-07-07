# vendor/ — locally hosted libraries

The site loads all third-party libraries from this folder instead of a CDN,
so it has **zero runtime dependency** on jsDelivr / unpkg being reachable.

## One-time setup

On any machine with internet access:

```bash
bash vendor/fetch-libs.sh
```

This downloads the exact pinned versions from the npm registry and copies just
the needed files here. Commit the resulting files so the site is fully
self-contained (GitHub Pages will then serve everything from your own origin).

## Pinned versions

| Library          | Version  | File(s)                                             |
|------------------|----------|-----------------------------------------------------|
| three.js         | 0.160.0  | `three.module.js` (ESM, via import map)             |
| GSAP             | 3.12.5   | `gsap.min.js`, `ScrollTrigger.min.js`               |
| Lenis            | 1.1.14   | `lenis.min.js`                                       |
| Bootstrap        | 5.3.0    | `bootstrap.min.css`, `bootstrap.bundle.min.js`      |
| Bootstrap Icons  | 1.10.5   | `bootstrap-icons/bootstrap-icons.css` + `fonts/*`   |
| Google Fonts     | current  | `fonts/fonts.css` + `fonts/gf-*.woff2` (self-hosted)|

To upgrade, bump the version in `fetch-libs.sh` and re-run it. (Fonts always
fetch the current Google build; edit `FONTS_URL` in the script to change families/weights.)

## Not vendored (still external, by design)

- **Google Maps embed** (venue) and the **favicon** — these are live/remote by nature.
