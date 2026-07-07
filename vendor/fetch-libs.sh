#!/usr/bin/env bash
# =============================================================
# fetch-libs.sh — download the pinned third-party libraries into vendor/
#
# Run this ONCE on a machine with internet access:
#     bash vendor/fetch-libs.sh
#
# Pulls exact, version-pinned files straight from the public jsDelivr CDN
# (falls back to unpkg). No npm / registry auth involved. Re-run any time to
# refresh; bump the versions below to upgrade.
# =============================================================
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"        # the vendor/ directory
cd "$here"

# fetch <dest-relative-to-vendor> <jsdelivr-path> — tries jsDelivr, then unpkg
fetch () {
  local dest="$1" path="$2"
  mkdir -p "$(dirname "$dest")"
  if curl -fsSL --retry 3 "https://cdn.jsdelivr.net/npm/$path" -o "$dest" \
     || curl -fsSL --retry 3 "https://unpkg.com/$path" -o "$dest"; then
    echo "  ✓ vendor/$dest"
  else
    echo "  ✗ FAILED: $path" >&2; return 1
  fi
}

echo "→ Downloading pinned libraries from jsDelivr..."
fetch three.module.js                        "three@0.160.0/build/three.module.js"
fetch gsap.min.js                            "gsap@3.12.5/dist/gsap.min.js"
fetch ScrollTrigger.min.js                   "gsap@3.12.5/dist/ScrollTrigger.min.js"
fetch lenis.min.js                           "lenis@1.1.14/dist/lenis.min.js"
fetch bootstrap.min.css                      "bootstrap@5.3.0/dist/css/bootstrap.min.css"
fetch bootstrap.bundle.min.js                "bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"
fetch bootstrap-icons/bootstrap-icons.css    "bootstrap-icons@1.10.5/font/bootstrap-icons.css"
fetch bootstrap-icons/fonts/bootstrap-icons.woff2 "bootstrap-icons@1.10.5/font/fonts/bootstrap-icons.woff2"
fetch bootstrap-icons/fonts/bootstrap-icons.woff  "bootstrap-icons@1.10.5/font/fonts/bootstrap-icons.woff"

# ---- Google Fonts (self-hosted) -----------------------------------------
# Fetch the CSS with a modern UA (so Google serves woff2), download every
# referenced font file into vendor/fonts/, and rewrite the URLs to be local.
echo "→ Self-hosting Google Fonts..."
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
FONTS_URL="https://fonts.googleapis.com/css2?family=Sacramento&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Work+Sans:wght@300;400;500;600&display=swap"

mkdir -p "$here/fonts"
curl -fsSL --retry 3 -A "$UA" "$FONTS_URL" -o "$here/fonts/fonts.css"

for url in $(grep -oE 'https://fonts\.gstatic\.com/[^)]+\.woff2' "$here/fonts/fonts.css" | sort -u || true); do
  fname="gf-$(printf '%s' "$url" | shasum | cut -c1-12).woff2"
  curl -fsSL --retry 3 "$url" -o "$here/fonts/$fname" || { echo "  ⚠ failed: $url"; continue; }
  sed -i.bak "s|$url|$fname|g" "$here/fonts/fonts.css"     # localize the reference
  echo "  ✓ vendor/fonts/$fname"
done
rm -f "$here/fonts/fonts.css.bak"
echo "  ✓ vendor/fonts/fonts.css"

echo ""
echo "✅ Done. All libraries are now in vendor/ — the site loads with zero CDN dependency."
