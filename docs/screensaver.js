/* Unica Smart Office – screensaver (company logo on black).
   Starts after a few minutes without touch. Any touch/key wakes it.
   Cycle: fade in at a random spot → binary digits melt down like "matrix" → letters dissolve one by one
   (random order) → black → next cycle at a new random spot.
   API: unica.screensaver.start() / stop() / setMinutes(n) / setEnabled(bool) / state */
(function () {
  'use strict';
  const KEY = 'unica.saver.v1';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VB_W = 277, VB_H = 71;                          // logo.svg viewBox
  const T = { toBlack: 700, fadeIn: 2200, hold: 3200, gap: 700, letterEvery: 720, letterDur: 1600, endBlack: 1400 };

  const cfg = (() => {
    let c = { minutes: 5, enabled: true };
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') c = Object.assign(c, s); } catch (e) { /* ignore */ }
    return c;
  })();
  const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } };

  let logoSvg = null;                                   // fetched once
  let root = null, active = false, token = 0, lastPos = null, lastActivity = Date.now(), wakeTimer = 0;

  async function loadLogo() {
    if (logoSvg) return logoSvg;
    try { logoSvg = await (await fetch('assets/logo.svg')).text(); } catch (e) { logoSvg = null; }
    return logoSvg;
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  function wait(ms, tok) { return new Promise((res) => setTimeout(() => res(tok === token && active), ms)); }

  /* wrap an SVG element in a plain <g> so CSS transforms don't fight its own transform="" attribute */
  function wrap(el) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'ss-fx');
    el.parentNode.insertBefore(g, el);
    g.appendChild(el);
    return g;
  }

  function build() {
    root = document.createElement('div');
    root.id = 'screensaver';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="ss-logo"></div>';
    document.body.appendChild(root);
    const holder = root.querySelector('.ss-logo');
    holder.innerHTML = logoSvg;
    const svg = holder.querySelector('svg');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('viewBox', '181 19 277 71');
    svg.querySelectorAll('[clip-path]').forEach((n) => n.removeAttribute('clip-path'));   // so melting digits can fall past the glyph boxes
    const digits = [...svg.querySelectorAll('g[fill="#38b6ff"] > g')].map(wrap);
    const letters = [...svg.querySelectorAll('g[fill="#ffffff"]')].map(wrap);
    return { holder, svg, digits, letters };
  }

  function place(holder) {
    const vw = innerWidth, vh = innerHeight;
    const W = Math.min(vw * 0.5, 560), H = W * VB_H / VB_W, m = 24;
    const maxL = Math.max(m, vw - W - m), maxT = Math.max(m, vh - H - m);
    let l, t, tries = 0;
    do { l = rnd(m, maxL); t = rnd(m + 10, maxT); tries++; }
    while (lastPos && tries < 12 && Math.abs(l - lastPos.l) + Math.abs(t - lastPos.t) < (vw + vh) * 0.3);
    lastPos = { l, t };
    holder.style.cssText = `left:${l}px;top:${t}px;width:${W}px;height:${H}px`;
    return W;
  }

  async function cycle(parts, tok) {
    const { holder, svg, digits, letters } = parts;
    const W = place(holder), unit = VB_W / W;           // px → svg user units
    const all = [...digits, ...letters];
    all.forEach((g) => g.getAnimations().forEach((a) => a.cancel()));
    svg.style.opacity = '0';
    // 2. fade in
    svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 400 : T.fadeIn, easing: 'ease-out', fill: 'forwards' });
    if (!(await wait((reduce ? 400 : T.fadeIn) + T.hold, tok))) return false;

    // 3. digits melt down like matrix rain (left columns first, with jitter)
    const rects = digits.map((g) => g.getBoundingClientRect());
    const minX = Math.min(...rects.map((r) => r.left)), spanX = Math.max(1, Math.max(...rects.map((r) => r.right)) - minX);
    let digitsEnd = 0;
    digits.forEach((g, i) => {
      const col = (rects[i].left - minX) / spanX;
      const delay = col * 1500 + rnd(0, 700), dur = rnd(2400, 3600);
      const fall = rnd(0.45, 0.9) * innerHeight * unit, stretch = rnd(4, 9);
      digitsEnd = Math.max(digitsEnd, delay + dur);
      g.style.transformBox = 'fill-box'; g.style.transformOrigin = '50% 0%';
      g.animate([
        { opacity: 1, transform: 'translateY(0) scaleY(1)', filter: 'brightness(1)' },
        { opacity: 1, offset: 0.1, filter: 'brightness(2.4)' },
        { opacity: 0.95, offset: 0.7, filter: 'brightness(1.4)' },
        { opacity: 0, transform: `translateY(${fall}px) scaleY(${stretch})`, filter: 'brightness(1)' }
      ], { duration: dur, delay, easing: 'cubic-bezier(.45,0,.85,.55)', fill: 'forwards' });
    });
    if (!(await wait(reduce ? 600 : digitsEnd + T.gap, tok))) return false;

    // 4. letters dissolve one by one, random order
    const order = shuffle(letters.slice());
    order.forEach((g, i) => {
      g.style.transformBox = 'fill-box'; g.style.transformOrigin = '50% 50%';
      g.animate([
        { opacity: 1, filter: 'blur(0px)', transform: 'scale(1) translateY(0)' },
        { opacity: 0.7, offset: 0.35, filter: 'blur(1.5px)' },
        { opacity: 0, filter: 'blur(7px)', transform: 'scale(1.14) translateY(-4px)' }
      ], { duration: T.letterDur, delay: i * T.letterEvery, easing: 'ease-in', fill: 'forwards' });
    });
    // 5. black, then restart elsewhere
    return wait(order.length * T.letterEvery + T.letterDur + T.endBlack, tok);
  }

  async function run(tok) {
    if (!(await loadLogo()) || tok !== token) return;
    const parts = build();
    root.classList.add('on');                           // 1. to black
    if (!(await wait(reduce ? 100 : T.toBlack, tok))) return;
    while (await cycle(parts, tok)) { /* endless */ }
  }

  function start() {
    if (active || document.hidden) return;
    active = true; token++;
    clearTimeout(wakeTimer);
    const old = document.getElementById('screensaver'); if (old) old.remove();
    run(token);
  }

  function stop() {
    if (!active) return;
    active = false; token++;
    lastActivity = Date.now();
    const r = root; root = null;
    if (!r) return;
    r.classList.remove('on');                           // quick fade; overlay stays ~0.45s so the waking tap hits it, not the UI below
    wakeTimer = setTimeout(() => r.remove(), 450);
  }

  /* idle detection */
  const bump = () => { lastActivity = Date.now(); };
  ['pointermove', 'touchstart', 'keydown', 'wheel'].forEach((ev) => document.addEventListener(ev, () => { if (!active) bump(); }, { capture: true, passive: true }));
  document.addEventListener('pointerdown', (e) => {
    if (window.__SS_DEMO) return;                       // demo page: runs until closed
    if (active) { e.preventDefault(); e.stopPropagation(); stop(); } else bump();
  }, { capture: true });
  document.addEventListener('keydown', () => { if (active && !window.__SS_DEMO) stop(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else bump(); });
  setInterval(() => {
    if (cfg.enabled && !active && Date.now() - lastActivity >= cfg.minutes * 60000) start();
  }, 2000);
  window.addEventListener('load', loadLogo);            // warm the cache so the first start is instant

  window.unica = Object.assign(window.unica || {}, {
    screensaver: {
      start, stop,
      setMinutes(n) { cfg.minutes = Math.max(0.1, +n || 5); saveCfg(); },
      setEnabled(b) { cfg.enabled = !!b; saveCfg(); if (!b) stop(); },
      get state() { return { active, minutes: cfg.minutes, enabled: cfg.enabled }; }
    }
  });
})();
