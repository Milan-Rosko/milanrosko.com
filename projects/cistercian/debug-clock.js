(function initCistercianDebugClock() {
  const clockEl = document.getElementById("debug-clock");
  const timeEl = document.getElementById("debug-time");
  const metaEl = document.getElementById("debug-meta");
  const hInput = document.getElementById("in-h");
  const mInput = document.getElementById("in-m");
  const sInput = document.getElementById("in-s");
  const applyBtn = document.getElementById("apply-btn");
  const nowBtn = document.getElementById("now-btn");

  if (!clockEl || !timeEl || !metaEl || !hInput || !mInput || !sInput || !applyBtn || !nowBtn) return;

  const SEGS_5 = [
    [1, 0, 2, 0],
    [1, 1, 2, 1],
    [2, 0, 2, 1],
    [1, 0, 2, 1],
    [1, 1, 2, 0],
  ];

  const COMBINATORIAL_GLYPH = Array.from({ length: 32 }, (_, mask) => {
    const active = [];
    for (let bit = 0; bit < 5; bit++) if (mask & (1 << bit)) active.push(bit);
    return active;
  });

  function popcount(n) {
    let x = n;
    let c = 0;
    while (x) {
      c += x & 1;
      x >>= 1;
    }
    return c;
  }

  function buildGrowthCycle(limit) {
    const out = [];
    for (let on = 0; on <= 5; on++) {
      for (let value = 0; value < limit; value++) {
        if (popcount(value) === on) out.push(value);
      }
    }
    return out;
  }

  // Keep identical mapping logic to clock-final.js
  const CYCLE_32 = buildGrowthCycle(32);
  const CYCLE_24 = CYCLE_32.slice(0, 24);
  const CYCLE_30 = CYCLE_32.filter((value) => value < 30);

  function tx(q, x, y) {
    let xx = x;
    let yy = y;
    if (q & 1) xx = 2 - xx;
    if (q & 2) yy = 3 - yy;
    return [xx, yy];
  }

  function lineEl(x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" />';
  }

  const ghostPath = (() => {
    let out = "M 1 0 L 1 3";
    for (let q = 0; q < 4; q++) {
      for (let si = 0; si < SEGS_5.length; si++) {
        const seg = SEGS_5[si];
        const a1 = tx(q, seg[0], seg[1]);
        const a2 = tx(q, seg[2], seg[3]);
        out += " M " + a1[0] + " " + a1[1] + " L " + a2[0] + " " + a2[1];
      }
    }
    return out;
  })();

  function activeLinesFromDigits(digits32) {
    let out = lineEl(1, 0, 1, 3);
    for (let q = 0; q < 4; q++) {
      const digit = digits32[q] | 0;
      for (const si of COMBINATORIAL_GLYPH[digit]) {
        const seg = SEGS_5[si];
        const a1 = tx(q, seg[0], seg[1]);
        const a2 = tx(q, seg[2], seg[3]);
        out += lineEl(a1[0], a1[1], a2[0], a2[1]);
      }
    }
    return out;
  }

  function bin(n, width) {
    return n.toString(2).padStart(width, "0");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function clampInt(v, lo, hi) {
    if (!Number.isFinite(v)) return lo;
    const n = Math.floor(v);
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  clockEl.innerHTML =
    '<svg viewBox="-0.62 0.38 3.24 2.24" role="img" aria-label="Cistercian debug clock">' +
    '<g transform="rotate(-90, 1, 1.5)">' +
    '<path class="ghost" d="' + ghostPath + '" fill="none" stroke-width="0.05" stroke-linecap="round" stroke-linejoin="round" />' +
    '<g class="active" fill="none" stroke="currentColor" stroke-width="0.05" stroke-linecap="round" stroke-linejoin="round"></g>' +
    "</g>" +
    "</svg>";

  const activeGroupEl = clockEl.querySelector("g.active");
  if (!activeGroupEl) return;

  function renderAt(hRaw, mRaw, sRaw) {
    const h = clampInt(hRaw, 0, 23);
    const m = clampInt(mRaw, 0, 59);
    const s = clampInt(sRaw, 0, 59);

    hInput.value = String(h);
    mInput.value = String(m);
    sInput.value = String(s);

    const hCycle = CYCLE_24[h];
    const m0 = m % 30;
    const m1 = (m / 30) | 0;
    const s0 = s % 30;
    const s1 = (s / 30) | 0;
    const m0Cycle = CYCLE_30[m0];
    const s0Cycle = CYCLE_30[s0];
    const f = (s1 << 1) | m1;

    activeGroupEl.innerHTML = activeLinesFromDigits([hCycle, s0Cycle, m0Cycle, f]);

    timeEl.textContent = pad2(h) + ":" + pad2(m) + ":" + pad2(s);
    metaEl.innerHTML =
      "h=" + h + " m=" + m0 + "+30&times;" + m1 + " s=" + s0 + "+30&times;" + s1 + " f=" + f +
      "<br>" +
      "h(cycle.bits)=" + bin(hCycle, 5) +
      " m(cycle.bits)=" + bin(m0Cycle, 5) +
      " s(cycle.bits)=" + bin(s0Cycle, 5) +
      " f(bits)=" + bin(f, 2);
  }

  function readAndRender() {
    renderAt(Number(hInput.value), Number(mInput.value), Number(sInput.value));
  }

  applyBtn.addEventListener("click", readAndRender);
  nowBtn.addEventListener("click", () => {
    const now = new Date();
    renderAt(now.getHours(), now.getMinutes(), now.getSeconds());
  });

  [hInput, mInput, sInput].forEach((el) => {
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") readAndRender();
    });
    el.addEventListener("change", readAndRender);
  });

  const now = new Date();
  renderAt(now.getHours(), now.getMinutes(), now.getSeconds());
})();
