import { MoireParams } from '../models/moire-params';

export interface PatternOffsets {
  frontPhaseX: Float32Array; // N² values, index = i*N + j (i = column, j = row)
  backPhaseY:  Float32Array; // N² values, index = i*N + j
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
  const Vy_c = params.viewerY + params.gridSize / 2;

  const frontPhaseX = new Float32Array(N * N);
  const backPhaseY  = new Float32Array(N * N);
  const halfPeriod  = P / 2;

  for (let i = 0; i < N; i++) {
    const cx     = (i + 0.5) * P;
    const deltaX = (1 - f) * (cx - Vx_c);

    for (let j = 0; j < N; j++) {
      const cy     = (j + 0.5) * P;
      const deltaY = (1 - f) * (cy - Vy_c);
      const idx    = i * N + j;
      const bright = image[idx] > 127;

      frontPhaseX[idx] = -deltaX + (bright ? 0 : halfPeriod);
      backPhaseY[idx]  = -deltaY + (bright ? 0 : halfPeriod);
    }
  }

  return { frontPhaseX, backPhaseY };
}
