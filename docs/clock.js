/* Unica Smart Office – animated clock widget (analog dial with sweeping second hand + seconds ring).
   Usage: unica.mountClock(element). Pure SVG, one requestAnimationFrame loop per instance, paused when hidden. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R = 46, C = 2 * Math.PI * R;

  function mount(el) {
    let ticks = '';
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0, a = (i * 6 * Math.PI) / 180;
      const r1 = major ? 36 : 39, r2 = 42;
      ticks += `<line x1="${50 + r1 * Math.sin(a)}" y1="${50 - r1 * Math.cos(a)}" x2="${50 + r2 * Math.sin(a)}" y2="${50 - r2 * Math.cos(a)}" class="${major ? 'tk major' : 'tk'}"/>`;
    }
    el.innerHTML = `
      <div class="clk">
        <svg class="clk-dial" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="${R}" class="clk-track"/>
          <circle cx="50" cy="50" r="${R}" class="clk-ring" id="clk-ring" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 50 50)"/>
          ${ticks}
          <line id="clk-h" x1="50" y1="50" x2="50" y2="29" class="hand hour"/>
          <line id="clk-m" x1="50" y1="50" x2="50" y2="19" class="hand min"/>
          <g id="clk-s"><line x1="50" y1="58" x2="50" y2="14" class="hand sec"/><circle cx="50" cy="14" r="2.2" class="sec-dot"/></g>
          <circle cx="50" cy="50" r="3" class="hub"/>
        </svg>
        <div class="clk-digital" dir="ltr">
          <div class="clk-hm" id="clk-hm">--:--</div>
          <div class="clk-sec"><span id="clk-ss">00</span><small>שניות</small></div>
        </div>
      </div>`;
    const $ = (s) => el.querySelector(s);
    const h = $('#clk-h'), m = $('#clk-m'), s = $('#clk-s'), ring = $('#clk-ring'), hm = $('#clk-hm'), ss = $('#clk-ss');
    let raf = 0, lastSec = -1;

    function frame() {
      const d = new Date();
      const ms = d.getMilliseconds(), sec = d.getSeconds() + (reduce ? 0 : ms / 1000);
      const min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
      s.setAttribute('transform', `rotate(${sec * 6} 50 50)`);
      m.setAttribute('transform', `rotate(${min * 6} 50 50)`);
      h.setAttribute('transform', `rotate(${hr * 30} 50 50)`);
      ring.setAttribute('stroke-dashoffset', String(C * (1 - sec / 60)));
      if (d.getSeconds() !== lastSec) {                       // once per second
        lastSec = d.getSeconds();
        ss.textContent = String(lastSec).padStart(2, '0');
        hm.textContent = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
        ss.classList.remove('tick'); void ss.offsetWidth; ss.classList.add('tick');
      }
      raf = reduce ? setTimeout(frame, 1000) : requestAnimationFrame(frame);
    }
    function stop() { cancelAnimationFrame(raf); clearTimeout(raf); raf = 0; }
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (!raf) frame(); });
    frame();
  }

  window.unica = Object.assign(window.unica || {}, { mountClock: mount });
})();
