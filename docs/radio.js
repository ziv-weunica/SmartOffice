/* Unica Home – radio widget (Radio Browser connector).
   Radio Browser (radio-browser.info) is an open, free, key-less API with CORS.
   Stream URLs are never hard-coded: they are resolved through /json/url/{uuid} right before playback.
   Public API: unica.radio.play('Kan Bet'), pause(), stop(), toggle(), setVolume(0..1), sleep(minutes) */
(function () {
  'use strict';
  const { esc, icon, toast } = window.unica;

  const MIRRORS = ['de1', 'at1', 'nl1'].map((s) => `https://${s}.api.radio-browser.info`);
  const FAV_KEY = 'unica.radio.favs.v1', LAST_KEY = 'unica.radio.last.v1', VOL_KEY = 'unica.radio.vol.v1';
  const SLEEP_STEPS = [0, 30, 60, 120];
  const TABS = [
    { id: 'favs', label: '⭐ מועדפים' },
    { id: 'il', label: 'ישראל', params: { countrycode: 'IL' } },
    { id: 'lounge', label: 'לאונג׳', params: { tag: 'lounge' } },
    { id: 'jazz', label: 'ג׳אז', params: { tag: 'jazz' } },
    { id: 'classical', label: 'קלאסית', params: { tag: 'classical' } },
    { id: 'chillout', label: 'צ׳יל', params: { tag: 'chillout' } },
    { id: 'ambient', label: 'אמביינט', params: { tag: 'ambient' } },
    { id: 'pop', label: 'פופ', params: { tag: 'pop' } },
    { id: 'rock', label: 'רוק', params: { tag: 'rock' } },
    { id: 'news', label: 'חדשות', params: { tag: 'news' } }
  ];

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }  };

  /* ---------- API with mirror fallback ---------- */
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const httpsOnly = location.protocol === 'https:' && !isNative; // native app allows http streams
  let mirrorIdx = 0;
  async function api(path, params) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    let lastErr;
    for (let i = 0; i < MIRRORS.length; i++) {
      const base = MIRRORS[(mirrorIdx + i) % MIRRORS.length];
      try {
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(base + path + qs, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        mirrorIdx = (mirrorIdx + i) % MIRRORS.length;
        return await r.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('radio-browser unreachable');
  }

  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((s) => {
      const k = (s.name || '').trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k); return true;
    });
  };
  const slim = (s) => ({ stationuuid: s.stationuuid, name: (s.name || '').trim(), favicon: s.favicon || '', country: s.country || '', tags: s.tags || '', url_resolved: s.url_resolved || s.url || '' });

  async function searchStations(params) {
    const p = Object.assign({ hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '60' }, params);
    if (httpsOnly) p.is_https = 'true';
    return dedupe((await api('/json/stations/search', p)).map(slim));
  }
  async function resolveUrl(st) {
    try {
      const r = await api('/json/url/' + encodeURIComponent(st.stationuuid)); // also registers the click
      if (r && r.ok !== false && r.url) return r.url;
    } catch (e) { /* fall back to the last known URL */ }
    return st.url_resolved;
  }

  /* ---------- player ---------- */
  const audio = new Audio();
  audio.preload = 'none';
  const P = { st: load(LAST_KEY, null), playing: false, loading: false, retries: 0, sleepIdx: 0, sleepEnd: 0, sleepTimer: null, favs: load(FAV_KEY, []), tab: 'il', list: [], status: '', q: '' };
  audio.volume = load(VOL_KEY, 0.7);
  let ui = null; // set by render()
  const paint = () => ui && ui.paint();

  async function playStation(st, isRetry) {
    if (!st) return;
    P.st = st; save(LAST_KEY, st);
    P.loading = true; P.status = 'מתחבר…';
    if (!isRetry) P.retries = 0;
    paint();
    try {
      const url = await resolveUrl(st);
      if (!url) throw new Error('no url');
      audio.src = url;
      await audio.play();
      setMedia(st);
    } catch (e) {
      P.loading = false; P.playing = false;
      if (e && e.name === 'NotAllowedError') P.status = 'לחץ ▶ כדי להתחיל';
      else scheduleRetry();
      paint();
    }
  }
  function scheduleRetry() {
    clearTimeout(P.retryTimer);
    if (!P.st || P.retries >= 6) { P.status = 'השידור אינו זמין'; return; }
    const wait = Math.min(1000 * 2 ** P.retries, 15000); P.retries++;
    P.status = `מתחבר מחדש… (${P.retries})`;
    P.retryTimer = setTimeout(() => P.wantPlay && playStation(P.st, true), wait);
  }
  function pause() { P.wantPlay = false; clearTimeout(P.retryTimer); audio.pause(); P.playing = false; P.loading = false; P.status = 'מושהה'; paint(); updateSession(); }
  function stop() { P.wantPlay = false; clearTimeout(P.retryTimer); audio.pause(); audio.removeAttribute('src'); audio.load(); P.playing = false; P.loading = false; P.status = ''; setSleep(0); paint(); updateSession(); }
  function play(x) {
    P.wantPlay = true;
    if (!x) return playStation(P.st);
    if (typeof x === 'object') return playStation(x);
    const all = P.favs.concat(P.list);
    const hit = all.find((s) => s.stationuuid === x || s.name.toLowerCase() === String(x).toLowerCase());
    if (hit) return playStation(hit);
    return searchStations({ name: x, limit: '10' }).then((r) => r[0] ? playStation(r[0]) : toast('תחנה לא נמצאה: ' + x));
  }
  const toggle = () => (P.playing || P.loading ? pause() : play());

  audio.addEventListener('playing', () => { P.playing = true; P.loading = false; P.retries = 0; P.status = 'מנגן'; paint(); updateSession(); });
  audio.addEventListener('waiting', () => { if (P.wantPlay) { P.loading = true; P.status = 'מאגר…'; paint(); } });
  ['error', 'stalled', 'ended'].forEach((ev) => audio.addEventListener(ev, () => {
    if (P.wantPlay && audio.src) { P.playing = false; P.loading = true; scheduleRetry(); paint(); }
  }));
  const setVolume = (v) => { audio.volume = Math.min(1, Math.max(0, v)); save(VOL_KEY, audio.volume); };

  /* sleep timer: off → 30 → 60 → 120 minutes */
  function setSleep(min) {
    clearInterval(P.sleepTimer);
    P.sleepIdx = Math.max(0, SLEEP_STEPS.indexOf(min));
    P.sleepEnd = min ? Date.now() + min * 60000 : 0;
    if (min) P.sleepTimer = setInterval(() => {
      if (Date.now() >= P.sleepEnd) { stop(); toast('טיימר שינה – הרדיו כבה'); } else paint();
    }, 1000);
    paint();
  }
  const cycleSleep = () => setSleep(SLEEP_STEPS[(P.sleepIdx + 1) % SLEEP_STEPS.length]);

  /* ---------- OS media session ---------- */
  function setMedia(st) {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: 'Unica Home', album: st.country || 'Radio', artwork: st.favicon ? [{ src: st.favicon }] : [] });
  }
  function updateSession() { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = P.playing ? 'playing' : 'paused'; }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler('play', () => play());
      ms.setActionHandler('pause', () => pause());
      ms.setActionHandler('stop', () => stop());
    } catch (e) { /* unsupported action */ }
  }

  /* ---------- favourites ---------- */
  const isFav = (st) => P.favs.some((f) => f.stationuuid === st.stationuuid);
  function toggleFav(st) {
    P.favs = isFav(st) ? P.favs.filter((f) => f.stationuuid !== st.stationuuid) : P.favs.concat(slim(st));
    save(FAV_KEY, P.favs);
  }

  /* ---------- widget UI ---------- */
  async function loadTab() {
    const q = P.q.trim();
    if (!q && P.tab === 'favs') { P.list = P.favs.slice(); P.status2 = ''; return paintList(); }
    P.listLoading = true; P.status2 = ''; paintList();
    try {
      const tab = TABS.find((t) => t.id === P.tab);
      P.list = await searchStations(q ? { name: q } : tab.params);
      if (!P.list.length) P.status2 = 'לא נמצאו תחנות';
    } catch (e) { P.list = []; P.status2 = 'אין חיבור לשרת הרדיו'; }
    P.listLoading = false; paintList();
  }
  let paintList = () => {};

  window.Widgets.register({
    id: 'radio', page: 'media', fill: true, size: 12, order: 1,
    render(el) {
      if (el.dataset.ready) return; // never re-rendered: keeps the music uninterrupted
      el.dataset.ready = '1';
      el.classList.add('radio');
      el.innerHTML = `
        <div class="radio-body">
          <div class="r-left">
            <div class="card-head"><div class="card-title">${icon('radio')}<h2>מדיה · רדיו</h2></div></div>
            <div class="now">
              <div class="art" id="r-art"><span>📻</span></div>
              <div class="now-info">
                <div class="now-name" id="r-name">בחר תחנה</div>
                <div class="now-sub" id="r-sub"></div>
                <div class="eq" id="r-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
              </div>
              <div class="ctrls">
                <button class="round big play" id="r-play" aria-label="נגן / השהה"></button>
                <button class="chip sleep" id="r-sleep" aria-label="טיימר שינה">😴 <span id="r-sleep-l">כבוי</span></button>
              </div>
              <div class="vol"><span>🔈</span><input type="range" id="r-vol" min="0" max="1" step="0.05" class="slider" aria-label="עוצמה"><span>🔊</span></div>
            </div>
          </div>
          <div class="r-right">
            <div class="search"><input type="search" id="r-q" placeholder="חיפוש תחנה…" aria-label="חיפוש תחנה"></div>
            <div class="tabs" id="r-tabs" role="tablist">${TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
            <div class="stations" id="r-list"></div>
          </div>
        </div>`;

      const $q = (s) => el.querySelector(s);
      const vol = $q('#r-vol'); vol.value = audio.volume;
      vol.oninput = () => setVolume(+vol.value);
      $q('#r-play').onclick = () => { if (!P.st) return toast('בחר תחנה'); toggle(); };
      $q('#r-sleep').onclick = cycleSleep;
      $q('#r-tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (!b) return; P.tab = b.dataset.tab; P.q = ''; $q('#r-q').value = ''; paintTabs(); loadTab(); };
      let qt; $q('#r-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { P.q = e.target.value; paintTabs(); loadTab(); }, 450); };

      const paintTabs = () => el.querySelectorAll('.tab').forEach((b) => b.classList.toggle('sel', !P.q && b.dataset.tab === P.tab));
      paintList = () => {
        const box = $q('#r-list');
        if (P.listLoading) { box.innerHTML = '<div class="empty">טוען תחנות…</div>'; return; }
        if (!P.list.length) { box.innerHTML = `<div class="empty">${esc(P.status2 || (P.tab === 'favs' ? 'עוד אין מועדפים – לחץ ⭐ ליד תחנה' : ''))}</div>`; return; }
        box.innerHTML = P.list.map((s, i) => `
          <div class="st${P.st && P.st.stationuuid === s.stationuuid ? ' cur' : ''}" data-i="${i}">
            <button class="st-play" aria-label="נגן ${esc(s.name)}">
              <span class="logo">${s.favicon ? `<img src="${esc(s.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<em>📻</em></span>
              <span class="st-name">${esc(s.name)}</span>
            </button>
            <button class="star${isFav(s) ? ' on' : ''}" aria-label="מועדף">${isFav(s) ? '★' : '☆'}</button>
          </div>`).join('');
        box.querySelectorAll('img').forEach((im) => { im.onerror = () => im.remove(); im.onload = () => im.parentElement.classList.add('has'); });
      };
      $q('#r-list').onclick = (e) => {
        const row = e.target.closest('.st'); if (!row) return;
        const s = P.list[+row.dataset.i];
        if (e.target.closest('.star')) { toggleFav(s); if (P.tab === 'favs' && !P.q) P.list = P.favs.slice(); paintList(); return; }
        play(s);
      };

      ui = {
        paint() {
          const st = P.st, on = P.playing || P.loading;
          $q('#r-name').textContent = st ? st.name : 'בחר תחנה';
          $q('#r-sub').textContent = P.status || (st ? st.country : '');
          $q('#r-play').innerHTML = on ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
          $q('#r-eq').classList.toggle('on', P.playing);
          const art = $q('#r-art');
          art.innerHTML = st && st.favicon ? `<img src="${esc(st.favicon)}" alt="" referrerpolicy="no-referrer"><span>📻</span>` : '<span>📻</span>';
          const im = art.querySelector('img'); if (im) { im.onerror = () => im.remove(); im.onload = () => art.classList.add('has'); } else art.classList.remove('has');
          const left = P.sleepEnd ? Math.max(0, Math.ceil((P.sleepEnd - Date.now()) / 60000)) : 0;
          $q('#r-sleep-l').textContent = P.sleepEnd ? left + ' דק׳' : 'כבוי';
          $q('#r-sleep').classList.toggle('sel', !!P.sleepEnd);
          el.classList.toggle('playing', P.playing);
          // keep the highlighted station row in sync without re-fetching
          el.querySelectorAll('.st').forEach((r) => { const s = P.list[+r.dataset.i]; r.classList.toggle('cur', !!(s && st && s.stationuuid === st.stationuuid)); });
        }
      };
      paintTabs(); ui.paint();
      P.tab = P.favs.length ? 'favs' : 'il'; paintTabs(); loadTab();
    }
  });

  window.unica.radio = {
    play, pause, stop, toggle, setVolume,
    sleep: setSleep,
    get state() { return { station: P.st && P.st.name, playing: P.playing, volume: audio.volume }; },
    search: (q) => searchStations({ name: q })
  };
})();
