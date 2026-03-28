# Moiré Pattern Visualizer — Implementation Plan

## Table of Contents

1. Project Setup
2. Data Model and Interfaces
3. Perspective Projection Mathematics
4. Canvas Rendering Strategy
5. SVG Export Strategy
6. Angular Component Breakdown
7. State Management
8. UI Layout
9. Step-by-Step Implementation Order

---

## 1. Project Setup

### Prerequisites

- Node.js 20+ and npm 10+
- Angular CLI 18+

### Commands

```bash
npm install -g @angular/cli
ng new moire-pattern-claude --style=scss --routing=false --standalone=false
cd moire-pattern-claude
ng add @angular/material    # choose a theme, e.g. Indigo/Pink; enable animations
```

### Additional Dependencies

No extra runtime dependencies are needed beyond Angular Material. The app uses only browser-native Canvas and SVG APIs.

### tsconfig adjustments

Ensure `"strict": true` is present in `tsconfig.json`. No other special compiler options are required.

### Angular Material Modules to Import

In `app.module.ts` import:

```
MatSliderModule
MatInputModule
MatButtonModule
MatIconModule
MatToolbarModule
MatSidenavModule
MatFormFieldModule
MatDividerModule
MatTooltipModule
ReactiveFormsModule
```

---

## 2. Data Model and Interfaces

File: `src/app/models/moire-params.ts`

```typescript
export interface MoireParams {
  /** Number of cells in each direction for both grids (N). Period = gridSize / N */
  cellCount: number;          // default: 500

  /** Fraction of the period that is opaque (line). 0 < thicknessRatio < 1 */
  thicknessRatio: number;     // default: 0.25

  /** Physical size of each grid in cm (square). Fixed at 500 in this app. */
  gridSize: number;           // default: 500  (cm)

  /** Gap between front grid (z=0) and back grid (z=-depthGap) in cm */
  depthGap: number;           // default: 10   (cm)

  /** Viewer distance from the front grid plane (z=0), in cm */
  viewerDist: number;         // default: 1000 (cm)

  /** Viewer X offset from grid center, in cm */
  viewerX: number;            // default: 0    (cm)

  /** Viewer Y offset from grid center, in cm */
  viewerY: number;            // default: 0    (cm)

  /** Canvas background color */
  bgColor: string;            // default: '#000000'

  /** Grid line color */
  lineColor: string;          // default: '#ffffff'
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
```

---

## 3. Perspective Projection Mathematics

### Coordinate System

- The physical world uses cm units.
- The front grid spans `[-gridSize/2, +gridSize/2]` in both X and Y, at z = 0.
- The back grid spans the same physical extent at z = `-depthGap`.
- The viewer is at world position `(viewerX, viewerY, viewerDist)`.
- The view plane is z = 0 (the front grid plane).

### Projection of a Back-Grid Point onto the View Plane

A point `(x, y, -d)` on the back grid (where `d = depthGap > 0`) projects to the view plane z = 0 via a ray from the viewer:

```
Ray: P(t) = Viewer + t * (BackPoint - Viewer)
           = (Vx, Vy, D) + t * (x - Vx,  y - Vy,  -d - D)

z-component = 0  =>  D + t*(-d - D) = 0
                  =>  t = D / (D + d)

px = Vx + (x - Vx) * D / (D + d)
py = Vy + (y - Vy) * D / (D + d)
```

Let `f = D / (D + d)`. This is a **uniform scale** by factor `f` **centered at `(Vx, Vy)`** in the view plane.

For default values: `f = 1000 / 1010 ≈ 0.99010`.

### Interpretation as a 2D Affine Transform

The entire back grid, as seen on the view plane, is a scaled-and-translated version of the front grid:

```
projectedX = Vx + f * (x - Vx) = f*x + Vx*(1 - f)
projectedY = Vy + f * (y - Vy) = f*y + Vy*(1 - f)
```

In matrix form (column vector, affine):

```
| f   0   Vx*(1-f) |   | x |
| 0   f   Vy*(1-f) | × | y |
| 0   0   1        |   | 1 |
```

This transform maps back-grid cm coordinates directly into view-plane cm coordinates.

### Period Mismatch (the Moiré cause)

- Front grid period: `P_front = gridSize / cellCount`
- Back grid apparent period on view plane: `P_back = P_front * f`
- Period difference: `ΔP = P_front - P_back = P_front * (1 - f) = P_front * d / (D + d)`
- Moiré fringe period (for zero viewer offset): `P_moire = P_front * P_back / |P_front - P_back| = P_front * f / (1 - f) = P_front * D / d`

For defaults: `P_moire = 1cm * 1000/10 = 100cm`, so the 500cm grid shows ~5 fringes.

### Viewer Offset Effect

When `viewerX != 0` or `viewerY != 0`, the back grid projection is no longer centered on the grid center. The scale center shifts to `(Vx, Vy)` in view-plane coordinates, which shifts the moiré fringe pattern laterally.

---

## 4. Canvas Rendering Strategy

### Pixel-per-cm Scale

The canvas element occupies the full remaining viewport area (minus the sidebar). Map the physical 500cm × 500cm grid to fit within this canvas:

```typescript
const scale = Math.min(canvasWidth, canvasHeight) / gridSize;
// e.g. 800px canvas / 500cm = 1.6 px/cm
```

Apply this scale once as a base transform so all subsequent drawing is in cm units:

```typescript
ctx.setTransform(scale, 0, 0, scale, canvasWidth/2, canvasHeight/2);
// Now (0,0) is center of canvas, 1 unit = 1 cm
```

### Drawing a Single Grid in cm Space

A grid with period `P` and line thickness `T = thicknessRatio * P` spanning `[-gridSize/2, +gridSize/2]`:

```typescript
function drawGrid(ctx: CanvasRenderingContext2D, params: MoireParams): void {
  const { cellCount, thicknessRatio, gridSize, lineColor } = params;
  const period = gridSize / cellCount;
  const lineWidth = thicknessRatio * period;
  const half = gridSize / 2;

  ctx.fillStyle = lineColor;

  // Vertical lines
  for (let i = 0; i <= cellCount; i++) {
    const x = -half + i * period;
    ctx.fillRect(x - lineWidth / 2, -half, lineWidth, gridSize);
  }

  // Horizontal lines
  for (let j = 0; j <= cellCount; j++) {
    const y = -half + j * period;
    ctx.fillRect(-half, y - lineWidth / 2, gridSize, lineWidth);
  }
}
```

Note: For `cellCount = 500`, this is 501 vertical + 501 horizontal fill calls. On modern hardware this is well under 16ms. No further optimization is needed for the initial version.

### Full Render Function

```typescript
render(canvas: HTMLCanvasElement, params: MoireParams): void {
  const { gridSize, viewerX, viewerY, viewerDist, depthGap, bgColor } = params;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const scale = Math.min(W, H) / gridSize;

  // Clear
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Base transform: cm space, origin at canvas center
  ctx.setTransform(scale, 0, 0, scale, W / 2, H / 2);

  // --- Draw back grid with perspective transform ---
  const D = viewerDist;
  const d = depthGap;
  const f = D / (D + d);
  const tx = viewerX * (1 - f);   // translation part: Vx*(1-f)
  const ty = viewerY * (1 - f);   // Vy*(1-f)

  ctx.save();
  // Apply back-grid projection on top of current transform.
  // ctx.transform post-multiplies the current matrix, so the effective
  // pixel transform for the back grid is: base_scale × perspective × cmPoint
  ctx.transform(f, 0, 0, f, tx, ty);
  drawGrid(ctx, params);
  ctx.restore();

  // --- Draw front grid (identity in cm space) ---
  drawGrid(ctx, params);
}
```

### Re-render Triggers

The canvas re-renders whenever any `MoireParams` value changes. Use RxJS to debounce slider emissions before triggering render (see Section 7). Debounce by 16ms (one frame) for smooth slider interaction.

### Canvas Resize Handling

Use a `ResizeObserver` on the canvas container. When dimensions change, update `canvas.width` and `canvas.height` (this auto-clears the canvas) and call `render()`.

---

## 5. SVG Export Strategy

### Approach

Generate an SVG string that mirrors the canvas scene exactly. Two `<g>` elements: one for the back grid (with a `transform` attribute applying the perspective scale), one for the front grid.

### SVG Coordinate Space

Use cm as SVG user units. Set `viewBox="-250 -250 500 500"` (for the default 500cm grid). This maps directly to cm space with origin at center.

### SVG Transform for Back Grid

The back-grid projection in cm space is: scale by `f` centered at `(Vx, Vy)`.

SVG `matrix(a b c d e f)` maps `(x,y)` to `(ax+cy+e, bx+dy+f)`. For the perspective scale:

```
transform="matrix(f 0 0 f tx ty)"
```

where `tx = Vx*(1-f)` and `ty = Vy*(1-f)`.

### Generating Grid Lines as SVG

```typescript
function gridToSvgRects(params: MoireParams): string {
  const { cellCount, thicknessRatio, gridSize } = params;
  const period = gridSize / cellCount;
  const T = thicknessRatio * period;
  const half = gridSize / 2;
  let rects = '';

  for (let i = 0; i <= cellCount; i++) {
    const x = -half + i * period - T / 2;
    rects += `<rect x="${x}" y="${-half}" width="${T}" height="${gridSize}"/>`;
  }
  for (let j = 0; j <= cellCount; j++) {
    const y = -half + j * period - T / 2;
    rects += `<rect x="${-half}" y="${y}" width="${gridSize}" height="${T}"/>`;
  }
  return rects;
}
```

For 500 cells this yields 1002 `<rect>` elements per grid layer (2004 total). SVG file size ~150–200 KB.

### Full SVG Assembly

```typescript
generateSvg(params: MoireParams): string {
  const { gridSize, viewerX, viewerY, viewerDist, depthGap, bgColor, lineColor } = params;
  const half = gridSize / 2;
  const D = viewerDist;
  const d = Math.max(0.001, depthGap);
  const f = D / (D + d);
  const tx = viewerX * (1 - f);
  const ty = viewerY * (1 - f);

  const backTransform = `matrix(${f} 0 0 ${f} ${tx} ${ty})`;
  const rects = gridToSvgRects(params);  // same geometry, transform applied to group

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${-half} ${-half} ${gridSize} ${gridSize}"
     width="${gridSize}cm" height="${gridSize}cm">
  <rect x="${-half}" y="${-half}" width="${gridSize}" height="${gridSize}" fill="${bgColor}"/>
  <g fill="${lineColor}" transform="${backTransform}">
    ${rects}
  </g>
  <g fill="${lineColor}">
    ${rects}
  </g>
</svg>`;
}
```

### SVG Download

```typescript
downloadSvg(svgString: string, filename = 'moire.svg'): void {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 6. Angular Component Breakdown

### 6.1 AppComponent (`app.component`)

**Responsibility:** Root layout shell. Contains the Material sidenav layout: sidebar on the left, canvas area on the right.

Template structure:
```html
<mat-toolbar color="primary">Moiré Pattern Visualizer</mat-toolbar>
<mat-sidenav-container>
  <mat-sidenav mode="side" opened>
    <app-control-panel></app-control-panel>
  </mat-sidenav>
  <mat-sidenav-content>
    <app-moire-canvas></app-moire-canvas>
  </mat-sidenav-content>
</mat-sidenav-container>
```

The sidenav has a fixed width of 320px; the canvas fills the rest of the viewport height.

### 6.2 MoireCanvasComponent (`components/moire-canvas/`)

**Responsibility:** Owns the `<canvas>` element. Subscribes to `MoireStateService.params$` and calls `render()` on every emission. Handles canvas sizing via `ResizeObserver`.

Key members:
- `@ViewChild('canvas') canvasRef: ElementRef<HTMLCanvasElement>`
- `private resizeObserver: ResizeObserver`
- Injects `MoireStateService`

Lifecycle:
1. `ngAfterViewInit`: set up `ResizeObserver` on the container `<div>`, subscribe to `params$`.
2. On resize: update `canvas.width` / `canvas.height`, call `render()`.
3. On params change: call `render()`.
4. `ngOnDestroy`: unsubscribe, disconnect observer.

The rendering math lives in `src/app/utils/canvas-renderer.ts` (pure functions, no Angular dependencies).

Template:
```html
<div class="canvas-container" #container>
  <canvas #canvas></canvas>
</div>
```

### 6.3 ControlPanelComponent (`components/control-panel/`)

**Responsibility:** Reactive form with Angular Material controls. Pushes value changes to `MoireStateService`.

Form controls (all via `ReactiveFormsModule`):

| Control | Widget | Range | Default |
|---|---|---|---|
| cellCount | mat-slider + number input | 10–2000 | 500 |
| thicknessRatio | mat-slider | 0.01–0.99 | 0.25 |
| depthGap | mat-slider + number input | 0.1–100 | 10 |
| viewerDist | mat-slider + number input | 100–10000 | 1000 |
| viewerX | mat-slider + number input | -250–250 | 0 |
| viewerY | mat-slider + number input | -250–250 | 0 |
| bgColor | `<input type="color">` | — | #000000 |
| lineColor | `<input type="color">` | — | #ffffff |

In `ngOnInit`, subscribe to `form.valueChanges.pipe(debounceTime(16))` → `MoireStateService.updateParams(value)`.

Includes:
- **Computed readouts** (read-only): scale factor f, back-grid apparent period, moiré fringe period
- **Reset to Defaults** button → `MoireStateService.reset()`
- **Export SVG** button → `SvgExportService.exportCurrentState()`

### 6.4 MoireStateService (`services/moire-state.service.ts`)

Single source of truth for `MoireParams`.

```typescript
@Injectable({ providedIn: 'root' })
export class MoireStateService {
  private paramsSubject = new BehaviorSubject<MoireParams>(DEFAULT_PARAMS);
  readonly params$ = this.paramsSubject.asObservable();

  updateParams(partial: Partial<MoireParams>): void {
    this.paramsSubject.next({ ...this.paramsSubject.value, ...partial });
  }

  reset(): void {
    this.paramsSubject.next({ ...DEFAULT_PARAMS });
  }

  get currentParams(): MoireParams {
    return this.paramsSubject.value;
  }
}
```

### 6.5 SvgExportService (`services/svg-export.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class SvgExportService {
  constructor(private state: MoireStateService) {}

  exportCurrentState(): void {
    const svg = this.generateSvg(this.state.currentParams);
    this.downloadSvg(svg);
  }

  private generateSvg(params: MoireParams): string { /* see Section 5 */ }
  private downloadSvg(svg: string): void { /* see Section 5 */ }
}
```

### 6.6 Canvas Rendering Utility

`src/app/utils/canvas-renderer.ts` — pure exported functions (no Angular injection). Contains `drawGrid()` and `render()` from Section 4. This keeps `MoireCanvasComponent` slim and makes the math independently testable.

---

## 7. State Management

### Data Flow

```
User moves slider
  → ControlPanelComponent form.valueChanges
  → debounceTime(16ms)
  → MoireStateService.updateParams()
  → BehaviorSubject emits
  → MoireCanvasComponent subscription fires
  → render() called on canvas
```

### Change Detection

`MoireCanvasComponent` uses `ChangeDetectionStrategy.OnPush` since it is driven entirely by the RxJS subscription. Canvas rendering happens imperatively in the subscription callback, so Angular's CD cycle is not involved.

`ControlPanelComponent` uses default strategy (manages a reactive form).

---

## 8. UI Layout

```
┌──────────────────────────────────────────────────────┐
│  Toolbar: "Moiré Pattern Visualizer"                  │
├──────────────┬───────────────────────────────────────┤
│  Control     │                                       │
│  Panel       │         Canvas (fills remaining)      │
│  (320px)     │                                       │
│              │                                       │
│  [sliders]   │                                       │
│  [readouts]  │                                       │
│              │                                       │
│  [Reset]     │                                       │
│  [Export]    │                                       │
└──────────────┴───────────────────────────────────────┘
```

### Control Panel Sections (separated by `<mat-divider>`)

1. **Grid Parameters** — Cells per axis (N), Line thickness ratio
2. **Depth & Viewer** — Grid gap (cm), Viewer distance (cm), Viewer X offset, Viewer Y offset
3. **Appearance** — Background color, Line color
4. **Computed Values** (read-only) — Scale factor f, Back-grid apparent period (cm), Moiré fringe period (cm)
5. **Actions** — Reset to Defaults, Export SVG

---

## 9. Step-by-Step Implementation Order

### Step 1 — Scaffold and Configure

1. Run `ng new` and `ng add @angular/material`.
2. Import all required Material modules in `AppModule`.
3. Set up `app.component` with `mat-sidenav-container` shell layout.
4. Verify `ng serve` runs with the Material theme applied.

### Step 2 — Data Model

1. Create `src/app/models/moire-params.ts` with `MoireParams` interface and `DEFAULT_PARAMS`.

### Step 3 — State Service

1. Create `MoireStateService` as in Section 6.4.

### Step 4 — Canvas Renderer Utility

1. Create `src/app/utils/canvas-renderer.ts` with `drawGrid()` and `render()` pure functions.

### Step 5 — MoireCanvasComponent

1. Generate: `ng g c components/moire-canvas`
2. Add `<canvas>` template, `ViewChild`, `ResizeObserver`, subscription to `params$`.
3. Call `render(canvas, params)` from the utility on each emission.
4. Add to `AppComponent` sidenav content.
5. Verify: grid renders on a black canvas at startup.

### Step 6 — ControlPanelComponent

1. Generate: `ng g c components/control-panel`
2. Build `ReactiveFormsModule` form with all controls defaulting to `DEFAULT_PARAMS`.
3. Wire `form.valueChanges.pipe(debounceTime(16))` → `MoireStateService.updateParams()`.
4. Add to sidenav.
5. Verify: moving a slider updates the canvas in real time.

### Step 7 — Computed Readouts

1. Derive display values (f, back-grid period, moiré fringe period) from `MoireStateService.params$` using `map()`.
2. Display via `async` pipe in the template.

### Step 8 — SVG Export Service

1. Create `SvgExportService` as in Section 6.5.
2. Implement `generateSvg()` and `downloadSvg()`.
3. Wire "Export SVG" button.
4. Verify: downloaded SVG matches the canvas visually when opened in a browser.

### Step 9 — Polish

1. Wire Reset button to `MoireStateService.reset()`.
2. Add `mat-tooltip` descriptions to each slider.
3. Guard against division by zero: `const d = Math.max(0.001, depthGap)` before computing f.
4. Handle canvas resize gracefully (debounce `ResizeObserver` callback with `requestAnimationFrame`).

### Step 10 — Optional Enhancements

- Canvas PNG export via `canvas.toBlob()` → download.
- Animate viewer X/Y with `requestAnimationFrame` for a live moiré drift effect.
- Sidenav collapse/hamburger menu for narrow viewports.

---

## Key Mathematical Reference

| Symbol | Meaning | Default |
|---|---|---|
| N | cells per axis | 500 |
| P | period (cm) = gridSize / N | 1 cm |
| T | line thickness (cm) = thicknessRatio × P | 0.25 cm |
| D | viewer distance (cm) | 1000 cm |
| d | depth gap (cm) | 10 cm |
| f | perspective scale = D/(D+d) | ≈ 0.99010 |
| Vx, Vy | viewer lateral offset (cm) | 0, 0 |
| tx, ty | translation = Vx(1−f), Vy(1−f) | 0, 0 |
| P_moire | fringe period = P × D/d | 100 cm |

### Canvas Transform Quick Reference

- `ctx.setTransform(scale, 0, 0, scale, W/2, H/2)` — base scale, cm origin at canvas center
- `ctx.transform(f, 0, 0, f, tx, ty)` — post-multiply for back-grid perspective scale
- Effective back-grid pixel transform: `[scale*f, 0, scale*tx + W/2; 0, scale*f, scale*ty + H/2]`

### SVG Transform Quick Reference

- `matrix(a b c d e f)` maps `(x,y)` → `(ax+cy+e, bx+dy+f)`
- Back-grid: `matrix(f 0 0 f tx ty)` where `tx = Vx*(1-f)`, `ty = Vy*(1-f)`
