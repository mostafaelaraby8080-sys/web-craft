(() => {
  "use strict";

  const WIDTH = 1280;
  const HEIGHT = 720;
  const stage = document.getElementById("quadtreeStage");
  const canvas2d = document.getElementById("quadtreeCanvas2d");
  const canvas3d = document.getElementById("quadtreeCanvas3d");
  const replay = document.getElementById("quadtreeReplay");
  if (!stage || !canvas2d || !canvas3d || !replay) return;

  const ctx2d = canvas2d.getContext("2d");
  const ctx3d = canvas3d.getContext("2d");
  if (!ctx2d || !ctx3d) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const ease = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const normalize = (vector) => {
    const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return vector.map((value) => value / length);
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

  let seed = 11;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const mask = document.createElement("canvas");
  mask.width = WIDTH;
  mask.height = HEIGHT;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  maskContext.clearRect(0, 0, WIDTH, HEIGHT);
  maskContext.strokeStyle = "#fff";
  maskContext.lineWidth = 26;
  maskContext.font = "900 430px Arial, sans-serif";
  maskContext.textAlign = "center";
  maskContext.textBaseline = "middle";
  maskContext.strokeText("AV1", WIDTH / 2, HEIGHT / 2);
  const maskData = maskContext.getImageData(0, 0, WIDTH, HEIGHT).data;
  const maskAt = (x, y) => {
    const px = clamp(Math.floor(x), 0, WIDTH - 1);
    const py = clamp(Math.floor(y), 0, HEIGHT - 1);
    return maskData[(py * WIDTH + px) * 4 + 3] / 255;
  };
  const densityAt = (x, y, size) => {
    const offset = size * 0.34;
    return Math.min(
      1,
      (maskAt(x, y) +
        maskAt(x - offset, y) +
        maskAt(x + offset, y) +
        maskAt(x, y - offset) +
        maskAt(x, y + offset)) /
        2.5,
    );
  };

  const cells = [];
  function divide(x, y, size) {
    const density = densityAt(x + size / 2, y + size / 2, size);
    let splitChance = 0.025 + density * 0.72;
    if (size >= 160) splitChance += 0.42;
    else if (size >= 80) splitChance += 0.22;
    else if (size >= 40) splitChance += 0.08;

    if (size > 10 && random() < Math.min(0.92, splitChance)) {
      const half = size / 2;
      divide(x, y, half);
      divide(x + half, y, half);
      divide(x, y + half, half);
      divide(x + half, y + half, half);
      return;
    }

    cells.push({
      x,
      y,
      size,
      cx: x + size / 2 - WIDTH / 2,
      cy: HEIGHT / 2 - (y + size / 2),
      density,
      height: 12 + size * (0.12 + density * 0.48) + random() * 18,
      colorShift: random(),
      accent: density > 0.2 && random() < 0.045,
    });
  }
  for (let y = 0; y < HEIGHT; y += 160) {
    for (let x = 0; x < WIDTH; x += 160) divide(x, y, 160);
  }

  const layer = document.createElement("canvas");
  layer.width = WIDTH;
  layer.height = HEIGHT;
  const layerContext = layer.getContext("2d");
  const background = layerContext.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#091222");
  background.addColorStop(0.52, "#0c1021");
  background.addColorStop(1, "#111027");
  layerContext.fillStyle = background;
  layerContext.fillRect(0, 0, WIDTH, HEIGHT);
  for (const cell of cells) {
    const density = cell.density;
    layerContext.fillStyle =
      density > 0.16
        ? `rgba(39, 164, 255, ${0.08 + density * 0.24})`
        : "rgba(108, 133, 180, 0.035)";
    layerContext.fillRect(cell.x, cell.y, cell.size, cell.size);
    layerContext.strokeStyle =
      density > 0.16
        ? `rgba(78, 218, 255, ${0.25 + density * 0.55})`
        : "rgba(136, 163, 205, 0.20)";
    layerContext.lineWidth = density > 0.16 ? 1.15 : 0.7;
    layerContext.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.size - 1, cell.size - 1);
    if (cell.accent) {
      layerContext.strokeStyle = "rgba(255, 173, 75, 0.78)";
      layerContext.lineWidth = 1.4;
      const inset = cell.size * 0.24;
      layerContext.strokeRect(
        cell.x + inset,
        cell.y + inset,
        cell.size - inset * 2,
        cell.size - inset * 2,
      );
    }
  }

  function draw2d(progress, scanPosition) {
    ctx2d.clearRect(0, 0, WIDTH, HEIGHT);
    const revealWidth = WIDTH * ease(progress);
    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.rect(0, 0, revealWidth, HEIGHT);
    ctx2d.clip();
    ctx2d.drawImage(layer, 0, 0);
    if (progress < 1) {
      const scanX = WIDTH * scanPosition;
      const glow = ctx2d.createLinearGradient(scanX - 34, 0, scanX + 34, 0);
      glow.addColorStop(0, "rgba(42, 225, 255, 0)");
      glow.addColorStop(0.5, "rgba(49, 224, 255, 0.9)");
      glow.addColorStop(1, "rgba(166, 88, 255, 0)");
      ctx2d.fillStyle = glow;
      ctx2d.fillRect(scanX - 34, 0, 68, HEIGHT);
      ctx2d.shadowColor = "#28dcff";
      ctx2d.shadowBlur = 16;
      ctx2d.fillStyle = "rgba(148, 244, 255, 0.9)";
      ctx2d.fillRect(scanX - 1, 0, 2, HEIGHT);
    }
    ctx2d.restore();
  }

  const focalLength = HEIGHT / 2 / Math.tan((25 * Math.PI) / 180);
  function cameraAt(progress) {
    const t = ease(progress);
    const position = [
      lerp(0, -320, t),
      lerp(-180, -430, t),
      lerp(1120, 840, t),
    ];
    const target = [lerp(0, 30, t), lerp(0, 10, t), 0];
    const forward = normalize([
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ]);
    const right = normalize(cross(forward, [0, 0, 1]));
    const up = normalize(cross(right, forward));

    return {
      position,
      project(x, y, z) {
        const vector = [x - position[0], y - position[1], z - position[2]];
        const depth = dot(vector, forward);
        if (depth <= 8) return null;
        const scale = focalLength / depth;
        return [
          WIDTH / 2 + dot(vector, right) * scale,
          HEIGHT / 2 - dot(vector, up) * scale,
          depth,
        ];
      },
    };
  }

  const color = (red, green, blue) =>
    `rgb(${Math.round(clamp(red, 0, 255))}, ${Math.round(clamp(green, 0, 255))}, ${Math.round(clamp(blue, 0, 255))})`;

  function polygon(points, fill, stroke) {
    if (points.some((point) => !point)) return;
    ctx3d.beginPath();
    ctx3d.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx3d.lineTo(points[i][0], points[i][1]);
    }
    ctx3d.closePath();
    ctx3d.fillStyle = fill;
    ctx3d.fill();
    if (stroke) {
      ctx3d.strokeStyle = stroke;
      ctx3d.lineWidth = 0.8;
      ctx3d.stroke();
    }
  }

  function draw3d(time, cameraProgress) {
    const camera = cameraAt(cameraProgress);
    const glowX = lerp(-WIDTH / 2 - 180, WIDTH / 2 + 220, clamp((time - 7) / 8));
    const back = ctx3d.createLinearGradient(0, 0, WIDTH, HEIGHT);
    back.addColorStop(0, "#080f1e");
    back.addColorStop(0.52, "#0b1021");
    back.addColorStop(1, "#17102a");
    ctx3d.fillStyle = back;
    ctx3d.fillRect(0, 0, WIDTH, HEIGHT);

    ctx3d.save();
    ctx3d.globalAlpha = 0.22;
    ctx3d.strokeStyle = "#5071a2";
    ctx3d.lineWidth = 1;
    for (let x = -640; x <= 640; x += 80) {
      const a = camera.project(x, -360, 0);
      const b = camera.project(x, 360, 0);
      if (a && b) {
        ctx3d.beginPath();
        ctx3d.moveTo(a[0], a[1]);
        ctx3d.lineTo(b[0], b[1]);
        ctx3d.stroke();
      }
    }
    for (let y = -360; y <= 360; y += 80) {
      const a = camera.project(-640, y, 0);
      const b = camera.project(640, y, 0);
      if (a && b) {
        ctx3d.beginPath();
        ctx3d.moveTo(a[0], a[1]);
        ctx3d.lineTo(b[0], b[1]);
        ctx3d.stroke();
      }
    }
    ctx3d.restore();

    const ordered = cells
      .map((cell) => {
        const center = camera.project(cell.cx, cell.cy, cell.height / 2);
        return { cell, depth: center ? center[2] : -1 };
      })
      .filter((item) => item.depth > 0)
      .sort((a, b) => b.depth - a.depth);

    for (const { cell } of ordered) {
      const half = cell.size * 0.46;
      const x0 = cell.cx - half;
      const x1 = cell.cx + half;
      const y0 = cell.cy - half;
      const y1 = cell.cy + half;
      const z = cell.height;
      const base = [
        camera.project(x0, y0, 0),
        camera.project(x1, y0, 0),
        camera.project(x1, y1, 0),
        camera.project(x0, y1, 0),
      ];
      const top = [
        camera.project(x0, y0, z),
        camera.project(x1, y0, z),
        camera.project(x1, y1, z),
        camera.project(x0, y1, z),
      ];
      const light = Math.exp(-((glowX - cell.cx) ** 2) / 36000);
      const hue = 190 + cell.colorShift * 80;
      const strength = 0.28 + cell.density * 0.62 + light * 0.38;
      const topColor = color(26 + (hue - 180) * 0.38 + light * 100, 85 + strength * 115, 160 + light * 90);
      const sideColor = color(19 + light * 55, 34 + strength * 48, 76 + strength * 72);
      const otherSideColor = color(27 + light * 70, 48 + strength * 55, 101 + strength * 83);
      const edge = cell.density > 0.2 ? "rgba(122, 224, 255, 0.45)" : null;

      if (camera.position[0] < cell.cx) {
        polygon([base[0], base[3], top[3], top[0]], sideColor, edge);
      } else {
        polygon([base[1], base[2], top[2], top[1]], sideColor, edge);
      }
      if (camera.position[1] < cell.cy) {
        polygon([base[0], base[1], top[1], top[0]], otherSideColor, edge);
      } else {
        polygon([base[3], base[2], top[2], top[3]], otherSideColor, edge);
      }
      polygon(top, topColor, edge);

      if (cell.accent) {
        const inset = half * 0.52;
        const marker = [
          camera.project(cell.cx - inset, cell.cy - inset, z + 1),
          camera.project(cell.cx + inset, cell.cy - inset, z + 1),
          camera.project(cell.cx + inset, cell.cy + inset, z + 1),
          camera.project(cell.cx - inset, cell.cy + inset, z + 1),
        ];
        polygon(marker, "#ffad4b");
      }
    }
  }

  let startedAt = 0;
  let frameId = 0;
  let visible = false;
  function drawStatic() {
    draw2d(1, 1);
    draw3d(15, 1);
    canvas3d.style.opacity = "1";
  }
  function render(now) {
    frameId = 0;
    if (!visible || document.hidden || reducedMotion.matches) return;

    if (!startedAt) startedAt = now;
    const elapsed = ((now - startedAt) / 1000) % 18;
    const reveal = clamp(elapsed / 5);
    const transition = ease((elapsed - 5.2) / 1.8);
    const cameraProgress = clamp((elapsed - 7) / 8);
    draw2d(reveal, reveal);
    draw3d(elapsed, cameraProgress);
    canvas3d.style.opacity = String(transition);
    frameId = requestAnimationFrame(render);
  }
  function stop() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  }
  function play() {
    stop();
    startedAt = 0;
    if (reducedMotion.matches) {
      drawStatic();
      return;
    }
    canvas3d.style.opacity = "0";
    if (visible && !document.hidden) frameId = requestAnimationFrame(render);
  }

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            if (visible) play();
            else stop();
          },
          { threshold: 0.08 },
        )
      : null;
  if (observer) observer.observe(stage);
  else visible = true;

  replay.addEventListener("click", (event) => {
    event.stopPropagation();
    play();
  });
  stage.addEventListener("click", play);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (visible) play();
  });
  reducedMotion.addEventListener?.("change", () => {
    if (reducedMotion.matches) {
      stop();
      drawStatic();
    } else if (visible && !document.hidden) {
      play();
    }
  });

  draw2d(1, 1);
  draw3d(15, 1);
  canvas3d.style.opacity = reducedMotion.matches ? "1" : "0";
})();
