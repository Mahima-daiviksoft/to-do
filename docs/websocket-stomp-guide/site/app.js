(function () {
'use strict';

// ------------------------------------------------------------------ utilities
var $ = function (sel, root) { return (root || document).querySelector(sel); };
var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
var META = JSON.parse(document.getElementById('metaData').textContent);
var CARDS = JSON.parse(document.getElementById('cardData').textContent);
var BY_ID = {}; META.forEach(function (m, i) { m.index = i; BY_ID[m.id] = m; });
var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function h(tag, attrs, children) {
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (k === 'text') el.textContent = attrs[k];
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
    else el.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
var store = {
  get: function (k, d) { try { var v = localStorage.getItem('wsbook:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('wsbook:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
var toastTimer;
function toast(msg) {
  var t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
}
function copyText(text, btn) {
  function done(ok) { if (btn) { btn.textContent = ok ? 'Copied' : 'Select & copy'; btn.classList.toggle('ok', ok); setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 1500); } }
  try {
    navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
  } catch (e) { done(false); }
}

// ------------------------------------------------------------------ preferences
var themeOrder = ['auto', 'light', 'dark'];
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
var theme = store.get('theme', null);
if (theme) applyTheme(theme);
$('#themeBtn').addEventListener('click', function () {
  var cur = theme || 'auto';
  theme = themeOrder[(themeOrder.indexOf(cur) + 1) % 3];
  applyTheme(theme); store.set('theme', theme);
  toast(theme === 'auto' ? 'Theme: follows your system' : 'Theme: ' + theme);
});
var sizes = ['m', 'l', 's'];
var size = store.get('size', 'm');
document.documentElement.setAttribute('data-size', size);
$('#sizeBtn').addEventListener('click', function () {
  size = sizes[(sizes.indexOf(size) + 1) % 3];
  document.documentElement.setAttribute('data-size', size); store.set('size', size);
  toast('Text size: ' + ({ s: 'small', m: 'medium', l: 'large' })[size]);
});

// ------------------------------------------------------------------ progress
var done = store.get('done', {});      // chapterId -> true
var pos = store.get('pos', {});        // chapterId -> percent read (0..100)
var last = store.get('last', null);    // last chapter id
function pct(id) { return done[id] ? 100 : Math.round(pos[id] || 0); }
function refreshProgress() {
  var n = META.filter(function (m) { return done[m.id]; }).length;
  $('#progTxt').textContent = n + ' / ' + META.length + ' done';
  $('#progBar').style.width = (n / META.length * 100) + '%';
  $$('.rch').forEach(function (li) {
    var id = li.dataset.ch, d = li.querySelector('.dot');
    d.classList.toggle('done', !!done[id]);
    d.style.setProperty('--p', done[id] ? 100 : (pos[id] || 0));
  });
  renderHomeGrid();
  var cta = $('#ctaRead');
  if (last && BY_ID[last] && !done[last]) { cta.href = '#' + last; cta.innerHTML = 'Continue reading <small>' + esc(BY_ID[last].label) + ' · ' + pct(last) + '%</small>'; }
  else {
    var next = META.find(function (m) { return !done[m.id]; });
    cta.href = '#' + (next ? next.id : 'intro');
    cta.innerHTML = n === 0 ? 'Start reading' : next ? 'Next: ' + esc(next.label) : 'Read again';
  }
}

// ------------------------------------------------------------------ rail
function buildRail() {
  var nav = $('#railNav'), part = null, ul = null;
  META.forEach(function (m) {
    if (m.part !== part) {
      part = m.part;
      nav.appendChild(h('div', { class: 'part-label', text: part }));
      ul = h('ul'); nav.appendChild(ul);
    }
    var sub = h('ul', { class: 'rsub' }, m.heads.map(function (x) { return h('li', null, [h('a', { href: '#' + x.id, text: x.text })]); }));
    ul.appendChild(h('li', { class: 'rch', 'data-ch': m.id }, [
      h('a', { href: '#' + m.id }, [h('span', { class: 'dot' }), h('span', { text: m.label }), h('span', { class: 'num', text: m.num || '' })]),
      sub
    ]));
  });
}
function renderHomeGrid() {
  var grid = $('#homeGrid'); grid.innerHTML = '';
  META.forEach(function (m) {
    var p = pct(m.id);
    var st = done[m.id] ? h('span', { class: 'state done', text: 'Done' }) : p > 0 ? h('span', { class: 'state going', text: p + '% read' }) : h('span', { class: 'state', text: 'Not started' });
    grid.appendChild(h('a', { class: 'card-ch', href: '#' + m.id }, [
      h('div', { class: 'big', text: m.num || '★' }),
      h('h3', { text: m.label }),
      h('p', { text: m.blurb }),
      h('div', { class: 'foot' }, [h('span', { text: m.minutes + ' min' }), st])
    ]));
  });
}

// mobile drawer
var rail = $('#rail'), menuBtn = $('#menuBtn');
function setDrawer(open) { rail.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open)); }
menuBtn.addEventListener('click', function () { setDrawer(!rail.classList.contains('open')); });
rail.addEventListener('click', function (e) { if (e.target.closest('a') && window.innerWidth <= 980) setDrawer(false); });

// ------------------------------------------------------------------ views & router
var views = { home: $('#view-home'), read: $('#view-read'), lab: $('#view-lab'), cards: $('#view-cards') };
var currentView = null, currentCh = null;
function showView(name) {
  Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  $$('[data-nav]').forEach(function (a) { a.setAttribute('aria-current', a.dataset.nav === name ? 'page' : 'false'); });
  if (name !== 'read') { $$('.rch').forEach(function (li) { li.classList.remove('active'); }); $('#readBar').style.width = '0'; currentCh = null; }
  currentView = name;
  if (name === 'lab') buildLab();
  if (name === 'cards') initDeck();
}
function route() {
  var hash = decodeURIComponent(location.hash.slice(1)) || 'home';
  if (hash === 'home' || hash === 'top') { showView('home'); window.scrollTo(0, 0); return; }
  if (hash === 'lab' || hash === 'cards') { showView(hash); window.scrollTo(0, 0); return; }
  var chId = hash.split('-')[0];
  if (BY_ID[chId]) { openChapter(chId, hash === chId ? null : hash); return; }
  showView('home');
}
window.addEventListener('hashchange', route);

// ------------------------------------------------------------------ reader
var host = $('#articleHost'), storeEl = $('#store');
var prepared = {};
function openChapter(id, anchor) {
  var m = BY_ID[id];
  if (currentCh !== id) {
    var old = host.firstElementChild;
    if (old) storeEl.appendChild(old);
    var art = document.getElementById(id);
    host.appendChild(art);
    if (!prepared[id]) { prepareChapter(art, m); prepared[id] = true; }
    currentCh = id;
    last = id; store.set('last', id);
    buildOtp(m);
    $$('.rch').forEach(function (li) { li.classList.toggle('active', li.dataset.ch === id); });
    var act = $('.rch.active'); if (act && window.innerWidth > 980) act.scrollIntoView({ block: 'nearest' });
  }
  showView('read');
  currentCh = id;
  $$('.rch').forEach(function (li) { li.classList.toggle('active', li.dataset.ch === id); });
  if (anchor) {
    var target = document.getElementById(anchor);
    if (target) { requestAnimationFrame(function () { target.scrollIntoView({ block: 'start' }); }); }
  } else window.scrollTo(0, 0);
  refreshProgress();
  onScroll();
}

function prepareChapter(art, m) {
  // meta line
  var metaEl = art.querySelector('[data-meta]');
  if (metaEl) metaEl.textContent = m.minutes + ' min read · ' + m.heads.length + ' sections';
  // heading anchors
  $$('h2[id], h3[id]', art).forEach(function (hd) {
    var a = h('a', { class: 'anchor', href: '#' + hd.id, 'aria-label': 'Link to this section', text: '#' });
    hd.insertBefore(a, hd.firstChild);
  });
  // copy buttons
  $$('.code', art).forEach(function (c) {
    var btn = h('button', { class: 'copy', type: 'button', text: 'Copy' });
    btn.addEventListener('click', function () { copyText(c.querySelector('pre').innerText, btn); });
    c.appendChild(btn);
  });
  // inline widgets
  INLINE.forEach(function (w) {
    if (w.ch !== m.id) return;
    var hd = document.getElementById(w.after); if (!hd) return;
    var level = +hd.tagName[1], n = hd.nextElementSibling;
    while (n && !(/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= level)) n = n.nextElementSibling;
    var panel = widgetPanel(w.widget);
    if (n) n.parentNode.insertBefore(panel, n); else art.appendChild(panel);
  });
  // end matter
  var idx = m.index, prev = META[idx - 1], next = META[idx + 1];
  var btn = h('button', { class: 'done-toggle', type: 'button' });
  function sync() {
    var d = !!done[m.id];
    btn.setAttribute('aria-pressed', String(d));
    btn.textContent = d ? '✓ Chapter completed' : 'Mark this chapter as completed';
  }
  btn.addEventListener('click', function () {
    if (done[m.id]) delete done[m.id]; else { done[m.id] = true; toast('Nice work. ' + m.label + ' completed.'); }
    store.set('done', done); sync(); refreshProgress();
  });
  sync();
  var pager = h('div', { class: 'pager' }, [
    prev ? h('a', { class: 'prev', href: '#' + prev.id }, [h('small', { text: '← Previous' }), h('b', { text: prev.label })]) : null,
    next ? h('a', { class: 'next', href: '#' + next.id }, [h('small', { text: 'Next →' }), h('b', { text: next.label })]) : null
  ]);
  art.appendChild(h('div', { class: 'ch-end' }, [btn, pager]));
}

function buildOtp(m) {
  var otp = $('#otp'); otp.innerHTML = '';
  otp.appendChild(h('h4', { text: 'On this page' }));
  m.heads.forEach(function (x) { otp.appendChild(h('a', { href: '#' + x.id, text: x.text })); });
}

var ticking = false, saveTimer;
function onScroll() {
  if (currentView !== 'read' || !currentCh) return;
  var art = host.firstElementChild; if (!art) return;
  var rect = art.getBoundingClientRect();
  var total = art.offsetHeight - window.innerHeight * 0.6;
  var p = Math.max(0, Math.min(100, (-rect.top + 80) / Math.max(1, total) * 100));
  $('#readBar').style.width = p + '%';
  var id = currentCh;
  if (p > (pos[id] || 0)) {
    pos[id] = Math.round(p);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set('pos', pos); refreshProgress(); }, 400);
  }
  // scroll spy
  var heads = $$('h2[id]', art), cur = null;
  for (var i = 0; i < heads.length; i++) { if (heads[i].getBoundingClientRect().top < 140) cur = heads[i]; else break; }
  $$('.otp a.here, .rsub a.here').forEach(function (a) { a.classList.remove('here'); });
  if (cur) $$('a[href="#' + cur.id + '"]').forEach(function (a) { if (a.closest('.otp, .rsub')) a.classList.add('here'); });
}
window.addEventListener('scroll', function () {
  if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; onScroll(); }); }
}, { passive: true });

// ------------------------------------------------------------------ search
var palette = $('#palette'), palInput = $('#palInput'), palList = $('#palList');
var index = null, results = [], sel = 0;
function buildIndex() {
  index = [];
  META.forEach(function (m) {
    var art = document.getElementById(m.id);
    var cur = { ch: m, id: m.id, title: m.label, text: '' };
    index.push(cur);
    Array.prototype.forEach.call(art.children, function walk(el) {
      if (el.classList && (el.classList.contains('try') || el.classList.contains('ch-end'))) return;
      if (/^H[23]$/.test(el.tagName) && el.id) {
        cur = { ch: m, id: el.id, title: el.textContent.replace(/^#/, ''), text: '' };
        index.push(cur);
      } else if (el.tagName === 'HEADER') {
        cur.text += ' ';
      } else {
        cur.text += ' ' + el.textContent;
      }
    });
  });
  index.forEach(function (e) { e.text = e.text.replace(/\s+/g, ' ').trim(); e.lt = e.text.toLowerCase(); e.ltitle = e.title.toLowerCase(); });
}
function openPalette() {
  if (!index) buildIndex();
  palette.hidden = false; palInput.value = ''; renderResults(); palInput.focus();
}
function closePalette() { palette.hidden = true; }
$('#searchBtn').addEventListener('click', openPalette);
$('#palClose').addEventListener('click', closePalette);
palette.addEventListener('click', function (e) { if (e.target === palette) closePalette(); });
function snippet(text, terms) {
  var lt = text.toLowerCase(), i = lt.indexOf(terms[0]);
  var start = Math.max(0, i - 60), s = (start > 0 ? '…' : '') + text.slice(start, start + 180) + (text.length > start + 180 ? '…' : '');
  var out = esc(s);
  terms.forEach(function (t) { if (t.length > 1) out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); });
  return out;
}
function renderResults() {
  var q = palInput.value.trim().toLowerCase();
  palList.innerHTML = ''; sel = 0;
  if (!q) {
    results = META.map(function (m) { return { ch: m, id: m.id, title: m.label, text: m.blurb }; });
  } else {
    var terms = q.split(/\s+/).filter(Boolean);
    results = index.map(function (e) {
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i], inT = e.ltitle.indexOf(t) !== -1, inB = e.lt.indexOf(t) !== -1;
        if (!inT && !inB) return null;
        score += (inT ? 10 : 0) + (inB ? 1 : 0);
      }
      return { e: e, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 40).map(function (r) { return r.e; });
  }
  if (!results.length) { palList.appendChild(h('div', { class: 'pal-empty', text: 'Nothing found. Try a shorter word, a close code like 1006, or a class name.' })); return; }
  var terms2 = q ? q.split(/\s+/) : [''];
  results.forEach(function (r, i) {
    var a = h('a', { class: 'pal-item', href: '#' + r.id, role: 'option', 'aria-selected': String(i === 0) }, [
      h('span', { class: 'where', text: (r.ch.num ? (/^[A-C]$/.test(r.ch.num) ? 'Appendix ' : 'Chapter ') + r.ch.num + ' · ' : '') + r.ch.label }),
      h('span', { class: 't', html: q ? snippet(r.title, terms2) : esc(r.title) }),
      r.text ? h('span', { class: 'snip', html: q ? snippet(r.text, terms2) : esc(r.text) }) : null
    ]);
    a.addEventListener('click', closePalette);
    palList.appendChild(a);
  });
}
palInput.addEventListener('input', renderResults);
palInput.addEventListener('keydown', function (e) {
  var items = $$('.pal-item', palList);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach(function (it, i) { it.setAttribute('aria-selected', String(i === sel)); });
    if (items[sel]) items[sel].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); location.hash = items[sel].getAttribute('href').slice(1); closePalette(); }
});

document.addEventListener('keydown', function (e) {
  var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === 'Escape') { if (!palette.hidden) closePalette(); setDrawer(false); return; }
  if (typing) return;
  if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); openPalette(); return; }
  if (currentView === 'read' && (e.key === '[' || e.key === ']')) {
    var m = BY_ID[currentCh], t = META[m.index + (e.key === ']' ? 1 : -1)];
    if (t) location.hash = t.id;
  }
  if (currentView === 'cards') deckKey(e);
});

// ------------------------------------------------------------------ SHA-1 (for the handshake tool; no dependency on crypto.subtle)
function sha1(bytes) {
  var H = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
  var l = bytes.length, withPad = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(withPad);
  m.set(bytes); m[l] = 0x80;
  var bits = l * 8, dv = new DataView(m.buffer);
  dv.setUint32(withPad - 4, bits >>> 0); dv.setUint32(withPad - 8, Math.floor(bits / 0x100000000));
  var w = new Uint32Array(80);
  for (var off = 0; off < withPad; off += 64) {
    for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (i = 16; i < 80; i++) { var x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4];
    for (i = 0; i < 80; i++) {
      var f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      var t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0;
  }
  var out = new Uint8Array(20), odv = new DataView(out.buffer);
  H.forEach(function (v, j) { odv.setUint32(j * 4, v); });
  return out;
}
function b64(bytes) { var s = ''; bytes.forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s); }
function hex(bytes, sep) { return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(sep == null ? ' ' : sep); }
function rand(n) {
  var a = new Uint8Array(n);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (var i = 0; i < n; i++) a[i] = Math.random() * 256 | 0;
  return a;
}
var enc = new TextEncoder();
var GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ------------------------------------------------------------------ widgets
var WIDGETS = {};

WIDGETS.accept = {
  title: 'Handshake calculator: Sec-WebSocket-Accept',
  render: function (body) {
    body.appendChild(h('p', { class: 'hint', text: 'The server proves it speaks WebSocket by hashing the client\'s key with a fixed GUID. Paste any key, or generate one like a browser would.' }));
    var key = h('input', { type: 'text', value: 'dGhlIHNhbXBsZSBub25jZQ==', spellcheck: 'false', 'aria-label': 'Sec-WebSocket-Key' });
    var gen = h('button', { class: 'mini', type: 'button', text: 'Generate a random key' });
    body.appendChild(h('div', { class: 'fields' }, [h('div', { class: 'field', style: 'flex:3 1 260px' }, [h('label', { text: 'Sec-WebSocket-Key' }), key]), gen]));
    var out = h('div', { class: 'out' }); body.appendChild(out);
    function calc() {
      var k = key.value.trim();
      var digest = sha1(enc.encode(k + GUID));
      out.innerHTML = '<div><span class="k">1. concatenate  </span>' + esc(k) + '<b>' + GUID + '</b></div>' +
        '<div><span class="k">2. SHA-1        </span>' + hex(digest) + '</div>' +
        '<div><span class="k">3. base64       </span></div><div class="result-big">' + b64(digest) + '</div>' +
        '<div style="margin-top:8px"><span class="k">→ server replies: </span>HTTP/1.1 101 Switching Protocols · Sec-WebSocket-Accept: ' + b64(digest) + '</div>' +
        (k === 'dGhlIHNhbXBsZSBub25jZQ==' ? '<div class="k" style="margin-top:6px">This is the example from RFC 6455; the answer s3pPLMBiTxaQ9kYGzzhZRbK+xOo= matches the RFC.</div>' : '');
    }
    key.addEventListener('input', calc);
    gen.addEventListener('click', function () { key.value = b64(rand(16)); calc(); });
    calc();
  }
};

WIDGETS.frame = {
  title: 'Frame inspector: see a WebSocket frame byte by byte',
  render: function (body) {
    body.appendChild(h('p', { class: 'hint', text: 'Type a message and choose who sends it. Clients must mask; servers must not. Try a long message to see the 16-bit length kick in at 126 bytes.' }));
    var txt = h('textarea', { 'aria-label': 'Payload', spellcheck: 'false' }); txt.value = 'Hello';
    var op = h('select', { 'aria-label': 'Opcode' }, [['1', 'Text (0x1)'], ['2', 'Binary (0x2)'], ['9', 'Ping (0x9)'], ['10', 'Pong (0xA)'], ['8', 'Close (0x8)']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var who = h('select', { 'aria-label': 'Sender' }, [h('option', { value: 'c', text: 'Client → server (masked)' }), h('option', { value: 's', text: 'Server → client (unmasked)' })]);
    var code = h('input', { type: 'number', value: '1000', min: '1000', max: '4999', 'aria-label': 'Close code' });
    var codeField = h('div', { class: 'field' }, [h('label', { text: 'Close code' }), code]);
    var newMask = h('button', { class: 'mini', type: 'button', text: 'New mask key' });
    body.appendChild(h('div', { class: 'fields' }, [
      h('div', { class: 'field', style: 'flex:1 1 100%' }, [h('label', { text: 'Payload (UTF-8)' }), txt]),
      h('div', { class: 'field' }, [h('label', { text: 'Frame type' }), op]),
      h('div', { class: 'field' }, [h('label', { text: 'Sender' }), who]), codeField, newMask
    ]));
    var hexEl = h('div', { class: 'hex' }), legend = h('div', { class: 'legend', html: '<span><i class="f-b0"></i>FIN · RSV · opcode</span><span><i class="f-len"></i>MASK bit + length</span><span><i class="f-ext"></i>extended length</span><span><i class="f-mask"></i>masking key</span><span><i class="f-pay"></i>payload</span>' });
    var kv = h('dl', { class: 'kv' }), msg = h('div');
    body.appendChild(h('div', { class: 'out', style: 'display:grid;gap:12px' }, [legend, hexEl, kv]));
    body.appendChild(msg);
    var mask = rand(4);
    function render() {
      var opcode = +op.value, masked = who.value === 'c';
      codeField.hidden = opcode !== 8;
      var payload = enc.encode(txt.value);
      if (opcode === 8) { var c = +code.value || 1000; var p = new Uint8Array(2 + payload.length); p[0] = c >> 8; p[1] = c & 255; p.set(payload, 2); payload = p; }
      var len = payload.length, b0 = 0x80 | opcode, lenField, ext = [];
      if (len <= 125) lenField = len; else if (len <= 65535) { lenField = 126; ext = [len >> 8, len & 255]; }
      else { lenField = 127; for (var i = 7; i >= 0; i--) ext.push(Math.floor(len / Math.pow(256, i)) & 255); }
      var b1 = (masked ? 0x80 : 0) | lenField;
      var pay = masked ? payload.map(function (b, i) { return b ^ mask[i % 4]; }) : payload;
      var parts = '<span class="f-b0">' + hex([b0]) + '</span><span class="f-len">' + hex([b1]) + '</span>';
      ext.forEach(function (b) { parts += '<span class="f-ext">' + hex([b]) + '</span>'; });
      if (masked) Array.prototype.forEach.call(mask, function (b) { parts += '<span class="f-mask">' + hex([b]) + '</span>'; });
      var shown = Math.min(pay.length, 48);
      for (var j = 0; j < shown; j++) parts += '<span class="f-pay">' + hex([pay[j]]) + '</span>';
      if (pay.length > shown) parts += '<span class="f-pay">… +' + (pay.length - shown) + ' bytes</span>';
      hexEl.innerHTML = parts;
      var header = 2 + ext.length + (masked ? 4 : 0);
      var names = { 1: 'text', 2: 'binary', 8: 'close', 9: 'ping', 10: 'pong' };
      var rows = [
        ['FIN', '1 (final frame of the message)'], ['RSV1-3', '000 (no extension)'],
        ['opcode', '0x' + opcode.toString(16).toUpperCase() + ' (' + names[opcode] + ')'],
        ['MASK', masked ? '1 · key ' + hex(mask) : '0'],
        ['payload length', len + ' byte' + (len === 1 ? '' : 's') + ' · ' + (lenField <= 125 ? '7-bit field' : lenField === 126 ? '126 + 16-bit extended length' : '127 + 64-bit extended length')],
        ['header size', header + ' bytes (overhead)'], ['frame size', header + len + ' bytes']
      ];
      if (masked && len) rows.push(['first byte', hex([payload[0]]) + ' XOR ' + hex([mask[0]]) + ' = ' + hex([pay[0]])]);
      kv.innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
      msg.innerHTML = '';
      if (opcode >= 8 && len > 125) msg.appendChild(h('div', { class: 'msg bad', text: 'Invalid: control frames (close, ping, pong) may carry at most 125 bytes.' }));
      if (opcode === 8 && (+code.value === 1005 || +code.value === 1006 || +code.value === 1015)) msg.appendChild(h('div', { class: 'msg bad', text: 'Codes 1005, 1006 and 1015 are reserved for local reporting and must never be sent in a close frame.' }));
    }
    [txt, op, who, code].forEach(function (el) { el.addEventListener('input', render); el.addEventListener('change', render); });
    newMask.addEventListener('click', function () { mask = rand(4); render(); });
    render();
  }
};

var STOMP_SPEC = {
  CONNECT: { req: ['accept-version', 'host'], def: [['accept-version', '1.2'], ['host', 'chat.example.com'], ['heart-beat', '10000,10000'], ['Authorization', 'Bearer eyJhbGciOi...']], body: false },
  STOMP: { req: ['accept-version', 'host'], def: [['accept-version', '1.2'], ['host', 'chat.example.com']], body: false },
  CONNECTED: { req: ['version'], def: [['version', '1.2'], ['heart-beat', '10000,10000'], ['session', 'sess-4f2a']], body: false },
  SEND: { req: ['destination'], def: [['destination', '/app/chat.send'], ['content-type', 'application/json']], body: true, sample: '{"text":"héllo 👋"}' },
  SUBSCRIBE: { req: ['destination', 'id'], def: [['id', 'sub-0'], ['destination', '/topic/chat.public'], ['ack', 'auto']], body: false },
  UNSUBSCRIBE: { req: ['id'], def: [['id', 'sub-0']], body: false },
  MESSAGE: { req: ['destination', 'message-id', 'subscription'], def: [['destination', '/topic/chat.public'], ['message-id', '007'], ['subscription', 'sub-0'], ['content-type', 'application/json']], body: true, sample: '{"from":"anna","text":"hi"}' },
  ACK: { req: ['id'], def: [['id', 'a1b2']], body: false },
  NACK: { req: ['id'], def: [['id', 'a1b2']], body: false },
  BEGIN: { req: ['transaction'], def: [['transaction', 'tx1']], body: false },
  COMMIT: { req: ['transaction'], def: [['transaction', 'tx1']], body: false },
  ABORT: { req: ['transaction'], def: [['transaction', 'tx1']], body: false },
  DISCONNECT: { req: [], def: [['receipt', 'close-1']], body: false },
  RECEIPT: { req: ['receipt-id'], def: [['receipt-id', 'close-1']], body: false },
  ERROR: { req: [], def: [['message', 'malformed frame received'], ['content-type', 'text/plain']], body: true, sample: 'Destination header missing on SEND frame' }
};
WIDGETS.stomp = {
  title: 'STOMP frame builder',
  render: function (body) {
    body.appendChild(h('p', { class: 'hint', text: 'Pick a command and edit headers. The builder escapes special characters, counts content-length in bytes (not characters), and checks the rules of STOMP 1.2.' }));
    var cmd = h('select', { 'aria-label': 'Command' }, Object.keys(STOMP_SPEC).map(function (c) { return h('option', { value: c, text: c }); }));
    cmd.value = 'SEND';
    var autoLen = h('input', { type: 'checkbox', checked: 'checked', id: 'stomp-auto-' + Math.random().toString(36).slice(2, 7) });
    var rowsEl = h('div', { class: 'hdr-rows' });
    var addBtn = h('button', { class: 'mini', type: 'button', text: '+ Add header' });
    var bodyTa = h('textarea', { 'aria-label': 'Body', spellcheck: 'false' });
    var bodyField = h('div', { class: 'field', style: 'flex:1 1 100%' }, [h('label', { text: 'Body' }), bodyTa]);
    body.appendChild(h('div', { class: 'fields' }, [
      h('div', { class: 'field' }, [h('label', { text: 'Command' }), cmd]),
      h('label', { style: 'display:flex;gap:6px;align-items:center;font:13px var(--f-mono)' }, [autoLen, 'add content-length'])
    ]));
    body.appendChild(h('div', { class: 'field' }, [h('label', { text: 'Headers' }), rowsEl]));
    body.appendChild(addBtn);
    body.appendChild(h('div', { class: 'fields' }, [bodyField]));
    var out = h('div', { class: 'out frame-out' }), info = h('div', { style: 'display:grid;gap:6px' });
    var copyB = h('button', { class: 'mini', type: 'button', text: 'Copy frame (with real NULL)' });
    body.appendChild(out); body.appendChild(h('div', { class: 'fields' }, [copyB])); body.appendChild(info);
    var lastFrame = '';
    function addRow(k, v) {
      var ki = h('input', { value: k || '', 'aria-label': 'Header name', spellcheck: 'false' });
      var vi = h('input', { value: v || '', 'aria-label': 'Header value', spellcheck: 'false' });
      var rm = h('button', { type: 'button', 'aria-label': 'Remove header', text: '×' });
      var row = h('div', { class: 'hdr-row' }, [ki, vi, rm]);
      rm.addEventListener('click', function () { row.remove(); render(); });
      ki.addEventListener('input', render); vi.addEventListener('input', render);
      rowsEl.appendChild(row);
    }
    function reset() {
      var spec = STOMP_SPEC[cmd.value];
      rowsEl.innerHTML = '';
      spec.def.forEach(function (p) { addRow(p[0], p[1]); });
      bodyTa.value = spec.sample || '';
      render();
    }
    function escapeVal(s) { return s.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/:/g, '\\c'); }
    function render() {
      var c = cmd.value, spec = STOMP_SPEC[c], noEscape = c === 'CONNECT' || c === 'CONNECTED' || c === 'STOMP';
      bodyField.hidden = !spec.body;
      var headers = $$('.hdr-row', rowsEl).map(function (r) { var i = r.querySelectorAll('input'); return [i[0].value, i[1].value]; }).filter(function (p) { return p[0]; });
      var b = spec.body ? bodyTa.value : '';
      var bodyBytes = enc.encode(b).length;
      var lines = [c], escaped = false, names = {};
      headers.forEach(function (p) {
        var k = noEscape ? p[0] : escapeVal(p[0]), v = noEscape ? p[1] : escapeVal(p[1]);
        if (k !== p[0] || v !== p[1]) escaped = true;
        lines.push(k + ':' + v); names[p[0]] = (names[p[0]] || 0) + 1;
      });
      if (spec.body && autoLen.checked && !names['content-length']) lines.push('content-length:' + bodyBytes);
      lastFrame = lines.join('\n') + '\n\n' + b + '\0';
      var html = '<span class="cmd">' + esc(c) + '</span><span class="eol">␊</span>\n';
      lines.slice(1).forEach(function (l) { html += esc(l) + '<span class="eol">␊</span>\n'; });
      html += '<span class="eol">␊</span>\n' + esc(b) + '<span class="nul">^@</span>';
      out.innerHTML = html;
      info.innerHTML = '';
      var missing = spec.req.filter(function (r) { return !names[r]; });
      if (missing.length) info.appendChild(h('div', { class: 'msg bad', text: 'Missing required header' + (missing.length > 1 ? 's' : '') + ' for ' + c + ': ' + missing.join(', ') }));
      Object.keys(names).forEach(function (n) { if (names[n] > 1) info.appendChild(h('div', { class: 'msg warn', text: 'Header "' + n + '" appears twice. Receivers use the first value only.' })); });
      if (escaped) info.appendChild(h('div', { class: 'msg warn', text: 'Special characters were escaped (\\n, \\r, \\c for ":", \\\\). CONNECT and CONNECTED frames are never escaped.' }));
      if (spec.body && b && !names['content-length'] && !autoLen.checked && b.indexOf('\0') !== -1) info.appendChild(h('div', { class: 'msg bad', text: 'A body containing NULL needs content-length.' }));
      var chars = Array.from(b).length;
      if (spec.body && bodyBytes !== chars) info.appendChild(h('div', { class: 'msg warn', text: 'Body is ' + chars + ' characters but ' + bodyBytes + ' bytes in UTF-8. content-length must be ' + bodyBytes + '.' }));
      if (!missing.length) info.appendChild(h('div', { class: 'msg ok', text: 'Valid STOMP 1.2 ' + c + ' frame · ' + enc.encode(lastFrame).length + ' bytes in total' + (spec.body ? '' : ' · this command must not have a body') }));
    }
    cmd.addEventListener('change', reset);
    autoLen.addEventListener('change', render);
    bodyTa.addEventListener('input', render);
    addBtn.addEventListener('click', function () { addRow('', ''); });
    copyB.addEventListener('click', function () { copyText(lastFrame, null); toast('Frame copied, including the NULL byte'); });
    reset();
  }
};

WIDGETS.heartbeat = {
  title: 'Heart-beat negotiator',
  render: function (body) {
    body.appendChild(h('p', { class: 'hint', text: 'CONNECT says heart-beat:cx,cy and CONNECTED answers sx,sy. Change the numbers (milliseconds; 0 means "never") and see what each side must send.' }));
    function num(label, v) { var i = h('input', { type: 'number', min: '0', step: '1000', value: String(v), 'aria-label': label }); return { i: i, f: h('div', { class: 'field' }, [h('label', { text: label }), i]) }; }
    var cx = num('client cx (can send)', 10000), cy = num('client cy (wants)', 10000), sx = num('server sx (can send)', 10000), sy = num('server sy (wants)', 10000);
    body.appendChild(h('div', { class: 'fields' }, [cx.f, cy.f, sx.f, sy.f]));
    var presets = h('div', { class: 'chips' });
    [['stompjs default ↔ Spring with scheduler', 10000, 10000, 10000, 10000], ['Spring simple broker without TaskScheduler', 10000, 10000, 0, 0], ['Book example (Ch 4.5)', 4000, 20000, 10000, 10000], ['Client sends none', 0, 10000, 10000, 10000]].forEach(function (p) {
      var b = h('button', { class: 'mini', type: 'button', text: p[0] });
      b.addEventListener('click', function () { cx.i.value = p[1]; cy.i.value = p[2]; sx.i.value = p[3]; sy.i.value = p[4]; calc(); });
      presets.appendChild(b);
    });
    body.appendChild(presets);
    var dir = h('div', { class: 'dir' }), note = h('div', { class: 'out' });
    body.appendChild(dir); body.appendChild(note);
    function one(a, b, la, lb) { return (a === 0 || b === 0) ? { v: 'none', why: la + ' or ' + lb + ' is 0' } : { v: Math.max(a, b), why: 'max(' + la + ', ' + lb + ') = max(' + a + ', ' + b + ')' }; }
    function fmt(v) { return v === 'none' ? 'No heart-beats' : (v / 1000) + ' s'; }
    function calc() {
      var a = +cx.i.value || 0, b = +cy.i.value || 0, c = +sx.i.value || 0, d = +sy.i.value || 0;
      var up = one(a, d, 'cx', 'sy'), down = one(c, b, 'sx', 'cy');
      dir.innerHTML = '';
      dir.appendChild(h('div', null, [h('small', { text: 'Client → server' }), h('strong', { text: fmt(up.v) }), h('span', { text: up.why })]));
      dir.appendChild(h('div', null, [h('small', { text: 'Server → client' }), h('strong', { text: fmt(down.v) }), h('span', { text: down.why })]));
      var lines = [];
      if (down.v !== 'none') lines.push('stompjs treats the server as dead after <b>' + (down.v * 2 / 1000) + ' s</b> without data (heartbeatToleranceMultiplier 2).');
      if (up.v !== 'none') lines.push('Spring\'s simple broker closes the client after <b>' + (up.v * 3 / 1000) + ' s</b> without data (multiplier 3).');
      if (up.v === 'none' && down.v === 'none') lines.push('<b>No liveness checks at all.</b> Proxies with a 60 s idle timeout will cut idle connections, and dead phones stay "connected".');
      else if (Math.min(up.v === 'none' ? Infinity : up.v, down.v === 'none' ? Infinity : down.v) >= 60000) lines.push('Warning: beats every 60 s or more will not keep connections alive behind proxies with a 60 s idle timeout.');
      note.innerHTML = lines.join('<br>');
    }
    [cx, cy, sx, sy].forEach(function (x) { x.i.addEventListener('input', calc); });
    calc();
  }
};

var CODES = {
  1000: ['Normal Closure', 'Purpose fulfilled, e.g. logout.'], 1001: ['Going Away', 'Server shutting down or the page navigating away. Spring uses it on shutdown.'],
  1002: ['Protocol Error', 'Malformed frames. Spring also closes with 1002 right after a STOMP ERROR frame.'], 1003: ['Unsupported Data', 'E.g. binary data to a text-only endpoint.'],
  1004: ['Reserved', 'Not to be used.'], 1005: ['No Status Received', 'Reserved: reported locally when a close frame had no code. Never sent.'],
  1006: ['Abnormal Closure', 'Reserved: the connection dropped without a close frame (network, proxy timeout, crash, TLS). Never sent. The code you will debug most.'],
  1007: ['Invalid Frame Payload Data', 'E.g. invalid UTF-8 in a text message.'], 1008: ['Policy Violation', 'Generic "you broke a rule", e.g. auth failure.'],
  1009: ['Message Too Big', 'Over the receiver\'s limit (Tomcat 8 KB buffer, Spring 64 KB STOMP limit).'], 1010: ['Mandatory Extension', 'Client required an extension the server did not negotiate.'],
  1011: ['Internal Error', 'Unexpected server condition.'], 1012: ['Service Restart', 'Server restarting; reconnect soon.'], 1013: ['Try Again Later', 'Overloaded; back off before reconnecting.'],
  1014: ['Bad Gateway', 'A gateway got an invalid response upstream.'], 1015: ['TLS Handshake', 'Reserved: TLS failure. Never sent.'],
  4500: ['Spring: SESSION_NOT_RELIABLE', 'Spring closed a slow session that exceeded its send buffer or send time limit.']
};
WIDGETS.close = {
  title: 'Close code explorer',
  render: function (body) {
    body.appendChild(h('p', { class: 'hint', text: 'Type a close code from your logs, or click a common one.' }));
    var inp = h('input', { type: 'number', value: '1006', 'aria-label': 'Close code' });
    body.appendChild(h('div', { class: 'fields' }, [h('div', { class: 'field', style: 'max-width:180px' }, [h('label', { text: 'Close code' }), inp])]));
    var chips = h('div', { class: 'chips' });
    [1000, 1001, 1002, 1006, 1008, 1009, 1011, 1013, 4500].forEach(function (c) {
      var b = h('button', { class: 'mini', type: 'button', text: String(c) });
      b.addEventListener('click', function () { inp.value = c; show(); });
      chips.appendChild(b);
    });
    body.appendChild(chips);
    var out = h('div', { class: 'out' }); body.appendChild(out);
    function show() {
      var c = Math.floor(+inp.value), known = CODES[c], range;
      if (!(c >= 0)) { out.innerHTML = 'Enter a number.'; return; }
      if (c < 1000) range = 'Not used (0–999)';
      else if (c < 3000) range = 'Protocol range (1000–2999), defined by the RFC and IANA';
      else if (c < 4000) range = 'Registered for libraries and frameworks (3000–3999)';
      else if (c < 5000) range = 'Private use by applications (4000–4999)';
      else range = 'Invalid (above 4999)';
      var reserved = c === 1005 || c === 1006 || c === 1015;
      var jsOk = c === 1000 || (c >= 3000 && c <= 4999);
      out.innerHTML = '<div class="result-big">' + c + ' · ' + esc(known ? known[0] : (c >= 4000 && c < 5000 ? 'Your application\'s own code' : 'Unassigned')) + '</div>' +
        (known ? '<div style="margin:6px 0 10px">' + esc(known[1]) + '</div>' : '<div style="margin:6px 0 10px"></div>') +
        '<div><span class="k">Range          </span>' + range + '</div>' +
        '<div><span class="k">Sent on wire   </span>' + (reserved ? '<b>No</b>, only reported locally' : (c >= 1000 && c < 5000 ? 'Yes' : 'No')) + '</div>' +
        '<div><span class="k">Browser close()</span>' + (jsOk ? 'Allowed' : 'Throws InvalidAccessError (only 1000 or 3000–4999)') + '</div>';
    }
    inp.addEventListener('input', show);
    show();
  }
};

var FLOW_NODES = {
  A: [70, 190, 'Client A', 'sender'], DEC: [220, 190, 'STOMP decoder', 'SubProtocolHandler'], IN: [380, 190, 'clientInbound', 'channel + interceptors'],
  CTL: [380, 62, '@MessageMapping', 'your controller'], BCH: [560, 62, 'brokerChannel', ''], SVC: [740, 62, 'Your service', 'SimpMessagingTemplate'],
  UD: [380, 318, 'User destinations', '/user → session queue'], BR: [560, 190, 'Broker', 'simple or relay'], OUT: [740, 190, 'clientOutbound', 'channel'],
  B: [880, 120, 'Client B', 'subscriber'], C: [880, 262, 'Client C', 'subscriber']
};
var FLOW_EDGES = [['A', 'DEC'], ['DEC', 'IN'], ['IN', 'CTL'], ['CTL', 'BCH'], ['SVC', 'BCH'], ['BCH', 'BR'], ['IN', 'BR'], ['IN', 'UD'], ['BCH', 'UD'], ['UD', 'BR'], ['BR', 'OUT'], ['OUT', 'B'], ['OUT', 'C'], ['DEC', 'A']];
var FLOWS = {
  send: { label: 'SEND to /app/chat.send', steps: [
    ['A', 'Client A sends SEND destination:/app/chat.send with a JSON body.'], ['DEC', 'Spring decodes the WebSocket message into a STOMP Message with headers (session id, user, destination).'],
    ['IN', 'clientInboundChannel: your interceptors run (auth, authorisation, rate limits) on the I/O thread, then a pool thread takes over.'],
    ['CTL', 'The /app prefix routes it to @MessageMapping("/chat.send"). JSON becomes your object; the method runs.'],
    ['BCH', 'The return value (or @SendTo) is sent to brokerChannel, destination /topic/chat.send by default.'],
    ['BR', 'The broker looks up every session subscribed to that destination.'], ['OUT', 'One MESSAGE per subscriber goes into clientOutboundChannel.'],
    ['B', 'Client B receives a MESSAGE frame.'], ['C', 'Client C receives the same MESSAGE: fan-out.']] },
  sub: { label: 'SUBSCRIBE to /topic/chat', steps: [
    ['A', 'Client A sends SUBSCRIBE id:sub-0 destination:/topic/chat.'], ['DEC', 'Decoded into a STOMP Message.'],
    ['IN', 'Interceptors check: is this user allowed to read this destination? (Chapter 8)'],
    ['BR', 'The /topic prefix sends it straight to the broker, which records the subscription. No controller is involved.']] },
  user: { label: 'convertAndSendToUser("anna")', steps: [
    ['SVC', 'A service calls convertAndSendToUser("anna", "/queue/notifications", payload).'], ['BCH', 'It goes to brokerChannel as /user/anna/queue/notifications.'],
    ['UD', 'UserDestinationMessageHandler finds anna\'s sessions in SimpUserRegistry and rewrites to /queue/notifications-user{sessionId}.'],
    ['BR', 'The broker delivers to the unique per-session subscription.'], ['OUT', 'Into clientOutboundChannel…'], ['B', '…and only anna\'s session receives it. Nobody else can.']] },
  deny: { label: 'Rejected SUBSCRIBE', steps: [
    ['A', 'Client A (not a member) sends SUBSCRIBE destination:/topic/orders.42.'], ['DEC', 'Decoded.'],
    ['!IN', 'Your SubscriptionGuard interceptor throws AccessDeniedException.'],
    ['!DEC', 'Spring turns the exception into a STOMP ERROR frame (message:FORBIDDEN).'],
    ['!A', 'The client gets ERROR and Spring closes the WebSocket with code 1002. (Unless setPreserveReceiveOrder is on: then nothing is sent. See bug C10.)']] }
};
WIDGETS.flow = {
  title: 'Message flow inside Spring',
  render: function (body) {
    body.appendChild(h('p', { class: 'hint', text: 'Pick a scenario and step through it, or press Play. Each step highlights the component that handles the message.' }));
    var chips = h('div', { class: 'chips' }), btns = {};
    Object.keys(FLOWS).forEach(function (k) {
      var b = h('button', { class: 'mini', type: 'button', text: FLOWS[k].label });
      b.addEventListener('click', function () { select(k); });
      btns[k] = b; chips.appendChild(b);
    });
    body.appendChild(chips);
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 960 380'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Diagram of Spring STOMP message flow');
    var edgeEls = {}, nodeEls = {};
    FLOW_EDGES.forEach(function (e) {
      if (e[0] === 'DEC' && e[1] === 'A') return;
      var a = FLOW_NODES[e[0]], b = FLOW_NODES[e[1]];
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]); l.setAttribute('x2', b[0]); l.setAttribute('y2', b[1]); l.setAttribute('class', 'edge');
      svg.appendChild(l); edgeEls[e[0] + '>' + e[1]] = l; edgeEls[e[1] + '>' + e[0]] = l;
    });
    Object.keys(FLOW_NODES).forEach(function (k) {
      var n = FLOW_NODES[k], g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'node');
      var r = document.createElementNS(NS, 'rect'); r.setAttribute('x', n[0] - 72); r.setAttribute('y', n[1] - 28); r.setAttribute('width', 144); r.setAttribute('height', 56); r.setAttribute('rx', 9);
      var t = document.createElementNS(NS, 'text'); t.setAttribute('x', n[0]); t.setAttribute('y', n[1] - 2); t.setAttribute('text-anchor', 'middle'); t.textContent = n[2];
      var s = document.createElementNS(NS, 'text'); s.setAttribute('x', n[0]); s.setAttribute('y', n[1] + 17); s.setAttribute('text-anchor', 'middle'); s.setAttribute('class', 's'); s.textContent = n[3];
      g.appendChild(r); g.appendChild(t); g.appendChild(s); svg.appendChild(g); nodeEls[k] = g;
    });
    body.appendChild(h('div', { class: 'flow', style: 'overflow-x:auto' }, [h('div', { style: 'min-width:560px' }, [svg])]));
    var cap = h('div', { class: 'flow-cap' }); body.appendChild(cap);
    var prev = h('button', { class: 'mini', type: 'button', text: '← Back' }), next = h('button', { class: 'mini', type: 'button', text: 'Step →' }), play = h('button', { class: 'mini', type: 'button', text: '▶ Play' });
    body.appendChild(h('div', { class: 'fields' }, [prev, next, play]));
    var cur = 'send', step = -1, timer = null;
    function paint() {
      Object.keys(nodeEls).forEach(function (k) { nodeEls[k].setAttribute('class', 'node'); });
      Object.keys(edgeEls).forEach(function (k) { edgeEls[k].setAttribute('class', 'edge'); });
      var steps = FLOWS[cur].steps;
      for (var i = 0; i <= step; i++) {
        var id = steps[i][0], deny = id[0] === '!', key = deny ? id.slice(1) : id;
        nodeEls[key].setAttribute('class', 'node ' + (deny ? 'deny' : 'on'));
        if (i > 0) { var p = steps[i - 1][0].replace('!', ''); var e = edgeEls[p + '>' + key] || edgeEls['OUT>' + key]; if (e) e.setAttribute('class', 'edge ' + (deny ? 'deny' : 'on')); }
      }
      cap.innerHTML = step < 0 ? '<b>READY</b>Press Step or Play to follow the message.' : '<b>STEP ' + (step + 1) + '/' + steps.length + '</b>' + esc(steps[step][1]);
      Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('on', k === cur); });
    }
    function stop() { clearInterval(timer); timer = null; play.textContent = '▶ Play'; }
    function select(k) { stop(); cur = k; step = -1; paint(); }
    next.addEventListener('click', function () { stop(); if (step < FLOWS[cur].steps.length - 1) step++; paint(); });
    prev.addEventListener('click', function () { stop(); if (step > -1) step--; paint(); });
    play.addEventListener('click', function () {
      if (timer) { stop(); return; }
      if (step >= FLOWS[cur].steps.length - 1) step = -1;
      play.textContent = '❚❚ Pause';
      timer = setInterval(function () { step++; paint(); if (step >= FLOWS[cur].steps.length - 1) stop(); }, 1500);
      step++; paint();
    });
    paint();
  }
};

WIDGETS.backoff = {
  title: 'Reconnect storm simulator',
  render: function (body) {
    body.appendChild(h('p', { class: 'hint', text: 'A server restart disconnects every client at t = 0 and takes 5 s to come back (grey). Bars show reconnect attempts per second; red means more than the server can accept. Compare the three strategies.' }));
    var n = h('input', { type: 'range', min: '1000', max: '100000', step: '1000', value: '20000', 'aria-label': 'Number of clients' });
    var nLbl = h('span', { class: 'mono' });
    var strat = h('div', { class: 'seg', role: 'group', 'aria-label': 'Strategy' });
    var S = [['fixed', 'Fixed 5 s'], ['exp', 'Exponential'], ['jitter', 'Exponential + jitter']], cur = 'fixed';
    S.forEach(function (s) {
      var b = h('button', { type: 'button', 'aria-pressed': String(s[0] === cur), text: s[1] });
      b.addEventListener('click', function () { cur = s[0]; $$('button', strat).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); draw(); });
      strat.appendChild(b);
    });
    body.appendChild(h('div', { class: 'fields' }, [h('div', { class: 'field', style: 'flex:2 1 220px' }, [h('label', null, ['Clients: ', nLbl]), n]), strat]));
    var canvas = h('canvas', { class: 'chart', role: 'img', 'aria-label': 'Reconnect attempts per second' }); body.appendChild(canvas);
    var verdict = h('div', { class: 'msg' }); body.appendChild(verdict);
    var CAP = 2000, SECS = 60, DOWN = 5;
    function simulate(clients, mode) {
      // Every client drops at t = 0. The server needs 5 s to restart, then accepts CAP connections per second.
      // Attempts while it is down fail fast; rejected clients wait for their strategy's delay and try again.
      var seed = 7;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      function delay(attempt) {
        if (mode === 'fixed') return 5;
        var e = Math.min(30, 2 * Math.pow(2, attempt));       // 2, 4, 8, 16, 30, 30 ... seconds
        return mode === 'jitter' ? rnd() * e : e;             // "full jitter": anywhere between 0 and the backoff
      }
      var times = new Float64Array(clients), att = new Uint8Array(clients), buckets = new Array(SECS).fill(0), i, allAt = -1, left = clients;
      for (i = 0; i < clients; i++) times[i] = delay(0);
      for (var s = 0; s < SECS; s++) {
        var cap = s >= DOWN ? CAP : 0, n = 0;
        for (i = 0; i < clients; i++) {
          if (times[i] >= s && times[i] < s + 1) {
            n++;
            if (cap > 0) { cap--; times[i] = Infinity; left--; }
            else { att[i]++; times[i] += delay(att[i]); if (times[i] < s + 1) times[i] = s + 1 + (mode === 'jitter' ? rnd() * 0.999 : 0); }
          }
        }
        buckets[s] = n;
        if (allAt < 0 && left === 0) allAt = s + 1;
      }
      return { buckets: buckets, left: left, allAt: allAt };
    }
    function draw() {
      var clients = +n.value; nLbl.textContent = clients.toLocaleString();
      var res = simulate(clients, cur), data = res.buckets, max = Math.max.apply(null, data.concat([CAP * 1.2]));
      var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 600, hgt = canvas.clientHeight || 220;
      canvas.width = w * dpr; canvas.height = hgt * dpr;
      var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt);
      var cs = getComputedStyle(document.documentElement);
      var cInk = cs.getPropertyValue('--ink-3').trim(), cLine = cs.getPropertyValue('--line').trim(), cAcc = cs.getPropertyValue('--accent').trim(), cRed = cs.getPropertyValue('--red').trim();
      var L = 48, R = 10, T = 12, B = 26, pw = w - L - R, ph = hgt - T - B;
      ctx.font = '11px ' + cs.getPropertyValue('--f-mono'); ctx.fillStyle = cInk; ctx.strokeStyle = cLine; ctx.lineWidth = 1;
      for (var g = 0; g <= 4; g++) {
        var y = T + ph - ph * g / 4; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(Math.round(max * g / 4).toLocaleString(), L - 6, y + 4);
      }
      ctx.textAlign = 'center';
      for (var t = 0; t <= SECS; t += 10) ctx.fillText(t + ' s', L + pw * t / SECS, hgt - 8);
      var bw = pw / SECS;
      var cDown = cs.getPropertyValue('--ink-3').trim();
      ctx.fillStyle = cs.getPropertyValue('--sunk').trim(); ctx.fillRect(L, T, pw * DOWN / SECS, ph);
      data.forEach(function (v, i) { var bh = ph * v / max; ctx.fillStyle = i < DOWN ? cDown : v > CAP ? cRed : cAcc; ctx.fillRect(L + i * bw + 1, T + ph - bh, Math.max(1, bw - 2), bh); });
      var cy = T + ph - ph * CAP / max; ctx.strokeStyle = cInk; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(L, cy); ctx.lineTo(w - R, cy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = cInk; ctx.textAlign = 'left'; ctx.fillText('server capacity ' + CAP.toLocaleString() + '/s', L + pw * DOWN / SECS + 6, cy - 6);
      ctx.fillText('server down', L + 6, T + 14);
      var peak = Math.max.apply(null, data.slice(DOWN));
      verdict.className = 'msg ' + (res.left ? 'bad' : peak > CAP * 1.5 ? 'warn' : 'ok');
      verdict.textContent = 'After recovery: peak ' + peak.toLocaleString() + ' attempts/s against a capacity of ' + CAP.toLocaleString() + ' · ' +
        (res.left ? res.left.toLocaleString() + ' clients still offline after 60 s' : 'everyone back after ' + res.allAt + ' s') +
        (cur === 'fixed' ? '. Everyone retries at the same moment, so most attempts are wasted.' : cur === 'exp' ? '. Backoff without jitter keeps clients in lockstep, and the gaps keep growing.' : '. Jitter spreads clients out, so the server works near capacity the whole time.');
    }
    n.addEventListener('input', draw);
    window.addEventListener('resize', function () { if (canvas.isConnected) draw(); });
    requestAnimationFrame(draw);
  }
};

function widgetPanel(name) {
  var w = WIDGETS[name];
  var body = h('div', { class: 'try-body' });
  var panel = h('div', { class: 'try' }, [h('div', { class: 'try-head' }, [h('span', { class: 'tag', text: 'Try it' }), h('h4', { text: w.title })]), body]);
  w.render(body);
  return panel;
}
var INLINE = [
  { ch: 'ch02', after: 'ch02-2-3-3-how-sec-websocket-accept-is-computed', widget: 'accept' },
  { ch: 'ch02', after: 'ch02-2-4-4-decoding-real-frames', widget: 'frame' },
  { ch: 'ch02', after: 'ch02-2-5-3-close-status-codes-memorise-the-common-ones', widget: 'close' },
  { ch: 'ch03', after: 'ch03-3-5-reconnect-done-right', widget: 'backoff' },
  { ch: 'ch04', after: 'ch04-4-3-7-size-limits', widget: 'stomp' },
  { ch: 'ch04', after: 'ch04-4-5-1-negotiation', widget: 'heartbeat' },
  { ch: 'ch05', after: 'ch05-5-4-6-follow-one-message-end-to-end', widget: 'flow' }
];
var labBuilt = false;
function buildLab() {
  if (labBuilt) return; labBuilt = true;
  var grid = $('#labGrid');
  ['accept', 'frame', 'stomp', 'heartbeat', 'close', 'flow', 'backoff'].forEach(function (k) { grid.appendChild(widgetPanel(k)); });
}

// ------------------------------------------------------------------ flashcards
var known = store.get('known', {});
var deckState = { lvl: 'all', topic: 'all', mode: 'todo', order: CARDS.map(function (_, i) { return i; }), i: 0 };
var deckInit = false, deckList = [];
function initDeck() {
  if (!deckInit) {
    deckInit = true;
    var topics = [];
    CARDS.forEach(function (c) { if (topics.indexOf(c.topic) === -1) topics.push(c.topic); });
    var sel = $('#topicSel');
    sel.appendChild(h('option', { value: 'all', text: 'All topics (' + CARDS.length + ')' }));
    topics.forEach(function (t) { sel.appendChild(h('option', { value: t, text: t + ' (' + CARDS.filter(function (c) { return c.topic === t; }).length + ')' })); });
    sel.addEventListener('change', function () { deckState.topic = sel.value; deckState.i = 0; renderDeck(); });
    $$('#lvlSeg button').forEach(function (b) { b.addEventListener('click', function () { deckState.lvl = b.dataset.lvl; $$('#lvlSeg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); deckState.i = 0; renderDeck(); }); });
    $$('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { deckState.mode = b.dataset.mode; $$('#modeSeg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); deckState.i = 0; renderDeck(); }); });
    $('#shuffleBtn').addEventListener('click', function () {
      var o = deckState.order; for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = o[i]; o[i] = o[j]; o[j] = t; }
      deckState.i = 0; renderDeck(); toast('Deck shuffled');
    });
    $('#resetCards').addEventListener('click', function () {
      var b = $('#resetCards');
      if (b.dataset.confirm) { known = {}; store.set('known', known); delete b.dataset.confirm; b.textContent = 'Reset progress'; renderDeck(); toast('Card progress cleared'); }
      else { b.dataset.confirm = '1'; b.textContent = 'Click again to confirm'; setTimeout(function () { delete b.dataset.confirm; b.textContent = 'Reset progress'; }, 3000); }
    });
  }
  renderDeck();
}
function filtered() {
  return deckState.order.map(function (i) { return CARDS[i]; }).filter(function (c) {
    return (deckState.lvl === 'all' || c.level === deckState.lvl) && (deckState.topic === 'all' || c.topic === deckState.topic) && (deckState.mode === 'all' || !known[c.id]);
  });
}
function renderDeck() {
  deckList = filtered();
  if (deckState.i >= deckList.length) deckState.i = Math.max(0, deckList.length - 1);
  var nKnown = Object.keys(known).length;
  $('#knownCount').textContent = nKnown; $('#knownBar').style.width = (nKnown / CARDS.length * 100) + '%';
  $('#cardCount').textContent = deckList.length; $('#cardPos').textContent = deckList.length ? deckState.i + 1 : 0;
  var deck = $('#deck'); deck.innerHTML = '';
  if (!deckList.length) {
    deck.appendChild(h('div', { class: 'empty', html: deckState.mode === 'todo' ? '<b>You know every card in this selection.</b><br>Choose "All cards" to review them, or pick another topic.' : 'No cards match these filters.' }));
    return;
  }
  var c = deckList[deckState.i], lvlName = { E: 'Entry', M: 'Mid', S: 'Senior' }[c.level];
  var flash = h('div', { class: 'flash', tabindex: '0', role: 'button', 'aria-label': 'Flip card' });
  var inner = h('div', { class: 'flash-inner' }, [
    h('div', { class: 'face front' }, [
      h('div', { class: 'meta' }, [h('span', { class: 'lvl lvl-' + c.level, text: lvlName }), h('span', { text: c.topic + ' · ' + c.id }), known[c.id] ? h('span', { class: 'state done', text: 'Known' }) : null]),
      h('p', { class: 'q', html: c.q }),
      h('div', { class: 'tap', text: 'Answer it out loud, then tap the card or press space to flip.' })
    ]),
    h('div', { class: 'face back' }, [
      h('div', { class: 'meta' }, [h('span', { class: 'lvl lvl-' + c.level, text: lvlName }), h('span', { text: 'Answer · ' + c.id })]),
      h('div', { class: 'a', html: c.a })
    ])
  ]);
  flash.appendChild(inner);
  flash.addEventListener('click', function (e) { if (!e.target.closest('a')) flash.classList.toggle('flipped'); });
  deck.appendChild(flash);
  var prev = h('button', { class: 'btn', type: 'button', text: '← Previous' }), next = h('button', { class: 'btn', type: 'button', text: 'Next →' });
  var good = h('button', { class: 'btn good', type: 'button', text: 'I knew it (K)' }), again = h('button', { class: 'btn again', type: 'button', text: 'Review again (R)' });
  prev.addEventListener('click', function () { move(-1); }); next.addEventListener('click', function () { move(1); });
  good.addEventListener('click', function () { rate(true); }); again.addEventListener('click', function () { rate(false); });
  deck.appendChild(h('div', { class: 'deck-actions' }, [h('div', { class: 'grp' }, [prev, next]), h('div', { class: 'grp' }, [again, good])]));
}
function move(d) { if (!deckList.length) return; deckState.i = (deckState.i + d + deckList.length) % deckList.length; renderDeck(); }
function rate(k) {
  var c = deckList[deckState.i]; if (!c) return;
  if (k) known[c.id] = true; else delete known[c.id];
  store.set('known', known);
  if (deckState.mode === 'todo' && k) { renderDeck(); } else move(1);
  toast(k ? 'Marked as known' : 'Kept in your review pile');
}
function deckKey(e) {
  var f = $('#deck .flash');
  if (e.key === ' ' && f) { e.preventDefault(); f.classList.toggle('flipped'); }
  else if (e.key === 'ArrowRight') move(1);
  else if (e.key === 'ArrowLeft') move(-1);
  else if (e.key.toLowerCase() === 'k') rate(true);
  else if (e.key.toLowerCase() === 'r') rate(false);
}

// ------------------------------------------------------------------ boot
buildRail();
refreshProgress();
route();
})();
