/* js/carrylesspairing.js
   Carryless Pairing Demo + Free Pair/Unpair Interface
   By Milan Rosko (c)
   (1) True Zeckendorf decomposition (enforces nonconsecutive indices).
   (2) Uses BigInt throughout (prevents precision loss for large Fibonacci terms).
*/

// ============================================================
// Fibonacci utilities (BigInt, memoized)
// ============================================================

const maxIndex = 300;

// Fibonacci table as BigInt
const F = new Array(maxIndex + 1).fill(0n);
F[0] = 0n;
F[1] = 1n;
for (let i = 2; i <= maxIndex; i++) {
  F[i] = F[i - 1] + F[i - 2];
}

function fib(k) {
  if (k < 0 || k > maxIndex) throw new Error(`fib(${k}) out of range`);
  return F[k];
}

// ============================================================
// Helpers: BigInt conversion + safe parsing
// ============================================================

function toBigIntNat(x) {
  // accepts Number, BigInt, or numeric string
  if (typeof x === "bigint") {
    if (x < 0n) throw new Error("Expected natural BigInt.");
    return x;
  }
  if (typeof x === "number") {
    if (!Number.isInteger(x) || x < 0) throw new Error("Expected natural integer.");
    return BigInt(x);
  }
  if (typeof x === "string") {
    if (!/^\d+$/.test(x)) throw new Error("Expected natural numeric string.");
    return BigInt(x);
  }
  throw new Error("Unsupported input type for natural number.");
}

// ============================================================
// Zeckendorf decomposition (canonical greedy, BigInt)
// Returns indices k such that n = Σ F_k and no two are consecutive.
// ============================================================

function zeckendorfDecompose(nInput) {
  const n = toBigIntNat(nInput);
  if (n === 0n) return [];

  const support = [];
  let remainder = n;
  let maxK = maxIndex;

  while (remainder > 0n) {
    // find largest k <= maxK with F[k] <= remainder
    let k = 2;
    while (k + 1 <= maxK && fib(k + 1) <= remainder) k++;

    support.push(k);
    remainder -= fib(k);

    // enforce nonconsecutive rule: next k must be <= k-2
    maxK = k - 2;
    if (maxK < 2 && remainder > 0n) {
      // Should never happen if fib table is sufficient.
      throw new Error("Zeckendorf failure: remainder left but cannot choose further indices.");
    }
  }

  return support;
}

// ============================================================
// Delimiter rank: r(x) = min{ e : F_e > x }  (BigInt)
// ============================================================

function delimiterRank(xInput) {
  const x = toBigIntNat(xInput);

  let e = 1;
  while (e <= maxIndex && fib(e) <= x) e++;

  if (e > maxIndex) throw new Error("delimiterRank overflow: increase maxIndex");
  return e;
}

// ============================================================
// Carryless Pairing π_CL(x,y) (BigInt)
// ============================================================

function carrylessPair(xInput, yInput) {
  const x = toBigIntNat(xInput);
  const y = toBigIntNat(yInput);

  const Zx = zeckendorfDecompose(x);
  const Zy = zeckendorfDecompose(y);

  const r = delimiterRank(x);
  const B = 2 * r;

  const evenBand = Zx.map(e => 2 * e);
  const oddBand  = Zy.map(j => B + (2 * j - 1));

  const maxUsed = Math.max(
    evenBand.length ? Math.max(...evenBand) : 0,
    oddBand.length  ? Math.max(...oddBand)  : 0
  );

  if (maxUsed > maxIndex) {
    return {
      ok: false,
      error: `Index overflow: require F_${maxUsed}, but maxIndex = ${maxIndex}. Increase maxIndex.`,
      n: 0n,
      Zx, Zy, r, B, evenBand, oddBand
    };
  }

  let n = 0n;
  evenBand.forEach(k => { n += fib(k); });
  oddBand.forEach(k  => { n += fib(k); });

  return {
    ok: true,
    n,
    Zx,
    Zy,
    r,
    B,
    evenBand,
    oddBand
  };
}

// ============================================================
// Carryless Unpairing (inverse of π_CL) (BigInt)
// ============================================================

function carrylessUnpair(nInput) {
  const n = toBigIntNat(nInput);

  const Zn = zeckendorfDecompose(n);

  const X = Zn.filter(k => (k % 2 === 0)).map(k => k / 2);
  let x = 0n;
  X.forEach(e => { x += fib(e); });

  const r = delimiterRank(x);
  const B = 2 * r;

  const Y = Zn
    .filter(k => (k % 2 === 1) && k >= (B + 1))
    .map(k => (k - B + 1) / 2);

  let y = 0n;
  Y.forEach(j => { y += fib(j); });

  return { x, y, Zn, X, Y, r, B };
}

// ============================================================
// Round-trip verification (BigInt)
// ============================================================

function verifyRoundTrip(xInput, yInput) {
  const x = toBigIntNat(xInput);
  const y = toBigIntNat(yInput);

  const p1 = carrylessPair(x, y);
  if (!p1.ok) return { ok: false, reason: p1.error, p1 };

  const u  = carrylessUnpair(p1.n);
  const p2 = carrylessPair(u.x, u.y);
  if (!p2.ok) return { ok: false, reason: p2.error, p1, u, p2 };

  const sameXY = (u.x === x && u.y === y);
  const sameN  = (p2.n === p1.n);

  if (!sameXY || !sameN) {
    return {
      ok: false,
      reason: "Round-trip mismatch: (x,y) ↦ n ↦ (x',y') ↦ n' did not stabilize.",
      p1, u, p2
    };
  }

  return { ok: true, p1, u, p2 };
}

// ============================================================
// Part I: Fibonacci selection UI (uses Number UI indices, BigInt sums)
// ============================================================

(function initPartI() {
  const listDiv = document.getElementById("fib-list");
  if (!listDiv) return;

  const uiMaxIndex = Math.min(maxIndex, 42);

  const fibs = [];
  for (let i = 2; i <= uiMaxIndex; i++) {
    fibs.push({ idx: i, val: fib(i) });
  }

  fibs.forEach(f => {
    const btn = document.createElement("button");
    btn.id = "fib-" + f.idx;
    btn.dataset.idx = f.idx;
    btn.dataset.selected = "false";
    btn.className = "btn fib-btn";
    btn.innerHTML = `F<sub>${f.idx}</sub> = ${f.val.toString()}`;
    listDiv.appendChild(btn);
  });

  function updateForbiddenButtons() {
    const selected = new Set(
      fibs
        .map(f => {
          const b = document.getElementById("fib-" + f.idx);
          return b.dataset.selected === "true" ? f.idx : null;
        })
        .filter(x => x !== null)
    );

    fibs.forEach(f => {
      const b = document.getElementById("fib-" + f.idx);
      b.classList.remove("fib-selected", "fib-forbidden");
      b.dataset.forbidden = "false";
    });

    selected.forEach(idx => {
      const b = document.getElementById("fib-" + idx);
      b.classList.add("fib-selected");
    });

    selected.forEach(idx => {
      [idx - 1, idx + 1].forEach(nei => {
        const b = document.getElementById("fib-" + nei);
        if (b && !selected.has(nei)) {
          b.classList.add("fib-forbidden");
          b.dataset.forbidden = "true";
        }
      });
    });
  }

  listDiv.addEventListener("click", e => {
    if (e.target.tagName !== "BUTTON") return;
    const btn = e.target;
    if (btn.dataset.forbidden === "true") return;
    btn.dataset.selected = (btn.dataset.selected === "true" ? "false" : "true");
    updateForbiddenButtons();
  });

  let lastEncodedValue = 0n;

  const encodeBtn = document.getElementById("encode-btn");
  const encodeOut = document.getElementById("encode-output");
  if (encodeBtn && encodeOut) {
    encodeBtn.onclick = function () {
      let raw = 0n;
      fibs.forEach(f => {
        const b = document.getElementById("fib-" + f.idx);
        if (b.dataset.selected === "true") raw += f.val;
      });

      if (raw === 0n) {
        encodeOut.textContent = "No digits selected.";
        lastEncodedValue = 0n;
        return;
      }

      const Z = zeckendorfDecompose(raw);
      lastEncodedValue = raw;

      encodeOut.textContent =
        `Zeckendorf Support = {${Z.join(", ")}}   Sum = ${raw.toString()}`;
    };
  }

  function greedyDecodeSteps(nInput) {
    const n = toBigIntNat(nInput);
    const steps = [];
    let remainder = n;

    while (remainder > 0n) {
      let k = 2;
      while (k + 1 <= maxIndex && fib(k + 1) <= remainder) k++;

      steps.push(
        `Pick F_${k} = ${fib(k).toString()}; remainder = ${remainder.toString()} - ${fib(k).toString()} = ${(remainder - fib(k)).toString()}`
      );

      remainder -= fib(k);
    }
    return steps;
  }

  const decodeBtn = document.getElementById("decode-btn");
  const stepsOut  = document.getElementById("steps");
  if (decodeBtn && stepsOut) {
    decodeBtn.onclick = function () {
      fibs.forEach(f => {
        const b = document.getElementById("fib-" + f.idx);
        b.dataset.selected = "false";
        b.dataset.forbidden = "false";
        b.classList.remove("fib-selected", "fib-forbidden");
      });

      if (lastEncodedValue === 0n) {
        stepsOut.textContent = "No encoded value available. Encode first.";
        return;
      }

      const n = lastEncodedValue;
      const steps = greedyDecodeSteps(n);

      const support = steps
        .map(s => {
          const m = s.match(/F_(\d+)/);
          return m ? parseInt(m[1], 10) : null;
        })
        .filter(x => x !== null);

      const out =
        `Decoding n = ${n.toString()}\n\n` +
        steps.join("\n") +
        `\n\nRecovered Zeckendorf support: {${support.join(", ")}}`;

      stepsOut.textContent = out.replace(/\s+$/g, "");
    };
  }
})();

// ============================================================
// Part II: Free pairing/unpairing interface with verification
// ============================================================

(function initPartII() {
  const pairBtn = document.getElementById("pair-generate-btn");
  const unpairBtn = document.getElementById("unpair-btn");
  if (!pairBtn && !unpairBtn) return;

  const pairOut   = document.getElementById("pair-output");
  const unpairOut = document.getElementById("unpair-output");
  const warning   = document.getElementById("pair-warning");

  function setWarning(ok, msg) {
    if (!warning) return;
    warning.textContent = msg;
    warning.classList.remove("warning-ok", "warning-bad");
    warning.classList.add(ok ? "warning-ok" : "warning-bad");
  }

  if (pairBtn) {
    pairBtn.onclick = function () {
      const xEl = document.getElementById("pair-x");
      const yEl = document.getElementById("pair-y");
      if (!xEl || !yEl || !pairOut) return;

      const xStr = xEl.value.trim();
      const yStr = yEl.value.trim();

      let x, y;
      try {
        x = toBigIntNat(xStr);
        y = toBigIntNat(yStr);
      } catch (err) {
        setWarning(false, "Warning: x and y must be natural numbers.");
        pairOut.textContent = "Invalid input.";
        return;
      }

      const v = verifyRoundTrip(x, y);
      if (!v.ok) {
        setWarning(false, "Warning: unrealized / unstable pair (verification failed).");
        pairOut.textContent = v.reason;
        return;
      }

      const { p1 } = v;

      pairOut.textContent =
        `π_CL(x,y) = ${p1.n.toString()}\n` +
        `Z(x) = {${p1.Zx.join(", ")}}   r(x) = ${p1.r}   B = ${p1.B}\n` +
        `Z(y) = {${p1.Zy.join(", ")}}\n` +
        `Even band indices: {${p1.evenBand.join(", ")}}\n` +
        `Odd band indices:  {${p1.oddBand.join(", ")}}`;

      const nEl = document.getElementById("unpair-n");
      if (nEl) nEl.value = p1.n.toString();

      setWarning(true, "Verified: (x,y) ↦ n ↦ (x,y).");
    };
  }

  if (unpairBtn) {
    unpairBtn.onclick = function () {
      const nEl = document.getElementById("unpair-n");
      if (!nEl || !unpairOut) return;

      const nStr = nEl.value.trim();
      let n;
      try {
        n = toBigIntNat(nStr);
      } catch (err) {
        setWarning(false, "Warning: n must be a natural number.");
        unpairOut.textContent = "Invalid input.";
        return;
      }

      const u = carrylessUnpair(n);

      const p = carrylessPair(u.x, u.y);
      if (!p.ok || p.n !== n) {
        setWarning(false, "Warning: n does not realize a stable pair under maxIndex.");
      } else {
        setWarning(true, "Verified: n ↦ (x,y) ↦ n.");
      }

      unpairOut.textContent =
        `n = ${n.toString()}\n` +
        `Z(n) = {${u.Zn.join(", ")}}\n` +
        `Extracted X (even/2): {${u.X.join(", ")}}   ⇒ x = ${u.x.toString()}\n` +
        `Computed r(x) = ${u.r}   B = ${u.B}\n` +
        `Extracted Y ((odd-B+1)/2): {${u.Y.join(", ")}}   ⇒ y = ${u.y.toString()}`;
    };
  }
})();
