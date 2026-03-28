import { MoireParams } from '../models/moire-params';

/**
 * Draws a single grid in the current canvas transform space (cm units, origin at center).
 * Lines are drawn as filled rectangles for consistent sub-pixel rendering.
 */
function drawGrid(ctx: CanvasRenderingContext2D, params: MoireParams): void {
  const { cellCount, thicknessRatio, gridSize, lineColor } = params;
  const period = gridSize / cellCount;
  const lineWidth = thicknessRatio * period;
  const half = gridSize / 2;

  ctx.fillStyle = lineColor;

  // Vertical lines
  for (let i = 0; i <= cellCount; i++) {
    const x = -half + i * period - lineWidth / 2;
    ctx.fillRect(x, -half, lineWidth, gridSize);
  }

  // Horizontal lines
  for (let j = 0; j <= cellCount; j++) {
    const y = -half + j * period - lineWidth / 2;
    ctx.fillRect(-half, y, gridSize, lineWidth);
  }
}

/**
 * Renders the moiré scene onto the canvas.
 *
 * Projection math:
 *   Viewer at (Vx, Vy, D). Back grid at z = -d.
 *   A back-grid point (x, y, -d) projects to view plane z=0 as:
 *     px = Vx + (x - Vx) * D/(D+d)  =  f*x + Vx*(1-f)
 *     py = Vy + (y - Vy) * D/(D+d)  =  f*y + Vy*(1-f)
 *   where f = D/(D+d).
 *   This is a uniform scale by f centered at (Vx, Vy).
 */
export function render(canvas: HTMLCanvasElement, params: MoireParams): void {
  const { gridSize, viewerX, viewerY, viewerDist, depthGap, bgColor } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const scale = Math.min(W, H) / gridSize;

  // Clear background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Base transform: 1 unit = 1 cm, origin at canvas center
  ctx.setTransform(scale, 0, 0, scale, W / 2, H / 2);

  // Perspective scale factor for back grid
  const D = viewerDist;
  const d = Math.max(0.001, depthGap);
  const f = D / (D + d);
  const tx = viewerX * (1 - f);
  const ty = viewerY * (1 - f);

  // Draw back grid with perspective transform
  ctx.save();
  ctx.transform(f, 0, 0, f, tx, ty);
  drawGrid(ctx, params);
  ctx.restore();

  // Draw front grid (no transform — identity in cm space)
  drawGrid(ctx, params);
}
