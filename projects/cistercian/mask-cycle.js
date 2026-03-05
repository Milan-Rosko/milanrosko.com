(function initMaskCycle() {
  const out = document.getElementById("mask-cycle-output");
  const clockEl = document.getElementById("mask-cycle-clock");
  if (!out || !clockEl) return;

  const SEGS_5 = [
    [1, 0, 2, 0],
    [1, 1, 2, 1],
    [2, 0, 2, 1],
    [1, 0, 2, 1],
    [1, 1, 2, 0],
  ];

  const MASK_GLYPH = Array.from({ length: 32 }, (_, mask) => {
    const active = [];
    for (let bit = 0; bit < 5; bit++) {
      if (mask & (1 << bit)) active.push(bit);
    }
    return active;
  });

  // Match the readable-clock semantics:
  // q=1 -> bottom-left seconds layer
  // q=3 -> bottom-right flag layer
  const SECONDS_QUADRANT = 1;
  const FLAG_QUADRANT = 3;
  const FLAG_STROKE_SEG = 1;

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
    let outPath = "M 1 0 L 1 3";
    for (let q = 0; q < 4; q++) {
      for (let si = 0; si < SEGS_5.length; si++) {
        const seg = SEGS_5[si];
        const a1 = tx(q, seg[0], seg[1]);
        const a2 = tx(q, seg[2], seg[3]);
        outPath += " M " + a1[0] + " " + a1[1] + " L " + a2[0] + " " + a2[1];
      }
    }
    return outPath;
  })();

  function activeLines(secondsMask, flagBit) {
    let outLines = lineEl(1, 0, 1, 3);

    for (const si of MASK_GLYPH[secondsMask]) {
      const seg = SEGS_5[si];
      const a1 = tx(SECONDS_QUADRANT, seg[0], seg[1]);
      const a2 = tx(SECONDS_QUADRANT, seg[2], seg[3]);
      outLines += lineEl(a1[0], a1[1], a2[0], a2[1]);
    }

    // Use one explicit flag bit: toggle the left flag stroke in bottom-right on/off.
    if (flagBit) {
      const seg = SEGS_5[FLAG_STROKE_SEG];
      const a1 = tx(FLAG_QUADRANT, seg[0], seg[1]);
      const a2 = tx(FLAG_QUADRANT, seg[2], seg[3]);
      outLines += lineEl(a1[0], a1[1], a2[0], a2[1]);
    }

    return outLines;
  }

  clockEl.innerHTML =
    '<svg viewBox="-0.62 0.38 3.24 2.24" role="img" aria-label="Seconds mask + flag cycle">' +
    '<g transform="rotate(-90, 1, 1.5)">' +
    '<path class="ghost" d="' + ghostPath + '" fill="none" stroke-width="0.05" stroke-linecap="round" stroke-linejoin="round" />' +
    '<g class="active" fill="none" stroke="currentColor" stroke-width="0.05" stroke-linecap="round" stroke-linejoin="round"></g>' +
    "</g>" +
    "</svg>";

  const activeGroupEl = clockEl.querySelector("g.active");
  if (!activeGroupEl) return;

  let seconds = 0;
  let last = 0;
  const STEP_MS = 280;

  function bits5(n) {
    return n.toString(2).padStart(5, "0");
  }

  function bits6(n) {
    return n.toString(2).padStart(6, "0");
  }

  function update(now) {
    if (now - last >= STEP_MS) {
      const secondsMask = seconds % 30;
      const flagBit = (seconds / 30) | 0;

      activeGroupEl.innerHTML = activeLines(secondsMask, flagBit);
      out.textContent =
        "seconds = " +
        seconds +
        " | cycle.bits = " +
        bits5(secondsMask) +
        " | flag.bits = " +
        flagBit +
        " | sec.bits = " +
        bits6((flagBit << 5) | secondsMask);

      seconds = (seconds + 1) % 60;
      last = now;
    }
    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
})();
