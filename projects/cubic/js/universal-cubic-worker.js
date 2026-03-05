let data = null;
let monoms = null;
let meta = null;
let varsCount = 0;
let uIndex = 0;
let profile = null;

function post(type, payload = {}) {
  postMessage({ type, ...payload });
}

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number in environment.');
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('Empty numeric string in environment.');
    return BigInt(trimmed);
  }
  throw new Error('Environment values must be numbers or strings.');
}

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Coefficient JSON must be an object.');
  }
  if (!Array.isArray(raw.vars)) {
    throw new Error('Invalid JSON: missing vars array.');
  }
  if (!Array.isArray(raw.monomials)) {
    throw new Error('Invalid JSON: missing monomials array.');
  }
  if (!raw.meta || typeof raw.meta !== 'object') {
    throw new Error('Invalid JSON: missing meta object.');
  }

  const vars = raw.vars.map((v) => String(v));
  const varsLen = vars.length;
  const normalizedMonoms = raw.monomials.map((m, i) => {
    if (!m || typeof m !== 'object' || !Array.isArray(m.m)) {
      throw new Error(`Invalid monomial at index ${i}`);
    }
    const coeff = BigInt(String(m.c));
    const exps = m.m.map((pair, j) => {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new Error(`Invalid exponent pair at monomial ${i}, entry ${j}`);
      }
      const v = Number.parseInt(String(pair[0]), 10);
      const e = Number.parseInt(String(pair[1]), 10);
      if (!Number.isFinite(v) || v < 0 || v >= varsLen) {
        throw new Error(`Variable index out of bounds at monomial ${i}, entry ${j}: ${pair[0]}`);
      }
      if (!Number.isFinite(e) || e < 0) {
        throw new Error(`Invalid exponent at monomial ${i}, entry ${j}: ${pair[1]}`);
      }
      return [v, e];
    });
    return { c: coeff, m: exps };
  });

  return {
    vars,
    monomials: normalizedMonoms,
    meta: raw.meta,
  };
}

function parseNatField(metaObj, key) {
  if (!Object.prototype.hasOwnProperty.call(metaObj, key)) {
    throw new Error(`Unsupported artifact profile: missing meta.${key}.`);
  }
  const n = Number(metaObj[key]);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`Invalid meta.${key}: expected a natural number.`);
  }
  return n;
}

function validateSemanticProfile(raw, varsLen) {
  const m = raw.meta || {};
  const requiredMsg =
    'This validator accepts only bounded artifacts with encoding=zeckendorf, pairing_layout=gap4, successor=nat_plus_one_eq.';

  if (m.encoding !== 'zeckendorf') {
    throw new Error(`Unsupported meta.encoding=${String(m.encoding)}. ${requiredMsg}`);
  }
  if (m.pairing_layout !== 'gap4') {
    throw new Error(`Unsupported meta.pairing_layout=${String(m.pairing_layout)}. ${requiredMsg}`);
  }
  if (m.successor !== 'nat_plus_one_eq') {
    throw new Error(`Unsupported meta.successor=${String(m.successor)}. ${requiredMsg}`);
  }
  if (!Object.prototype.hasOwnProperty.call(m, 'debug_nonadjacency_disabled')) {
    throw new Error(`Unsupported artifact profile: missing meta.debug_nonadjacency_disabled. ${requiredMsg}`);
  }
  if (Boolean(m.debug_nonadjacency_disabled) !== false) {
    throw new Error('Rejected debug artifact: meta.debug_nonadjacency_disabled must be false.');
  }

  const nLines = parseNatField(m, 'n_lines');
  const digitWidth = parseNatField(m, 'digit_width');
  const maxReprLane = parseNatField(m, 'max_repr_lane');
  const maxReprFull = parseNatField(m, 'max_repr_full');

  if (digitWidth < 4 || digitWidth % 4 !== 0) {
    throw new Error(`Invalid meta.digit_width=${digitWidth}: expected divisible by 4 and >= 4.`);
  }
  if (nLines < 1) {
    throw new Error('Invalid meta.n_lines: expected >= 1.');
  }

  const publicVars = m.public_vars;
  if (!publicVars || typeof publicVars !== 'object') {
    throw new Error(`Unsupported artifact profile: missing meta.public_vars. ${requiredMsg}`);
  }
  if (!Object.prototype.hasOwnProperty.call(publicVars, 'u')) {
    throw new Error('Unsupported artifact profile: missing meta.public_vars.u.');
  }
  const ixU = Number.parseInt(String(publicVars.u), 10);
  if (!Number.isFinite(ixU) || ixU < 0 || ixU >= varsLen) {
    throw new Error(`Invalid meta.public_vars.u=${String(publicVars.u)}: out of bounds.`);
  }

  return {
    encoding: m.encoding,
    pairing_layout: m.pairing_layout,
    successor: m.successor,
    debug_nonadjacency_disabled: false,
    n_lines: nLines,
    digit_width: digitWidth,
    max_repr_lane: maxReprLane,
    max_repr_full: maxReprFull,
    u_index: ixU,
  };
}

function parseEnv(envObj) {
  const env = new Map();
  for (const [key, raw] of Object.entries(envObj || {})) {
    const idx = Number.parseInt(key, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= varsCount) {
      throw new Error(`Invalid variable index: ${key}`);
    }
    env.set(idx, toBigInt(raw));
  }
  return env;
}

function computeAudit() {
  if (!monoms || !meta) return null;
  let maxDegree = 0;
  let hasDegree3 = false;
  const degreeCounts = { 0: 0, 1: 0, 2: 0, 3: 0, gt3: 0 };
  let maxCoeffDigitsObserved = 0;
  let maxVarIndex = 0;
  let coeffsNonzero = true;

  for (const m of monoms) {
    if (m.c === 0n) coeffsNonzero = false;
    let deg = 0;
    for (const [v, e] of m.m) {
      deg += e;
      if (v > maxVarIndex) maxVarIndex = v;
    }
    if (deg > maxDegree) maxDegree = deg;
    if (deg === 3) hasDegree3 = true;
    if (deg <= 3) {
      degreeCounts[deg] += 1;
    } else {
      degreeCounts.gt3 += 1;
    }
    const coeffDigits = m.c < 0n ? (-m.c).toString().length : m.c.toString().length;
    if (coeffDigits > maxCoeffDigitsObserved) maxCoeffDigitsObserved = coeffDigits;
  }

  return {
    max_degree: maxDegree,
    has_degree_3: hasDegree3,
    degree_counts: degreeCounts,
    max_coeff_digits_observed: maxCoeffDigitsObserved,
    coeff_digits_ok: maxCoeffDigitsObserved <= Number(meta.max_coeff_digits),
    max_var_index: maxVarIndex,
    var_index_ok: maxVarIndex < varsCount,
    poly_nonempty: monoms.length > 0,
    coeffs_nonzero: coeffsNonzero,
    semantic_profile_ok: profile !== null,
  };
}

function bigIntPow(base, exp) {
  if (exp === 0) return 1n;
  let result = 1n;
  for (let i = 0; i < exp; i += 1) {
    result *= base;
  }
  return result;
}

function evalMonom(m, env) {
  let term = m.c;
  if (m.m.length === 0) return term;
  for (const [v, e] of m.m) {
    const value = env.get(v) ?? 0n;
    if (value === 0n) return 0n;
    term *= bigIntPow(value, e);
  }
  return term;
}

function evalPoly(env, stats = null) {
  let sum = 0n;
  for (let i = 0; i < monoms.length; i += 1) {
    const term = evalMonom(monoms[i], env);
    sum += term;
    if (stats) {
      stats.processed += 1;
      if (term !== 0n) stats.nonzero_terms += 1;
    }
    if (i > 0 && i % 3000 === 0) {
      post('progress', {
        phase: 'eval',
        current: i,
        total: monoms.length,
        message: `Evaluated ${i} / ${monoms.length} monomials.`,
      });
    }
  }
  post('progress', {
    phase: 'eval',
    current: monoms.length,
    total: monoms.length,
    message: `Evaluated ${monoms.length} / ${monoms.length} monomials.`,
  });
  return sum;
}

function buildDirectEnv(rawU) {
  const u = toBigInt(rawU ?? 0);
  return new Map([[uIndex, u]]);
}

function evaluatePointEnv(envMap) {
  if (!monoms) throw new Error('Coefficients not loaded yet.');
  const start = performance.now();
  const tableValue = evalPoly(envMap);
  const tableDurationMs = performance.now() - start;
  return {
    u: (envMap.get(uIndex) ?? 0n).toString(),
    u_index: uIndex,
    table_value: tableValue.toString(),
    table_is_zero: tableValue === 0n,
    table_duration_ms: tableDurationMs,
    nonzero_assignments: envMap.size,
  };
}

function ingestRawData(raw) {
  const normalized = normalizeData(raw);
  data = raw;
  monoms = normalized.monomials;
  meta = normalized.meta;
  varsCount = normalized.vars.length;
  profile = validateSemanticProfile(raw, varsCount);
  uIndex = profile.u_index;

  post('loaded', {
    meta,
    counts: { vars: varsCount, monomials: monoms.length },
    profile,
    u_index: uIndex,
  });
}

async function loadData(url) {
  post('progress', { phase: 'load', current: 0, total: 1, message: 'Fetching coefficient table...' });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  const raw = await res.json();
  ingestRawData(raw);
  post('progress', { phase: 'load', current: 1, total: 1, message: `Loaded ${monoms.length} monomials.` });
}

function loadDataFromText(text) {
  const raw = JSON.parse(text);
  ingestRawData(raw);
  post('progress', { phase: 'load', current: 1, total: 1, message: `Loaded ${monoms.length} monomials.` });
}

function validateSuiteArtifactShape(suite) {
  if (!suite || typeof suite !== 'object') throw new Error('Suite payload must be an object.');
  if (!suite.artifact || typeof suite.artifact !== 'object') throw new Error('Suite missing artifact metadata.');
  if (!Array.isArray(suite.cases)) throw new Error('Suite missing cases array.');
  const expectedVarCount = Number(suite.artifact.var_count);
  const expectedMonomialCount = Number(suite.artifact.monomial_count);
  const expectedU = Number(suite.artifact.public_u_index);
  if (!Number.isFinite(expectedVarCount) || expectedVarCount !== varsCount) {
    throw new Error(`Suite/artifact mismatch: var_count=${expectedVarCount}, loaded=${varsCount}`);
  }
  if (!Number.isFinite(expectedMonomialCount) || expectedMonomialCount !== monoms.length) {
    throw new Error(`Suite/artifact mismatch: monomial_count=${expectedMonomialCount}, loaded=${monoms.length}`);
  }
  if (!Number.isFinite(expectedU) || expectedU !== uIndex) {
    throw new Error(`Suite/artifact mismatch: public_u_index=${expectedU}, loaded=${uIndex}`);
  }
}

function runSentenceSuite(suite) {
  if (!monoms) throw new Error('Coefficients not loaded yet.');
  validateSuiteArtifactShape(suite);
  const rows = [];
  let passed = 0;
  const total = suite.cases.length;
  for (let i = 0; i < total; i += 1) {
    const c = suite.cases[i];
    post('progress', {
      phase: 'suite',
      current: i,
      total,
      message: `Running suite case ${i + 1}/${total}: ${c.id}`,
    });
    const env = parseEnv(c.env || {});
    const start = performance.now();
    const stats = { processed: 0, nonzero_terms: 0 };
    const value = evalPoly(env, stats);
    const duration = performance.now() - start;
    const observedZero = value === 0n;
    const expectedZero = Boolean(c.expected_zero);
    const pass = observedZero === expectedZero;
    if (pass) passed += 1;
    rows.push({
      id: String(c.id || `case_${i}`),
      kind: String(c.kind || ''),
      expected_zero: expectedZero,
      observed_zero: observedZero,
      pass,
      value: value.toString(),
      duration_ms: duration,
      nonzero_assignments: env.size,
      processed_monomials: stats.processed,
      nonzero_monomials: stats.nonzero_terms,
      description: String(c.description || ''),
    });
  }
  post('suite_result', {
    name: String(suite.name || 'suite'),
    total,
    passed,
    all_passed: passed === total,
    cases: rows,
  });
}

self.addEventListener('message', async (event) => {
  try {
    const { type } = event.data;

    if (type === 'load') {
      await loadData(event.data.url);
      return;
    }

    if (type === 'load_data') {
      post('progress', { phase: 'load', current: 0, total: 1, message: 'Parsing coefficient file...' });
      loadDataFromText(event.data.text);
      return;
    }

    if (type === 'audit') {
      const audit = computeAudit();
      post('audit', { audit });
      return;
    }

    if (type === 'eval') {
      if (!monoms) throw new Error('Coefficients not loaded yet.');
      const env = parseEnv(event.data.env || {});
      const start = performance.now();
      const value = evalPoly(env);
      const duration = performance.now() - start;
      post('eval_result', {
        value: value.toString(),
        duration_ms: duration,
        nonzero_assignments: env.size,
      });
      return;
    }

    if (type === 'direct_route') {
      if (!monoms) throw new Error('Coefficients not loaded yet.');
      const env = buildDirectEnv(event.data.u);
      const result = evaluatePointEnv(env);
      post('direct_route_result', result);
      return;
    }

    if (type === 'run_sentence_suite_data') {
      runSentenceSuite(event.data.suite);
      return;
    }
  } catch (err) {
    post('error', { message: err && err.message ? err.message : String(err) });
  }
});
