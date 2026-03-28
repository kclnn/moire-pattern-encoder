import { MoireParams } from '../models/moire-params';

export interface PatternOffsets {
  frontPhaseX: Float32Array; // N² values, index = i*N + j (i = column, j = row)
}

/**
 * Computes per-cell phase offsets for both grids so that the resulting moiré
 * under the given perspective parameters matches the target binary image.
 *
 * Encoding rule (symmetric — both axes participate for every cell):
 *   Bright cell: φ_x = −Δx,       φ_y = −Δy        (align both axes → max transmission)
 *   Dark cell:   φ_x = −Δx + P/2, φ_y = −Δy + P/2  (misalign both axes → min transmission)
 *
 * where Δx[i] = (1−f)·(cx − Vx_c) is the baseline phase gap between the two grids
 * at column i, and Δy[j] is the same for row j.
 *
 * @param image  N² uint8 values (0 = black, 255 = white), column-major: index = i*N + j
 * @param params Current MoireParams (cellCount, gridSize, viewerDist, depthGap, viewerX, viewerY)
 */
export function encodePattern(image: Uint8Array, params: MoireParams): PatternOffsets {
  const N  = params.cellCount;
  const P  = params.gridSize / N;
  const d  = Math.max(0.001, params.depthGap);
  const f  = params.viewerDist / (params.viewerDist + d);
  // Viewer position in corner-origin coords (grid spans [0, gridSize])
  const Vx_c = params.viewerX + params.gridSize / 2;

  const frontPhaseX = new Float32Array(N * N);
  const halfPeriod  = P / 2;

  for (let i = 0; i < N; i++) {
    const cx     = (i + 0.5) * P;
    const deltaX = (1 - f) * (cx - Vx_c);

    for (let j = 0; j < N; j++) {
      const idx   = i * N + j;
      const bright = image[idx] > 127;

      frontPhaseX[idx] = -deltaX + (bright ? 0 : halfPeriod);
    }
  }

  return { frontPhaseX };
}

/**
 * Encodes pattern 2 into per-cell Y-phase offsets for the back grid's horizontal lines.
 * The back grid Y offsets are computed so that pattern 2 is visible when the viewer is
 * at the position stored in params (viewerX, viewerY) at the time this function is called.
 *
 * Encoding rule per back cell (bi, bj):
 *   deltaY = (1−f) · (by_c − Vy_c)        natural Y-phase gap at this back cell
 *   backPhaseY = deltaY + (bright2 ? 0 : P/2)
 *
 * Pattern 1 (frontPhaseX, X offsets) and pattern 2 (backPhaseY, Y offsets) are orthogonal,
 * so they can be applied independently without interfering with each other.
 */
export function encodePatternToBack(image: Uint8Array, params: MoireParams): { backPhaseY: Float32Array } {
  const N        = params.cellCount;
  const P        = params.gridSize / N;
  const d        = Math.max(0.001, params.depthGap);
  const f        = params.viewerDist / (params.viewerDist + d);
  const halfGrid = params.gridSize / 2;
  const halfP    = P / 2;
  const Vy_c     = params.viewerY + halfGrid;

  const backPhaseY = new Float32Array(N * N);

  for (let bj = 0; bj < N; bj++) {
    const by_c   = (bj + 0.5) * P;
    const deltaY = (1 - f) * (by_c - Vy_c);
    // Front row that maps to this back row from the current viewer Y position
    const cy_mapped = (by_c - halfGrid) * f + halfGrid + params.viewerY * (1 - f);
    const j = Math.min(Math.max(Math.floor(cy_mapped / P), 0), N - 1);

    for (let bi = 0; bi < N; bi++) {
      const bx_c = (bi + 0.5) * P;
      // Front column that maps to this back column from the current viewer X position
      const cx_mapped = (bx_c - halfGrid) * f + halfGrid + params.viewerX * (1 - f);
      const i = Math.min(Math.max(Math.floor(cx_mapped / P), 0), N - 1);

      const bright2 = image[i * N + j] > 127;
      backPhaseY[bi * N + bj] = deltaY + (bright2 ? 0 : halfP);
    }
  }

  return { backPhaseY };
}
