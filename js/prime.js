/* js/prime.js
  By Milan Rosko (c)
  Universal diagonalization demo (browser BigInt), UI aligned with carryless.js:
  - Prime sieve P uses direct button handlers + dataset.selected + fib-selected.
  - MR rounds / bit cap / max_t are button groups (single-selection).
  - Console behavior: show WAIT state during execution, then show ONLY the final summary.
  - Uses ids: fib-list, encode-btn, decode-btn, encode-output, steps
*/

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Output wiring
  function setStatus(text) {
    const el = $("encode-output");
    if (el) el.textContent = text;
  }

  function setConsole(text) {
    const el = $("steps");
    if (el) el.textContent = text;
  }

  function clearConsole() {
    setConsole("");
  }

  function setWaitState() {
    setConsole("WAIT: diagonalization in progress. Please do not navigate away.\n");
  }

  function setButtonsEnabled(enabled) {
    const runBtn = $("encode-btn");
    const resetBtn = $("decode-btn");
    if (runBtn) runBtn.disabled = !enabled;
    if (resetBtn) resetBtn.disabled = !enabled;
  }

  // -----------------------
  // BigInt helpers
  // -----------------------
  function bitLengthBigInt(x) {
    if (x === 0n) return 0;
    return (x < 0n ? -x : x).toString(2).length;
  }

  function modPow(base, exp, mod) {
    let result = 1n;
    let b = base % mod;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) result = (result * b) % mod;
      e >>= 1n;
      if (e > 0n) b = (b * b) % mod;
    }
    return result;
  }

  function isEven(n) {
    return (n & 1n) === 0n;
  }

  function randBigIntBelow(n) {
    if (n <= 0n) return 0n;
    const bits = bitLengthBigInt(n);
    const bytes = Math.ceil(bits / 8);
    const buf = new Uint8Array(bytes);
    while (true) {
      crypto.getRandomValues(buf);
      let x = 0n;
      for (let i = 0; i < buf.length; i++) x = (x << 8n) + BigInt(buf[i]);
      const excess = BigInt(bytes * 8 - bits);
      if (excess > 0n) x >>= excess;
      if (x < n) return x;
    }
  }

  const SMALL_PRIMES = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n
  ];

  function isProbablePrimeMR(n, rounds = 12) {
    if (n < 2n) return false;
    for (const p of SMALL_PRIMES) {
      if (n === p) return true;
      if (n % p === 0n) return false;
    }
    if (isEven(n)) return false;

    let d = n - 1n;
    let s = 0n;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s++;
    }

    const TWO64 = 1n << 64n;
    let bases;
    if (n < TWO64) {
      bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n];
    } else {
      bases = [];
      for (let i = 0; i < rounds; i++) bases.push(2n + randBigIntBelow(n - 3n));
    }

    for (const a of bases) {
      if (a % n === 0n) continue;
      let x = modPow(a, d, n);
      if (x === 1n || x === n - 1n) continue;

      let ok = false;
      for (let r = 1n; r < s; r++) {
        x = (x * x) % n;
        if (x === n - 1n) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    return true;
  }

  // -----------------------
  // Sequences
  // -----------------------
  function fibPair(n) {
    if (n === 0) return [0n, 1n];
    const [a, b] = fibPair(Math.floor(n / 2));
    const c = a * ((2n * b) - a);
    const d = a * a + b * b;
    if (n % 2 === 0) return [c, d];
    return [d, c + d];
  }

  function fib(n) {
    if (n <= 0) return 0n;
    const [fn] = fibPair(n);
    return fn;
  }

  function mersenne(n) {
    if (n < 0) return 0n;
    return (1n << BigInt(n)) - 1n;
  }

  function thabit(n) {
    if (n < 0) return 0n;
    return 3n * (1n << BigInt(n)) - 1n;
  }

  function cullen(n) {
    if (n < 0) return 0n;
    return BigInt(n) * (1n << BigInt(n)) + 1n;
  }

  function euler(n) {
    if (n < 0) return 0n;
    const bn = BigInt(n);
    return bn * bn + bn + 41n;
  }

  const SEQS = [
    null,
    { name: "Fibonacci", fn: fib },
    { name: "Mersenne", fn: mersenne },
    { name: "Thabit", fn: thabit },
    { name: "Cullen", fn: cullen },
    { name: "Euler", fn: euler }
  ];

  function cheapHeuristicReject(k, n, v) {
    if (v <= 1n) return "v<=1";
    if (v !== 2n && isEven(v)) return "even";

    if (k === 2) {
      if (n <= 1) return "n<=1";
      if (n % 2 === 0) return "n even";
      for (const p of [3, 5, 7, 11, 13, 17, 19, 23]) {
        if (n !== p && n % p === 0) return "n composite (small factor)";
      }
    }
    if (k === 3) {
      if (n === 0) return "n=0";
    }
    return null;
  }

  // ============================================================
  // Button-group helper (single-selection)
  // ============================================================
  function renderButtonGroup(containerId, values, defaultValue) {
    const box = $(containerId);
    if (!box) return;

    box.innerHTML = "";

    values.forEach((v) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn fib-btn";
      btn.dataset.value = String(v);
      btn.dataset.selected = (v === defaultValue) ? "true" : "false";
      btn.textContent = String(v);

      if (btn.dataset.selected === "true") btn.classList.add("fib-selected");

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        Array.from(box.querySelectorAll("button")).forEach((b) => {
          b.dataset.selected = "false";
          b.classList.remove("fib-selected");
        });

        btn.dataset.selected = "true";
        btn.classList.add("fib-selected");
      });

      box.appendChild(btn);
    });
  }

  function readSelectedFromGroup(containerId, fallback) {
    const box = $(containerId);
    if (!box) return fallback;
    const btn = box.querySelector('button[data-selected="true"]');
    if (!btn) return fallback;
    const n = Number(btn.dataset.value);
    return Number.isFinite(n) ? n : fallback;
  }

  // ============================================================
  // PRIME SIEVE UI: palette-only, direct handlers
  // ============================================================
  const PRIME_PALETTE = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
    31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
    73, 79, 83, 89, 97
  ];

  const primesUI = [...PRIME_PALETTE];
  const listDiv = $("fib-list");

  function updatePrimeButtons() {
    primesUI.forEach((p) => {
      const b = $(`prime-${p}`);
      if (!b) return;
      b.classList.remove("fib-selected", "fib-forbidden");
      b.dataset.forbidden = "false";
      if (b.dataset.selected === "true") b.classList.add("fib-selected");
    });
  }

  function ensurePrimeButton(p, selected = false) {
    const pid = `prime-${p}`;
    if ($(pid)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = pid;
    btn.dataset.val = String(p);
    btn.dataset.selected = selected ? "true" : "false";
    btn.dataset.forbidden = "false";
    btn.className = "btn fib-btn";
    btn.textContent = String(p);

    if (btn.dataset.selected === "true") btn.classList.add("fib-selected");

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.forbidden === "true") return;
      btn.dataset.selected = (btn.dataset.selected === "true") ? "false" : "true";
      updatePrimeButtons();
    });

    listDiv.appendChild(btn);
  }

  function renderPrimePalette() {
    listDiv.innerHTML = "";

    const title = document.createElement("div");
    title.style.marginBottom = "0.75rem";
    title.innerHTML = `<strong>Prime sieve P</strong> (click to select primes used for cheap compositeness filtering).`;
    listDiv.appendChild(title);

    primesUI.forEach((p) => ensurePrimeButton(p, [2, 3, 5, 7, 11].includes(p)));
    updatePrimeButtons();
  }

  function readSievePrimes() {
    const primes = [];
    primesUI.forEach((p) => {
      const b = $(`prime-${p}`);
      if (b && b.dataset.selected === "true") primes.push(BigInt(p));
    });
    primes.sort((a, b) => (a < b ? -1 : 1));
    return primes;
  }

  function readSequenceMask() {
    const mask = new Array(6).fill(true);
    for (let k = 1; k <= 5; k++) {
      const el = $(`seq-${k}`);
      if (el) mask[k] = el.checked;
    }
    return mask;
  }

  // ============================================================
  // Diagonalization run: WAIT state then SUMMARY only
  // ============================================================
  let RUNNING = false;

  function formatSummary({
    maxT, bitCap, rounds, sieve,
    tested, survived, verified, found, elapsed,
    oracles, seqMask
  }) {
    const lines = [];
    lines.push("Summary");
    lines.push(`  max_t=${maxT}, bit_cap=${bitCap}, MR_rounds=${rounds}, |P|=${sieve.length}`);
    lines.push(`  tested=${tested}, survivors=${survived}, verified=${verified}, found=${found}`);
    lines.push(`  elapsed=${elapsed.toFixed(2)}s`);
    lines.push("");
    lines.push(`Sieve primes P = { ${sieve.map(String).join(", ")} }`);
    lines.push("");

    for (let k = 1; k <= 5; k++) {
      if (!seqMask[k]) continue;
      const arr = Array.from(oracles[k]).sort((a, b) => (a < b ? -1 : 1));
      lines.push(`${SEQS[k].name}: ${arr.length} prime survivors recorded.`);
      for (const v of arr.slice(0, 10)) lines.push(`  ${v.toString()}`);
      if (arr.length > 10) lines.push("  ...");
      lines.push("");
    }

    return lines.join("\n").replace(/\s+$/g, "");
  }

  async function universalDiagonal() {
    if (RUNNING) return;
    RUNNING = true;

    clearConsole();
    setWaitState();
    setButtonsEnabled(false);

    const maxT = Math.max(3, readSelectedFromGroup("max-t-buttons", 250));
    const bitCap = Math.max(64, readSelectedFromGroup("bit-cap-buttons", 1024));
    const rounds = Math.max(1, readSelectedFromGroup("mr-rounds-buttons", 10));
    const promote = Boolean($("auto-promote")?.checked);
    const seqMask = readSequenceMask();

    const sieve = readSievePrimes();
    const known = new Set(SMALL_PRIMES.map((p) => p.toString()));
    for (const p of sieve) known.add(p.toString());

    const oracles = [null, new Set(), new Set(), new Set(), new Set(), new Set()];
    const seen = new Set(known);

    let tested = 0, survived = 0, verified = 0, found = 0;

    const start = performance.now();
    setStatus(`Running: max_t=${maxT}, bit_cap=${bitCap}, MR_rounds=${rounds}, |P|=${sieve.length}.`);

    const CHUNK = 250;
    let iter = 0;

    for (let t = 2; t <= maxT; t++) {
      for (let k = 1; k <= 5; k++) {
        if (!seqMask[k]) continue;
        if (k >= t) break;

        const n = t - k;
        if (n < 1) continue;

        let v;
        try {
          v = SEQS[k].fn(n);
        } catch {
          continue;
        }

        const bl = bitLengthBigInt(v);
        if (bl === 0 || bl > bitCap) continue;

        tested++;
        if (seen.has(v.toString())) continue;

        // Sieve
        let caught = false;
        for (const p of sieve) {
          if (v === p) { caught = false; break; }
          if (v % p === 0n) { caught = true; break; }
        }
        if (caught) continue;

        const reason = cheapHeuristicReject(k, n, v);
        if (reason) continue;

        survived++;
        verified++;

        const prime = isProbablePrimeMR(v, rounds);
        if (prime) {
          found++;
          seen.add(v.toString());
          oracles[k].add(v);

          if (promote) {
            sieve.push(v);
            sieve.sort((a, b) => (a < b ? -1 : 1));
          }
        }

        iter++;
        if (iter % CHUNK === 0) {
          const elapsed = (performance.now() - start) / 1000;
          setStatus(
            `Running: t=${t}/${maxT}. tested=${tested}, survivors=${survived}, verified=${verified}, found=${found}. ` +
            `elapsed=${elapsed.toFixed(2)}s. |P|=${sieve.length}.`
          );
          await new Promise((r) => requestAnimationFrame(r));
        }
      }
    }

    const elapsed = (performance.now() - start) / 1000;
    setStatus(`Done. tested=${tested}, survivors=${survived}, verified=${verified}, found=${found}. elapsed=${elapsed.toFixed(2)}s.`);

    // Replace console with summary only
    setConsole(formatSummary({
      maxT, bitCap, rounds, sieve,
      tested, survived, verified, found, elapsed,
      oracles, seqMask
    }));

    RUNNING = false;
    setButtonsEnabled(true);
  }

  function resetAll() {
    RUNNING = false;
    clearConsole();
    setStatus("Ready.");
    setButtonsEnabled(true);
  }

  function wireButtons() {
    $("encode-btn")?.addEventListener("click", () => {
      universalDiagonal().catch((e) => {
        RUNNING = false;
        setButtonsEnabled(true);
        setStatus("Error.");
        setConsole(`ERROR: ${String(e)}`);
      });
    });

    $("decode-btn")?.addEventListener("click", resetAll);
  }

  function init() {
    renderPrimePalette();

    // Selection groups
    renderButtonGroup("mr-rounds-buttons", [1, 2, 5, 10], 10);
    renderButtonGroup("bit-cap-buttons", [2048, 1024, 512], 1024);
    renderButtonGroup("max-t-buttons", [3, 10, 25, 50, 100, 250], 250);

    wireButtons();
    setStatus("Ready. Configure a sieve P, then run diagonalization.");
    clearConsole();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
