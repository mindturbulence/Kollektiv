/**
 * Page measurement for "Clone a website" (CL-1). Two halves:
 *
 * - In-page scripts (strings run with page.evaluate in the sandboxed capture browser). They are plain JS
 *   strings because tsx compiles with keepNames, which wraps named inner functions in a `__name` helper
 *   that does not exist inside the page.
 * - `sanitizeMeasurements` (Node): the page's own JavaScript can tamper with anything the script reads,
 *   so the result is untrusted input. Every value is re-validated against a strict shape or dropped.
 */
import type {
  AssetInfo,
  AssetKind,
  FixedInfo,
  FontInfo,
  HoverRule,
  LinkInfo,
  PageMeasurements,
  SectionInfo,
  Tally,
  TextBlock,
  TypeSample,
} from '../src/schemas/cloneSite';

/**
 * Hides cookie/consent overlays and large fixed layers that would cover the screenshot (never by clicking:
 * a click on an untrusted page can navigate or submit). Marks them with data-k-hidden. Returns the count.
 */
export const HIDE_OVERLAYS_SCRIPT = String.raw`(function () {
  var vw = innerWidth, vh = innerHeight, n = 0;
  var all = document.body ? document.body.querySelectorAll('*') : [];
  for (var i = 0; i < all.length && i < 8000; i++) {
    var el = all[i], s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    var r = el.getBoundingClientRect();
    var hint = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('role') || '')).toLowerCase();
    // Class names are often obfuscated, so a small fixed box is also judged by its own wording.
    var words = (el.innerText || '').slice(0, 400).toLowerCase();
    var consent = /cookie|consent|gdpr|cmp|onetrust|didomi|usercentrics|privacy-banner/.test(hint)
      || (r.height < vh * 0.6 && /cookie|consent|gdpr/.test(words) && /accept|agree|reject|allow|ok\b|got it/.test(words));
    var cover = s.position === 'fixed' && (r.width * r.height) / (vw * vh) > 0.25 && !(r.top <= 0 && r.height < 160);
    if (consent || cover) {
      el.setAttribute('data-k-hidden', consent ? 'consent' : 'cover');
      el.style.setProperty('display', 'none', 'important');
      n++;
    }
  }
  if (n) {
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    if (document.body) document.body.style.setProperty('overflow', 'auto', 'important');
  }
  return n;
})()`;

/**
 * Measures the page. Reads stylesheet texts collected from network responses from window.__kCss (set just
 * before; cross-origin sheets throw on cssRules, so they are re-parsed here with CSSStyleSheet.replaceSync).
 * Returns raw values; never URLs.
 */
export const MEASURE_SCRIPT = String.raw`(function () {
  var cssTexts = window.__kCss || [];
  try { delete window.__kCss; } catch (e) {}
  var doc = document, root = doc.documentElement, body = doc.body;
  var vw = innerWidth, vh = innerHeight, sx = scrollX, sy = scrollY;
  var docW = root.scrollWidth;
  function cs(el) { return getComputedStyle(el); }
  function rect(el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.left + sx), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) }; }
  function bump(m, k, n) { if (!k) return; m[k] = (m[k] || 0) + (n || 1); }
  function top(m, n) { return Object.keys(m).map(function (k) { return [k, Math.round(m[k])]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, n); }
  function rgb(s) { var m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  function lum(c) { function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
  function bgOf(el) { for (var e = el; e && e.nodeType === 1; e = e.parentElement) { var c = rgb(cs(e).backgroundColor); if (c && c.a > 0.5) return { c: c, s: cs(e).backgroundColor }; } return { c: { r: 255, g: 255, b: 255, a: 1 }, s: 'rgb(255, 255, 255)' }; }
  function shown(el) {
    if (el.closest('[aria-hidden="true"],[data-k-hidden]')) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.right + sx <= 0 || r.left + sx >= docW || r.bottom + sy <= 0) return false;
    return true;
  }
  function readable(el) {
    var s = cs(el);
    if (parseFloat(s.fontSize) < 4) return false;
    var c = rgb(s.color); if (!c || c.a < 0.15) return false;
    var b = bgOf(el).c, l1 = lum(c), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) >= 1.15;
  }
  function ownText(el) { var t = ''; for (var i = 0; i < el.childNodes.length; i++) { var n = el.childNodes[i]; if (n.nodeType === 3) t += n.nodeValue; } return t.replace(/\s+/g, ' ').trim(); }
  function fullText(el) { return (el.innerText || '').replace(/\s+/g, ' ').trim(); }

  // ---- element sweep: colours, radii, spacing, widths, shadows, motion
  var colText = {}, colBg = {}, colBorder = {}, radii = {}, spacing = {}, maxW = {}, shadows = {}, trans = {}, anims = {};
  var fixed = [];
  var els = body ? body.querySelectorAll('*') : [];
  var limit = Math.min(els.length, 6000);
  for (var i = 0; i < limit; i++) {
    var el = els[i];
    if (!shown(el)) continue;
    var s = cs(el), r = el.getBoundingClientRect();
    var t = ownText(el);
    if (t) bump(colText, s.color, t.length);
    var bgc = rgb(s.backgroundColor);
    if (bgc && bgc.a > 0) bump(colBg, s.backgroundColor, (r.width * r.height) / 1000);
    if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') bump(colBorder, s.borderTopColor);
    if (s.borderTopLeftRadius !== '0px') bump(radii, s.borderTopLeftRadius);
    if (s.paddingTop !== '0px') bump(spacing, s.paddingTop);
    if (s.paddingLeft !== '0px') bump(spacing, s.paddingLeft);
    if (s.rowGap && s.rowGap !== 'normal' && s.rowGap !== '0px') bump(spacing, s.rowGap);
    if (s.maxWidth !== 'none' && /px$/.test(s.maxWidth)) bump(maxW, s.maxWidth);
    if (s.boxShadow !== 'none') bump(shadows, s.boxShadow);
    if (s.transitionDuration && s.transitionDuration !== '0s') bump(trans, s.transitionDuration.split(',')[0].trim() + ' ' + s.transitionTimingFunction.split(',')[0].trim());
    if (s.animationName && s.animationName !== 'none') bump(anims, s.animationName.split(',')[0].trim());
    if ((s.position === 'fixed' || s.position === 'sticky') && fixed.length < 12) {
      var rr = rect(el); fixed.push({ position: s.position, y: rr.y, height: rr.h, background: s.backgroundColor, hiddenForCapture: false });
    }
  }
  var hid = doc.querySelectorAll('[data-k-hidden]');
  for (var h = 0; h < hid.length && fixed.length < 16; h++) fixed.push({ position: 'fixed', y: 0, height: 0, background: '', hiddenForCapture: true });

  // ---- typography by role
  var roles = [['h1', 'h1'], ['h2', 'h2'], ['h3', 'h3'], ['h4', 'h4'], ['body', 'p'], ['link', 'main a, a'], ['button', 'button, [role=button], a[class*=btn], a[class*=button]'], ['nav', 'nav a, header a'], ['small', 'small, figcaption'], ['label', 'label']];
  var type = [];
  roles.forEach(function (pair) {
    var list = doc.querySelectorAll(pair[1]);
    for (var j = 0; j < list.length && j < 200; j++) {
      var e = list[j];
      if (!shown(e) || !fullText(e)) continue;
      var st = cs(e);
      type.push({ role: pair[0], family: st.fontFamily, weight: st.fontWeight, size: st.fontSize, lineHeight: st.lineHeight, letterSpacing: st.letterSpacing, transform: st.textTransform, color: st.color });
      break;
    }
  });

  // ---- fonts actually loaded
  var fontsLoaded = [];
  try { doc.fonts.forEach(function (f) { if (f.status === 'loaded' && fontsLoaded.length < 40) fontsLoaded.push({ family: f.family, weight: String(f.weight), style: f.style }); }); } catch (e) {}

  // ---- stylesheets: root custom properties, @font-face, @keyframes, hover/focus rules
  var rootVars = {}, fontFaces = [], keyframes = {}, hover = [];
  var HOVER_PROPS = ['color', 'background-color', 'border-color', 'box-shadow', 'transform', 'opacity', 'text-decoration-line', 'outline-color'];
  function walk(rules, depth) {
    if (!rules || depth > 4) return;
    for (var k = 0; k < rules.length; k++) {
      var rule = rules[k];
      try {
        if (rule.type === 1) {
          var sel = rule.selectorText || '';
          if (/(^|,)\s*(:root|html)\s*(,|$)/.test(sel)) {
            for (var p = 0; p < rule.style.length; p++) { var name = rule.style[p]; if (name.indexOf('--') === 0 && Object.keys(rootVars).length < 300) rootVars[name] = rule.style.getPropertyValue(name).trim(); }
          }
          if (/:hover|:focus/.test(sel) && hover.length < 60) {
            var props = {}, any = false;
            HOVER_PROPS.forEach(function (hp) { var v = rule.style.getPropertyValue(hp); if (v) { props[hp] = v.trim(); any = true; } });
            if (any) hover.push({ selector: sel, props: props });
          }
        } else if (rule.type === 5 && fontFaces.length < 40) {
          fontFaces.push({ family: rule.style.getPropertyValue('font-family'), weight: rule.style.getPropertyValue('font-weight') || '400', style: rule.style.getPropertyValue('font-style') || 'normal' });
        } else if (rule.type === 7) {
          bump(keyframes, rule.name);
        } else if (rule.cssRules) {
          walk(rule.cssRules, depth + 1);
        }
      } catch (e) {}
    }
  }
  for (var q = 0; q < doc.styleSheets.length; q++) { try { walk(doc.styleSheets[q].cssRules, 0); } catch (e) {} }
  for (var c2 = 0; c2 < cssTexts.length; c2++) {
    try { var sheet = new CSSStyleSheet(); sheet.replaceSync(cssTexts[c2]); walk(sheet.cssRules, 0); } catch (e) {}
  }
  var rootStyle = cs(root);
  for (var v = 0; v < rootStyle.length; v++) { var vn = rootStyle[v]; if (vn.indexOf('--') === 0 && !(vn in rootVars) && Object.keys(rootVars).length < 300) rootVars[vn] = rootStyle.getPropertyValue(vn).trim(); }

  // ---- sections: descend through single-child wrappers, split wide multi-child containers
  function bigKids(el) {
    var out = [];
    for (var m = 0; m < el.children.length; m++) {
      var ch = el.children[m];
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META)$/.test(ch.tagName) || !shown(ch)) continue;
      var rr = ch.getBoundingClientRect();
      if (rr.width >= vw * 0.6 && rr.height >= 40) out.push(ch);
    }
    return out;
  }
  function expand(el, depth) {
    var kids = bigKids(el);
    if (depth > 6 || kids.length === 0) return [el];
    if (kids.length === 1) return expand(kids[0], depth + 1);
    var out = [];
    // A <main>, or any block taller than two screens that holds wide blocks itself, is a wrapper: split it too.
    kids.forEach(function (k2) {
      var tall = k2.getBoundingClientRect().height > vh * 2 && bigKids(k2).length > 0;
      if (k2.tagName === 'MAIN' || tall) out = out.concat(expand(k2, depth + 1)); else out.push(k2);
    });
    return out;
  }
  var sectionEls = body ? expand(body, 0).slice(0, 40) : [];
  if (sectionEls.length === 1 && sectionEls[0] === body) sectionEls = [];
  function sectionOf(el) { for (var z = 0; z < sectionEls.length; z++) if (sectionEls[z].contains(el)) return z; return -1; }
  function columns(sec) {
    var best = 1, conts = [sec].concat([].slice.call(sec.querySelectorAll('*')));
    for (var a = 0; a < conts.length && a < 1500; a++) {
      var d = cs(conts[a]).display;
      if (d.indexOf('flex') === -1 && d.indexOf('grid') === -1) continue;
      var rows = {};
      for (var b = 0; b < conts[a].children.length; b++) {
        var kid = conts[a].children[b]; if (!shown(kid)) continue;
        var kr = kid.getBoundingClientRect(); if (kr.height < 40) continue;
        bump(rows, String(Math.round(kr.top / 8)));
      }
      Object.keys(rows).forEach(function (key) { if (rows[key] > best) best = rows[key]; });
    }
    return Math.min(best, 12);
  }
  var sections = sectionEls.map(function (sec, idx) {
    var rr = rect(sec), hd = sec.querySelector('h1, h2, h3, h4');
    function count(sel) { var n2 = 0, l = sec.querySelectorAll(sel); for (var w = 0; w < l.length && w < 500; w++) if (shown(l[w])) n2++; return n2; }
    return {
      index: idx, tag: sec.tagName.toLowerCase(), role: sec.getAttribute('role') || '',
      y: rr.y, height: rr.h, background: bgOf(sec).s,
      heading: hd && shown(hd) ? fullText(hd).slice(0, 160) : '',
      counts: { headings: count('h1,h2,h3,h4,h5,h6'), paragraphs: count('p'), buttons: count('button,[role=button]'), links: count('a[href]'), images: count('img,svg,video,picture'), inputs: count('input,textarea,select') },
      columns: columns(sec)
    };
  });

  // ---- same-origin links in nav/header and footer (paths only)
  function links(sel) {
    var out = [], seen = {}, l = doc.querySelectorAll(sel);
    for (var w = 0; w < l.length && out.length < 40; w++) {
      var a = l[w]; if (!shown(a)) continue;
      var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { continue; }
      if (u.origin !== location.origin || seen[u.pathname]) continue;
      seen[u.pathname] = 1;
      out.push({ path: u.pathname, label: (fullText(a) || a.getAttribute('aria-label') || '').slice(0, 80) });
    }
    return out;
  }
  var nav = links('header a[href], nav a[href], [role=banner] a[href]');
  var footer = links('footer a[href], [role=contentinfo] a[href]');

  // ---- assets (shape and place only)
  var assets = [];
  function inHeader(el) { return !!el.closest('header, nav, [role=banner]'); }
  function addAsset(a) { if (assets.length < 80) assets.push(a); }
  var imgs = doc.querySelectorAll('img');
  for (var g = 0; g < imgs.length; g++) {
    var im = imgs[g]; if (!shown(im)) continue; var ir = rect(im), ist = cs(im);
    var kind = ir.w <= 48 && ir.h <= 48 ? 'icon' : (inHeader(im) && ir.h <= 120 ? 'logo' : 'photo');
    addAsset({ kind: kind, section: sectionOf(im), x: ir.x, y: ir.y, width: ir.w, height: ir.h, naturalWidth: im.naturalWidth, naturalHeight: im.naturalHeight, objectFit: ist.objectFit, alt: (im.getAttribute('alt') || '').slice(0, 160) });
  }
  var svgs = doc.querySelectorAll('svg');
  for (var g2 = 0; g2 < svgs.length; g2++) {
    var sv = svgs[g2]; if (sv.parentElement && sv.parentElement.closest('svg')) continue; if (!shown(sv)) continue;
    var vr = rect(sv); if (vr.w < 16 || vr.h < 16) continue;
    addAsset({ kind: vr.w <= 48 && vr.h <= 48 ? 'icon' : (inHeader(sv) && vr.h <= 120 ? 'logo' : 'illustration'), section: sectionOf(sv), x: vr.x, y: vr.y, width: vr.w, height: vr.h, alt: (sv.getAttribute('aria-label') || '').slice(0, 160) });
  }
  var vids = doc.querySelectorAll('video');
  for (var g3 = 0; g3 < vids.length; g3++) {
    var vd = vids[g3]; if (!shown(vd)) continue; var dr = rect(vd);
    addAsset({ kind: 'video', section: sectionOf(vd), x: dr.x, y: dr.y, width: dr.w, height: dr.h, naturalWidth: vd.videoWidth, naturalHeight: vd.videoHeight, objectFit: cs(vd).objectFit, autoplay: vd.autoplay, loop: vd.loop });
  }
  var canv = doc.querySelectorAll('canvas');
  for (var g4 = 0; g4 < canv.length; g4++) { var cv = canv[g4]; if (!shown(cv)) continue; var cr = rect(cv); if (cr.w * cr.h < 10000) continue; addAsset({ kind: 'canvas', section: sectionOf(cv), x: cr.x, y: cr.y, width: cr.w, height: cr.h }); }
  for (var g5 = 0; g5 < limit; g5++) {
    var be = els[g5]; var bs = cs(be);
    if (bs.backgroundImage.indexOf('url(') === -1 || !shown(be)) continue;
    var br = rect(be); if (br.w * br.h < 20000) continue;
    addAsset({ kind: 'background', section: sectionOf(be), x: br.x, y: br.y, width: br.w, height: br.h, objectFit: bs.backgroundSize });
  }

  // ---- visible, readable text by section (the clone's copy; untrusted)
  // Any element holding text itself (cards often put copy straight into a div), in document order.
  var text = [], budget = 12000;
  for (var y2 = 0; y2 < limit && budget > 0 && text.length < 400; y2++) {
    var te = els[y2]; if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|svg)$/i.test(te.tagName)) continue;
    var own = ownText(te);
    if (!own || !shown(te) || !readable(te)) continue;
    var val = own.slice(0, 400); budget -= val.length;
    text.push({ section: sectionOf(te), tag: te.tagName.toLowerCase(), text: val });
  }

  // ---- platform / library hints (booleans only)
  var gen = (doc.querySelector('meta[name=generator]') || { content: '' }).content || '';
  var scripts = [].slice.call(doc.scripts).map(function (sc) { return sc.src || ''; }).join(' ');
  var twCount = 0;
  for (var tw = 0; tw < limit && tw < 3000; tw++) { var cn = els[tw].getAttribute('class') || ''; if (/(^|\s)(px|py|mt|mb|gap|text|bg|rounded)-[\w\[\].\/-]+/.test(cn)) twCount++; }
  var tech = {
    next: !!(window.__NEXT_DATA__ || doc.getElementById('__next') || /\/_next\//.test(scripts)),
    nuxt: !!(window.__NUXT__ || doc.getElementById('__nuxt')),
    framer: !!doc.querySelector('[data-framer-name], [data-framer-component-type]') || /framer/i.test(gen),
    webflow: !!(root.getAttribute('data-wf-site') || window.Webflow) || /webflow/i.test(gen),
    wordpress: /wordpress/i.test(gen) || /\/wp-content\//.test(scripts),
    wix: /wix/i.test(gen),
    squarespace: /squarespace/i.test(gen),
    shopify: !!window.Shopify,
    astro: /astro/i.test(gen) || !!doc.querySelector('astro-island'),
    gatsby: !!doc.getElementById('___gatsby'),
    react: !!(doc.querySelector('[data-reactroot]') || window.React || doc.getElementById('root')),
    vue: !!(window.Vue || doc.querySelector('[data-v-app]')),
    svelte: !!doc.querySelector('[class*="svelte-"]'),
    gsap: !!window.gsap,
    lenis: !!(window.lenis || root.classList.contains('lenis')),
    swiper: !!(window.Swiper || doc.querySelector('.swiper')),
    three: !!window.THREE,
    lottie: !!(window.lottie || doc.querySelector('lottie-player, dotlottie-player')),
    tailwind: twCount > 40
  };

  return {
    viewport: { width: vw, height: vh }, scrollHeight: root.scrollHeight, lang: root.getAttribute('lang') || '',
    colors: { text: top(colText, 12), background: top(colBg, 12), border: top(colBorder, 8) },
    rootVars: Object.keys(rootVars).map(function (k) { return [k, rootVars[k]]; }),
    type: type, fontsLoaded: fontsLoaded, fontFaces: fontFaces,
    radii: top(radii, 8), spacing: top(spacing, 12), maxWidths: top(maxW, 6), shadows: top(shadows, 6),
    sections: sections, nav: nav, footer: footer, assets: assets, text: text,
    motion: { transitions: top(trans, 8), animations: top(anims, 8), keyframes: Object.keys(keyframes).slice(0, 30) },
    hover: hover, fixed: fixed, tech: tech
  };
})()`;

// ---------------------------------------------------------------------------------------------------------
// Sanitizer (Node). Input is whatever the page returned; output only holds values that pass a strict shape.

const LIMITS = { tally: 12, rootVars: 200, fonts: 40, sections: 40, links: 40, assets: 80, text: 400, hover: 40, fixed: 16 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown, max = 1_000_000): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.max(-max, Math.min(max, Math.round(n))) : 0;
};
/** Free text (page copy): control characters stripped, whitespace collapsed, capped. */
/** Control, zero-width, bidi-override and BOM characters (built from code points so no invisible character sits in this file). */
const INVISIBLE = new RegExp(
  `[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]]
    .map(([a, b]) => `\\u${a.toString(16).padStart(4, '0')}-\\u${b.toString(16).padStart(4, '0')}`)
    .join('')}]`,
  'g',
);
const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Computed colours: `rgb()/rgba()`, `#hex`, `transparent` → lowercase `#rrggbb` / `#rrggbbaa`; `oklch()`, `color()` etc.
 *  kept as written when they hold only numbers and known keywords; anything else ''. */
export function normalizeColor(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) return s;
  if (s === 'transparent') return '#00000000';
  // Chrome keeps oklch()/lab()/color(display-p3 …) authored colours in that notation: numbers and known keywords only.
  if (/^(oklch|oklab|lab|lch|hsla?|color)\((\s*(srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65|none|-?[\d.]+(e-?\d+)?(%|deg)?|\/|,)\s*)+\)$/.test(s)) return s;
  const m =/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (!m) return '';
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  const base = `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}`;
  return a >= 1 ? base : `${base}${hex2(a * 255)}`;
}

const LENGTH = /^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch)$/;
const isLength = (v: string) => LENGTH.test(v) || v === '0';
const isLengthList = (v: string) => v.split(/\s+/).every(isLength);
const DURATION_EASE = /^\d+(\.\d+)?m?s (ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)|steps\(\d+(, ?(start|end|jump-\w+))?\))$/;
const IDENT = /^[a-z_][\w-]{0,59}$/i;
const FAMILY = /^[a-z0-9][a-z0-9 _-]{0,62}$/i;
/** Selector characters only; no braces, semicolons, backslashes or url(). */
const SELECTOR = /^[\w\s.#:>+~*=,"'()[\]|^$-]{1,160}$/;

/** Box shadows: lengths, colours and `inset` only. */
function isShadow(v: string): boolean {
  if (v.length > 200 || /url\(|var\(/i.test(v)) return false;
  const stripped = v.replace(/rgba?\([^)]*\)/gi, '').replace(/#[0-9a-f]{3,8}/gi, '');
  return /^[\s\d.,%a-z-]*$/i.test(stripped) && stripped.split(/[\s,]+/).filter(Boolean).every((t) => isLength(t) || t === 'inset');
}

/** Values allowed for a root custom property: a colour, a length list, a number, a duration/easing or a font list. */
function isTokenValue(v: string): boolean {
  if (!v || v.length > 120) return false;
  if (normalizeColor(v)) return true;
  if (/^-?\d+(\.\d+)?$/.test(v) || isLengthList(v)) return true;
  if (/^\d+(\.\d+)?m?s$/.test(v) || /^cubic-bezier\([\d.,\s-]+\)$/.test(v)) return true;
  // A font token must look like a real stack (a fallback list or a generic family), so a bare phrase such as
  // "ignore previous instructions" does not pass as a three-word family name.
  const fonts = fontList(v);
  const isStack = fonts.length > 1 || fonts.some((f) => GENERIC_FAMILY.test(f));
  return isStack && v.split(',').length === fonts.length;
}

const GENERIC_FAMILY = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|emoji|math|fangsong)$/i;

/** `"Inter Variable", Inter, sans-serif` → ['Inter Variable', 'Inter', 'sans-serif']; entries that fail FAMILY are dropped. */
export function fontList(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  return v
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, '').trim())
    .filter((f) => FAMILY.test(f) && f.split(' ').length <= 5)
    .slice(0, 6);
}

function tally(v: unknown, accept: (s: string) => string | null, max: number = LIMITS.tally): Tally[] {
  const out = new Map<string, number>();
  for (const entry of arr(v)) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
    const key = accept(entry[0].trim());
    if (key) out.set(key, (out.get(key) ?? 0) + Math.max(0, int(entry[1])));
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
}

const colorTally = (v: unknown) => tally(v, (s) => normalizeColor(s) || null);

const SECTION_ROLES = new Set(['banner', 'navigation', 'main', 'contentinfo', 'region', 'complementary', 'search', 'form', '']);
const TAG = /^[a-z][a-z0-9-]{0,30}$/;
const TYPE_ROLES = new Set(['h1', 'h2', 'h3', 'h4', 'body', 'link', 'button', 'nav', 'small', 'label']);
const ASSET_KINDS = new Set<AssetKind>(['photo', 'logo', 'icon', 'illustration', 'background', 'video', 'canvas']);
const OBJECT_FIT = /^(fill|contain|cover|none|scale-down|auto|contain|cover|[\d.]+(px|%)( [\d.]+(px|%))?|auto [\d.]+(px|%)|[\d.]+(px|%) auto)$/;
const HOVER_PROP_NAMES = new Set(['color', 'background-color', 'border-color', 'box-shadow', 'transform', 'opacity', 'text-decoration-line', 'outline-color']);
const TECH_NAMES: Record<string, string> = {
  next: 'Next.js', nuxt: 'Nuxt', framer: 'Framer', webflow: 'Webflow', wordpress: 'WordPress', wix: 'Wix',
  squarespace: 'Squarespace', shopify: 'Shopify', astro: 'Astro', gatsby: 'Gatsby', react: 'React', vue: 'Vue',
  svelte: 'Svelte', gsap: 'GSAP', lenis: 'Lenis', swiper: 'Swiper', three: 'three.js', lottie: 'Lottie', tailwind: 'Tailwind CSS',
};

function hoverValue(prop: string, v: string): boolean {
  if (prop.endsWith('color')) return !!normalizeColor(v);
  if (prop === 'box-shadow') return v === 'none' || isShadow(v);
  if (prop === 'opacity') return /^(0|1|0?\.\d+)$/.test(v);
  if (prop === 'text-decoration-line') return /^(none|underline|overline|line-through)$/.test(v);
  if (prop === 'transform') return v === 'none' || /^((translate[xyz3d]*|scale[xyz3d]*|rotate[xyz3d]*|skew[xy]?)\([\d.,\s%a-z-]*\)\s*)+$/i.test(v);
  return false;
}

function link(v: unknown): LinkInfo | null {
  if (!isObj(v) || typeof v.path !== 'string') return null;
  const path = v.path.trim();
  // Same-origin path only: starts with one slash, no scheme-relative `//`, no control characters or backslashes.
  if (!/^\/(?!\/)[^\s\\\u0000-\u001f]{0,199}$/.test(path)) return null;
  return { path, label: clean(v.label, 80) };
}

function font(v: unknown): FontInfo | null {
  if (!isObj(v)) return null;
  const family = fontList(v.family)[0];
  if (!family) return null;
  const weight = typeof v.weight === 'string' && /^(\d{3}( \d{3})?|normal|bold)$/.test(v.weight.trim()) ? v.weight.trim() : '400';
  const style = typeof v.style === 'string' && /^(normal|italic|oblique)/.test(v.style.trim()) ? v.style.trim().split(' ')[0] : 'normal';
  return { family, weight, style };
}

function dedupeFonts(list: unknown): FontInfo[] {
  const seen = new Set<string>();
  const out: FontInfo[] = [];
  for (const f of arr(list).map(font)) {
    if (!f) continue;
    const key = `${f.family}|${f.weight}|${f.style}`;
    if (!seen.has(key) && out.length < LIMITS.fonts) { seen.add(key); out.push(f); }
  }
  return out;
}

/** Validates the raw object MEASURE_SCRIPT returned. Never throws; unknown or malformed parts become empty. */
export function sanitizeMeasurements(raw: unknown): PageMeasurements {
  const r = isObj(raw) ? raw : {};
  const colors = isObj(r.colors) ? r.colors : {};
  const motion = isObj(r.motion) ? r.motion : {};
  const viewport = isObj(r.viewport) ? r.viewport : {};

  const type: TypeSample[] = arr(r.type).flatMap((t) => {
    if (!isObj(t) || typeof t.role !== 'string' || !TYPE_ROLES.has(t.role)) return [];
    const lineHeight = typeof t.lineHeight === 'string' && (t.lineHeight === 'normal' || isLength(t.lineHeight)) ? t.lineHeight : 'normal';
    const letterSpacing = typeof t.letterSpacing === 'string' && (t.letterSpacing === 'normal' || isLength(t.letterSpacing)) ? t.letterSpacing : 'normal';
    const transform = typeof t.transform === 'string' && /^(none|uppercase|lowercase|capitalize)$/.test(t.transform) ? t.transform : 'none';
    return [{ role: t.role, family: fontList(t.family), weight: int(t.weight, 1000), sizePx: int(t.size, 1000), lineHeight, letterSpacing, transform, color: normalizeColor(t.color) }];
  });

  const sections: SectionInfo[] = arr(r.sections).slice(0, LIMITS.sections).flatMap((s, i) => {
    if (!isObj(s)) return [];
    const c = isObj(s.counts) ? s.counts : {};
    const tag = typeof s.tag === 'string' && TAG.test(s.tag) ? s.tag : 'div';
    const role = typeof s.role === 'string' && SECTION_ROLES.has(s.role) ? s.role : '';
    return [{
      index: i, tag, role, y: int(s.y), height: int(s.height), background: normalizeColor(s.background), heading: clean(s.heading, 160),
      counts: { headings: int(c.headings, 999), paragraphs: int(c.paragraphs, 999), buttons: int(c.buttons, 999), links: int(c.links, 999), images: int(c.images, 999), inputs: int(c.inputs, 999) },
      columns: Math.max(1, int(s.columns, 12)),
    }];
  });
  const sectionIndex = (v: unknown) => { const n = int(v, 1000); return n >= 0 && n < sections.length ? n : -1; };

  const assets: AssetInfo[] = arr(r.assets).slice(0, LIMITS.assets).flatMap((a) => {
    if (!isObj(a) || !ASSET_KINDS.has(a.kind as AssetKind)) return [];
    const out: AssetInfo = { kind: a.kind as AssetKind, section: sectionIndex(a.section), x: int(a.x), y: int(a.y), width: int(a.width), height: int(a.height) };
    if (a.naturalWidth !== undefined) out.naturalWidth = int(a.naturalWidth);
    if (a.naturalHeight !== undefined) out.naturalHeight = int(a.naturalHeight);
    if (typeof a.objectFit === 'string' && OBJECT_FIT.test(a.objectFit.trim())) out.objectFit = a.objectFit.trim();
    const alt = clean(a.alt, 160);
    if (alt) out.alt = alt;
    if (typeof a.autoplay === 'boolean') out.autoplay = a.autoplay;
    if (typeof a.loop === 'boolean') out.loop = a.loop;
    return [out];
  });

  const text: TextBlock[] = arr(r.text).slice(0, LIMITS.text).flatMap((t) => {
    if (!isObj(t) || typeof t.tag !== 'string' || !TAG.test(t.tag)) return [];
    const value = clean(t.text, 400);
    return value ? [{ section: sectionIndex(t.section), tag: t.tag, text: value }] : [];
  });

  const hover: HoverRule[] = arr(r.hover).flatMap((h) => {
    if (!isObj(h) || typeof h.selector !== 'string' || !isObj(h.props)) return [];
    const selector = h.selector.trim();
    if (!SELECTOR.test(selector)) return [];
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(h.props)) {
      if (HOVER_PROP_NAMES.has(k) && typeof v === 'string' && hoverValue(k, v.trim())) props[k] = k.endsWith('color') ? normalizeColor(v) : v.trim();
    }
    return Object.keys(props).length ? [{ selector, props }] : [];
  }).slice(0, LIMITS.hover);

  const fixed: FixedInfo[] = arr(r.fixed).slice(0, LIMITS.fixed).flatMap((f) =>
    isObj(f) && (f.position === 'fixed' || f.position === 'sticky')
      ? [{ position: f.position, y: int(f.y), height: int(f.height), background: normalizeColor(f.background), hiddenForCapture: f.hiddenForCapture === true }]
      : []);

  const techRaw = isObj(r.tech) ? r.tech : {};
  const tech = Object.keys(TECH_NAMES).filter((k) => techRaw[k] === true).map((k) => TECH_NAMES[k]);

  const rootVars: [string, string][] = arr(r.rootVars).flatMap((e) => {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || typeof e[1] !== 'string') return [];
    const [name, value] = [e[0].trim(), e[1].trim()];
    return /^--[\w-]{1,60}$/.test(name) && isTokenValue(value) ? [[name, normalizeColor(value) || value] as [string, string]] : [];
  }).slice(0, LIMITS.rootVars);

  const uniqueLinks = (v: unknown) => {
    const seen = new Set<string>();
    return arr(v).map(link).filter((l): l is LinkInfo => !!l && !seen.has(l.path) && !!seen.add(l.path)).slice(0, LIMITS.links);
  };

  return {
    viewport: { width: int(viewport.width, 10_000), height: int(viewport.height, 10_000) },
    scrollHeight: int(r.scrollHeight),
    lang: typeof r.lang === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(r.lang) ? r.lang : '',
    colors: { text: colorTally(colors.text), background: colorTally(colors.background), border: colorTally(colors.border) },
    rootVars,
    type,
    fontsLoaded: dedupeFonts(r.fontsLoaded),
    fontFaces: dedupeFonts(r.fontFaces),
    radii: tally(r.radii, (s) => (isLengthList(s) ? s : null), 8),
    spacing: tally(r.spacing, (s) => (isLength(s) ? s : null)),
    maxWidths: tally(r.maxWidths, (s) => (/^\d+(\.\d+)?px$/.test(s) ? s : null), 6),
    shadows: tally(r.shadows, (s) => (isShadow(s) ? s : null), 6),
    sections,
    nav: uniqueLinks(r.nav),
    footer: uniqueLinks(r.footer),
    assets,
    text,
    motion: {
      transitions: tally(motion.transitions, (s) => (DURATION_EASE.test(s) ? s : null), 8),
      animations: tally(motion.animations, (s) => (IDENT.test(s) ? s : null), 8),
      keyframes: arr(motion.keyframes).filter((k): k is string => typeof k === 'string' && IDENT.test(k)).slice(0, 30),
    },
    hover,
    fixed,
    tech,
  };
}
