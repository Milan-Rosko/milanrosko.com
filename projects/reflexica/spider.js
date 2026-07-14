"use strict";

(function () {
  var container,
    canvas,
    context,
    w,
    h,
    circleCenter,
    circleRadius,
    margin = 40,
    lines = [],
    animationId = null,
    resizeObserver,
    intersectionObserver,
    isInView = false,
    lineColor = "#a8b7ac",
    maxLines = 1500;

  var Vec = function (x, y) {
    this.x = x;
    this.y = y;
  };

  var Line = function (x1, y1, x2, y2) {
    this.a = new Vec(x1, y1);
    this.b = new Vec(x2, y2);
    this.center = new Vec((x1 + x2) / 2, (y1 + y2) / 2);
    this.dx = x2 - x1;
    this.dy = y2 - y1;
  };

  Line.prototype.display = function () {
    context.strokeStyle = lineColor;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(this.a.x, this.a.y);
    context.lineTo(this.b.x, this.b.y);
    context.stroke();
  };

  function sqDist(v1, v2) {
    var dx = v2.x - v1.x;
    var dy = v2.y - v1.y;
    return dx * dx + dy * dy;
  }

  function segIntersection(l1, l2) {
    var denominator = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(denominator) < 0.000001) return null;

    var cx = l2.a.x - l1.a.x;
    var cy = l2.a.y - l1.a.y;
    var t = (cx * l2.dy - cy * l2.dx) / denominator;
    var u = (cx * l1.dy - cy * l1.dx) / denominator;

    if (t < 0 || t > 1 || u < 0 || u > 1) return null;

    return new Vec(l1.a.x + t * l1.dx, l1.a.y + t * l1.dy);
  }

  function getCircleIntersections(line) {
    var fx = line.a.x - circleCenter.x;
    var fy = line.a.y - circleCenter.y;
    var a = line.dx * line.dx + line.dy * line.dy;
    var b = 2 * (fx * line.dx + fy * line.dy);
    var c = fx * fx + fy * fy - circleRadius * circleRadius;
    var discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return [];

    var root = Math.sqrt(discriminant);
    var first = (-b - root) / (2 * a);
    var second = (-b + root) / (2 * a);
    var intersections = [];

    if (first >= 0 && first <= 1) {
      intersections.push(
        new Vec(line.a.x + first * line.dx, line.a.y + first * line.dy)
      );
    }

    if (second >= 0 && second <= 1) {
      intersections.push(
        new Vec(line.a.x + second * line.dx, line.a.y + second * line.dy)
      );
    }

    return intersections;
  }

  function getIntersections(line) {
    var intersections = getCircleIntersections(line);

    for (var i = 0; i < lines.length; i++) {
      var point = segIntersection(line, lines[i]);
      if (point !== null) intersections.push(point);
    }

    return intersections;
  }

  function getNearestIntersections(line, intersections) {
    var negative = null;
    var positive = null;
    var negativeDistance = Infinity;
    var positiveDistance = Infinity;

    for (var i = 0; i < intersections.length; i++) {
      var point = intersections[i];
      var projection =
        (point.x - line.center.x) * line.dx +
        (point.y - line.center.y) * line.dy;
      var distance = sqDist(point, line.center);

      if (projection < 0 && distance < negativeDistance) {
        negative = point;
        negativeDistance = distance;
      } else if (projection >= 0 && distance < positiveDistance) {
        positive = point;
        positiveDistance = distance;
      }
    }

    return negative && positive ? [negative, positive] : null;
  }

  function reduceLine(line, intersections) {
    line.a = intersections[0];
    line.b = intersections[1];
    line.center.x = (line.a.x + line.b.x) / 2;
    line.center.y = (line.a.y + line.b.y) / 2;
    line.dx = line.b.x - line.a.x;
    line.dy = line.b.y - line.a.y;
  }

  function applyRule(line) {
    var intersections = getNearestIntersections(
      line,
      getIntersections(line)
    );

    if (!intersections) return false;

    reduceLine(line, intersections);
    return true;
  }

  function createLine() {
    var positionAngle = Math.random() * Math.PI * 2;
    var positionRadius = Math.sqrt(Math.random()) * circleRadius * 0.98;
    var pos = new Vec(
      circleCenter.x + Math.cos(positionAngle) * positionRadius,
      circleCenter.y + Math.sin(positionAngle) * positionRadius
    );
    var angle = Math.random() * Math.PI;
    var radius = Math.sqrt(w * w + h * h);

    return new Line(
      pos.x + Math.cos(angle) * radius,
      pos.y + Math.sin(angle) * radius,
      pos.x + Math.cos(angle + Math.PI) * radius,
      pos.y + Math.sin(angle + Math.PI) * radius
    );
  }

  function drawBoundary() {
    var outerRadius = circleRadius + 6;

    context.strokeStyle = lineColor;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(
      circleCenter.x,
      circleCenter.y,
      circleRadius,
      0,
      Math.PI * 2
    );
    context.moveTo(circleCenter.x + outerRadius, circleCenter.y);
    context.arc(
      circleCenter.x,
      circleCenter.y,
      outerRadius,
      0,
      Math.PI * 2
    );
    context.stroke();
  }

  function addNewLine() {
    var line = createLine();

    if (applyRule(line)) {
      line.display();
      lines.push(line);
    }
  }

  function resetWeb() {
    context.clearRect(0, 0, w, h);
    lines = [];
    drawBoundary();
  }

  function shouldAnimate() {
    return isInView && !document.hidden;
  }

  function updateAnimationState() {
    if (shouldAnimate()) {
      if (animationId === null) {
        animationId = window.requestAnimationFrame(draw);
      }
    } else if (animationId !== null) {
      window.cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function draw() {
    animationId = null;
    if (!shouldAnimate()) return;

    if (lines.length >= maxLines) resetWeb();
    addNewLine();
    animationId = window.requestAnimationFrame(draw);
  }

  function resize() {
    var bounds = container.getBoundingClientRect();
    var nextWidth = Math.round(bounds.width);
    var nextHeight = Math.round(bounds.height);

    if (nextWidth < 1 || nextHeight < 1) return;
    if (nextWidth === w && nextHeight === h) return;

    w = nextWidth;
    h = nextHeight;
    margin = Math.min(40, w / 8, h / 8);
    circleCenter = new Vec(w / 2, h / 2);
    circleRadius = Math.min(w, h) / 2 - margin;

    var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * pixelRatio);
    canvas.height = Math.round(h * pixelRatio);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.lineCap = "round";

    resetWeb();
    updateAnimationState();
  }

  function init() {
    container = document.getElementById("spider-web-container");
    if (!container) return;

    canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "A generative spider web growing strand by strand across the open end of a hollow pipe"
    );
    context = canvas.getContext("2d");
    if (!context) return;

    lineColor =
      window.getComputedStyle(container).getPropertyValue("--color-main").trim() ||
      lineColor;

    container.appendChild(canvas);

    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", resize);
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

  window.addEventListener("load", init);
  document.addEventListener("visibilitychange", updateAnimationState);
})();
