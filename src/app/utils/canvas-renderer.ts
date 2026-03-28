import { MoireParams } from '../models/moire-params';

// ---------------------------------------------------------------------------
// Uniform moiré renderer (no custom pattern)
// ---------------------------------------------------------------------------

function drawGrid(ctx: CanvasRenderingContext2D, params: MoireParams): void {
  const { cellCount, thicknessRatio, gridSize, lineColor } = params;
  const period    = gridSize / cellCount;
  const lineWidth = thicknessRatio * period;
  const half      = gridSize / 2;

  ctx.fillStyle = lineColor;

  for (let i = 0; i <= cellCount; i++) {
    const x = -half + i * period - lineWidth / 2;
    ctx.fillRect(x, -half, lineWidth, gridSize);
  }
  for (let j = 0; j <= cellCount; j++) {
    const y = -half + j * period - lineWidth / 2;
    ctx.fillRect(-half, y, gridSize, lineWidth);
  }
}

function renderUniform(canvas: HTMLCanvasElement, params: MoireParams): void {
  const { gridSize, viewerX, viewerY, viewerDist, depthGap, bgColor } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W     = canvas.width;
  const H     = canvas.height;
  const scale = Math.min(W, H) / gridSize;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  ctx.setTransform(scale, 0, 0, scale, W / 2, H / 2);

  const D  = viewerDist;
  const d  = Math.max(0.001, depthGap);
  const f  = D / (D + d);
  const tx = viewerX * (1 - f);
  const ty = viewerY * (1 - f);

  ctx.save();
  ctx.transform(f, 0, 0, f, tx, ty);
  drawGrid(ctx, params);
  ctx.restore();

  drawGrid(ctx, params);
}

// ---------------------------------------------------------------------------
// Custom-pattern renderer (per-cell phase offsets, pixel-by-pixel ImageData)
// ---------------------------------------------------------------------------

function renderWithPattern(canvas: HTMLCanvasElement, params: MoireParams): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !params.customPattern) return;

  const { gridSize, viewerX, viewerY, viewerDist, depthGap,
          cellCount, thicknessRatio, bgColor, lineColor, customPattern } = params;
  const { frontPhaseX, backPhaseY } = customPattern;

  const W     = canvas.width;
  const H     = canvas.height;
  const scale = Math.min(W, H) / gridSize;

  const N  = cellCount;
  const P  = gridSize / N;
  const T  = thicknessRatio * P;
  const Th = T / 2;                    // opaque half-width on each side of a line
  const d  = Math.max(0.001, depthGap);
  const f  = viewerDist / (viewerDist + d);
  const tx = viewerX * (1 - f);        // front-space translation of back projection
  const ty = viewerY * (1 - f);

  // Parse bgColor and lineColor into R,G,B components
  const bg   = hexToRgb(bgColor);
  const line = hexToRgb(lineColor);

  const imageData = ctx.createImageData(W, H);
  const data      = imageData.data;

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      // Front-grid cm coordinates, corner-origin [0, gridSize]
      const cx = (px - W / 2) / scale + gridSize / 2;
      const cy = (py - H / 2) / scale + gridSize / 2;

      const base = (py * W + px) * 4;

      if (cx < 0 || cx >= gridSize || cy < 0 || cy >= gridSize) {
        data[base]     = bg.r;
        data[base + 1] = bg.g;
        data[base + 2] = bg.b;
        data[base + 3] = 255;
        continue;
      }

      // Front-grid cell indices
      const i  = Math.min(Math.floor(cx / P), N - 1);
      const j  = Math.min(Math.floor(cy / P), N - 1);
      const fi = i * N + j;

      // Front x-opacity (per-cell phase shift)
      const ux     = posMod(cx - frontPhaseX[fi], P);
      const fOpaX  = ux < Th || ux > P - Th;

      // Front y-opacity (no phase shift for front horizontal lines)
      const uy    = posMod(cy, P);
      const fOpaY = uy < Th || uy > P - Th;

      const frontOpaque = fOpaX || fOpaY;

      let bright = false;
      if (!frontOpaque) {
        // Back-grid cm coordinates (corner-origin)
        const bx = (cx - gridSize / 2 - tx) / f + gridSize / 2;
        const by = (cy - gridSize / 2 - ty) / f + gridSize / 2;

        const bi  = Math.min(Math.max(Math.floor(bx / P), 0), N - 1);
        const bj  = Math.min(Math.max(Math.floor(by / P), 0), N - 1);
        const bfi = bi * N + bj;

        // Back x-opacity (no phase shift for back vertical lines)
        const ubx    = posMod(bx, P);
        const bOpaX  = ubx < Th || ubx > P - Th;

        // Back y-opacity (per-cell phase shift)
        const uby   = posMod(by - backPhaseY[bfi], P);
        const bOpaY = uby < Th || uby > P - Th;

        bright = !(bOpaX || bOpaY);
      }

      const c = bright ? line : bg;
      data[base]     = c.r;
      data[base + 1] = c.g;
      data[base + 2] = c.b;
      data[base + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Always-positive modulo */
function posMod(x: number, m: number): number {
  return ((x % m) + m) % m;
}

interface Rgb { r: number; g: number; b: number; }

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function render(canvas: HTMLCanvasElement, params: MoireParams): void {
  if (params.customPattern) {
    renderWithPattern(canvas, params);
  } else {
    renderUniform(canvas, params);
  }
}
