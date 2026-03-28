# Custom Pattern Encoding — Implementation Plan

## Overview

Instead of the natural periodic moiré, the user draws an N×N pixel black-and-white image.
The app computes per-cell phase offsets for both grids so that — under the current perspective
parameters — the resulting moiré resembles the drawn image.

---

## 1. Mathematical Foundation

### 1.1 Phase control

For a standard uniform moiré, both grids have the same period P and the slight difference in
projected period (due to perspective scale f = D/(D+d)) creates a beat pattern.

At cell (i, j), define the **baseline phase gap** between the two grids:

```
P = gridSize / cellCount
f = D / (D + d)

// Cell center in front-plane cm space (corner-origin: grid spans [0, gridSize])
cx = (i + 0.5) * P
cy = (j + 0.5) * P

// Viewer position in the same corner-origin system
Vx_c = viewerX + gridSize/2
Vy_c = viewerY + gridSize/2

// Back-grid cell center as projected onto front plane
cx_back_proj = f * cx + Vx_c * (1 - f)
cy_back_proj = f * cy + Vy_c * (1 - f)

// Baseline phase gaps (how far front gap is from back gap)
Δx[i] = cx - cx_back_proj = (1 - f) * (cx - Vx_c)
Δy[j] = cy - cy_back_proj = (1 - f) * (cy - Vy_c)
```

These grow linearly with cell index, which is exactly what creates the natural moiré fringes.

### 1.2 Per-cell phase offsets

By individually shifting:
- The **front grid's vertical lines** by φ_x[i][j] in x (per-cell x-phase)
- The **back grid's horizontal lines** by φ_y[i][j] in y in back space (per-cell y-phase)

Both offsets participate in encoding every cell:

| Target | φ_x[i][j] | φ_y[i][j] |
|---|---|---|
| Bright | `−Δx[i]` (align x-gaps) | `−Δy[j]` (align y-gaps) |
| Dark | `−Δx[i] + P/2` (misalign x by half-period) | `−Δy[j] + P/2` (misalign y by half-period) |

**Why this works:**
- Moiré transmission at cell (i,j) = T_x(i,j) × T_y(i,j)
- T_x = 1 and T_y = 1 when both gaps align → bright
- T_x = 0 and T_y = 0 when both are misaligned by P/2 → maximally dark
- Misaligning both axes simultaneously gives the strongest dark signal and preserves the
  2D grid interference character in both directions, making full use of both types of offsets

### 1.3 Number of offsets

For an N×N grid: N² per-cell x-offsets for the front + N² per-cell y-offsets for the back = 2N² total.
For N = 500: 500,000 offsets. These are stored as two `Float32Array`s of length N².

The "lines" in the front grid become locally non-straight (a zigzag at cell resolution), which is what
allows independent per-cell control. Adjacent cells in the same column may have different x-phases.

---

## 2. Rendering with Per-Cell Offsets

The existing `fillRect` line-drawing approach cannot handle per-cell phase shifts efficiently.
Replace it with a **pixel-by-pixel ImageData computation** when a custom pattern is active.

### 2.1 Algorithm (pseudocode)

```
scale = min(W, H) / gridSize
imageData = ctx.createImageData(W, H)
data = imageData.data  // Uint8ClampedArray, RGBA

for py in 0..H:
  for px in 0..W:
    // 1. Convert canvas pixel to front-grid cm (corner-origin)
    cx = (px - W/2) / scale + gridSize/2
    cy = (py - H/2) / scale + gridSize/2

    if cx < 0 || cx >= gridSize || cy < 0 || cy >= gridSize:
      set pixel to bgColor; continue

    // 2. Front-grid cell
    i = floor(cx / P);  j = floor(cy / P)
    clamp i, j to [0, N-1]

    // 3. Front x-opacity (with per-cell phase shift φ_x[i][j])
    ux = ((cx - frontPhaseX[i * N + j]) mod P + P) mod P
    front_opaque_x = ux < T/2  ||  ux > P − T/2

    // 4. Front y-opacity (no phase shift for front y)
    uy = cy mod P
    front_opaque_y = uy < T/2  ||  uy > P − T/2

    front_opaque = front_opaque_x || front_opaque_y

    if !front_opaque:
      // 5. Map to back-grid cm (corner-origin)
      bx = (cx - gridSize/2 - Vx*(1−f)) / f + gridSize/2
      by = (cy - gridSize/2 - Vy*(1−f)) / f + gridSize/2

      bi = floor(bx / P);  bj = floor(by / P)
      clamp bi, bj to [0, N-1]

      // 6. Back x-opacity (no phase shift for back x)
      ubx = bx mod P
      back_opaque_x = ubx < T/2  ||  ubx > P − T/2

      // 7. Back y-opacity (with per-cell phase shift φ_y[bi][bj])
      uby = ((by - backPhaseY[bi * N + bj]) mod P + P) mod P
      back_opaque_y = uby < T/2  ||  uby > P − T/2

      back_opaque = back_opaque_x || back_opaque_y
    else:
      back_opaque = true  // irrelevant, pixel is already dark

    // 8. Set pixel color
    set pixel to lineColor if (!front_opaque && !back_opaque) else bgColor

ctx.putImageData(imageData, 0, 0)
```

T = thicknessRatio × P (opaque half-thickness on each side of each line = T/2)

### 2.2 Performance

For a typical canvas of 800×800 = 640,000 pixels, each with ~20 arithmetic operations:
~12M operations per frame. With Float32Array access and no DOM manipulation, this runs
in under 10ms on modern hardware — within the 16ms frame budget.

When there is **no custom pattern** active, continue to use the existing fast `fillRect`
approach (unchanged).

### 2.3 Worker thread (optional, stretch goal)

If performance is a concern, move the `imageData` computation to a Web Worker, passing the
typed-array buffers via `transferable` objects.

---

## 3. Pattern Offset Computation Utility

File: `src/app/utils/pattern-encoder.ts`

```typescript
export interface PatternOffsets {
  frontPhaseX: Float32Array;  // N² values, index i*N + j
  backPhaseY:  Float32Array;  // N² values, index i*N + j
}

export function encodePattern(
  image: Uint8Array,       // N² values, 0 = black, 255 = white
  params: MoireParams
): PatternOffsets {
  const N = params.cellCount;
  const P = params.gridSize / N;
  const f = params.viewerDist / (params.viewerDist + params.depthGap);
  const Vx_c = params.viewerX + params.gridSize / 2;
  const Vy_c = params.viewerY + params.gridSize / 2;

  const frontPhaseX = new Float32Array(N * N);
  const backPhaseY  = new Float32Array(N * N);

  for (let i = 0; i < N; i++) {
    const cx = (i + 0.5) * P;
    const deltaX = (1 - f) * (cx - Vx_c);

    for (let j = 0; j < N; j++) {
      const cy = (j + 0.5) * P;
      const deltaY = (1 - f) * (cy - Vy_c);
      const idx = i * N + j;
      const bright = image[idx] > 127;

      frontPhaseX[idx] = -deltaX + (bright ? 0 : P / 2);
      backPhaseY[idx]  = -deltaY  + (bright ? 0 : P / 2);
    }
  }

  return { frontPhaseX, backPhaseY };
}
```

`encodePattern` runs in O(N²) and takes ~5ms for N=500 on modern hardware.

---

## 4. Pattern Image Editor (Dialog Component)

### 4.1 Design

A `MatDialog` that contains a square canvas editor. The canvas displays an N×N pixel
image (same N as the current `cellCount`). For N=500, the canvas is displayed at
a fixed size (e.g. 480×480px) with CSS scaling — each logical pixel corresponds to one cell.

### 4.2 Tools

| Tool | Behaviour |
|---|---|
| Paint white | Click/drag paints cells white |
| Paint black | Click/drag paints cells black |
| Erase | Same as paint white |
| Fill checkerboard | Fills the entire image with a 10×10-cell checker pattern |
| Clear (all black) | Fills with black |
| Clear (all white) | Fills with white |

### 4.3 Component files

```
src/app/components/pattern-editor/
  pattern-editor.component.ts
  pattern-editor.component.html
  pattern-editor.component.scss
```

The component receives `cellCount` as `MAT_DIALOG_DATA` and returns the `Uint8Array` image
(or `null` if cancelled) through `MatDialogRef`.

### 4.4 Interaction flow

1. User clicks "Edit Pattern" in the control panel.
2. `PatternEditorComponent` opens as a dialog. If a pattern is already active, it pre-loads
   the existing image; otherwise starts blank (all white).
3. User draws on the canvas. Preview updates in real time (live rendering in the main canvas
   via `MoireStateService` — optional stretch goal; can also just show the B&W image in the dialog).
4. User clicks "Apply". The dialog calls `encodePattern(image, currentParams)` and pushes the
   result into `MoireStateService`.
5. User clicks "Remove Pattern" (in control panel) to revert to the default uniform moiré.

### 4.5 Canvas interaction (mouse + touch)

```typescript
// On mousedown / touchstart:
startDrawing(event) → record isDrawing = true, get paint color from current tool

// On mousemove / touchmove (while isDrawing):
paintCell(event) → convert canvas pixel to cell index, write to imageBuffer, redraw canvas

// On mouseup / touchend:
stopDrawing()
```

Conversion from canvas pixel to cell index:
```typescript
const rect = canvas.getBoundingClientRect();
const scaleX = cellCount / rect.width;
const scaleY = cellCount / rect.height;
const i = Math.floor((event.clientX - rect.left) * scaleX);
const j = Math.floor((event.clientY - rect.top) * scaleY);
```

---

## 5. Data Model Changes

### 5.1 `MoireParams` (extend)

```typescript
// Add to MoireParams interface:
customPattern?: {
  image:       Uint8Array;   // N² pixels, 0=black 255=white — source of truth for re-encoding
  frontPhaseX: Float32Array; // N² phase offsets (cm), precomputed from image + params
  backPhaseY:  Float32Array; // N² phase offsets (cm)
}
```

Storing the source `image` alongside the precomputed offsets allows re-encoding whenever
grid/viewer parameters change (if the user re-encodes on parameter change — see Section 7).

### 5.2 `MoireStateService` (extend)

```typescript
setCustomPattern(image: Uint8Array): void {
  const offsets = encodePattern(image, this.currentParams);
  this.paramsSubject.next({
    ...this.currentParams,
    customPattern: { image, ...offsets }
  });
}

clearCustomPattern(): void {
  const { customPattern, ...rest } = this.currentParams;
  this.paramsSubject.next(rest as MoireParams);
}
```

---

## 6. Canvas Renderer Changes

File: `src/app/utils/canvas-renderer.ts`

Add a new function `renderWithPattern()` alongside the existing `render()`:

```typescript
export function render(canvas, params): void {
  if (params.customPattern) {
    renderWithPattern(canvas, params);
  } else {
    renderUniform(canvas, params);   // renamed from current render()
  }
}
```

`renderWithPattern` implements the ImageData pixel loop from Section 2.1.

The existing `renderUniform` (currently `render`) is unchanged.

---

## 7. Re-encoding on Parameter Change

When the user has a custom pattern active and then changes a viewer/grid parameter (viewerDist,
viewerX, depthGap, etc.), the offsets must be recomputed because the phase gaps Δx[i] and Δy[j]
depend on f, Vx, Vy.

Strategy: in `MoireStateService.updateParams()`, if `customPattern` is set, automatically re-run
`encodePattern` with the stored image and the new params. Since `encodePattern` is ~5ms, this can
run synchronously on the main thread without jank.

```typescript
updateParams(partial: Partial<MoireParams>): void {
  let next = { ...this.paramsSubject.value, ...partial };
  if (next.customPattern) {
    const offsets = encodePattern(next.customPattern.image, next);
    next = { ...next, customPattern: { ...next.customPattern, ...offsets } };
  }
  this.paramsSubject.next(next);
}
```

---

## 8. SVG Export with Custom Pattern

With 500×500 = 250,000 cells each having independent phase offsets, a per-line SVG is enormous.
Instead, export a rasterized SVG:

**Option A (recommended): Embed a PNG data URL**
- Render the scene at full resolution into an OffscreenCanvas
- Encode as PNG data URL
- Embed in SVG as `<image href="data:image/png;base64,..."/>`
- Fast, compact, lossless

**Option B: Per-cell rectangle SVG**
- Each bright cell (i,j) emits one `<rect>` for its transparent zone
- For 500×500 with ~50% bright cells: ~125,000 elements → ~10MB file
- Accurate but slow to render in SVG viewers

The control panel "Export SVG" button should call `exportCurrentState()` which:
- Detects if `customPattern` is active
- Uses Option A (PNG-in-SVG) if yes
- Uses the existing line-based SVG if no

---

## 9. Control Panel Changes

Add a new section "Custom Pattern" (with `<mat-divider>` above):

```html
<div class="section-title">Custom Pattern</div>
<button mat-stroked-button (click)="editPattern()">
  <mat-icon>edit</mat-icon> Edit Pattern
</button>
<button mat-stroked-button (click)="clearPattern()" *ngIf="hasPattern$ | async">
  <mat-icon>delete</mat-icon> Remove Pattern
</button>
<div class="pattern-indicator" *ngIf="hasPattern$ | async">
  <mat-icon color="primary">check_circle</mat-icon> Custom pattern active
</div>
```

`hasPattern$` is derived from `params$.pipe(map(p => !!p.customPattern))`.

---

## 10. Module Changes

Add to `AppModule` imports:
- `MatDialogModule`

---

## 11. New Files Summary

| File | Purpose |
|---|---|
| `src/app/utils/pattern-encoder.ts` | `encodePattern()` utility |
| `src/app/components/pattern-editor/pattern-editor.component.ts` | Dialog canvas editor |
| `src/app/components/pattern-editor/pattern-editor.component.html` | Editor template |
| `src/app/components/pattern-editor/pattern-editor.component.scss` | Editor styles |

### Modified Files

| File | Change |
|---|---|
| `src/app/models/moire-params.ts` | Add `customPattern` field |
| `src/app/utils/canvas-renderer.ts` | Add `renderWithPattern()`, dispatch on params |
| `src/app/services/moire-state.service.ts` | Add `setCustomPattern()`, `clearCustomPattern()`, re-encode on param change |
| `src/app/services/svg-export.service.ts` | PNG-in-SVG path for custom pattern |
| `src/app/components/control-panel/control-panel.component.*` | Add Edit/Remove Pattern buttons |
| `src/app/app.module.ts` | Add `MatDialogModule` |

---

## 12. Step-by-Step Implementation Order

1. **`pattern-encoder.ts`** — pure utility, no dependencies; testable in isolation
2. **`MoireParams` + `MoireStateService`** — extend model and service with `customPattern`
3. **`canvas-renderer.ts`** — add `renderWithPattern()` (pixel loop), test visually
4. **`PatternEditorComponent`** — canvas drawing UI; wired to `MoireStateService.setCustomPattern()`
5. **`ControlPanelComponent`** — add Edit/Remove buttons, `hasPattern$` indicator
6. **`SvgExportService`** — PNG-in-SVG path when `customPattern` is active
7. **`AppModule`** — add `MatDialogModule`

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| X-phase on front, Y-phase on back | Matches user's specification; keeps the two controls independent |
| Misalign both axes for dark | Both offsets encode every cell; preserves 2D grid interference character; maximises contrast |
| Re-encode on param change | Keeps the displayed pattern correct as viewer position changes |
| PNG-in-SVG for custom export | Per-cell SVG would be 10MB+; PNG is compact and exact |
| ImageData pixel loop for pattern rendering | The `fillRect` approach cannot handle per-cell offsets |
| `Float32Array` for offsets | 4 bytes/float × 250,000 cells × 2 arrays = 2MB RAM, acceptable |
