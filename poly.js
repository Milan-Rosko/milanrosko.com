"use strict";

window.onload = () => {

  /* ============================================================
   * 1. BASIC SETUP
   * ============================================================ */
  let rot = 2;         // rotation angle in radians
  const rotSpeed = 0.02;   // adjust for slower/faster rotation

  const body = document.body;
  const TP = 2 * Math.PI;
  const CSIZE = 300;

const ctx = (() => {
  const parent = document.getElementById("anim-container1");

  let container = document.createElement("div");
  container.style.textAlign = "center";
  parent.appendChild(container);

  let c = document.createElement("canvas");
  c.width = c.height = 2 * CSIZE;
  container.appendChild(c);

  return c.getContext("2d");
})();

  ctx.translate(CSIZE, CSIZE);
  ctx.lineCap = "round";

  onresize = () => {
    let D = Math.min(window.innerWidth, window.innerHeight) - 40;
    ctx.canvas.style.width = ctx.canvas.style.height = D + "px";
  };
  onresize();


  /* ============================================================
   * 2. COLOR
   * ============================================================ */

  const getRandomInt = (min, max, low) =>
    low
      ? Math.floor(Math.random() * Math.random() * (max - min)) + min
      : Math.floor(Math.random() * (max - min)) + min;

  function Color() {
    const CBASE = 11;
    const CT = 256 - CBASE;

    this.getRGB = (cf) => {
      let red = Math.round(cf * (CBASE + CT * 1 * Math.cos(this.RK2 + c / this.RK1)));
      let grn = Math.round(cf * (CBASE + CT * 2 * Math.cos(this.GK2 + c / this.GK1)));
      let blu = Math.round(cf * (CBASE + CT * 3 * Math.cos(this.BK2 + c / this.BK1)));
      return `rgb(${red},${grn},${blu})`;
    };

    this.randomize = () => {
      this.RK1 = 10 + 40 * Math.random();
      this.GK1 = 10 + 40 * Math.random();
      this.BK1 = 10 + 40 * Math.random();

      this.RK2 = TP * Math.random();
      this.GK2 = TP * Math.random();
      this.BK2 = TP * Math.random();
    };

    this.randomize();
  }

  const color = new Color();


  /* ============================================================
   * 3. POINTS AND LINES
   * ============================================================ */

  const ka = [2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60];
  let K1 = ka[getRandomInt(0, ka.length)];
  let K2 = ka[getRandomInt(0, ka.length)];
  let K3 = ka[getRandomInt(0, ka.length)];

  function Point(i) {
    this.set = () => {
      this.m = true;
      let z = i * TP / RES;

      let f = 1;
      if (i % K1) {
        f = frac;
      } else {
        this.m = false;
      }

      let f2 = (i % K2) ? frac2 : 1;
      let f3 = (i % K3) ? frac3 : 1;

      if (f2 === 1 && f3 === 1) this.m = false;

      this.x =
        f * CSIZE / 2 * (f2 * Math.cos(z) + f2 * Math.cos(11 * z)) +
        (1 - f) * CSIZE / 2 * (f3 * Math.cos(z) + f3 * Math.cos(11 * z));

      this.y =
        f * CSIZE / 2 * (f2 * Math.sin(z) + f2 * Math.sin(11 * z)) +
        (1 - f) * CSIZE / 2 * (f3 * Math.sin(z) + f3 * Math.sin(11 * z));
    };
  }

  function Line(p1, p2) {
    this.p1 = p1;
    this.p2 = p2;
    this.p = false;

    this.getPath = () => {
      let p = new Path2D();
      let mx = (p1.x + p2.x) / 2;
      let my = (p1.y + p2.y) / 2;

      p.moveTo(mx, my);
      p.lineTo(p1.x, p1.y);

      p.moveTo(mx, my);
      p.lineTo(p2.x, p2.y);

      return p;
    };
  }


  /* ============================================================
   * 4. ANIMATION STATE
   * ============================================================ */

  let stopped = true;

  const DUR = 200;     // main cycle length in frames (shape morphing)
  let t = 0;
  let t2 = 0;
  let c = 0;

  let frac = 1;
  let frac2 = 1;
  let frac3 = 1;
  let fracm = 1;
  let fracd = true;

  const ffa = [
    () => Math.pow(Math.cos(Math.PI * t / DUR), 2),
    () => (1 + 2 * Math.pow(Math.cos(Math.PI * t / DUR), 2)) / 3,
    () => (1 + Math.pow(Math.cos(Math.PI * t / DUR), 2)) / 2,
    () => (2 + Math.pow(Math.cos(Math.PI * t / DUR), 2)) / 3,
    () => (3 + Math.pow(Math.cos(Math.PI * t / DUR), 2)) / 4
  ];

  let ff1 = ffa[0];
  let ff2 = ffa[getRandomInt(0, 5, true)];
  let ff3 = ffa[getRandomInt(0, 5, true)];

  let dash = 10 * getRandomInt(1, 12);
  let useDash = false;


  /* ============================================================
   * 5. TRAIL DECAY (≈5 SECONDS)
   * ============================================================ */

  // We want old strokes to fade to ~5% of their brightness after 5 seconds.
  // Model: intensity(t) = exp(-t / tau), with intensity(5s) ≈ 0.05.
  const decaySeconds = 3;
  const targetFactor = 0.2;
  const tau = -decaySeconds / Math.log(targetFactor);  // in seconds

  let lastTs = null;  // last timestamp from requestAnimationFrame

  function applyDecay(dtSeconds) {
    // r is the multiplicative brightness factor between frames
    const r = Math.exp(-dtSeconds / tau);
    const alpha = 1 - r;  // newIntensity = (1 - alpha)*oldIntensity

    // Temporarily reset transform so the fill covers the full canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(0,0,0,0)`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }


  /* ============================================================
   * 6. POINT / LINE ARRAYS
   * ============================================================ */

  const RES = 120;
  const pa = Array.from({ length: RES }, (_, i) => new Point(i));

  const setPoints = () => {
    for (let p of pa) p.set();
  };

  const la = (() => {
    let lines = new Array(RES);

    for (let i = 0; i < RES - 1; i++) {
      lines[i] = new Line(pa[i], pa[i + 1]);

      if (
        (Math.abs(pa[i].x) < 0.1 && Math.abs(pa[i].y) < 0.1) ||
        (Math.abs(pa[i + 1].x) < 0.1 && Math.abs(pa[i + 1].y) < 0.1)
      ) {
        lines[i].p = true;
      }
    }

    lines[RES - 1] = new Line(pa[RES - 1], pa[0]);

    return lines;
  })();


  /* ============================================================
   * 7. DRAWING
   * ============================================================ */

const draw = () => {
  setPoints();

  let path = new Path2D();
  for (let i = 0; i < la.length; i++) {
    if (la[i].p) continue;
    if (la[i].p1.m || la[i].p2.m) {
      path.addPath(la[i].getPath());
    }
  }

  // ---- APPLY ROTATION ONLY TO THE DRAWN SHAPES ----
  ctx.save();
  ctx.rotate(rot);

  ctx.globalAlpha = 1;

  if (useDash) {
    ctx.setLineDash([
      (fracd ? (1 - fracm) : (1 - frac)) * dash,
      1000
    ]);
  } else {
    ctx.setLineDash([]);
  }

  ctx.lineWidth = 5;
  ctx.strokeStyle = "#00000010";
  ctx.stroke(path);

  ctx.lineWidth = 0.6 + 2 * (1 - Math.pow(ffa[0](), 8));
  ctx.strokeStyle = color.getRGB(1 - Math.pow(fracm, 2));
  ctx.stroke(path);

  ctx.restore();   // important: keep decay in screen space
};


  /* ============================================================
   * 8. MAIN LOOP
   * ============================================================ */

  const animate = (ts) => {
    if (stopped) return;

    if (lastTs === null) lastTs = ts;
    const dt = (ts - lastTs) / 1000; // dt in seconds
    lastTs = ts;

    // Apply decay to existing content
    applyDecay(dt);

    // Advance counters
    t++;
    t2++;
    c+=3;

    // Add rotation
    rot += rotSpeed;


    if (t >= DUR) {
      t = 5;
      t2 = 3;

      ff1 = ffa[getRandomInt(0, 5, true)];
      ff2 = ffa[getRandomInt(0, 5, true)];
      ff3 = ffa[getRandomInt(0, 5, true)];

      K1 = ka[getRandomInt(0, ka.length, true)];
      K2 = ka[getRandomInt(0, ka.length, true)];
      K3 = ka[getRandomInt(0, ka.length, true)];

      useDash = Math.random() < 0.7;
      if (useDash) {
        dash = 10 * getRandomInt(1, 12);
      } else {
        ctx.setLineDash([]);
      }
    }

    if (t === DUR / 2) {
      t2 = 0;
      useDash = Math.random() < 0.7;
      if (useDash) {
        dash = 10 * getRandomInt(1, 12);
      } else {
        ctx.setLineDash([]);
      }
      fracd = Math.random() < 0.8;
    }

    frac  = ff1();
    frac2 = ff2();
    frac3 = ff3();
    fracm = Math.pow(Math.cos(Math.PI * 2 * t2 / DUR), 2);

    draw();
    requestAnimationFrame(animate);
  };


  /* ============================================================
   * 9. START / STOP
   * ============================================================ */

  const start = () => {
    if (stopped) {
      stopped = false;
      lastTs = null;  // reset timing so decay is well-behaved
      requestAnimationFrame(animate);
    } else {
      stopped = true;
    }
  };

  start();

};
