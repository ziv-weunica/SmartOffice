/* Unica Home – core: widget registry, device state (`home`), built-in widgets, boot.
   No build step, no framework. Add features by registering widgets from another file:
     Widgets.register({ id, size, order, render(el, home) { ... } })
   All state changes go through home.set(path, value) so the local store can later be
   swapped for Home Assistant / MQTT without touching any widget. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const ICONS = {
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    snow: '<path d="M12 2v20M4.2 7l15.6 10M19.8 7 4.2 17M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/>',
    blinds: '<path d="M4 4h16M5 4v10M19 4v10M5 8h14M5 11h14M5 14h14M12 14v4"/><circle cx="12" cy="20" r="1.2"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    arrive: '<path d="M3 11.5 12 4l9 7.5M6 10v10h12V10M10 20v-5h4v5"/>',
    work: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    away: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    cam: '<path d="M3 8h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3zM15 11l6-3v8l-6-3"/>',
    plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="16" cy="14" r="2.5"/><path d="M7 12h4M7 15h4M5 8l13-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>'
  };
  const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- home: device state in localStorage ---------- */
  const STORE_KEY = 'unica.home.v2'; // v2: office areas (v1 held the old home rooms)
  const DEFAULTS = () => ({
    lights: {
      general: { name: 'תאורה כללית', on: true, level: 80 },
      spotsMain: { name: 'ספוטים ראשי', on: true, level: 70 },
      spotsSmall: { name: 'ספוטים קטנים', on: false, level: 50 }
    },
    climate: {
      main: { name: 'אזור ראשי / מטבח', on: true, temp: 23, mode: 'cool' },
      dev1: { name: 'משרד פיתוח 1', on: true, temp: 24, mode: 'auto' },
      dev2: { name: 'משרד פיתוח 2', on: false, temp: 24, mode: 'auto' },
      meeting: { name: 'חדר ישיבות', on: false, temp: 23, mode: 'cool' },
      office3: { name: 'משרד 3', on: false, temp: 24, mode: 'auto' },
      office4: { name: 'משרד 4', on: false, temp: 24, mode: 'auto' },
      office5: { name: 'משרד 5', on: false, temp: 24, mode: 'auto' }
    },
    blinds: {
      dev: { name: 'משרד מפתחים', pos: 100 },
      meeting: { name: 'חדר ישיבות', pos: 60 },
      liron: { name: 'משרד לירון / זיו', pos: 100 }
    },
    security: { armed: false, doorLocked: true },
    energy: { now: 1.8, today: 12.4, solar: 3.2, cost: 9.6 }
  });

  const home = (() => {
    let state;
    try { state = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { state = null; }
    const def = DEFAULTS();
    // merge so new devices added in code appear for existing users
    state = Object.assign(def, state && typeof state === 'object' ? state : {});
    for (const k of Object.keys(DEFAULTS())) if (!state[k]) state[k] = DEFAULTS()[k];

    const listeners = [];
    let batching = 0, pending = false;
    const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage may be unavailable */ } };
    const parts = (p) => String(p).split('.');
    const api = {
      get(path) { return parts(path).reduce((o, k) => (o == null ? undefined : o[k]), state); },
      /* the single write path – replace this body with a Home Assistant / MQTT call later */
      set(path, val, opts = {}) {
        const ks = parts(path), last = ks.pop();
        const obj = ks.reduce((o, k) => o[k], state);
        if (obj[last] === val) return;
        obj[last] = val;
        persist();
        if (opts.silent) return;
        if (batching) { pending = true; return; }
        listeners.forEach((fn) => fn(path, val));
      },
      batch(fn) {
        batching++;
        try { fn(); } finally {
          batching--;
          if (!batching && pending) { pending = false; listeners.forEach((f) => f('*', null)); }
        }
      },
      on(fn) { listeners.push(fn); },
      keys(path) { return Object.keys(api.get(path) || {}); },
      snapshot() { return JSON.parse(JSON.stringify(state)); },
      reset() { state = DEFAULTS(); persist(); listeners.forEach((f) => f('*', null)); }
    };
    return api;
  })();

  /* ---------- pages (swipe pager) + widget registry ---------- */
  const PAGES = [
    { id: 'media', label: 'מדיה', icon: 'radio' },
    { id: 'lights', label: 'תאורה', icon: 'bulb' },
    { id: 'climate', label: 'מיזוג', icon: 'snow' },
    { id: 'blinds', label: 'תריסים', icon: 'blinds' },
    { id: 'security', label: 'אבטחה', icon: 'shield' },
    { id: 'energy', label: 'אנרגיה', icon: 'bolt' }
  ];
  const LAST_PAGE_KEY = 'unica.page.v1';

  const Pager = (() => {
    let raf = 0, active = null;
    const pager = () => $('#pager');
    const pageEl = (id) => $(`.page[data-page="${id}"]`, pager());
    function ensure(id, label, ico) {
      let el = pageEl(id);
      if (el) return el;
      if (!PAGES.some((p) => p.id === id)) PAGES.push({ id, label: label || id, icon: ico || 'sparkle' });
      el = document.createElement('section');
      el.className = 'page'; el.dataset.page = id;
      el.innerHTML = '<div class="page-grid"></div>';
      pager().appendChild(el);
      drawTabs();
      return el;
    }
    function drawTabs() {
      const nav = $('#tabs');
      nav.innerHTML = PAGES.map((p) =>
        `<button class="tabbtn" role="tab" data-page="${p.id}" aria-selected="false">${icon(p.icon)}<span>${p.label}</span></button>`).join('') +
        `<button class="theme-toggle" role="switch" aria-checked="false" aria-label="מצב בהיר / כהה">${icon('moon', 'moon')}${icon('sun', 'sun')}</button>`;
      Theme.set(Theme.get());                 // sync toggle state with the saved theme
      mark();
    }
    const index = () => Math.round(Math.abs(pager().scrollLeft) / (pager().clientWidth || 1));
    function mark() {
      const pages = [...pager().querySelectorAll('.page')];
      const cur = pages[Math.min(index(), pages.length - 1)];
      const id = cur ? cur.dataset.page : null;
      document.querySelectorAll('.tabbtn').forEach((b) => {
        const on = b.dataset.page === id;
        b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
        if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      if (id && id !== active) { active = id; try { localStorage.setItem(LAST_PAGE_KEY, id); } catch (e) { /* ignore */ } }
    }
    function goto(id, instant) {
      const el = pageEl(id);
      if (el) el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
    }
    function step(d) {                       // d = +1 next page (swipe left in RTL), -1 previous
      const pages = [...pager().querySelectorAll('.page')];
      const i = Math.max(0, Math.min(pages.length - 1, index() + d));
      goto(pages[i].dataset.page);
    }
    function init() {
      PAGES.forEach((p) => ensure(p.id));
      drawTabs();
      $('#tabs').onclick = (e) => {
        if (e.target.closest('.theme-toggle')) return Theme.toggle();
        const b = e.target.closest('.tabbtn'); if (b) goto(b.dataset.page);
      };
      pager().addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); }, { passive: true });
      window.addEventListener('resize', () => { if (active) goto(active, true); });
      document.addEventListener('keydown', (e) => {
        if (e.target.matches('input,textarea')) return;
        if (e.key === 'ArrowLeft') step(1); else if (e.key === 'ArrowRight') step(-1);
      });
      mark();
    }
    function restore() {
      let last = null; try { last = localStorage.getItem(LAST_PAGE_KEY); } catch (e) { /* ignore */ }
      if (last) goto(last, true);
      mark();
    }
    return { init, restore, ensure, goto, step, get current() { return active; } };
  })();

  const Widgets = (() => {
    const list = new Map();
    return {
      list,
      /* page: id of the pager page this widget lives on (default 'more'); fill: stretch to page height */
      register(w) {
        if (!w || !w.id || typeof w.render !== 'function') throw new Error('Widgets.register: id and render() required');
        list.set(w.id, Object.assign({ size: 12, order: 100, page: 'more' }, w));
        if (Widgets.mounted) Widgets.mount(list.get(w.id)); // late registration
      },
      mounted: false,
      mount(w) {
        const page = Pager.ensure(w.page, w.pageLabel, w.pageIcon);
        const grid = $('.page-grid', page);
        let el = $(`[data-widget="${w.id}"]`, grid);
        if (!el) {
          el = document.createElement('section');
          el.className = 'card widget' + (w.fill ? ' fill' : '');
          el.dataset.widget = w.id;
          grid.appendChild(el);
        }
        el.style.order = w.order;
        w.render(el, home);
      },
      refresh(id) {
        const w = list.get(id), el = $(`[data-widget="${id}"]`);
        if (w && el) w.render(el, home);
      },
      /* re-render everything except `skip` ids (used so music keeps playing) */
      refreshAll(skip = []) { list.forEach((w, id) => { if (!skip.includes(id)) Widgets.refresh(id); }); }
    };
  })();

  /* a widget whose state lives under home.<id> re-renders when its path changes */
  const STATEFUL = ['lights', 'climate', 'blinds', 'security', 'energy'];
  const NO_RERENDER = ['radio']; // never torn down by scenes
  home.on((path) => {
    if (path === '*') return Widgets.refreshAll(NO_RERENDER);
    const root = path.split('.')[0];
    if (STATEFUL.includes(root)) Widgets.refresh(root);
  });

  /* ---------- shared widget pieces ---------- */
  const head = (ico, title, extra = '') =>
    `<div class="card-head"><div class="card-title">${icon(ico)}<h2>${title}</h2></div>${extra}</div>`;
  const switchEl = (on, attrs = '') =>
    `<button class="switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" ${attrs}><span></span></button>`;

  /* ---------- lights ---------- */
  Widgets.register({
    id: 'lights', page: 'lights', fill: true, size: 12, order: 1,
    render(el, h) {
      const rooms = h.keys('lights');
      const anyOn = rooms.some((r) => h.get(`lights.${r}.on`));
      el.innerHTML = head('bulb', 'תאורה', `<button class="btn ghost" data-all>${anyOn ? 'כבה הכל' : 'הדלק הכל'}</button>`) +
        `<div class="rows">${rooms.map((r) => {
          const d = h.get(`lights.${r}`);
          return `<div class="row${d.on ? ' active' : ''}" data-room="${r}">
            <div class="row-main"><span class="row-name">${esc(d.name)}</span><span class="row-val">${d.on ? d.level + '%' : 'כבוי'}</span></div>
            <input type="range" min="5" max="100" step="5" value="${d.level}" class="slider warm" aria-label="עוצמת תאורה ${esc(d.name)}" ${d.on ? '' : 'disabled'}>
            ${switchEl(d.on, `aria-label="${esc(d.name)}"`)}
          </div>`;
        }).join('')}</div>`;
      el.querySelector('[data-all]').onclick = () => h.batch(() => rooms.forEach((r) => h.set(`lights.${r}.on`, !anyOn)));
      el.querySelectorAll('.row').forEach((row) => {
        const r = row.dataset.room, rng = row.querySelector('input'), val = row.querySelector('.row-val');
        row.querySelector('.switch').onclick = () => h.set(`lights.${r}.on`, !h.get(`lights.${r}.on`));
        rng.oninput = () => { val.textContent = rng.value + '%'; h.set(`lights.${r}.level`, +rng.value, { silent: true }); };
      });
    }
  });

  /* ---------- climate ---------- */
  const MODES = { cool: 'קירור', heat: 'חימום', fan: 'מאוורר', auto: 'אוטו' };
  Widgets.register({
    id: 'climate', page: 'climate', fill: true, size: 12, order: 1,
    render(el, h) {
      const zones = h.keys('climate');
      el.innerHTML = head('snow', 'מיזוג') + `<div class="zones${zones.length > 4 ? ' dense' : ''}">${zones.map((z) => {
        const d = h.get(`climate.${z}`);
        return `<div class="zone${d.on ? ' active' : ''}" data-zone="${z}">
          <div class="zone-top"><span class="row-name">${esc(d.name)}</span>${switchEl(d.on, `aria-label="${esc(d.name)}"`)}</div>
          <div class="temp">
            <button class="round" data-d="-1" aria-label="הורד" ${d.on ? '' : 'disabled'}>${icon('minus')}</button>
            <div class="temp-val"><b>${d.temp}</b><small>°C</small></div>
            <button class="round" data-d="1" aria-label="הגבר" ${d.on ? '' : 'disabled'}>${icon('plus')}</button>
          </div>
          <div class="modes">${Object.entries(MODES).map(([k, v]) =>
            `<button class="chip${d.mode === k ? ' sel' : ''}" data-mode="${k}" ${d.on ? '' : 'disabled'}>${v}</button>`).join('')}</div>
        </div>`;
      }).join('')}</div>`;
      el.querySelectorAll('.zone').forEach((zn) => {
        const z = zn.dataset.zone;
        zn.querySelector('.switch').onclick = () => h.set(`climate.${z}.on`, !h.get(`climate.${z}.on`));
        zn.querySelectorAll('[data-d]').forEach((b) => b.onclick = () =>
          h.set(`climate.${z}.temp`, clamp(h.get(`climate.${z}.temp`) + +b.dataset.d, 16, 30)));
        zn.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => h.set(`climate.${z}.mode`, b.dataset.mode));
      });
    }
  });

  /* ---------- blinds ---------- */
  Widgets.register({
    id: 'blinds', page: 'blinds', fill: true, size: 12, order: 1,
    render(el, h) {
      const rooms = h.keys('blinds');
      el.innerHTML = head('blinds', 'תריסים', `<div class="btn-group"><button class="btn ghost" data-all="100">פתח הכל</button><button class="btn ghost" data-all="0">סגור הכל</button></div>`) +
        `<div class="rows">${rooms.map((r) => {
          const d = h.get(`blinds.${r}`);
          return `<div class="row blind" data-room="${r}">
            <div class="row-main"><span class="row-name">${esc(d.name)}</span><span class="row-val">${d.pos === 0 ? 'סגור' : d.pos === 100 ? 'פתוח' : d.pos + '%'}</span></div>
            <input type="range" min="0" max="100" step="10" value="${d.pos}" class="slider" aria-label="תריס ${esc(d.name)}">
          </div>`;
        }).join('')}</div>`;
      el.querySelectorAll('[data-all]').forEach((b) => b.onclick = () =>
        h.batch(() => rooms.forEach((r) => h.set(`blinds.${r}.pos`, +b.dataset.all))));
      el.querySelectorAll('.row').forEach((row) => {
        const r = row.dataset.room, rng = row.querySelector('input'), val = row.querySelector('.row-val');
        const label = (v) => (v === 0 ? 'סגור' : v === 100 ? 'פתוח' : v + '%');
        rng.oninput = () => { val.textContent = label(+rng.value); h.set(`blinds.${r}.pos`, +rng.value, { silent: true }); };
      });
    }
  });

  /* ---------- security ---------- */
  Widgets.register({
    id: 'security', page: 'security', fill: true, size: 12, order: 1,
    render(el, h) {
      const armed = h.get('security.armed'), locked = h.get('security.doorLocked');
      el.innerHTML = head('shield', 'אבטחה') + `
        <div class="rows">
          <div class="row sec${armed ? ' active' : ''}">
            <div class="row-main"><span class="row-name">אזעקה</span><span class="row-val">${armed ? 'דרוכה' : 'כבויה'}</span></div>
            ${switchEl(armed, 'data-alarm aria-label="אזעקה"')}
          </div>
          <div class="row sec${locked ? ' active' : ''}">
            <div class="row-main"><span class="row-name">דלת כניסה</span><span class="row-val">${locked ? 'נעולה' : 'פתוחה'}</span></div>
            <button class="btn ghost" data-door>${icon(locked ? 'unlock' : 'lock')}<span>${locked ? 'פתח' : 'נעל'}</span></button>
          </div>
        </div>
        <div class="cams">
          ${['מצלמת כניסה', 'מצלמה איזור כללי'].map((n) => `<div class="cam">${icon('cam')}<span>${n}</span><em>מקום שמור</em></div>`).join('')}
        </div>`;
      el.querySelector('[data-alarm]').onclick = () => h.set('security.armed', !armed);
      el.querySelector('[data-door]').onclick = () => h.set('security.doorLocked', !locked);
    }
  });

  /* ---------- energy (demo data) ---------- */
  Widgets.register({
    id: 'energy', page: 'energy', size: 12, order: 1,
    render(el, h) {
      const e = h.get('energy');
      const bars = [0.35, 0.3, 0.28, 0.32, 0.5, 0.7, 0.62, 0.55, 0.8, 0.95, 0.7, 0.6];
      el.innerHTML = head('bolt', 'אנרגיה', '<span class="tag">נתוני דמו</span>') + `
        <div class="stats">
          <div class="stat"><b>${e.now}</b><small>kW עכשיו</small></div>
          <div class="stat"><b>${e.today}</b><small>kWh היום</small></div>
          <div class="stat sun"><b>${e.solar}</b><small>kW סולארי</small></div>
          <div class="stat"><b>₪${e.cost}</b><small>עלות היום</small></div>
        </div>
        <div class="spark" aria-hidden="true">${bars.map((v) => `<i style="height:${Math.round(v * 100)}%"></i>`).join('')}</div>`;
    }
  });

  /* ---------- placeholder ---------- */
  Widgets.register({
    id: 'placeholder', page: 'energy', size: 12, order: 999,
    render(el) {
      el.classList.add('placeholder');
      el.innerHTML = `${icon('sparkle')}<span>כאן יתווספו יכולות חדשות</span>`;
    }
  });

  /* ---------- scenes ---------- */
  const SCENES = {
    arrive: { label: 'הגעה', icon: 'arrive', apply(h) {
      h.set('security.armed', false); h.set('security.doorLocked', true);
      h.set('lights.general.on', true); h.set('lights.general.level', 80);
      h.set('lights.spotsMain.on', true); h.set('lights.spotsMain.level', 70);
      h.set('climate.main.on', true); h.set('climate.main.temp', 23);
      h.keys('blinds').forEach((r) => h.set(`blinds.${r}.pos`, 100));
    } },
    work: { label: 'עבודה', icon: 'work', apply(h) {
      h.set('lights.general.on', true); h.set('lights.general.level', 90);
      h.set('lights.spotsMain.on', true); h.set('lights.spotsSmall.on', false);
      ['dev1', 'dev2'].forEach((z) => { h.set(`climate.${z}.on`, true); h.set(`climate.${z}.temp`, 24); h.set(`climate.${z}.mode`, 'auto'); });
      h.set('blinds.dev.pos', 70); h.set('blinds.liron.pos', 70);
    } },
    night: { label: 'לילה', icon: 'moon', apply(h) {
      h.keys('lights').forEach((r) => h.set(`lights.${r}.on`, false));
      h.keys('climate').forEach((z) => h.set(`climate.${z}.on`, false));
      h.keys('blinds').forEach((r) => h.set(`blinds.${r}.pos`, 0));
      h.set('security.armed', true); h.set('security.doorLocked', true);
      if (window.unica && window.unica.radio) window.unica.radio.stop();
    } },
    away: { label: 'יציאה', icon: 'away', apply(h) {
      h.keys('lights').forEach((r) => h.set(`lights.${r}.on`, false));
      h.keys('climate').forEach((z) => h.set(`climate.${z}.on`, false));
      h.keys('blinds').forEach((r) => h.set(`blinds.${r}.pos`, 0));
      h.set('security.armed', true); h.set('security.doorLocked', true);
      if (window.unica && window.unica.radio) window.unica.radio.stop();
    } }
  };

  function applyScene(id) {
    const s = SCENES[id];
    if (!s) return false;
    home.batch(() => s.apply(home));          // one refresh, radio card untouched
    document.querySelectorAll('.scene').forEach((b) => b.classList.toggle('on', b.dataset.scene === id));
    toast('סצנה: ' + s.label);
    return true;
  }

  /* ---------- theme (dark / light) ---------- */
  const THEME_KEY = 'unica.theme.v1';
  const Theme = {
    get() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; },
    set(t) {
      t = t === 'light' ? 'light' : 'dark';
      if (t === 'light') document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
      try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
      const m = $('#meta-theme'); if (m) m.setAttribute('content', t === 'light' ? '#e9f1eb' : '#0b0f14');
      const b = $('.theme-toggle'); if (b) { b.setAttribute('aria-checked', t === 'light'); b.setAttribute('title', t === 'light' ? 'מצב כהה' : 'מצב בהיר'); }
    },
    toggle() { Theme.set(Theme.get() === 'light' ? 'dark' : 'light'); }
  };

  function renderScenes() {
    const nav = $('#scenes');
    nav.innerHTML = Object.entries(SCENES).map(([id, s]) =>
      `<button class="scene" data-scene="${id}">${icon(s.icon)}<span>${s.label}</span></button>`).join('');
    nav.onclick = (e) => { const b = e.target.closest('.scene'); if (b) applyScene(b.dataset.scene); };
  }

  /* ---------- clock ---------- */
  function tickClock() {
    const d = new Date();
    $('#clock-time').textContent = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
    $('#clock-date').textContent = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /* ---------- public API ---------- */
  window.Widgets = Widgets;
  window.unica = Object.assign(window.unica || {}, {
    home, Widgets, Pager, Theme, icon, esc, toast,
    scene: applyScene,
    lights: {
      all(on) { home.batch(() => home.keys('lights').forEach((r) => home.set(`lights.${r}.on`, !!on))); },
      set(room, on, level) { home.set(`lights.${room}.on`, !!on); if (level != null) home.set(`lights.${room}.level`, level); }
    },
    climate: { set(zone, temp) { home.set(`climate.${zone}.temp`, clamp(temp, 16, 30)); } },
    blinds: { set(room, pos) { home.set(`blinds.${room}.pos`, clamp(pos, 0, 100)); } },
    security: { arm(on) { home.set('security.armed', !!on); } }
  });

  /* ---------- boot ---------- */
  function boot() {
    renderScenes();
    tickClock(); setInterval(tickClock, 1000);
    Pager.init();
    Widgets.list.forEach((w) => Widgets.mount(w));
    Widgets.mounted = true;
    Pager.restore();
    const sp = $('#splash');
    if (sp) { setTimeout(() => sp.classList.add('hide'), 700); setTimeout(() => sp.remove(), 1300); }
  }
  document.addEventListener('DOMContentLoaded', boot);

  /* Keep the display awake while the page is visible (PWA / browser). The Android app also sets FLAG_KEEP_SCREEN_ON natively. */
  (function keepAwake() {
    if (!('wakeLock' in navigator)) return;
    let lock = null;
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (e) { /* denied: battery saver or no user gesture yet */ }
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !lock) acquire(); });
    document.addEventListener('pointerdown', () => { if (!lock) acquire(); }, { passive: true });
    acquire();
  })();

  /* PWA: offline app shell. Skipped inside the Capacitor APK (assets are already local). */
  if ('serviceWorker' in navigator && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* needs https or localhost */ }));
  }
})();
