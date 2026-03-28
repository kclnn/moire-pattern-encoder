export interface CustomPattern {
  /** Source image, N² pixels (0 = black, 255 = white), column-major: index = i*N + j */
  image:       Uint8Array;
  /** Per-cell x-phase offset for front grid vertical lines (cm), N² values */
  frontPhaseX: Float32Array;
  /** Per-cell y-phase offset for back grid horizontal lines in back space (cm), N² values */
  backPhaseY:  Float32Array;
}

export interface MoireParams {
  /** Number of cells in each direction for both grids (N). Period = gridSize / N */
  cellCount: number;
  /** Fraction of the period that is opaque (line). 0 < thicknessRatio < 1 */
  thicknessRatio: number;
  /** Physical size of each grid in cm (square) */
  gridSize: number;
  /** Gap between front grid (z=0) and back grid (z=-depthGap) in cm */
  depthGap: number;
  /** Viewer distance from the front grid plane (z=0), in cm */
  viewerDist: number;
  /** Viewer X offset from grid center, in cm */
  viewerX: number;
  /** Viewer Y offset from grid center, in cm */
  viewerY: number;
  /** Canvas background color */
  bgColor: string;
  /** Grid line color */
  lineColor: string;
  /** Optional custom pattern overriding the uniform moiré */
  customPattern?: CustomPattern;
}

export const DEFAULT_PARAMS: MoireParams = {
  cellCount: 500,
  thicknessRatio: 0.25,
  gridSize: 500,
  depthGap: 10,
  viewerDist: 1000,
  viewerX: 0,
  viewerY: 0,
  bgColor: '#000000',
  lineColor: '#ffffff',
};
