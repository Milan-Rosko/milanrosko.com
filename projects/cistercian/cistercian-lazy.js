(function initCistercianLazyBrowser() {
  const listEl = document.getElementById("cis-list");
  const sentinelEl = document.getElementById("cis-sentinel");
  const scrollEl = document.getElementById("cis-scroll");
  const jumpEl = document.getElementById("cis-jump");
  const jumpBtn = document.getElementById("cis-jump-btn");
  const resetBtn = document.getElementById("cis-reset-btn");
  const metaEl = document.getElementById("cis-meta");

  if (!listEl || !sentinelEl || !scrollEl || !jumpEl || !jumpBtn || !resetBtn || !metaEl) {
    return;
  }

  const CHUNK = 48;
  const MAX_INDEX = 1048575;

  const SEGS_5 = [
    [1, 0, 2, 0],
    [1, 1, 2, 1],
    [2, 0, 2, 1],
    [1, 0, 2, 1],
    [1, 1, 2, 0],
  ];

  const COMPACT_SEGS = [SEGS_5[0], SEGS_5[1], SEGS_5[3], SEGS_5[4]];

  const MEDIEVAL_GLYPH = [
    [],
    [0],
    [1],
    [3],
    [4],
    [0, 4],
    [2],
    [0, 2],
    [1, 2],
    [0, 1, 2],
  ];

  const COMPACT_GLYPH = [
    [],
    [0],
    [1],
    [2],
    [3],
    [0, 3],
    [0, 2],
    [1, 3],
    [1, 2],
    [0, 1, 3],
  ];

  const COMBINATORIAL_GLYPH = Array.from({ length: 32 }, (_, mask) => {
    const active = [];
    for (let bit = 0; bit < 5; bit++) {
      if (mask & (1 << bit)) active.push(bit);
    }
    return active;
  });

  const state = {
    max: MAX_INDEX,
    startIndex: 0,
    nextIndex: 0,
    rendered: -1,
    busy: false,
  };

  function tx(q, x, y) {
    let xx = x;
    let yy = y;
    if (q & 1) xx = 2 - xx;
    if (q & 2) yy = 3 - yy;
    return [xx, yy];
  }

  function toBaseDigits(n, base, width) {
    const out = [];
    let value = n;
    for (let i = 0; i < width; i++) {
      out.push(value % base);
      value = Math.floor(value / base);
    }
    return out;
  }

  function renderFromDigits(digits, segs, glyph) {
    let d = "M 1 0 1 3";
    for (let q = 0; q < 4; q++) {
      const digit = digits[q];
      for (const si of glyph[digit]) {
        const seg = segs[si];
        const a1 = tx(q, seg[0], seg[1]);
        const a2 = tx(q, seg[2], seg[3]);
        d += " M " + a1[0] + " " + a1[1] + " " + a2[0] + " " + a2[1];
      }
    }

    return '<svg viewBox="-.12 -.12 2.24 3.24" role="img"><path d="' + d + '" stroke="currentColor" stroke-width=".2" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>';
  }

  function renderCompact(index) {
    const digits10 = toBaseDigits(index, 10, 4);
    return {
      svg: renderFromDigits(digits10, COMPACT_SEGS, COMPACT_GLYPH),
      digits: "d10=" + digits10.join("-"),
    };
  }

  function renderMedieval(index) {
    const digits10 = toBaseDigits(index, 10, 4);
    return {
      svg: renderFromDigits(digits10, SEGS_5, MEDIEVAL_GLYPH),
      digits: "d10=" + digits10.join("-"),
    };
  }

  function renderCombinatorial(index) {
    const digits32 = toBaseDigits(index, 32, 4);
    return {
      svg: renderFromDigits(digits32, SEGS_5, COMBINATORIAL_GLYPH),
      digits: "d32=" + digits32.join("-"),
    };
  }

  function fmt(n) {
    return n.toLocaleString("en-US");
  }

  function cardHtml(kind, payload) {
    return (
      '<article class="cis-card ' + kind + '">' +
      payload.svg +
      '<div class="tag">' + kind + '</div>' +
      '<div class="digits">' + payload.digits + '</div>' +
      '</article>'
    );
  }

  function rowHtml(index) {
    const cards = [];

    const inLegacyRange = index <= 9999;

    if (inLegacyRange) {
      cards.push(cardHtml("compact", renderCompact(index)));
      cards.push(cardHtml("medieval", renderMedieval(index)));
    }
    cards.push(cardHtml("combinatorial", renderCombinatorial(index)));

    return (
      '<div class="cis-row">' +
      '<div class="cis-index">#' + fmt(index) + '</div>' +
      '<div class="cis-cards">' + cards.join("") + '</div>' +
      '</div>'
    );
  }

  function updateMeta() {
    if (state.rendered < state.startIndex) {
      metaEl.textContent =
        "Mode: combined + combinatorial" +
        " | rendered: none yet | range: 0.." +
        fmt(state.max) +
        " | chunk size: " +
        CHUNK;
      return;
    }

    const from = state.startIndex;
    const to = state.rendered;

    metaEl.textContent =
      "Mode: combined + combinatorial" +
      " | rendered: " +
      fmt(from) +
      ".." +
      fmt(to) +
      " of 0.." +
      fmt(state.max) +
      " | chunk size: " +
      CHUNK;
  }

  function finishIfNeeded() {
    if (state.nextIndex > state.max) {
      sentinelEl.textContent = "End of range.";
      return true;
    }
    sentinelEl.textContent = "Scroll for more...";
    return false;
  }

  function renderChunk() {
    if (state.busy || state.nextIndex > state.max) return;
    state.busy = true;

    const end = Math.min(state.max, state.nextIndex + CHUNK - 1);
    let html = "";
    for (let i = state.nextIndex; i <= end; i++) {
      html += rowHtml(i);
    }

    listEl.insertAdjacentHTML("beforeend", html);
    state.rendered = end;
    state.nextIndex = end + 1;

    finishIfNeeded();
    updateMeta();
    state.busy = false;
  }

  function clampToRange(value) {
    if (!Number.isFinite(value)) return 0;
    const floored = Math.floor(value);
    if (floored < 0) return 0;
    if (floored > state.max) return state.max;
    return floored;
  }

  function reset(startAt) {
    const start = clampToRange(startAt);
    listEl.innerHTML = "";
    state.startIndex = start;
    state.nextIndex = start;
    state.rendered = start - 1;
    jumpEl.value = String(start);
    scrollEl.scrollTop = 0;
    finishIfNeeded();
    updateMeta();
    renderChunk();
  }

  jumpBtn.addEventListener("click", function onJumpClick() {
    const raw = Number(jumpEl.value);
    reset(raw);
  });

  resetBtn.addEventListener("click", function onResetClick() {
    jumpEl.value = "0";
    reset(0);
  });

  jumpEl.addEventListener("keydown", function onJumpKeyDown(ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      reset(Number(jumpEl.value));
    }
  });

  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      function onIntersect(entries) {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            renderChunk();
          }
        }
      },
      {
        root: scrollEl,
        rootMargin: "240px 0px",
        threshold: 0,
      }
    );

    observer.observe(sentinelEl);
  } else {
    scrollEl.addEventListener("scroll", function onScrollFallback() {
      const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 260;
      if (nearBottom) renderChunk();
    });
  }

  jumpEl.max = String(state.max);
  reset(0);
})();
