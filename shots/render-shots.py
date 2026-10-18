#!/usr/bin/env python3
# shots/render-shots.py — derives every screenshot on the landing page from its reviewed capture.
#
# SOURCES (edit only by recapturing, never the outputs):
#   shots/final/*.png   real-UI captures of the app at 3x (its ~393 CSS px column, ~1179 px wide), dark theme,
#                       the demo account, reviewed: no personal data, every value checked against what it claims
#
# OUTPUTS (derived; regenerate after any source change, commit together):
#   img/shots/{stem}.webp   quality 85, alpha kept
#   img/shots/{stem}.png    optimized, the fallback for a browser without WebP
#   Each is TWICE its placement's display width (Lanczos), its height from the source's aspect ratio rounded to the
#   nearest EVEN number, so the markup's height (the PNG's ÷ 2) is a whole pixel — a distortion under one pixel.
#
# PLACEMENTS below is the ONE place an image's size is stated. index.html's width and height attributes are the PNG's
# dimensions ÷ 2, and launch-guard.test.js G15 reads both files' headers and holds the markup to them.
# Only the placed stems render; the other captures in shots/final are kept as alternates.
#
# Needs: python3, Pillow (built with WebP). Run from the repo root:  python3 shots/render-shots.py
import os
from PIL import Image

SRC, OUT = 'shots/final', 'img/shots'

# stem → display width in CSS px (the page's own section names)
PLACEMENTS = {
    '01-portfolio-tall':      360,   # hero, in the device frame (brief 157-R1: drawn at 360 on desktop)
    '02-radar-active':        320,   # One navigator › Award search
    '03-lab-build-planned':   320,   # One navigator › Pricing
    '03-lab-booked-block':    320,   # One navigator › Travel planning
    '04-vault-programs':      320,   # One navigator › Your portfolio
    '05-brief-flights':       320,   # How it works › 02 Forward the rest.
    '06-radar-inbound':       320,   # The story, after the pull quote
    '07-profile-companions':  320,   # What we believe › 03, the pair (first)
    '07-profile-cabin':       320,   # What we believe › 03, the pair (second)
}

os.makedirs(OUT, exist_ok=True)
for stem, display in PLACEMENTS.items():
    src = Image.open(os.path.join(SRC, stem + '.png')).convert('RGBA')
    w = 2 * display
    h = 2 * round(src.height * w / src.width / 2)
    out = src.resize((w, h), Image.LANCZOS)
    out.save(os.path.join(OUT, stem + '.webp'), 'WEBP', quality=85, method=6)
    out.save(os.path.join(OUT, stem + '.png'), 'PNG', optimize=True)
    print(f'rendered: {OUT}/{stem}.webp + .png  {w}x{h}  (displayed {display}x{h // 2})')
