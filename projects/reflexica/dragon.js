"use strict";

(() => {
  const speed = 1;
  const W = 500;
  const H = 350;
  const maxDraws = 200000;
  const xRange = [-0.35, 1.35];
  const yRange = [-0.55, 1.05];

  const transformations = [
    [(x, y) => 0.5 * x - 0.5 * y, (x, y) => 0.5 * x + 0.5 * y, 50],
    [(x, y) => -0.5 * x - 0.5 * y + 1, (x, y) => 0.5 * x - 0.5 * y, 50]
  ];

  const colorStops = [
    [0, "rgba(255,255,255,0.9)"],
    [1000, "rgba(112,199,255,0.55)"],
    [5000, "rgba(89,255,214,0.55)"],
    [10000, "rgba(255,232,102,0.5)"],
    [20000, "rgba(255,109,194,0.48)"],
    [40000, "rgba(132,255,122,0.48)"],
    [65000, "rgba(93,180,255,0.42)"],
    [90000, "rgba(248,244,154,0.4)"],
    [125000, "rgba(255,128,212,0.42)"],
    [150000, "rgba(133,255,236,0.45)"],
    [190000, "rgba(255,255,255,0.72)"]
  ];

  const animationCurve = (frame) => {
    if (frame < 1000) return 25;
    if (frame < 5000) return 50;
    if (frame < 10000) return 75;
    if (frame < 20000) return 100;
    if (frame < 40000) return 150;
    if (frame < 65000) return 250;
    if (frame < 90000) return 400;
    if (frame < 150000) return 600;
    if (frame < 190000) return 400;
    if (frame < 200000) return 100;
    return 0;
  };

  const rand = (a, b) => (b - a) * Math.random() + a;

  const makeColorUpdater = (ctx, getNumDraws) => {
    const colors = colorStops.slice();

    return () => {
      if (!colors[0] || getNumDraws() < colors[0][0]) return;
      const colorStop = colors.shift();
      ctx.fillStyle = colorStop[1];
    };
  };

  window.addEventListener("load", () => {
    const canvas = document.getElementById("world");
    if (!canvas) return;

    canvas.width = W;
    canvas.height = H;
    Object.assign(canvas.style, {
      margin: "0 auto"
    });

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    window.ctx = ctx;

    const lut = {};
    let pMax = 0;

    for (const row of transformations) {
      for (let i = pMax; i < row[2] + pMax; i++) {
        lut[i] = [row[0], row[1]];
      }
      pMax += row[2];
    }

    const xSpan = xRange[1] - xRange[0];
    const ySpan = yRange[1] - yRange[0];

    let numDraws = 0;
    let updateColor = makeColorUpdater(ctx, () => numDraws);

    const reset = () => {
      numDraws = 0;
      updateColor = makeColorUpdater(ctx, () => numDraws);
      ctx.clearRect(0, 0, W, H);
    };

    window.updateColor = () => updateColor();
    window.addEventListener("click", reset);

    const render = () => {
      if (numDraws > maxDraws) return;

      updateColor();
      const drawsPerFrame = speed * animationCurve(numDraws);

      for (let i = 0; i <= drawsPerFrame; i++) {
        let iter = 0;
        let x = rand(xRange[0], xRange[1]);
        let y = rand(yRange[0], yRange[1]);

        while (iter++ < 50) {
          const f = lut[Math.floor(rand(0, pMax))];
          const nextX = f[0](x, y);
          const nextY = f[1](x, y);
          x = nextX;
          y = nextY;
        }

        const px = W * (x - xRange[0]) / xSpan;
        const py = H * (1 - (y - yRange[0]) / ySpan);
        ctx.fillRect(px, py, 1, 1);
      }

      numDraws += drawsPerFrame;
    };

    const step = () => {
      requestAnimationFrame(step);
      render();
    };

    step();
  });
})();
