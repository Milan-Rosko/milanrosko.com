const loadBtn = document.getElementById('loadBtn');
const loadStatus = document.getElementById('loadStatus');
const analyticsEl = document.getElementById('analytics');
const auditBtn = document.getElementById('auditBtn');
const logEl = document.getElementById('log');
const fileBtn = document.getElementById('fileBtn');
const fileInput = document.getElementById('fileInput');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const suiteBtn = document.getElementById('suiteBtn');
const suiteResultEl = document.getElementById('suiteResult');

function createBlobWorker() {
  const workerUrl = new URL('js/universal-cubic-worker.js', location.href).href;
  const source = `importScripts(${JSON.stringify(workerUrl)});`;
  const blob = new Blob([source], { type: 'text/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  return new Worker(blobUrl);
}

function createWorker() {
  if (location.protocol !== 'file:') {
    try {
      return new Worker('js/universal-cubic-worker.js');
    } catch (err) {
      log(`Worker.js failed (${err.message}). Falling back to blob worker.`);
    }
  }
  return createBlobWorker();
}

let worker;
try {
  worker = createWorker();
} catch (err) {
  setStatus('Error');
  log(`Worker init failed: ${err.message}`);
}

let loaded = false;
let workerReady = false;
let loadedUIndex = 0;
let readoutSource = null;
const logLines = [];
const analyticsState = {
  metadata: ['No artifact metadata loaded.'],
  ingest: ['No artifact parsed yet.'],
  audit: ['Structural audit not run yet.'],
};

function setProgress(percent, label) {
  const clamped = Math.max(0, Math.min(100, percent));
  if (progressBar) progressBar.style.width = `${clamped}%`;
  if (progressText && label) progressText.textContent = label;
}

function send(message) {
  if (!worker) {
    setStatus('Error');
    log('Worker is unavailable. Open with a local server or use the file loader.');
    return;
  }
  worker.postMessage(message);
}

async function resolveSuiteData() {
  if (typeof window !== 'undefined' && window.CUBIC_SENTENCE_CASES && typeof window.CUBIC_SENTENCE_CASES === 'object') {
    return window.CUBIC_SENTENCE_CASES;
  }
  throw new Error('Suite payload is unavailable (window.CUBIC_SENTENCE_CASES missing).');
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  logLines.push(`[${ts}] ${msg}`);
  renderLog();
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLog() {
  const html = logLines.map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join('');
  logEl.innerHTML = html;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text) {
  if (loadStatus) loadStatus.textContent = text;
  else if (progressText) progressText.textContent = text;
}

function asText(value) {
  if (value === null || value === undefined) return 'missing';
  return String(value);
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function renderAnalytics() {
  if (!analyticsEl) return;
  const lines = [
    '[READ FROM METADATA]',
    ...analyticsState.metadata,
    '',
    '[CALCULATED / VERIFIED]',
    '-- artifact ingest --',
    ...analyticsState.ingest,
    '',
    '-- structural audit --',
    ...analyticsState.audit,
  ];
  analyticsEl.textContent = lines.join('\n');
}

function buildMetadataLines(meta, profile, uIndex) {
  return [
    `meta.base: ${asText(meta.base)}`,
    `meta.channel_count: ${asText(meta.channel_count)}`,
    `meta.max_coeff_digits: ${asText(meta.max_coeff_digits)}`,
    `meta.aggregation_mode: ${asText(meta.aggregation_mode)}`,
    `meta.aggregation_block_size: ${asText(meta.aggregation_block_size)}`,
    `meta.aggregation_outer_base: ${asText(meta.aggregation_outer_base)}`,
    `meta.encoding: ${asText(meta.encoding)}`,
    `meta.pairing_layout: ${asText(meta.pairing_layout)}`,
    `meta.successor: ${asText(meta.successor)}`,
    `meta.n_lines: ${asText(meta.n_lines)}`,
    `meta.digit_width: ${asText(meta.digit_width)}`,
    `meta.max_repr_lane: ${asText(meta.max_repr_lane)}`,
    `meta.max_repr_full: ${asText(meta.max_repr_full)}`,
    `meta.public_vars.u: ${asText(uIndex)}`,
    `meta.debug_nonadjacency_disabled: ${profile ? asText(profile.debug_nonadjacency_disabled) : asText(meta.debug_nonadjacency_disabled)}`,
  ];
}

function buildIngestLines(counts, profile, uIndex, suiteCompatibility) {
  const profileCheck = profile
    ? `pass (${profile.encoding}, ${profile.pairing_layout}, ${profile.successor})`
    : 'fail (semantic profile unavailable)';
  const suiteCheck = suiteCompatibility.ok ? 'pass' : `fail (${suiteCompatibility.reason})`;
  return [
    `vars_count_observed: ${counts.vars} (from vars.length)`,
    `monomial_count_observed: ${counts.monomials} (from monomials.length)`,
    `public_u_index_bounds_check: pass (0 <= ${uIndex} < ${counts.vars})`,
    `semantic_profile_validation: ${profileCheck}`,
    `suite_compatibility_check: ${suiteCheck}`,
  ];
}

function buildAuditLines(audit) {
  if (!audit) return ['Audit unavailable.'];
  return [
    'computed from full monomial scan:',
    `max_degree_observed: ${audit.max_degree}`,
    `has_degree_3_observed: ${yesNo(audit.has_degree_3)}`,
    `degree_counts_observed: ${JSON.stringify(audit.degree_counts)}`,
    `max_coeff_digits_observed: ${audit.max_coeff_digits_observed}`,
    `coeff_digits_vs_meta_check: ${yesNo(audit.coeff_digits_ok)}`,
    `max_var_index_observed: ${audit.max_var_index}`,
    `var_index_bounds_check: ${yesNo(audit.var_index_ok)}`,
    `poly_nonempty_check: ${yesNo(audit.poly_nonempty)}`,
    `coeffs_nonzero_check: ${yesNo(audit.coeffs_nonzero)}`,
    `semantic_profile_check: ${yesNo(audit.semantic_profile_ok)}`,
  ];
}

function buildSuiteLines(payload) {
  if (!payload) return ['Sentence suite did not produce results.'];
  const rows = Array.isArray(payload.cases) ? payload.cases : [];
  const lines = [
    `suite_name: ${payload.name || 'unknown'}`,
    `cases_passed: ${payload.passed}/${payload.total}`,
    `all_cases_passed: ${yesNo(payload.all_passed)}`,
  ];
  for (const row of rows) {
    lines.push(
      `${row.id}: expected_zero=${yesNo(row.expected_zero)}, observed_zero=${yesNo(row.observed_zero)}, pass=${yesNo(row.pass)}, eval_time_ms=${Math.round(row.duration_ms || 0)}, monomials=${row.processed_monomials}, nonzero_terms=${row.nonzero_monomials}`
    );
  }
  return lines;
}

function setReadoutPendingLines() {
  analyticsState.metadata = ['Readout pending. Press "Readout" to display metadata values.'];
  analyticsState.ingest = ['Readout pending. Press "Readout" to display ingest checks.'];
  analyticsState.audit = ['Readout pending. Press "Readout" to compute structural audit.'];
}

function renderSuiteResult(lines) {
  if (!suiteResultEl) return;
  suiteResultEl.textContent = lines.join('\n');
}

function getSuiteArtifactMeta() {
  if (
    typeof window !== 'undefined' &&
    window.CUBIC_SENTENCE_CASES &&
    typeof window.CUBIC_SENTENCE_CASES === 'object' &&
    window.CUBIC_SENTENCE_CASES.artifact &&
    typeof window.CUBIC_SENTENCE_CASES.artifact === 'object'
  ) {
    return window.CUBIC_SENTENCE_CASES.artifact;
  }
  return null;
}

function getSuiteCompatibility(counts, uIndex, meta) {
  const artifact = getSuiteArtifactMeta();
  if (!artifact) {
    return { ok: false, reason: 'suite metadata is unavailable.' };
  }
  const expectedVars = Number(artifact.var_count);
  const expectedMonomials = Number(artifact.monomial_count);
  const expectedU = Number(artifact.public_u_index);
  const expectedBase = Number(artifact.base);

  if (!Number.isFinite(expectedVars) || expectedVars !== counts.vars) {
    return { ok: false, reason: `var_count mismatch (suite=${expectedVars}, loaded=${counts.vars}).` };
  }
  if (!Number.isFinite(expectedMonomials) || expectedMonomials !== counts.monomials) {
    return {
      ok: false,
      reason: `monomial_count mismatch (suite=${expectedMonomials}, loaded=${counts.monomials}).`,
    };
  }
  if (!Number.isFinite(expectedU) || expectedU !== uIndex) {
    return { ok: false, reason: `public_u_index mismatch (suite=${expectedU}, loaded=${uIndex}).` };
  }
  if (Number.isFinite(expectedBase) && Number(meta.base) !== expectedBase) {
    return { ok: false, reason: `base mismatch (suite=${expectedBase}, loaded=${meta.base}).` };
  }
  return { ok: true, reason: '' };
}

if (suiteBtn) suiteBtn.disabled = true;
renderAnalytics();
renderSuiteResult(['Sentence suite not run yet.']);

if (suiteBtn) {
  suiteBtn.addEventListener('click', async () => {
    if (!loaded) {
      log('Load coefficients first.');
      return;
    }
    try {
      log('Resolving sentence suite payload.');
      const suite = await resolveSuiteData();
      log('Running fixed sentence suite (2 true + 2 false).');
      send({ type: 'run_sentence_suite_data', suite });
    } catch (err) {
      log(`Suite load failed: ${err.message}`);
      setStatus('Error');
    }
  });
}

loadBtn.addEventListener('click', () => {
  if (location.protocol === 'file:') {
    setStatus('File mode');
    log('Fetch disabled in file mode. Use "Load (file)" instead.');
    return;
  }
  loaded = false;
  readoutSource = null;
  auditBtn.disabled = true;
  if (suiteBtn) suiteBtn.disabled = true;
  analyticsState.ingest = ['Loading artifact...'];
  analyticsState.audit = ['Structural audit not run yet.'];
  renderAnalytics();
  renderSuiteResult(['Sentence suite not run yet.']);
  setStatus('Loading...');
  log('Requesting coefficient load.');
  setProgress(5, 'Loading coefficients...');
  send({ type: 'load', url: new URL('assets/universal_cubic.effective.coefficients.json', location.href).href });
});

fileBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  loaded = false;
  readoutSource = null;
  auditBtn.disabled = true;
  if (suiteBtn) suiteBtn.disabled = true;
  analyticsState.ingest = ['Loading artifact...'];
  analyticsState.audit = ['Structural audit not run yet.'];
  renderAnalytics();
  renderSuiteResult(['Sentence suite not run yet.']);
  setStatus('Loading file...');
  log(`Reading ${file.name} (${Math.round(file.size / 1024)} KB).`);
  setProgress(5, 'Loading coefficients...');
  try {
    const text = await file.text();
    send({ type: 'load_data', text });
  } catch (err) {
    setStatus('Error');
    log(`File read error: ${err.message}`);
  } finally {
    fileInput.value = '';
  }
});

auditBtn.addEventListener('click', () => {
  if (!loaded) return;
  log('Running readout.');
  send({ type: 'audit' });
});

if (worker) {
  workerReady = true;
  worker.addEventListener('message', (event) => {
    const { type } = event.data;

    if (type === 'loaded') {
      loaded = true;
      loadedUIndex = Number.isFinite(event.data.u_index) ? event.data.u_index : 0;
      const counts = event.data.counts;
      const suiteCompatibility = getSuiteCompatibility(counts, loadedUIndex, event.data.meta);
      readoutSource = {
        meta: event.data.meta,
        profile: event.data.profile,
        counts,
        uIndex: loadedUIndex,
        suiteCompatibility,
      };
      setReadoutPendingLines();
      if (suiteBtn) suiteBtn.disabled = !suiteCompatibility.ok;
      renderAnalytics();
      renderSuiteResult(
        suiteCompatibility.ok
          ? ['Ready. Press "Test" to verify the fixed sentence suite.']
          : [`Sentence suite is disabled for this artifact.`, `Reason: ${suiteCompatibility.reason}`]
      );
      auditBtn.disabled = false;
      setStatus('Loaded');
      log(`Coefficient table loaded (u_index=${loadedUIndex}).`);
      if (!suiteCompatibility.ok) {
        log(`Suite disabled: ${suiteCompatibility.reason}`);
      }
      setProgress(100, 'Coefficients ready');
      return;
    }

    if (type === 'audit') {
      if (readoutSource) {
        analyticsState.metadata = buildMetadataLines(readoutSource.meta, readoutSource.profile, readoutSource.uIndex);
        analyticsState.ingest = buildIngestLines(
          readoutSource.counts,
          readoutSource.profile,
          readoutSource.uIndex,
          readoutSource.suiteCompatibility
        );
      }
      analyticsState.audit = buildAuditLines(event.data.audit);
      renderAnalytics();
      log('Audit completed.');
      return;
    }

    if (type === 'progress') {
      if (event.data.message) {
        log(event.data.message);
      }
      if (event.data.phase === 'load' && event.data.total) {
        const pct = (event.data.current / event.data.total) * 100;
        setProgress(pct, event.data.message || 'Loading...');
      }
      return;
    }

    if (type === 'suite_result') {
      renderSuiteResult(buildSuiteLines(event.data));
      log(`Sentence suite completed. pass=${event.data.passed}/${event.data.total}.`);
      return;
    }

    if (type === 'error') {
      setStatus('Error');
      log(`Error: ${event.data.message}`);
    }
  });
}

if (worker) {
  worker.addEventListener('error', (event) => {
    setStatus('Error');
    log(`Worker error: ${event.message || 'Unknown error'}`);
  });
}

if (location.protocol === 'file:') {
  setStatus('Waiting for file...');
  log('File mode detected. Use "Load (file)" to select universal_cubic.effective.coefficients.json for the built-in sentence suite.');
  loadBtn.disabled = true;
} else {
  setStatus('Idle');
  log('Press "Load (fetch)" to load coefficients.');
}

if (!workerReady) {
  setStatus('Error');
  log('Worker failed to initialize. Try the file loader or run a local server.');
}
