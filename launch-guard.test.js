// launch-guard.test.js — brief 93: the launch page mirrors the product and carries no second source of
// truth. Seven decisions, seven guards, G-n to decision n. node:assert + the copied runner; reads
// index.html and privacy/index.html from disk. Run: npm test
const { test, run } = require('./_test-runner');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = __dirname;
const rawIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rawPrivacy = fs.readFileSync(path.join(ROOT, 'privacy', 'index.html'), 'utf8');

// ── strip ── HTML comments, and JS comments inside <script> (block and line). Asserted below.
function stripJs(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:\\'"])\/\/.*$/, '$1')).join('\n');
}
function strip(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (m, a, b, c) => a + stripJs(b) + c);
}
const index = strip(rawIndex), privacy = strip(rawPrivacy);
// text outside <style> and <svg>, with quoted attribute values removed: a CSS alpha, an animation delay
// or an SVG opacity is a decimal and not a price. What remains is prose, markup text and script.
const noStyle = (s) => s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '').replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/="[^"]*"/g, '=""');
// a bounded slice: from an opener forward to its closer, with a length range
function slice(src, open, close, min, max, label) {
  const i = src.indexOf(open);
  assert.ok(i >= 0, label + ': opener not found');
  const j = src.indexOf(close, i + open.length);
  assert.ok(j > i, label + ': closer not found');
  const out = src.slice(i, j + close.length);
  assert.ok(out.length >= min && out.length <= max, label + ': slice is ' + out.length + ' chars, outside ' + min + '–' + max);
  return out;
}
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' not found');
  let d = 0, k = src.indexOf('{', i);
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const count = (s, re) => (s.match(re) || []).length;

test('the strip is real — the deletion comment names waitlist and hello@, and the scans do not see them', () => {
  assert.ok(/waitlist/.test(rawIndex) && /hello@/.test(rawIndex), 'the reason comment naming the removed waitlist and hello@ is gone');
  assert.ok(!/waitlist|hello@/.test(index), 'the strip does not strip HTML comments');
  assert.ok(/PROVISIONAL \(Nicole\) — the words/.test(rawIndex) && !/PROVISIONAL \(Nicole\) — the words/.test(index), 'the strip does not strip JS line comments');
});

test('G1 (decision 1) — one pricing constant in Creem’s units; every number on the page derives from it; no price digit lives anywhere else', () => {
  const block = slice(rawIndex, '<script id="elitr-pricing">', '</script>', 200, 1200, '#elitr-pricing');
  const ctx = { window: {} };
  vm.runInNewContext(block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''), ctx);
  const P = ctx.window.ELITR_PRICING;
  assert.ok(P && Array.isArray(P.plans), 'ELITR_PRICING is not defined by the block');
  assert.strictEqual(P.plans.length, 2);
  for (const p of P.plans) {
    assert.ok(Number.isInteger(p.cents) && p.cents > 0, p.plan + ': cents is not a positive integer');
    assert.ok(['every-month', 'every-year'].includes(p.period), p.plan + ': period is not Creem’s enum');
    assert.ok(typeof p.plan === 'string' && p.plan, 'a plan without a name');
  }
  assert.ok(Number.isInteger(P.trialDays) && P.trialDays > 0, 'trialDays is not a positive integer');
  assert.strictEqual(P.taxMode, 'exclusive');
  assert.match(P.currency, /^[A-Z]{3}$/);
  // OUTSIDE THE BLOCK, comments stripped: the digits appear zero times (so exactly once in the file)
  const outside = index.replace(/<script id="elitr-pricing">[\s\S]*?<\/script>/, '');
  for (const p of P.plans) assert.strictEqual(count(outside, new RegExp('\\b' + p.cents + '\\b', 'g')), 0,
    'the cents digits of ' + p.plan + ' appear outside #elitr-pricing — PROPERTY, NOT VALUE: this guard reads the block, never a literal, so the sale-close edit does not red it');
  assert.ok(!/\$\d/.test(outside), 'a $ followed by a digit outside the block');
  assert.ok(!/\d+\.\d{2}(?!\d)/.test(noStyle(outside)), 'a price-shaped decimal outside the block (outside <style>, where a CSS alpha is not a price)');
  assert.ok(!/\b7[- ]days?\b/.test(outside), 'a 7-day / 7 days / 7 day literal outside the block — the day count is rendered from trialDays');
  assert.ok(!new RegExp('\\b' + P.trialDays + '-day\\b').test(outside), 'the trial day count typed outside the block');
  const render = fnBody(index, 'renderPricing');
  assert.ok(render.length > 600 && render.length < 4000, 'renderPricing is ' + render.length + ' chars');
  assert.match(render, /new Intl\.NumberFormat\(undefined, \{ style: 'currency', currency: P\.currency \}\)\.format\(cents \/ 100\)/, 'the formatter is not Intl.NumberFormat over cents');
  assert.match(render, /plan\.period === 'every-year' \? perMonth\(plan\.cents\)/, 'the per-month figure is not gated on every-year');
  assert.match(render, /var perMonth = function \(cents\) \{ return fmt\(cents \/ 12\); \};/, 'the per-month figure is not cents / 12');
  assert.match(render, /P\.trialDays \+ ' days free'/, 'the trial line is not from trialDays');
  assert.match(render, /P\.taxMode === 'exclusive' \? 'plus tax at checkout' : ''/, 'the tax line is not from taxMode');
  assert.match(render, /querySelectorAll\('\[data-trial-days\]'\)\.forEach\(function \(el\) \{ el\.textContent = P\.trialDays; \}\)/, 'the [data-trial-days] slots are not filled from the constant');
  assert.ok(count(index, /data-trial-days/g) >= 6, 'fewer than six [data-trial-days] slots (five CTAs and two notes)');
  assert.match(index, /document\.addEventListener\('DOMContentLoaded', function \(\) \{\s*renderPricing\(\);/, 'renderPricing does not run on DOMContentLoaded');
  assert.ok(!/ELITR_PRICING\s*=/.test(outside), 'the constant is assigned outside its block');
});

test('G2 (decision 3) — every href is in the allowed set; every app-bound anchor carries a data-cta, and every data-cta anchor is app-bound', () => {
  const ALLOWED = new Set(['/', '/privacy', 'https://app.elitr.ai', 'mailto:support@elitr.ai']);
  const EXTERNAL_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'googletagmanager.com'];
  // pre-existing in /privacy's contact block (Jeff's, not this brief): privacy@, exactly once — G4 counts it.
  // 93-R1: the self-link to elitr.ai went with the line that carried it; an exemption for a thing that
  // no longer exists is a pardon, so every entry here must match an href in the file.
  const PRE_EXISTING_PRIVACY = new Set(['mailto:privacy@elitr.ai']);
  assert.deepStrictEqual([...PRE_EXISTING_PRIVACY], ['mailto:privacy@elitr.ai'], 'the privacy exemption grew — add an entry only for an href that exists, and say why');
  const privacyHrefs = new Set([...privacy.matchAll(/href="([^"]*)"/g)].map((m) => m[1]));
  for (const e of PRE_EXISTING_PRIVACY) assert.ok(privacyHrefs.has(e), 'PRE_EXISTING_PRIVACY entry matches no href in /privacy: ' + e + ' — a stale exemption');
  const hrefs = (src, file) => [...src.matchAll(/href="([^"]*)"/g)].map((m) => ({ href: m[1], file }));
  const all = hrefs(index, 'index.html').concat(hrefs(privacy, 'privacy/index.html'));
  const bad = all.filter(({ href, file }) => {
    if (EXTERNAL_HOSTS.some((h) => href.includes('//' + h) || href.includes('//www.' + h))) return false;
    if (file === 'privacy/index.html' && PRE_EXISTING_PRIVACY.has(href)) return false;
    return !ALLOWED.has(href);
  });
  assert.deepStrictEqual(bad, [], 'an href outside the allowed set — a new destination is a guard failure, not a style choice (brief 93 decision 3)');
  const ctaAnchors = [...index.matchAll(/<a\b[^>]*data-cta="([^"]*)"[^>]*>/g)];
  for (const m of ctaAnchors) assert.match(m[0], /href="https:\/\/app\.elitr\.ai"/, 'a data-cta anchor not bound to the app: ' + m[0]);
  const appAnchors = [...index.matchAll(/<a\b[^>]*href="https:\/\/app\.elitr\.ai"[^>]*>/g)];
  for (const m of appAnchors) assert.match(m[0], /data-cta="[a-z_]+"/, 'an app-bound anchor with no position — a click the funnel cannot see: ' + m[0]);
  assert.ok(ctaAnchors.length >= 5, 'fewer than five data-cta anchors (hero, two cards, bottom, footer) — a FLOOR, a copy pass may add one');
  const positions = ctaAnchors.map((m) => m[1]);
  for (const p of ['top', 'pricing_monthly', 'pricing_annual', 'bottom', 'footer']) assert.ok(positions.includes(p), 'no anchor at position ' + p);
  assert.strictEqual(new Set(positions).size, positions.length, 'two anchors share a position');
  assert.ok(!/<form\b/.test(index) && !/<form\b/.test(privacy), 'a form on the page');
});

test('G3 (decision 4) — the waitlist is gone: no endpoint, no form, no script, no email input', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'api')), 'api/ still exists — the unauthenticated sender is live');
  for (const w of ['handleWaitlist', 'scrollToForm', '/api/waitlist', 'cta-success', 'cta-form', 'type="email"']) {
    assert.ok(!index.includes(w) && !privacy.includes(w), w + ' survives in code');
  }
  assert.match(rawIndex, /The waitlist form and api\/waitlist\.js were removed at launch\s+\(brief 93\)/, 'the reason comment is gone');
});

test('G4 (decision 5) — one address: support@ everywhere, privacy@ once in /privacy, and no hello@, bryan@ or Cloudflare protection', () => {
  const mailtos = (s) => [...s.matchAll(/mailto:([^"'\s>]+)/g)].map((m) => m[1]);
  assert.deepStrictEqual(mailtos(index), ['support@elitr.ai', 'support@elitr.ai'], 'index.html does not carry exactly two support@ mailtos (nav, footer)');
  const pm = mailtos(privacy);
  assert.strictEqual(pm.filter((a) => a === 'privacy@elitr.ai').length, 1, 'privacy@ must appear exactly once in /privacy — an exemption that matches nothing is a stale exemption');
  assert.deepStrictEqual(pm.filter((a) => a !== 'privacy@elitr.ai'), ['support@elitr.ai', 'support@elitr.ai'], '/privacy’s other mailtos are not support@');
  for (const w of ['hello@', 'bryan@', 'cdn-cgi', '__cf_email__']) assert.ok(!index.includes(w) && !privacy.includes(w), w + ' survives');
  // 93-R1 G-1: a contact line that points at the site the reader is already on is gone, with its sentence
  for (const w of ['https://elitr.ai', 'reach us at']) assert.ok(!privacy.includes(w), w + ' survives in /privacy');
});

// THE LAUNCH PREDECESSOR, FIXED (93-R1 decision 3): the commit before brief 93 touched this repo. A diff
// against HEAD re-reads HEAD every run, so once the launch commit is HEAD it asserts that the file never
// changes again — which nothing intends — and an empty diff satisfied the predicate vacuously. The
// constant does not move: a change to /privacy's body (Jeff's pass) is a new predicate here, not a new
// anchor.
const LAUNCH_PREDECESSOR = 'f72829d';

test('G5 (decision 5, 93-R1) — /privacy differs from the launch predecessor only by the mechanical edits', () => {
  let base;
  try { base = cp.execSync('git show ' + LAUNCH_PREDECESSOR + ':privacy/index.html', { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { console.log('      G5 skipped: git unavailable (' + (e && e.message ? e.message.split('\n')[0] : e) + ') — the claim is unverified this run'); return; }
  const a = base.split('\n'), b = rawPrivacy.split('\n');
  const surviving = new Set(b), original = new Set(a);
  const changed = a.filter((l) => !surviving.has(l));
  const added = b.filter((l) => !original.has(l));
  // THE SLICE IS REAL: an empty diff is the HEAD-anchored failure and reads red, never green
  assert.ok(changed.length >= 4, 'G5 saw ' + changed.length + ' changed line(s) against ' + LAUNCH_PREDECESSOR + ' — anchored to HEAD, or the predecessor moved; do not edit the constant to go green.');
  for (const l of changed) {
    assert.ok(/hello@elitr\.ai|Request access|scrollToForm|https:\/\/elitr\.ai/.test(l) || l.trim() === '<br />',
      'a /privacy line changed that named none of hello@, Request access, scrollToForm, https://elitr.ai and is not a bare <br />: ' + JSON.stringify(l));
  }
  for (const l of added) assert.ok(/support@elitr\.ai/.test(l), 'a /privacy line was added that is not the support@ address: ' + JSON.stringify(l));
});

test('G6 (decision 6) — the early-access framing is gone, and every replacement sentence is flagged PROVISIONAL', () => {
  for (const w of ['early access', 'Early access', 'early development', 'waitlist', 'Request access', 'private early access', 'on the list']) {
    assert.ok(!index.includes(w), w + ' survives in index.html');
  }
  assert.ok(count(rawIndex, /PROVISIONAL \(Nicole\)/g) >= 3, 'fewer than three PROVISIONAL flags — a FLOOR: the two notes and the bottom sub carry copy');
  // each replacement site carries its flag within its own element or immediately before it
  for (const re of [/<!-- PROVISIONAL \(Nicole\) -->\s*<p class="cta-note">/g, /<!-- PROVISIONAL \(Nicole\) -->\s*<p class="hero-sub">/g, /<!-- PROVISIONAL \(Nicole\) -->\s*<a href="https:\/\/app\.elitr\.ai" data-cta="footer">/g]) {
    assert.ok(re.test(rawIndex), 'a replacement site without its PROVISIONAL flag: ' + re);
  }
  assert.strictEqual(count(rawIndex, /<!-- PROVISIONAL \(Nicole\) -->\s*<p class="cta-note">/g), 2, 'both cta-notes are flagged');
  assert.ok(!/font-style:italic; color:#6e7180; margin-top:22px/.test(rawIndex), 'the Sol section’s italic line survives');
});

test('G7 (decision 7) — one trial_cta_click push over [data-cta], the position from the anchor’s dataset; waitlist_signup is gone', () => {
  assert.ok(!index.includes('waitlist_signup'), 'waitlist_signup survives');
  const pushes = [...index.matchAll(/dataLayer\.push\(\{[\s\S]*?\}\)/g)].map((m) => m[0]).filter((p) => p.includes("'trial_cta_click'"));
  assert.strictEqual(pushes.length, 1, pushes.length + ' trial_cta_click pushes');
  const listener = fnBody(index, 'installTrialCtaEvents');
  assert.ok(listener.includes("querySelectorAll('a[data-cta]')") && listener.includes(pushes[0]), 'the push is not inside the listener attached over a[data-cta]');
  assert.match(pushes[0], /'cta_position': a\.dataset\.cta/, 'cta_position is not read from the anchor’s dataset');
  assert.match(pushes[0], /'elitr_variant'/, 'the variant does not ride the event');
  assert.ok(!/onclick=/.test(index), 'an onclick survives — one listener, not five');
  assert.match(index, /installTrialCtaEvents\(\);\s*\}\);/, 'the listener is not installed on DOMContentLoaded');
});

run('launch-guard.test.js');
