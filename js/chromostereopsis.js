"use strict";

var frag = `
  precision highp float;

  uniform float time;
  uniform vec2 resolution;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float hardWindow(float x, float inA, float inB, float outA, float outB) {
    float grow = smoothstep(inA, inB, x);
    float shrink = 1.0 - smoothstep(outA, outB, x);
    return grow * shrink;
  }

  float particle(vec2 uv, float radius, float salt) {
    vec2 cell = floor(uv);
    vec2 local = fract(uv);
    float keep = step(0.56, hash21(cell + salt));
    vec2 center = vec2(
      0.22 + 0.56 * hash21(cell + salt + 17.7),
      0.22 + 0.56 * hash21(cell + salt + 83.1)
    );

    return keep * (1.0 - smoothstep(radius, radius + 0.035, length(local - center)));
  }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
    float r = length(p);

    float life = r / 0.45;
    // net particle field diameter

    float angle = (atan(p.y, p.x) + 3.14159265) / 6.2831853;

    float ringFlow = r * 32.0 - time * 2.0;
    // noise and speed

    float scatterSeed = hash21(vec2(angle * 164.0, floor(ringFlow * 1.58)) + 719.0);
    float ringScatter = (scatterSeed - 1.5) * 0.34;

    float ring = 1.5 - smoothstep(0.3, 0.5, abs(fract(ringFlow + ringScatter) - 0.0));

    float scatter = (scatterSeed / 0.5) * 0.28;
    // diamond scatter effect

    vec2 ringSpace = vec2(angle * 100.0, ringFlow * 1.0 + scatter);
    // ring slices

    vec2 redCell = floor(ringSpace);
    vec2 blueSpace = ringSpace + vec2(10.0, 0.0);
    vec2 blueCell = floor(blueSpace);

    float blueOffset = (hash21(redCell + 300.0) - 0.5) * 0.40;
    float redOffset = (hash21(blueCell + 500.0) - 0.5) * 0.10;

    float blueScale = hardWindow(life + blueOffset, 0.05, 0.42, 0.35, 0.55);
    float redScale = hardWindow(life + redOffset, 0.50, 0.60, 0.56, 1.1);
    // regions

    float blueMask = ring * particle(ringSpace, 0.585 * blueScale, 12.0) * step(0.02, blueScale);
    float redMask = ring * particle(blueSpace, 0.285 * redScale, 211.0) * step(0.02, redScale);
    // particles

    float red = redMask;
    float blue = blueMask;

    blue *= 1.5 - step(0.001, red);

    vec3 color = vec3(red, 0.0, blue);
    float disc = 0.9 - smoothstep(0.50, 0.501, r);
    color *= disc;

    gl_FragColor = vec4(color, disc);
  }
`;

var container,
  scene,
  camera,
  renderer,
  animationId,
  uniforms,
  geometry,
  material,
  mesh,
  resizeObserver,
  intersectionObserver,
  isInView = false,
  startTime = Date.now();

function init() {
  container = document.getElementById("container");
  if (!container || !window.THREE) return;

  scene = new THREE.Scene();

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;

  geometry = new THREE.PlaneGeometry(2, 2);
  uniforms = {
    time: { type: "f", value: 1.0 },
    resolution: { type: "v2", value: new THREE.Vector2() }
  };

  material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    fragmentShader: frag,
    transparent: true
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
  }

  if (window.IntersectionObserver) {
    intersectionObserver = new IntersectionObserver(function (entries) {
      isInView = entries[entries.length - 1].isIntersecting;
      updateAnimationState();
    });
    intersectionObserver.observe(container);
  } else {
    isInView = true;
  }

  resize();
  updateAnimationState();
}

function animate() {
  animationId = null;
  if (!isInView || document.hidden) return;

  material.uniforms.time.value = (Date.now() - startTime) / 1000.0;
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

function updateAnimationState() {
  if (isInView && !document.hidden) {
    if (animationId === null || animationId === undefined) {
      animationId = requestAnimationFrame(animate);
    }
  } else if (animationId !== null && animationId !== undefined) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function resize() {
  if (!container || !renderer || !camera || !material) return;

  var bounds = container.getBoundingClientRect();
  var width = Math.round(bounds.width);
  var height = Math.round(bounds.height);

  if (width < 1 || height < 1) return;

  renderer.setSize(width, height, false);
  renderer.getDrawingBufferSize(material.uniforms.resolution.value);
}

window.addEventListener("load", init);
window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", updateAnimationState);
