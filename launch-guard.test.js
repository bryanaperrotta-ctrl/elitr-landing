// launch-guard.test.js — brief 93: the launch page mirrors the product and carries no second source of
// truth. Seven decisions, seven guards, G-n to decision n. node:assert + the copied runner; reads
// index.html, privacy/index.html and terms/index.html from disk. Brief 94: the legal pages share one
// chrome (legal.css), /terms exists, and G5 reads the chrome, not the prose. Run: npm test
const { test, run } = require('./_test-runner');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = __dirname;
// brief 100 D7: the site's own addresses, in one list — G2's allowed set and G8 both read it
const ORIGIN = 'https://www.elitr.ai';
const PAGES = [['index.html', '/'], ['privacy/index.html', '/privacy'], ['terms/index.html', '/terms']];
const CANONICAL = new Map(PAGES.map(([file, p]) => [file, ORIGIN + p]));
const rawIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rawPrivacy = fs.readFileSync(path.join(ROOT, 'privacy', 'index.html'), 'utf8');
const rawTerms = fs.readFileSync(path.join(ROOT, 'terms', 'index.html'), 'utf8');

// ── strip ── HTML comments, and JS comments inside <script> (block and line). Asserted below.
function stripJs(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:\\'"])\/\/.*$/, '$1')).join('\n');
}
function strip(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (m, a, b, c) => a + stripJs(b) + c);
}
const index = strip(rawIndex), privacy = strip(rawPrivacy), terms = strip(rawTerms);
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
  assert.ok(/COPY \(Nicole 2026-09-29\) — the words/.test(rawIndex) && !/COPY \(Nicole 2026-09-29\) — the words/.test(index), 'the strip does not strip JS line comments');
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
  // brief 100 D7: the three canonicals join as exact hrefs, from CANONICAL — not a host in EXTERNAL_HOSTS,
  // which is matched by includes and would admit any path on the host
  const ALLOWED = new Set(['/', '/privacy', '/terms', '/legal.css', 'https://app.elitr.ai', 'mailto:support@elitr.ai', ...CANONICAL.values()]);
  const EXTERNAL_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'googletagmanager.com'];
  // pre-existing in /privacy's contact block (Jeff's, not this brief): privacy@, exactly once — G4 counts it.
  // 93-R1: the self-link to elitr.ai went with the line that carried it; an exemption for a thing that
  // no longer exists is a pardon, so every entry here must match an href in the file.
  const PRE_EXISTING_PRIVACY = new Set(['mailto:privacy@elitr.ai']);
  assert.deepStrictEqual([...PRE_EXISTING_PRIVACY], ['mailto:privacy@elitr.ai'], 'the privacy exemption grew — add an entry only for an href that exists, and say why');
  const privacyHrefs = new Set([...privacy.matchAll(/href="([^"]*)"/g)].map((m) => m[1]));
  for (const e of PRE_EXISTING_PRIVACY) assert.ok(privacyHrefs.has(e), 'PRE_EXISTING_PRIVACY entry matches no href in /privacy: ' + e + ' — a stale exemption');
  const hrefs = (src, file) => [...src.matchAll(/href="([^"]*)"/g)].map((m) => ({ href: m[1], file }));
  const all = hrefs(index, 'index.html').concat(hrefs(privacy, 'privacy/index.html'), hrefs(terms, 'terms/index.html'));
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
  assert.ok(!/<form\b/.test(index) && !/<form\b/.test(privacy) && !/<form\b/.test(terms), 'a form on the page');
  for (const f of ['index.html', 'privacy/index.html', 'terms/index.html']) assert.ok(all.some((h) => h.file === f && h.href === '/terms'), f + ' has no Terms link in its footer (brief 94 D5)');
});

test('G3 (decision 4) — the waitlist is gone: no endpoint, no form, no script, no email input', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'api')), 'api/ still exists — the unauthenticated sender is live');
  for (const w of ['handleWaitlist', 'scrollToForm', '/api/waitlist', 'cta-success', 'cta-form', 'type="email"']) {
    assert.ok(!index.includes(w) && !privacy.includes(w) && !terms.includes(w), w + ' survives in code');
  }
  assert.match(rawIndex, /The waitlist form and api\/waitlist\.js were removed at launch\s+\(brief 93\)/, 'the reason comment is gone');
});

test('G4 (decision 5) — one address: support@ everywhere, privacy@ once in /privacy, and no hello@, bryan@ or Cloudflare protection', () => {
  const mailtos = (s) => [...s.matchAll(/mailto:([^"'\s>]+)/g)].map((m) => m[1]);
  assert.deepStrictEqual(mailtos(index), ['support@elitr.ai', 'support@elitr.ai'], 'index.html does not carry exactly two support@ mailtos (nav, footer)');
  const pm = mailtos(privacy);
  assert.strictEqual(pm.filter((a) => a === 'privacy@elitr.ai').length, 1, 'privacy@ must appear exactly once in /privacy — an exemption that matches nothing is a stale exemption');
  assert.deepStrictEqual(pm.filter((a) => a !== 'privacy@elitr.ai'), ['support@elitr.ai', 'support@elitr.ai'], '/privacy’s other mailtos are not support@');
  // /terms (brief 94): legal@ is the notices and opt-out address (§14.1, §14.11, §18.4) and may appear; support@ may appear; nothing else
  const tm = mailtos(terms);
  assert.ok(tm.every((a) => a === 'support@elitr.ai' || a === 'legal@elitr.ai'), '/terms carries a mailto that is neither support@ nor legal@: ' + tm.join(', '));
  assert.ok(count(terms, /legal@elitr\.ai/g) >= 1, 'legal@ does not appear in /terms — the notices and opt-out address is missing');
  assert.ok(!index.includes('legal@') && !privacy.includes('legal@'), 'legal@ appears outside /terms');
  for (const w of ['hello@', 'bryan@', 'cdn-cgi', '__cf_email__']) assert.ok(!index.includes(w) && !privacy.includes(w) && !terms.includes(w), w + ' survives');
  // 93-R1 G-1: a contact line that points at the site the reader is already on is gone, with its sentence
  for (const w of ['https://elitr.ai', 'reach us at']) assert.ok(!privacy.includes(w), w + ' survives in /privacy');
});

// THE LAUNCH PREDECESSOR, FIXED (93-R1 decision 3; re-pointed by brief 94): the commit before brief 93
// touched this repo. It no longer anchors a prose diff — Jeff's rewrite of /privacy was the body change
// the old comment named — it anchors the CHROME: legal.css must equal, byte for byte, the <style> body
// that /privacy carried at this commit, plus the one list rule brief 94 added. A diff against HEAD would
// assert the file never changes again; this asserts the move was a move.
const LAUNCH_PREDECESSOR = 'f72829d';
const LIST_RULE = '\n    /* lists inside policy text (brief 94 D2, the one rule added with the move) */\n    .policy-text ol, .policy-text ul { margin: 0 0 16px 22px; }\n';

test('G5 (brief 94 D1/D2/D4) — the legal pages share one chrome: no inline style, one legal.css moved byte-for-byte, identical nav and footer, one date, no retired processor, eighteen anchored sections', () => {
  // (1) neither legal page carries a <style>; each links legal.css exactly once
  for (const [name, raw] of [['privacy', rawPrivacy], ['terms', rawTerms]]) {
    assert.ok(!/<style\b/.test(raw), '/' + name + ' carries an inline <style> — the chrome is legal.css');
    assert.strictEqual(count(raw, /href="\/legal\.css"/g), 1, '/' + name + ' does not link legal.css exactly once');
  }
  // (2) legal.css is the predecessor's <style> body plus the one list rule — the move was a move
  const cssPath = path.join(ROOT, 'legal.css');
  assert.ok(fs.existsSync(cssPath), 'legal.css is missing');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.trim().length > 0, 'legal.css is empty');
  assert.ok(css.includes(LIST_RULE), 'the one list rule brief 94 added is not in legal.css as written');
  let base;
  try { base = cp.execSync('git show ' + LAUNCH_PREDECESSOR + ':privacy/index.html', { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { console.log('      G5 (2) skipped: git unavailable (' + (e && e.message ? e.message.split('\n')[0] : e) + ') — the byte-for-byte claim is unverified this run'); base = null; }
  if (base) {
    const m = /\n  <style>\n([\s\S]*?)\n  <\/style>\n/.exec(base);
    assert.ok(m, 'the predecessor’s <style> body was not found');
    assert.strictEqual(css.replace(LIST_RULE, '').trim(), m[1].trim(), 'legal.css minus the list rule is not the predecessor’s <style> body — the move edited the CSS, which is a different brief');
  }
  // (3) the nav and footer blocks are byte-identical across the two legal pages
  const block = (raw, tag) => { const i = raw.indexOf('<' + tag + '>'), j = raw.indexOf('</' + tag + '>', i); assert.ok(i >= 0 && j > i, tag + ' block missing'); return raw.slice(i, j + tag.length + 3); };
  assert.strictEqual(block(rawPrivacy, 'nav'), block(rawTerms, 'nav'), 'the two legal pages’ <nav> blocks differ');
  assert.strictEqual(block(rawPrivacy, 'footer'), block(rawTerms, 'footer'), 'the two legal pages’ <footer> blocks differ');
  // (4) one date, typed once per page, the same on both, not 2025
  const meta = (raw) => { const m2 = /<p class="page-meta">([^<]*)<\/p>/.exec(raw); assert.ok(m2, 'page-meta missing'); return m2[1]; };
  const eff = (raw) => { const m2 = /Effective date: ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(meta(raw)); assert.ok(m2, 'no Effective date in page-meta'); return m2[1]; };
  assert.strictEqual(eff(rawPrivacy), eff(rawTerms), 'the two pages carry different effective dates');
  assert.ok(!/2025/.test(eff(rawPrivacy)), 'the effective date is in 2025');
  assert.strictEqual(count(rawPrivacy, /<p class="page-meta">/g), 1); assert.strictEqual(count(rawTerms, /<p class="page-meta">/g), 1);
  assert.ok(!/Effective date:/.test(privacy.replace(/<p class="page-meta">[^<]*<\/p>/, '')) && !/Effective date:/.test(terms.replace(/<p class="page-meta">[^<]*<\/p>/, '')), 'the effective date is typed a second time on a page');
  assert.ok(/Last updated: /.test(meta(rawPrivacy)) && !/Last updated/.test(meta(rawTerms)), 'the page-meta shapes moved');
  // (5) the retired processor and the one we never had are on no page
  for (const w of ['AwardWallet', 'seats.aero']) for (const [name, src] of [['index.html', index], ['privacy', privacy], ['terms', terms]]) assert.ok(!src.includes(w), w + ' survives in ' + name);
  // (6) every section anchor s-1 … s-18, exactly once
  for (let n = 1; n <= 18; n++) assert.strictEqual(count(rawTerms, new RegExp('id="s-' + n + '"', 'g')), 1, '/terms#s-' + n + ' is not exactly one anchor');
  assert.strictEqual(count(rawTerms, /id="s-\d+"/g), 18, 'a section anchor beyond s-18');
  assert.match(rawTerms, /<div class="policy-section" id="s-14">\s*<p class="section-label">Section 14<\/p>\s*<h2 class="section-heading">Binding Confidential Arbitration; Class-Action Waiver<\/h2>/, 'Section 14 is not the arbitration section — the app links /terms#s-14');
  assert.strictEqual(count(rawTerms, /<p><strong>PLEASE READ/g), 2, 'the two all-caps notices are not two');
  assert.ok(!/\[/.test(terms.replace(/<[^>]+>/g, '')) && !/\[/.test(privacy.replace(/<[^>]+>/g, '')), 'a bracket note survives in a legal page’s text');
});

test('G6 (decision 6; brief 98) — the early-access framing is gone, every replacement sentence carries its attribution, and no PROVISIONAL survives', () => {
  for (const w of ['early access', 'Early access', 'early development', 'waitlist', 'Request access', 'private early access', 'on the list']) {
    assert.ok(!index.includes(w), w + ' survives in index.html');
  }
  // brief 98: attribution was the property and the placeholder word retires — the same sites, the same floor,
  // now under COPY (…); Nicole's own sites carry her date, the two lines she has not seen carry "pending"
  assert.ok(count(rawIndex, /COPY \(/g) >= 3, 'fewer than three COPY markers — a FLOOR: the two notes and the bottom sub carry copy');
  assert.strictEqual(count(rawIndex, /PROVISIONAL/g), 0, 'a PROVISIONAL flag survives in index.html — the launch page copy is Nicole’s (brief 98)');
  for (const re of [/<!-- COPY \(Nicole 2026-09-29\) -->\s*<p class="cta-note">/g, /<!-- COPY \(Nicole 2026-09-29\) -->\s*<p class="hero-sub">/g, /<!-- COPY \(Nicole 2026-09-29\) -->\s*<a href="https:\/\/app\.elitr\.ai" data-cta="footer">/g]) {
    assert.ok(re.test(rawIndex), 'a replacement site without its attribution: ' + re);
  }
  assert.strictEqual(count(rawIndex, /<!-- COPY \(Nicole 2026-09-29\) -->\s*<p class="cta-note">/g), 2, 'both cta-notes are attributed');
  assert.strictEqual(count(rawIndex, /<!-- COPY \(pending Nicole\)/g), 2, 'the two lines she has not seen (the cut intro, the annual bullet) are not exactly two');
  // her strings, verbatim (brief 98)
  assert.strictEqual(count(index, /<p class="cta-note"><span data-trial-days><\/span> days free\. Cancel any time\.<\/p>/g), 2, 'the notes are not hers');
  assert.strictEqual(count(index, /data-cta="(top|pricing|pricing_monthly|pricing_annual|bottom)">Start <span data-trial-days><\/span> days free<\/a>/g), 5, 'the five trial buttons do not read Start N days free');
  assert.strictEqual(count(index, /<li>Cancel any time<\/li>/g), 2, 'both cards do not carry Cancel any time');
  assert.strictEqual(count(index, /<li>Founding price holds for as long as you stay<\/li>/g), 1, 'the founding promise is not on exactly one card');
  const annual = index.slice(index.indexOf('data-plan="founding_annual"'), index.indexOf('data-cta="pricing_annual"'));
  const monthly = index.slice(index.indexOf('data-plan="founding_monthly"'), index.indexOf('data-cta="pricing_monthly"'));
  assert.ok(/Founding price holds/.test(annual) && !/Founding price holds/.test(monthly), 'the promise is on the wrong card — it is true for the annual plan only (Terms §7.5)');
  assert.match(index, /<p class="pricing-intro">One membership, two ways to pay for it\. Sol reads your whole portfolio from day one\.<\/p>/, 'the intro is not the cut sentence');
  assert.ok(!/founding price holds for the life/i.test(index), 'the founding clause survives above both cards');
  assert.match(index, /' \/ month, billed once a year'/, 'the per-month line is not hers');
  assert.match(rawIndex, /<title>Elitr — Sol reads your points, your cards, and what's closing this week<\/title>/);
  assert.match(rawIndex, /<meta property="og:title" content="Elitr — Sol reads your points, your cards, and what's closing this week" \/>/);
  assert.match(rawIndex, /<meta name="description" content="A travel intelligence platform for points-and-miles travelers\. Sol, your navigator, reads your programs and your cards and answers in specifics — what's showing, what's closing, and when it was read\." \/>/);
  assert.match(rawIndex, /<meta property="og:description" content="When a program devalues what you've saved, Sol reads what changed and what's still open — in specifics, with the time it was read\." \/>/);
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

test('G8 (brief 100) — a page names its own address: one canonical each, a sitemap and robots.txt that publish exactly those, and one Organization record on / only', () => {
  // every read here is RAW — the JSON-LD is a <script>, and the stripped copy has been through stripJs
  const RAW = new Map([['index.html', rawIndex], ['privacy/index.html', rawPrivacy], ['terms/index.html', rawTerms]]);
  // (1) one canonical per page, and it is that page's own address
  for (const [file] of PAGES) {
    const links = [...RAW.get(file).matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
    assert.strictEqual(count(RAW.get(file), /rel="canonical"/g), 1, file + ' does not carry exactly one rel="canonical"');
    assert.deepStrictEqual(links, [CANONICAL.get(file)], file + ' names an address that is not its own');
  }
  // (2) the sitemap lists the canonicals, all of them and nothing else, with no hand-typed date
  const smPath = path.join(ROOT, 'sitemap.xml');
  assert.ok(fs.existsSync(smPath), 'sitemap.xml is missing');
  const sm = fs.readFileSync(smPath, 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const canon = [...CANONICAL.values()];
  assert.strictEqual(locs.length, canon.length, 'sitemap.xml lists ' + locs.length + ' <loc>, not ' + canon.length);
  assert.deepStrictEqual([...new Set(locs)].sort(), [...canon].sort(), 'the sitemap’s <loc> set is not the canonical set');
  assert.ok(!/<lastmod>/.test(sm), 'a <lastmod> in sitemap.xml — a typed date goes stale (brief 100 D2)');
  // (3) robots.txt publishes the sitemap, once, at the file that exists
  const rbPath = path.join(ROOT, 'robots.txt');
  assert.ok(fs.existsSync(rbPath), 'robots.txt is missing');
  const sitemapLines = fs.readFileSync(rbPath, 'utf8').split('\n').filter((l) => /^Sitemap:/i.test(l));
  assert.strictEqual(sitemapLines.length, 1, 'robots.txt does not carry exactly one Sitemap: line');
  const smUrl = sitemapLines[0].replace(/^Sitemap:\s*/i, '').trim();
  assert.strictEqual(smUrl, ORIGIN + '/sitemap.xml', 'robots.txt points somewhere other than ' + ORIGIN + '/sitemap.xml');
  assert.ok(fs.existsSync(path.join(ROOT, smUrl.slice(ORIGIN.length))), 'the Sitemap: url is not the file at that path');
  // (4) one record, in one place
  const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  assert.strictEqual(count(rawIndex, LD), 1, 'index.html does not carry exactly one JSON-LD block');
  assert.strictEqual(count(rawPrivacy, /application\/ld\+json/g), 0, '/privacy carries JSON-LD — the organization is described in one place');
  assert.strictEqual(count(rawTerms, /application\/ld\+json/g), 0, '/terms carries JSON-LD — the organization is described in one place');
  const ld = JSON.parse([...rawIndex.matchAll(LD)][0][1]);
  const graph = ld['@graph'];
  // the positive companion: without it an empty graph would pass every check below
  assert.ok(Array.isArray(graph) && graph.length === 2, '@graph is not exactly two nodes');
  const org = graph.filter((n) => n['@type'] === 'Organization'), site = graph.filter((n) => n['@type'] === 'WebSite');
  assert.ok(org.length === 1 && site.length === 1, '@graph is not one Organization and one WebSite');
  const [O] = org, [W] = site;
  assert.strictEqual(O.url, CANONICAL.get('index.html')); assert.strictEqual(W.url, CANONICAL.get('index.html'));
  assert.strictEqual(W.publisher && W.publisher['@id'], O['@id'], 'the WebSite’s publisher is not the Organization');
  const decode = (t) => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const meta = /<meta name="description" content="([^"]*)"/.exec(rawIndex);
  assert.ok(meta, 'index.html has no description meta');
  const desc = decode(meta[1]);
  assert.strictEqual(O.description, desc, 'the Organization description is not the description meta — one canonical description (brief 100 D5)');
  assert.ok([...desc].length <= 200, 'the canonical description is ' + [...desc].length + ' characters — Reddit’s profile field holds 200');
  assert.deepStrictEqual(new Set((O.founder || []).map((f) => f.name)), new Set(['Bryan Perrotta', 'Nicole Perrotta']), 'the founders are not Bryan and Nicole');
  assert.strictEqual((O.founder || []).length, 2, 'not two founders');
  assert.deepStrictEqual(O.sameAs, ['https://www.linkedin.com/company/elitr-ai/']);
  assert.deepStrictEqual(W.alternateName, ['elitr.ai']);
  // NOT A PROHIBITION: no mark file exists yet. Brief 100-A adds the logo and flips this assertion.
  assert.ok(!('logo' in O), 'the Organization carries a logo — 100-A flips this assertion when the mark file exists');
  // (5) the What-is sentence, once (brief 100 D6 — the LinkedIn tagline)
  assert.strictEqual(count(rawIndex, /Elitr is a personal travel intelligence platform for sophisticated points and miles travelers\./g), 1, 'the What-is sentence is not on the page exactly once');
  // (6) the retired word
  for (const [file, raw] of RAW) assert.ok(!/strategist/i.test(raw), '"strategist" is back in ' + file);
});

run('launch-guard.test.js');
