// clock-final.js
(function initFinalReadableClock() {
  const root = document.getElementById("cisclock-final");

  const clockEl = root
    ? document.getElementById("clock-final")
    : document.getElementById("clock");
  const timeEl = root
    ? document.getElementById("time-final")
    : document.getElementById("time");
  const metaEl = root
    ? document.getElementById("meta-final")
    : document.getElementById("of");

  if (!clockEl || !timeEl || !metaEl) return;

  // Keep a stable three-line panel in both embeddings.
  timeEl.style.display = "block";
  timeEl.style.marginLeft = "0";
  metaEl.style.display = "block";
  metaEl.style.marginLeft = "0";

  // 5 primitive segments per quadrant (outer rail included)
  const SEGS_5 = [
    [1, 0, 2, 0],
    [1, 1, 2, 1],
    [2, 0, 2, 1],
    [1, 0, 2, 1],
    [1, 1, 2, 0],
  ];

  // 32 states = all bitmasks over the 5 segments
  const COMBINATORIAL_GLYPH = Array.from({ length: 32 }, (_, mask) => {
    const active = [];
    for (let bit = 0; bit < 5; bit++) if (mask & (1 << bit)) active.push(bit);
    return active;
  });

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

  clockEl.innerHTML =
    '<svg viewBox="-0.62 0.38 3.24 2.24" role="img" aria-label="Cistercian readable clock">' +
    '<g transform="rotate(-90, 1, 1.5)">' +
    '<path class="ghost" d="' + ghostPath + '" fill="none" stroke-width="0.05" stroke-linecap="round" stroke-linejoin="round" />' +
    '<g class="active" fill="none" stroke="currentColor" stroke-width="0.05" stroke-linecap="round" stroke-linejoin="round"></g>' +
    "</g>" +
    "</svg>";

  const activeGroupEl = clockEl.querySelector("g.active");
  if (!activeGroupEl) return;

  // Mixed radix decomposition variables (for panel/debug line):
  // h in [0,23], m0 in [0,29], s0 in [0,29], f = 2*s1 + m1 in [0,3]
  //
  // Visual quadrant layout after rotate(-90) (requested):
  // q=0 -> top-left:     hours (h)
  // q=1 -> bottom-left:  seconds (s0)
  // q=2 -> top-right:    minutes (m0)
  // q=3 -> bottom-right: flag (f = 2*s1 + m1)

  let lastKey = "";

  function bin(n, width) {
    return n.toString(2).padStart(width, "0");
  }

  function update() {
    const now = new Date();
    const h = now.getHours(); // 0..23
    const m = now.getMinutes(); // 0..59
    const s = now.getSeconds(); // 0..59

    const m0 = m % 30;
    const m1 = (m / 30) | 0;
    const s0 = s % 30;
    const s1 = (s / 30) | 0;
    // Swapped bit order so flag states 01 and 10 are exchanged.
    const f = (s1 << 1) | m1; // 0..3

    const key = h + ":" + m0 + ":" + s0 + ":" + f;
    if (key !== lastKey) {
      // digits32 array is indexed by q=0..3: [hours, seconds, minutes, flag]
      activeGroupEl.innerHTML = activeLinesFromDigits([h, s0, m0, f]);
      lastKey = key;
    }

    // Line 1: human-readable time
    timeEl.textContent = now.toLocaleTimeString("en-US", { hour12: false });

    // Lines 2-3: decomposition in requested order, then binary values
    metaEl.innerHTML =
      "h=" + h + " m=" + m0 + "+30&times;" + m1 + " s=" + s0 + "+30&times;" + s1 + " f=" + f +
      "<br>" +
      "h(bin)=" + bin(h, 5) + " m(bin)=" + bin(m, 6) + " s(bin)=" + bin(s, 6) + " f(bin)=" + bin(f, 2);

    requestAnimationFrame(update);
  }

  update();

  const themes = ["./clock-1.css", "./clock-2.css"];
  const link = document.getElementById("theme");

  if (link) {
    document.body.addEventListener("click", () => {
      const current = themes.findIndex((t) => link.href.includes(t.replace("./", "")));
      link.href = themes[(current + 1) % themes.length];
    });
  }
})();
