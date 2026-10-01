#!/usr/bin/env python3
# brand/render-assets.py — derives every raster brand asset from the two mark sources.
#
# SOURCES (edit these, never the outputs):
#   brand/fix-mark.svg        the Fix mark (viewBox 0 0 220 220, center 110,110; gold via one `color`)
#   brand/fix-mark-small.svg  the small-size variant (aircraft + inner ring) for 16–64 px
#
# OUTPUTS (derived; regenerate after any source edit, commit together):
#   favicon.ico                  16/32/48 from favicon.svg            (repo root — browsers ask for /favicon.ico)
#   brand/favicon.svg            small mark on a rounded dark tile
#   brand/apple-touch-icon.png   180, full mark, full-bleed dark (iOS rounds the corners)
#   brand/logo.png               512, full mark on dark (the Organization logo in JSON-LD)
#   brand/og-image.png           1200x630 share card: the mark, the wordmark, the tagline
#
# Needs: python3, cairosvg, Pillow, and the brand fonts installed locally
# (Cormorant Garamond 500, DM Sans 400) — the og card's text is set in them.
# Run from the repo root:  python3 brand/render-assets.py
import io, os, re
import cairosvg
from PIL import Image

DARK, GOLD, CREAM = '#0a0b0d', '#b89a5a', '#f7f5f1'   # the PI's brand colors
TAGLINE = 'TRAVEL INTELLIGENCE'
B = 'brand'

def inner(path):
    s = open(path, encoding='utf-8').read()
    body = re.search(r'<svg[^>]*>(.*)</svg>', s, re.S).group(1)
    return re.sub(r'\s*<title>.*?</title>', '', body)

def mark(body, x, y, size):
    return f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="0 0 220 220" color="{GOLD}">{body}</svg>'

def tile(body, size, pad, rx):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" rx="{rx}" fill="{DARK}"/>{mark(body, pad, pad, size - 2 * pad)}</svg>')

def png(svg, path, w, h):
    cairosvg.svg2png(bytestring=svg.encode(), write_to=path, output_width=w, output_height=h)

full, small = inner(f'{B}/fix-mark.svg'), inner(f'{B}/fix-mark-small.svg')

fav = tile(small, 64, 4, 14)
open(f'{B}/favicon.svg', 'w', encoding='utf-8').write(fav)
sizes = (48, 32, 16)
imgs = [Image.open(io.BytesIO(cairosvg.svg2png(bytestring=fav.encode(), output_width=s, output_height=s))).convert('RGBA') for s in sizes]
imgs[0].save('favicon.ico', sizes=[(s, s) for s in sizes], append_images=imgs[1:])

png(tile(full, 180, 18, 0), f'{B}/apple-touch-icon.png', 180, 180)
png(tile(full, 512, 48, 0), f'{B}/logo.png', 512, 512)

og = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">'
      f'<rect width="1200" height="630" fill="{DARK}"/>{mark(full, 130, 155, 320)}'
      f'<text x="520" y="330" font-family="Cormorant Garamond" font-weight="500" font-size="168" fill="{CREAM}" letter-spacing="2">Elitr<tspan fill="{GOLD}">.</tspan></text>'
      f'<text x="526" y="398" font-family="DM Sans" font-weight="400" font-size="26" fill="{GOLD}" letter-spacing="9">{TAGLINE}</text></svg>')
png(og, f'{B}/og-image.png', 1200, 630)
print('rendered: favicon.ico', *(f'{B}/{n}' for n in ('favicon.svg', 'apple-touch-icon.png', 'logo.png', 'og-image.png')))
