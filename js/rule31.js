// ----------------------------------------------------
// Configuration
// ----------------------------------------------------

let CANVAS_BG = "white";
// Example overrides:
// CANVAS_BG = "#202020";
// CANVAS_BG = "rgba(0,0,0,0.8)";
// CANVAS_BG = "transparent";  // use CSS container background instead

const CELL_COUNT     = 170;
const CELL_SIZE      = 7;

const TRAIL_LENGTH   = 60;
const FADE_LENGTH    = 100;

let writeRow = 0;

let cells = [];
let trail = [];
let field = [];

// layers
let simLayer;
let accumLayer;

const INITIAL_HUE   = 200;

const MAX_STATE = 22;        // phase count
const ANNIHILATION_T = 3;  // phase difference threshold
const ZERO_STICKY_T = 4;   // zero hysteresis threshold

const BACKGROUND_ENERGY = 1;   // very weak sustenance
const RECOVERY_GATE    = 55;  // lower = more revival



// ----------------------------------------------------
// Feature Toggles & Tunable Parameters
// ----------------------------------------------------

// --- Simulation toggles ---
let ENABLE_HUE_CYCLE            = true;    // engine modifies hue on active cells

let ENABLE_BRIGHTNESS_GAIN      = false;   // brightness increases on active cells
let ENABLE_BRIGHTNESS_DECAY     = false;   // brightness decreases on inactive cells
let ENABLE_KILL_ON_MAX_BRIGHT   = false;   // state forced to 0 when brightness exceeds threshold

let ENABLE_TRAIL                = true;    // if false, nothing stored in trail buffer
let ENABLE_TRAIL_FADE           = true;    // if false, alpha will not depend on age

let ENABLE_ACCUM_DECAY          = true;    // global accumulation fade-out per frame
let ENABLE_ACCUM_BLEND          = true;    // add simLayer into accumulation layer

// --- Engine parameters ---
let HUE_INCREMENT_ACTIVE        = 33;      // hue shift for active cells
let BRIGHTNESS_GAIN_ACTIVE      = 80;      // brightness gain per active event
let BRIGHTNESS_DECAY_INACTIVE   = 50;      // brightness loss on inactive event
let BRIGHTNESS_MAX_THRESHOLD    = 100;     // used with ENABLE_KILL_ON_MAX_BRIGHT

// --- Trail parameters ---
let TRAIL_ALPHA_MIN             = 0.1;     // minimum opacity
let TRAIL_ALPHA_MAX             = 1.0;     // maximum opacity
let TRAIL_FADE_LENGTH           = FADE_LENGTH; // can override independently
let TRAIL_DRAW_SIZE_FACTOR      = 0.8;     // radius/size relative to cell size

// --- Speed & pacing ---
let STEPS_PER_FRAME             = 2;       // how many CA steps per draw() call
let FRAME_SKIP                  = 0;       // render every (FRAME_SKIP+1)-th frame

// --- Accumulation layer dynamics ---
const BLEND_LIGHTEST =
  (typeof LIGHTEST !== "undefined") ? LIGHTEST : 13; // fallback numeric constant
let ACCUM_FADE_ALPHA            = 0.05;    // how strongly the accumulation layer fades
let ACCUM_BLEND_MODE            = BLEND_LIGHTEST;   // can change to ADD, DARKEST, etc.

// --- Rendering overrides ---
let CELL_RENDER_STYLE           = "circle";
// options: "circle", "square", "soft-square", "point"


// ----------------------------------------------------
// Stronger chaotic dynamics injection (computable)
// OFF by default (baseline preserved)
// ----------------------------------------------------

let ENABLE_CHAOTIC_PULSES = false;

// Fibonacci pulse schedule (mod 2^32, integer-only)
let fibPulseA = 1 >>> 0;
let fibPulseB = 1 >>> 0;
let nextPulse = 1 >>> 0;

// Weyl phase (integer-only; quasi-periodic)
let weylPhase = 3 >>> 0;
const WEYL_STEP = 0x9E3779B9 >>> 0;

// Internal step counter for CA-steps (not frames)
let caStepCount = 0;

function tickFibonacciPulse() {
  const n = (fibPulseA + fibPulseB) >>> 0;
  fibPulseA = fibPulseB;
  fibPulseB = n;

  // keep pulses from getting pathological at start
  nextPulse = (n === 0 ? 1 : n) >>> 0;
}

function tickWeyl() {
  weylPhase = (weylPhase + WEYL_STEP) >>> 0;
}

function isPulseStep(stepCount) {
  return (stepCount >>> 0) === (nextPulse >>> 0);
}


// ----------------------------------------------------
// Setup
// ----------------------------------------------------
function setup() {
  let cnv = createCanvas(CELL_COUNT * CELL_SIZE, TRAIL_LENGTH * CELL_SIZE);
  cnv.parent("ca-container");  // canvas inside your div
  cnv.elt.style.background = CANVAS_BG;

  colorMode(HSL, 360, 100, 100, 1);
  noStroke();

  simLayer = createGraphics(width, height);
  simLayer.colorMode(HSL, 360, 100, 100, 1);
  simLayer.noStroke();

  accumLayer = createGraphics(width, height);
  accumLayer.colorMode(HSL, 360, 100, 100, 1);
  accumLayer.noStroke();

  // initial CA row
  for (let i = 0; i < CELL_COUNT; i++) {
    cells[i] = Math.random() < 0.5 ? 0 : 1;
  }

  // trail ring buffer
  for (let r = 0; r < TRAIL_LENGTH; r++) {
    trail[r] = [];
    for (let c = 0; c < CELL_COUNT; c++) {
      trail[r][c] = {
        state: 0,
        age: TRAIL_LENGTH,
        hue: INITIAL_HUE,
        brightness: 50
      };
    }
  }

  // field buffer
  for (let r = 0; r < TRAIL_LENGTH; r++) {
    field[r] = [];
    for (let c = 0; c < CELL_COUNT; c++) {
      field[r][c] = { hue: INITIAL_HUE, brightness: 50 };
    }
  }

  // initialize pulse schedule deterministically
  tickFibonacciPulse(); // nextPulse = 2
  tickFibonacciPulse(); // nextPulse = 3
}


// ----------------------------------------------------
// Main Loop
// ----------------------------------------------------
function draw() {
  // optional frame skipping
  if (FRAME_SKIP > 0 && frameCount % (FRAME_SKIP + 1) !== 0) return;

  // clear only the simulation layer
  simLayer.clear();

  // run multiple CA steps per frame if desired
  for (let step = 0; step < STEPS_PER_FRAME; step++) {
    applyEngineToField();
    saveCurrentRow();
    ageTrail();

    caStepCount = (caStepCount + 1) >>> 0;

    if (ENABLE_CHAOTIC_PULSES && isPulseStep(caStepCount)) {
      cells = nextRulePulse(cells);   // one-step chaotic pulse
      tickFibonacciPulse();           // schedule the next pulse
    } else {
      cells = nextRuleCore(cells);      // baseline dynamics
    }
  }

  // draw the trail for the latest state
  drawTrail(simLayer);

  // ------------------------------------------------
  // DECAY ACCUMULATION LAYER
  // ------------------------------------------------
  if (ENABLE_ACCUM_DECAY) {
    // in HSL mode: (h,s,l,a) -> white is l=100, any h/s
    accumLayer.fill(0, 0, 100, ACCUM_FADE_ALPHA);
    accumLayer.rect(0, 0, width, height);
  }

  // add simLayer to accumulation layer
  if (ENABLE_ACCUM_BLEND) {
    accumLayer.blend(
      simLayer, 0, 0, width, height,
      0, 0, width, height,
      ACCUM_BLEND_MODE
    );
  }

  // draw the accumulation layer to the main canvas
  image(accumLayer, 0, 0);
}


// ----------------------------------------------------
// Engine updates hue + brightness
// ----------------------------------------------------
function applyEngineToField() {
  const r = writeRow;

  for (let c = 0; c < CELL_COUNT; c++) {
    let f = field[r][c];

    if (cells[c] === 1) {
      if (ENABLE_HUE_CYCLE) {
        f.hue = (f.hue + HUE_INCREMENT_ACTIVE) % 360;
      }
      if (ENABLE_BRIGHTNESS_GAIN) {
        f.brightness = Math.min(100, f.brightness + BRIGHTNESS_GAIN_ACTIVE);
      }
    } else {
      if (ENABLE_BRIGHTNESS_DECAY) {
        f.brightness = Math.max(0, f.brightness - BRIGHTNESS_DECAY_INACTIVE);
      }
    }
  }
}


// ----------------------------------------------------
// Save current row into ring buffer
// ----------------------------------------------------
function saveCurrentRow() {
  const r = writeRow;

  for (let c = 0; c < CELL_COUNT; c++) {
    const f = field[r][c];
    let state = cells[c];

    if (ENABLE_KILL_ON_MAX_BRIGHT && f.brightness >= BRIGHTNESS_MAX_THRESHOLD) {
      state = 0;
    }

    if (!ENABLE_TRAIL) continue;

    trail[r][c] = {
      state: state,
      age: 0,
      hue: f.hue,
      brightness: f.brightness
    };
  }

  writeRow = (writeRow + 1) % TRAIL_LENGTH;
}


// ----------------------------------------------------
// Age trail entries
// ----------------------------------------------------
function ageTrail() {
  if (!ENABLE_TRAIL) return;

  for (let r = 0; r < TRAIL_LENGTH; r++) {
    for (let c = 0; c < CELL_COUNT; c++) {
      trail[r][c].age++;
    }
  }
}


// ----------------------------------------------------
// Draw trail with fading into a target layer
// ----------------------------------------------------
function drawTrail(pg) {
  if (!ENABLE_TRAIL) return;

  const fadeLen = ENABLE_TRAIL_FADE ? TRAIL_FADE_LENGTH : 1;

  for (let r = 0; r < TRAIL_LENGTH; r++) {
    for (let c = 0; c < CELL_COUNT; c++) {

      const cell = trail[r][c];
      if (cell.state === 0) continue;

      // age-based alpha (clamped)
      const alpha = map(
        cell.age,
        0, fadeLen,
        TRAIL_ALPHA_MAX, TRAIL_ALPHA_MIN,
        true
      );

      pg.fill(cell.hue, 60, cell.brightness, alpha);

      const x = (c + 0.5) * CELL_SIZE;
      const y = (r + 0.5) * CELL_SIZE;
      const s = CELL_SIZE * TRAIL_DRAW_SIZE_FACTOR;

      switch (CELL_RENDER_STYLE) {
        case "square":
          pg.square(x - s / 2, y - s / 2, s);
          break;

        case "soft-square":
          pg.rect(x - s / 2, y - s / 2, s, s, CELL_SIZE * 0.2);
          break;

        case "point":
          pg.point(x, y);
          break;

        case "circle":
        default:
          pg.circle(x, y, s);
          break;
      }
    }
  }
}

function nextRuleCore(row) {
  const out = new Array(row.length);

  // slow global modulation
  tickFibonacciPulse();
  const mod = (fibPulseB % 5) + 5; // 5..9

  for (let i = 0; i < row.length; i++) {
    const l = row[(i - 1 + row.length) % row.length];
    const c = row[i];
    const r = row[(i + 1) % row.length];

    // -----------------------------
    // 1. ASYMMETRIC ANNIHILATION
    // -----------------------------
    const dL = Math.abs(c - l);
    const dR = Math.abs(c - r);

    if ((fibPulseB & 7) === 0 && dL > ANNIHILATION_T && dR > ANNIHILATION_T) {
      // collapse only if center is weak
      if (c < l || c < r) {
        out[i] = 0;
        continue;
      }
    }

    // -----------------------------
    // 2. ZERO HYSTERESIS (leaky)
    // -----------------------------
    if (c === 0) {
      // rare Fibonacci-gated recovery
      if ((fibPulseB % RECOVERY_GATE) === (i & 3)) {
        out[i] = (l + r + fibPulseA) % (MAX_STATE + 1);
        continue;
      }
      // otherwise stay zero if neighborhood is weak
      if ((l + r) < ZERO_STICKY_T) {
        out[i] = 0;
        continue;
      }
    }

    // -----------------------------
    // 3. ENERGY COMPUTATION
    // -----------------------------
    let energy =
      (c << 1) +
      l +
      r -
      Math.abs(l - r);

    // directional bias
    if ((i & 1) === 0) energy += l;
    else energy -= r;

    // background sustenance (critical!)
    energy += BACKGROUND_ENERGY;

    if (energy <= 0) {
      out[i] = 0;
      continue;
    }

    // -----------------------------
    // 4. PHASE TRANSPORT
    // -----------------------------
    let next =
      (c +
       ((l > r) ? l : r) +
       fibPulseA) % mod;

    if (next > MAX_STATE) next %= (MAX_STATE + 1);

    out[i] = next;
  }

  return out;
}
