/*
  js/typed-repair-vs-gd.js
  By Milan Rosko (c)

  Patch set (Jan 2026):
  - Typed Repair: push a terminal snapshot when FULL.ok is reached.
  - Semantics lock: truthful schedule statement (Typed deterministic; GD respects scanOrder/seed).
  - GD trace: store only W + scalar metrics; compute logits/probs on-demand in render.
  - Logs: render once, update highlight only.
*/
(function () {
  'use strict';

  // ---------- Tasks ----------
  const PRESETS = {
    nand: `0 0|1\n0 1|1\n1 0|1\n1 1|0`,
    or: `0 0|0\n0 1|1\n1 0|1\n1 1|1`,
    and: `0 0|0\n0 1|0\n1 0|0\n1 1|1`,
    xor: `0 0|0\n0 1|1\n1 0|1\n1 1|0`,
    impl: `0 0|1\n0 1|1\n1 0|0\n1 1|1`,
    xandnot: `0 0|0\n0 1|0\n1 0|1\n1 1|0`,
    maj3: `0 0 0|0\n0 0 1|0\n0 1 0|0\n1 0 0|0\n0 1 1|1\n1 0 1|1\n1 1 0|1\n1 1 1|1`,
    parity3: `0 0 0|0\n0 0 1|1\n0 1 0|1\n0 1 1|0\n1 0 0|1\n1 0 1|0\n1 1 0|0\n1 1 1|1`,
  };

  // ---------- Elements ----------
  const elPreset = document.getElementById('preset');
  const elDataset = document.getElementById('dataset');

  // Old UI (kept for backward compatibility if present)
  const elEpochs = document.getElementById('epochs');

  // New UI (shared budget + determinism)
  const elCycles = document.getElementById('cycles');
  const elSeed = document.getElementById('seed');
  const elScanOrder = document.getElementById('scanOrder');
  const elEpochsDerived = document.getElementById('epochsDerived');

  const elBuild = document.getElementById('buildBtn');
  const elLockText = document.getElementById('lockText');
  const elBuildText = document.getElementById('buildText');

  // Typed controls
  const elTGamma = document.getElementById('tGamma');
  const elTDelta = document.getElementById('tDelta');
  const elTCycle = document.getElementById('tCycle');
  const elTCycleNum = document.getElementById('tCycleNum');
  const elTPlay = document.getElementById('tPlay');
  const elTStop = document.getElementById('tStop');
  const elTStep = document.getElementById('tStep');
  const elTLast = document.getElementById('tLast');

  // Typed outputs
  const elTWF = document.getElementById('tWF');
  const elTFULL = document.getElementById('tFULL');
  const elTCACHE = document.getElementById('tCACHE');
  const elTCert = document.getElementById('tCert');
  const elTNote = document.getElementById('tNote');
  const elTLog = document.getElementById('tLog');
  const elTTableWrap = document.getElementById('tTableWrap');
  const elTWeightsWrap = document.getElementById('tWeightsWrap');
  const elTPostingsWrap = document.getElementById('tPostingsWrap');

  // GD controls
  const elGLR = document.getElementById('gLR');
  const elGCycle = document.getElementById('gCycle');
  const elGCycleNum = document.getElementById('gCycleNum');
  const elGPlay = document.getElementById('gPlay');
  const elGStop = document.getElementById('gStop');
  const elGStep = document.getElementById('gStep');
  const elGLast = document.getElementById('gLast');

  // GD outputs
  const elGAcc = document.getElementById('gAcc');
  const elGLoss = document.getElementById('gLoss');
  const elGSnap = document.getElementById('gSnap');
  const elGNote = document.getElementById('gNote');
  const elGLog = document.getElementById('gLog');
  const elGTableWrap = document.getElementById('gTableWrap');
  const elGWeightsWrap = document.getElementById('gWeightsWrap');

  // Defensive: if this JS is included without the UI, do nothing.
  if (!elPreset || !elDataset || !elBuild) return;

  // ---------- Utilities ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function stableArgmaxStar(arr) {
    let best = 0, bestv = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > bestv) { best = i; bestv = arr[i]; }
    }
    return best;
  }

  function setBadge(el, ok, text) {
    if (!el) return;
    el.textContent = text;
    el.className = 'pill ' + (ok ? 'ok' : 'bad');
  }

  function clone2D(a) { return a.map(r => r.slice()); }

  function makeLCG(seed) {
    // 32-bit LCG; deterministic across browsers.
    let s = (seed | 0) || 1;
    return function rnd() {
      s = (1103515245 * s + 12345) | 0;
      return ((s >>> 0) / 4294967296);
    };
  }

  function shuffledIndices(N, seed, epoch) {
    const a = Array.from({ length: N }, (_, i) => i);
    const rnd = makeLCG((seed | 0) ^ ((epoch + 1) * 0x9e3779b9));
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // Parse dataset lines: "0 1|1"
  function parseDataset(text) {
    const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
    const examples = [];
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length !== 2) throw new Error(`Bad line (missing '|'): ${line}`);
      const xs = parts[0].trim().split(/\s+/).filter(Boolean).map(v => {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`Bad input number: ${v}`);
        return n;
      });
      const y = Number(parts[1].trim());
      if (!Number.isInteger(y) || y < 0) throw new Error(`Bad label: ${parts[1]}`);
      examples.push({ x: xs, y });
    }
    if (examples.length === 0) throw new Error('Dataset is empty.');
    const d = examples[0].x.length;
    for (const ex of examples) {
      if (ex.x.length !== d) throw new Error('All rows must have the same number of inputs.');
    }
    const K = Math.max(...examples.map(e => e.y)) + 1;
    if (K < 2) throw new Error('Need at least 2 classes.');
    return { examples, d, K };
  }

  // Shared locked feature schema: bias + unary "x_i=1"
  function buildFeatureSpace(d) {
    const featNames = ['bias'];
    for (let i = 0; i < d; i++) featNames.push(`x${i}=1`);
    return featNames;
  }

  function factsForExample(x) {
    const facts = [0]; // bias always
    for (let i = 0; i < x.length; i++) if (Number(x[i]) === 1) facts.push(1 + i);
    return facts;
  }

  // ---------- Typed Repair core ----------
  function buildFiniteTable(examples, featNames) {
    const N = examples.length;
    const FI = new Array(N);
    const y = new Array(N);
    for (let i = 0; i < N; i++) { FI[i] = factsForExample(examples[i].x); y[i] = examples[i].y; }
    const post = Array.from({ length: featNames.length }, () => []);
    for (let i = 0; i < N; i++) for (const f of FI[i]) post[f].push(i);
    return { FI, y, post };
  }

  function scoreDefinitional(FI_i, W, c) {
    let s = 0;
    for (const f of FI_i) s += W[c][f];
    return s;
  }

  function checkCacheOK(FI, W, S) {
    for (let i = 0; i < FI.length; i++) {
      for (let c = 0; c < W.length; c++) {
        const d = scoreDefinitional(FI[i], W, c);
        if (S[i][c] !== d) return { ok: false, witness: { i, c, cached: S[i][c], definitional: d } };
      }
    }
    return { ok: true };
  }

  function countViolationsFromCache(FI, y, W, S, gamma) {
    const N = FI.length, K = W.length;
    let viol = 0;
    const witnesses = [];
    for (let i = 0; i < N; i++) {
      const yi = y[i];
      let bestC = null, bestV = null;
      for (let c = 0; c < K; c++) {
        if (c === yi) continue;
        if (bestC === null || S[i][c] > bestV) { bestC = c; bestV = S[i][c]; }
      }
      const slack = (bestV + gamma) - S[i][yi];
      if (slack > 0) {
        viol++;
        witnesses.push({ i, yi, cStar: bestC, slack, trueScore: S[i][yi], compScore: bestV });
      }
    }
    return { viol, witnesses };
  }

  function typedRepairFirstWitness(state, table, gamma, delta) {
    const { FI, y, post } = table;
    const N = FI.length, K = state.W.length;

    for (let i = 0; i < N; i++) {
      const yi = y[i];
      let bestC = null, bestV = null;
      for (let c = 0; c < K; c++) {
        if (c === yi) continue;
        if (bestC === null || state.S[i][c] > bestV) { bestC = c; bestV = state.S[i][c]; }
      }
      const slack = (bestV + gamma) - state.S[i][yi];
      if (slack <= 0) continue;

      const L = FI[i];
      const ell = Math.max(1, L.length);
      const steps = Math.ceil(slack / ell) + delta;

      for (const f of L) {
        state.W[yi][f] += steps;
        state.W[bestC][f] -= steps;
        for (const j of post[f]) {
          state.S[j][yi] += steps;
          state.S[j][bestC] -= steps;
        }
      }

      state.updates++;
      const note = `Repair @i=${i} (y=${yi}, c*=${bestC}): slack=${slack}, |FI|=${ell}, steps=${steps}`;
      state.note = note;
      return { changed: true, note, i, yi, cStar: bestC, slack, steps };
    }

    state.note = `No violations found in this pass.`;
    return { changed: false, note: state.note };
  }

  // PATCH: terminal snapshot on FULL.ok.
  function generateTypedTrace(parsed, featNames, table, gamma, delta, maxCycles) {
    const K = parsed.K, F = featNames.length, N = table.FI.length;

    let state = {
      epoch: 0,
      updates: 0,
      W: Array.from({ length: K }, () => Array.from({ length: F }, () => 0)),
      S: Array.from({ length: N }, () => Array.from({ length: K }, () => 0)),
      note: 'Initialized.',
    };

    const snapshots = [{ ...state, W: clone2D(state.W), S: clone2D(state.S) }];
    const events = [`cycle=0: init W=0, S=0`];

    while (state.updates < maxCycles) {
      const beforeInfo = countViolationsFromCache(table.FI, table.y, state.W, state.S, gamma);
      const before = beforeInfo.viol;

      if (before === 0) {
        state.note = `FULL.ok reached (0 violations).`;
        snapshots.push({ ...state, W: clone2D(state.W), S: clone2D(state.S) });
        events.push(`cycle=${state.updates}: FULL.ok reached (0 violations).`);
        break;
      }

      const res = typedRepairFirstWitness(state, table, gamma, delta);
      if (!res.changed) {
        state.epoch += 1;
        snapshots.push({ ...state, W: clone2D(state.W), S: clone2D(state.S) });
        events.push(`cycle=${state.updates}: saturated (no repairs in a full scan).`);
        break;
      }

      const after = countViolationsFromCache(table.FI, table.y, state.W, state.S, gamma).viol;
      snapshots.push({ ...state, W: clone2D(state.W), S: clone2D(state.S) });
      events.push(`cycle=${state.updates}: ${res.note} | viol: ${before}→${after}`);
    }

    if (state.updates >= maxCycles) {
      events.push(`STOP: reached cycle budget C=${maxCycles}.`);
    }

    return { snapshots, events };
  }

  // ---------- Gradient Descent core (softmax + SGD) ----------
  function softmax(logits) {
    let m = logits[0];
    for (let i = 1; i < logits.length; i++) if (logits[i] > m) m = logits[i];
    const exps = logits.map(z => Math.exp(z - m));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
  }

  function crossEntropyLoss(probsRow, y) {
    const eps = 1e-12;
    return -Math.log(Math.max(eps, probsRow[y]));
  }

  function initWeightsGD(K, F) {
    return Array.from({ length: K }, () => Array.from({ length: F }, () => 0));
  }

  // Canonical evaluation: always evaluate on the entire dataset.
  function evalGD(table, K, W) {
    const N = table.FI.length;
    const logits = Array.from({ length: N }, () => Array.from({ length: K }, () => 0));
    const probs = Array.from({ length: N }, () => Array.from({ length: K }, () => 0));

    for (let i = 0; i < N; i++) {
      for (let c = 0; c < K; c++) {
        let z = 0;
        for (const f of table.FI[i]) z += W[c][f];
        logits[i][c] = z;
      }
      const p = softmax(logits[i]);
      for (let c = 0; c < K; c++) probs[i][c] = p[c];
    }

    let lossSum = 0;
    let correct = 0;
    for (let i = 0; i < N; i++) {
      lossSum += crossEntropyLoss(probs[i], table.y[i]);
      const pred = stableArgmaxStar(logits[i]);
      if (pred === table.y[i]) correct++;
    }
    const loss = lossSum / N;
    const acc = correct / N;

    return { logits, probs, loss, acc };
  }

  // PATCH: GD trace stores only W + scalars; logits/probs computed on-demand in render.
  function generateGDTrace(parsed, featNames, table, lr, maxCycles, seed, scanOrder) {
    const K = parsed.K, F = featNames.length, N = table.FI.length;
    let W = initWeightsGD(K, F);
    let updates = 0;

    const permCache = new Map(); // epoch -> permutation

    function indexAt(cycle) {
      const epoch = Math.floor(cycle / N) + 1;
      const pos = cycle % N;

      if (scanOrder === 'shuffle') {
        let perm = permCache.get(epoch);
        if (!perm) { perm = shuffledIndices(N, seed, epoch); permCache.set(epoch, perm); }
        return { i: perm[pos], epoch };
      }
      return { i: pos, epoch };
    }

    function snapshot(epoch, note) {
      const ev = evalGD(table, K, W);
      return {
        epoch, updates,
        W: clone2D(W),
        loss: ev.loss,
        acc: ev.acc,
        note
      };
    }

    const snapshots = [snapshot(0, 'Initialized.')];
    const events = [`cycle=0: init W (zeros), eval`];

    while (updates < maxCycles) {
      const { i, epoch } = indexAt(updates);
      const yi = table.y[i];

      // Forward single example
      const logits1 = new Array(K).fill(0);
      for (let c = 0; c < K; c++) {
        let z = 0;
        for (const f of table.FI[i]) z += W[c][f];
        logits1[c] = z;
      }
      const p1 = softmax(logits1);

      // SGD update: W[c][f] -= lr * (p[c] - 1_{c=yi})
      for (const f of table.FI[i]) {
        for (let c = 0; c < K; c++) {
          const target = (c === yi) ? 1 : 0;
          const grad = (p1[c] - target);
          W[c][f] -= lr * grad;
        }
      }

      updates++;

      const ev = evalGD(table, K, W);
      const note = `GD @i=${i} (y=${yi}): loss≈${ev.loss.toFixed(4)}, acc=${(ev.acc * 100).toFixed(1)}%`;

      snapshots.push({
        epoch, updates,
        W: clone2D(W),
        loss: ev.loss,
        acc: ev.acc,
        note
      });

      events.push(`cycle=${updates}: epoch=${epoch}: ${note}`);
    }

    events.push(`STOP: reached cycle budget C=${maxCycles}.`);
    return { snapshots, events };
  }

  // ---------- Rendering: Logs (PATCH: render once; highlight only) ----------
  function buildLogOnce(container, events) {
    if (!container) return;
    container.innerHTML = events.map((line) => {
      return `<div class="logline">${escapeHtml(line)}</div>`;
    }).join('');
  }

  function highlightLogCycle(container, cycleIndex) {
    if (!container) return;

    const prev = container.querySelector('.logline.here');
    if (prev) prev.classList.remove('here');

    const prefix = `cycle=${cycleIndex}:`;
    const nodes = container.querySelectorAll('.logline');
    for (let k = 0; k < nodes.length; k++) {
      const t = nodes[k].textContent || '';
      if (t.startsWith(prefix)) {
        nodes[k].classList.add('here');
        break;
      }
    }
  }

  // ---------- Rendering (Typed) ----------
  function renderTyped(trace, parsed, featNames, table, snap, cycleIndex) {
    const cacheCheck = checkCacheOK(table.FI, snap.W, snap.S);
    const violInfo = countViolationsFromCache(table.FI, table.y, snap.W, snap.S, Number(elTGamma.value));
    const wfOk = cacheCheck.ok;

    setBadge(elTWF, wfOk, `WF: ${wfOk ? 'OK' : 'FAIL'}`);
    setBadge(elTCACHE, cacheCheck.ok, `CACHE.ok: ${cacheCheck.ok ? 'OK' : 'FAIL'}`);
    setBadge(elTFULL, violInfo.viol === 0, `FULL.ok: ${violInfo.viol === 0 ? 'OK' : `FAIL (${violInfo.viol})`}`);

    if (elTCert) {
      elTCert.textContent =
        `cycle=${cycleIndex}/${trace.snapshots.length - 1}\n` +
        `epoch=${snap.epoch}\n` +
        `repairs=${snap.updates}\n` +
        `violations=${violInfo.viol}`;
    }

    if (elTNote) elTNote.textContent = snap.note || '';

    const K = parsed.K;
    let tHtml = `<table><thead><tr>
      <th>#</th><th>x</th><th>y</th><th>FI[i]</th><th>S[i,·]</th><th>pred</th><th>c*</th><th>slack</th><th>margin</th>
    </tr></thead><tbody>`;
    for (let i = 0; i < parsed.examples.length; i++) {
      const ex = parsed.examples[i];
      const yi = ex.y;
      const scores = snap.S[i];
      const pred = stableArgmaxStar(scores);
      let bestC = null, bestV = null;
      for (let c = 0; c < K; c++) {
        if (c === yi) continue;
        if (bestC === null || scores[c] > bestV) { bestC = c; bestV = scores[c]; }
      }
      const gamma = Number(elTGamma.value);
      const slack = (bestV + gamma) - scores[yi];
      const ok = slack <= 0;
      const FIi = table.FI[i].map(f => featNames[f]).join(', ');
      tHtml += `<tr>
        <td class="mono">${i}</td>
        <td class="mono">${ex.x.join(' ')}</td>
        <td class="mono">${yi}</td>
        <td class="mono">[${FIi}]</td>
        <td class="mono">[${scores.join(', ')}]</td>
        <td class="mono">${pred}</td>
        <td class="mono">${bestC}</td>
        <td class="mono">${slack}</td>
        <td>${ok ? `<span class="pill ok">OK</span>` : `<span class="pill bad">VIOL</span>`}</td>
      </tr>`;
    }
    tHtml += `</tbody></table>`;
    if (elTTableWrap) elTTableWrap.innerHTML = tHtml;

    let wHtml = `<table><thead><tr><th>class \\ feat</th>`;
    for (let f = 0; f < featNames.length; f++) wHtml += `<th class="mono">${featNames[f]}</th>`;
    wHtml += `</tr></thead><tbody>`;
    for (let c = 0; c < K; c++) {
      wHtml += `<tr><th class="mono">${c}</th>`;
      for (let f = 0; f < featNames.length; f++) wHtml += `<td class="mono">${snap.W[c][f]}</td>`;
      wHtml += `</tr>`;
    }
    wHtml += `</tbody></table>`;
    if (elTWeightsWrap) {
      elTWeightsWrap.innerHTML =
        `<div class="muted" style="margin-bottom:6px">Integer W; updates are symmetric on (y, c*) and propagated via postings.</div>` + wHtml;
    }

    let pHtml = `<table><thead><tr><th>feature f</th><th>post[f] (example indices)</th></tr></thead><tbody>`;
    for (let f = 0; f < featNames.length; f++) {
      pHtml += `<tr><td class="mono">${featNames[f]}</td><td class="mono">[${table.post[f].join(', ')}]</td></tr>`;
    }
    pHtml += `</tbody></table>`;
    if (elTPostingsWrap) {
      elTPostingsWrap.innerHTML =
        `<div class="muted" style="margin-bottom:6px">Propagation paths are exactly these lists.</div>` + pHtml;
    }

    // PATCH: just highlight
    highlightLogCycle(elTLog, cycleIndex);
  }

  // ---------- Rendering (GD) ----------
  function renderGD(trace, parsed, featNames, table, snap, cycleIndex) {
    // PATCH: compute logits/probs on-demand for the selected snapshot.
    const ev = evalGD(table, parsed.K, snap.W);

    const acc = snap.acc;
    const loss = snap.loss;

    setBadge(elGAcc, acc >= 0.999, `acc: ${(acc * 100).toFixed(1)}%`);
    setBadge(elGLoss, loss < 0.02, `loss: ${loss.toFixed(4)}`);

    if (elGSnap) {
      elGSnap.textContent =
        `cycle=${cycleIndex}/${trace.snapshots.length - 1}\n` +
        `epoch=${snap.epoch}\n` +
        `updates=${snap.updates}\n` +
        `loss=${snap.loss.toFixed(6)}\n` +
        `acc=${(snap.acc * 100).toFixed(2)}%`;
    }

    if (elGNote) elGNote.textContent = snap.note || '';

    const K = parsed.K;
    let tHtml = `<table><thead><tr>
      <th>#</th><th>x</th><th>y</th><th>FI[i]</th><th>logits</th><th>probs</th><th>pred</th><th>loss_i</th>
    </tr></thead><tbody>`;
    for (let i = 0; i < parsed.examples.length; i++) {
      const ex = parsed.examples[i];
      const yi = ex.y;
      const logits = ev.logits[i];
      const probs = ev.probs[i];
      const pred = stableArgmaxStar(logits);
      const FIi = table.FI[i].map(f => featNames[f]).join(', ');
      const li = crossEntropyLoss(probs, yi);
      tHtml += `<tr>
        <td class="mono">${i}</td>
        <td class="mono">${ex.x.join(' ')}</td>
        <td class="mono">${yi}</td>
        <td class="mono">[${FIi}]</td>
        <td class="mono">[${logits.map(z => z.toFixed(3)).join(', ')}]</td>
        <td class="mono">[${probs.map(p => p.toFixed(3)).join(', ')}]</td>
        <td class="mono">${pred}</td>
        <td class="mono">${li.toFixed(4)}</td>
      </tr>`;
    }
    tHtml += `</tbody></table>`;
    if (elGTableWrap) elGTableWrap.innerHTML = tHtml;

    let wHtml = `<table><thead><tr><th>class \\ feat</th>`;
    for (let f = 0; f < featNames.length; f++) wHtml += `<th class="mono">${featNames[f]}</th>`;
    wHtml += `</tr></thead><tbody>`;
    for (let c = 0; c < K; c++) {
      wHtml += `<tr><th class="mono">${c}</th>`;
      for (let f = 0; f < featNames.length; f++) wHtml += `<td class="mono">${snap.W[c][f].toFixed(4)}</td>`;
      wHtml += `</tr>`;
    }
    wHtml += `</tbody></table>`;
    if (elGWeightsWrap) {
      elGWeightsWrap.innerHTML =
        `<div class="muted" style="margin-bottom:6px">Float W; GD on softmax cross-entropy (one update per cycle).</div>` + wHtml;
    }

    // PATCH: just highlight
    highlightLogCycle(elGLog, cycleIndex);
  }

  // ---------- State + Playback ----------
  let BUILT = null;
  let tTimer = null;
  let gTimer = null;

  function stopTimers() {
    if (tTimer) clearInterval(tTimer);
    if (gTimer) clearInterval(gTimer);
    tTimer = null; gTimer = null;

    if (elTPlay) elTPlay.disabled = !BUILT;
    if (elTStop) elTStop.disabled = !BUILT;
    if (elTLast) elTLast.disabled = !BUILT;

    if (elGPlay) elGPlay.disabled = !BUILT;
    if (elGStop) elGStop.disabled = !BUILT;
    if (elGLast) elGLast.disabled = !BUILT;
  }

  function setTypedCycle(idx) {
    if (!BUILT) return;
    const trace = BUILT.typedTrace;
    idx = Math.max(0, Math.min(idx, trace.snapshots.length - 1));
    if (elTCycle) elTCycle.value = String(idx);
    if (elTCycleNum) elTCycleNum.value = String(idx);
    const snap = trace.snapshots[idx];
    renderTyped(trace, BUILT.parsed, BUILT.featNames, BUILT.table, snap, idx);
  }

  function setGDCycle(idx) {
    if (!BUILT) return;
    const trace = BUILT.gdTrace;
    idx = Math.max(0, Math.min(idx, trace.snapshots.length - 1));
    if (elGCycle) elGCycle.value = String(idx);
    if (elGCycleNum) elGCycleNum.value = String(idx);
    const snap = trace.snapshots[idx];
    renderGD(trace, BUILT.parsed, BUILT.featNames, BUILT.table, snap, idx);
  }

  function renderSharedLock(parsed, featNames) {
    const N = parsed.examples.length;
    const C = (BUILT && Number.isInteger(BUILT.cycles)) ? BUILT.cycles : '?';
    const seed = (BUILT && Number.isInteger(BUILT.seed)) ? BUILT.seed : '?';
    const scan = (BUILT && BUILT.scanOrder) ? BUILT.scanOrder : 'det';

    if (!elLockText) return;
    elLockText.textContent =
      `K=${parsed.K}, N=${N}, F=${featNames.length}\n` +
      `features: bias + unary (x_i=1)\n` +
      `prediction: argmax* (first maximum)\n` +
      `budget: C=${C} cycles (shared)\n` +
      `Typed Repair schedule: deterministic scan i=0..N-1 (first witness)\n` +
      `GD schedule: ${scan === 'shuffle' ? 'shuffle per epoch (seeded)' : 'deterministic i = cycle mod N'}\n` +
      `seed (GD shuffle): ${seed}`;
  }

  function updateDerivedEpochsText() {
    if (!elEpochsDerived) return;
    try {
      const parsed = parseDataset(elDataset.value);
      const N = parsed.examples.length;

      let C = null;
      if (elCycles) {
        const c = Number(elCycles.value);
        if (Number.isFinite(c) && c > 0) C = c;
      }
      if (C === null && elEpochs) {
        const e = Number(elEpochs.value);
        if (Number.isFinite(e) && e > 0) C = e * N;
      }
      if (C === null) C = 200;

      elEpochsDerived.textContent = ` (≈ ${(C / N).toFixed(2)} epochs at N=${N})`;
    } catch {
      elEpochsDerived.textContent = '';
    }
  }

  // Keep derived text in sync if these controls exist
  if (elCycles) elCycles.addEventListener('input', updateDerivedEpochsText);
  if (elEpochs) elEpochs.addEventListener('input', updateDerivedEpochsText);

  // ---------- Init ----------
  elDataset.value = PRESETS.nand;
  elPreset.addEventListener('change', () => {
    elDataset.value = PRESETS[elPreset.value] ?? PRESETS.nand;
    updateDerivedEpochsText();
  });

  // ---------- Build ----------
  elBuild.addEventListener('click', () => {
    try {
      stopTimers();

      const parsed = parseDataset(elDataset.value);
      const featNames = buildFeatureSpace(parsed.d);
      const table = buildFiniteTable(parsed.examples, featNames);

      // Cycle budget C:
      let cycles = 200;
      if (elCycles) {
        cycles = Number(elCycles.value);
        if (!Number.isInteger(cycles) || cycles < 1) throw new Error('Cycle budget C must be an integer >= 1.');
      } else if (elEpochs) {
        const epochs = Number(elEpochs.value);
        if (!Number.isInteger(epochs) || epochs < 1) throw new Error('Epochs must be >= 1.');
        cycles = epochs * parsed.examples.length;
      }

      // Determinism controls
      let seed = 123456789;
      if (elSeed) {
        seed = Number(elSeed.value);
        if (!Number.isInteger(seed)) throw new Error('Seed must be an integer.');
      }
      const scanOrder = (elScanOrder && elScanOrder.value) ? elScanOrder.value : 'det';

      // Typed params
      const gamma = Number(elTGamma.value);
      const delta = Number(elTDelta.value);
      if (!Number.isInteger(gamma) || gamma < 0) throw new Error('Typed γ must be a nonnegative integer.');
      if (!Number.isInteger(delta) || delta < 0) throw new Error('Typed Δ must be a nonnegative integer.');

      // GD params
      const lr = Number(elGLR.value);
      if (!Number.isFinite(lr) || lr <= 0) throw new Error('Learning rate η must be a positive number.');

      const typedTrace = generateTypedTrace(parsed, featNames, table, gamma, delta, cycles);
      const gdTrace = generateGDTrace(parsed, featNames, table, lr, cycles, seed, scanOrder);

      BUILT = { parsed, featNames, table, typedTrace, gdTrace, cycles, seed, scanOrder, lr, gamma, delta };

      renderSharedLock(parsed, featNames);
      updateDerivedEpochsText();

      // PATCH: build logs once (no per-step rebuild).
      buildLogOnce(elTLog, typedTrace.events);
      buildLogOnce(elGLog, gdTrace.events);

      // Configure sliders
      if (elTCycle) {
        elTCycle.min = "0";
        elTCycle.max = String(typedTrace.snapshots.length - 1);
        elTCycle.value = "0";
      }
      if (elTCycleNum) {
        elTCycleNum.min = "0";
        elTCycleNum.max = String(typedTrace.snapshots.length - 1);
        elTCycleNum.value = "0";
      }

      if (elGCycle) {
        elGCycle.min = "0";
        elGCycle.max = String(gdTrace.snapshots.length - 1);
        elGCycle.value = "0";
      }
      if (elGCycleNum) {
        elGCycleNum.min = "0";
        elGCycleNum.max = String(gdTrace.snapshots.length - 1);
        elGCycleNum.value = "0";
      }

      // Enable controls
      if (elTPlay) elTPlay.disabled = false;
      if (elTStop) elTStop.disabled = false;
      if (elTStep) elTStep.disabled = false;
      if (elTLast) elTLast.disabled = false;

      if (elGPlay) elGPlay.disabled = false;
      if (elGStop) elGStop.disabled = false;
      if (elGStep) elGStep.disabled = false;
      if (elGLast) elGLast.disabled = false;

      setTypedCycle(0);
      setGDCycle(0);

      if (elBuildText) {
        elBuildText.textContent =
          `Built.\n` +
          `budget C=${cycles}\n` +
          `typed cycles: 0..${typedTrace.snapshots.length - 1}\n` +
          `gd cycles: 0..${gdTrace.snapshots.length - 1}`;
      }

    } catch (e) {
      alert(String(e && (e.message || e)));
    }
  });

  // Slider bindings
  if (elTCycle) elTCycle.addEventListener('input', () => setTypedCycle(Number(elTCycle.value)));
  if (elTCycleNum) elTCycleNum.addEventListener('change', () => setTypedCycle(Number(elTCycleNum.value)));
  if (elGCycle) elGCycle.addEventListener('input', () => setGDCycle(Number(elGCycle.value)));
  if (elGCycleNum) elGCycleNum.addEventListener('change', () => setGDCycle(Number(elGCycleNum.value)));

  // Step buttons
  if (elTStep) elTStep.addEventListener('click', () => setTypedCycle(Number(elTCycle.value) + 1));
  if (elGStep) elGStep.addEventListener('click', () => setGDCycle(Number(elGCycle.value) + 1));

  // Last buttons
  if (elTLast) elTLast.addEventListener('click', () => { if (BUILT) setTypedCycle(BUILT.typedTrace.snapshots.length - 1); });
  if (elGLast) elGLast.addEventListener('click', () => { if (BUILT) setGDCycle(BUILT.gdTrace.snapshots.length - 1); });

  // Play/Stop
  if (elTPlay) {
    elTPlay.addEventListener('click', () => {
      if (!BUILT) return;
      stopTimers();
      elTPlay.disabled = true;
      tTimer = setInterval(() => {
        const cur = Number(elTCycle.value);
        if (cur >= BUILT.typedTrace.snapshots.length - 1) { stopTimers(); return; }
        setTypedCycle(cur + 1);
      }, 220);
    });
  }

  if (elGPlay) {
    elGPlay.addEventListener('click', () => {
      if (!BUILT) return;
      stopTimers();
      elGPlay.disabled = true;
      gTimer = setInterval(() => {
        const cur = Number(elGCycle.value);
        if (cur >= BUILT.gdTrace.snapshots.length - 1) { stopTimers(); return; }
        setGDCycle(cur + 1);
      }, 220);
    });
  }

  if (elTStop) elTStop.addEventListener('click', stopTimers);
  if (elGStop) elGStop.addEventListener('click', stopTimers);

  // Boot text placeholders
  if (elLockText) {
    elLockText.textContent =
      `K=?, N=?, F=?\n` +
      `features: bias + unary (x_i=1)\n` +
      `prediction: argmax* (first maximum)\n` +
      `budget: C=? cycles (shared)\n` +
      `Typed Repair schedule: deterministic scan i=0..N-1 (first witness)\n` +
      `GD schedule: deterministic i = cycle mod N\n` +
      `seed (GD shuffle): ?`;
  }

  // Initialize derived info once at load
  updateDerivedEpochsText();
})();
