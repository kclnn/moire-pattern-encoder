import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { map, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PARAMS } from '../models/moire-params';
import { MoireStateService } from '../services/moire-state.service';
import { SvgExportService } from '../services/svg-export.service';
import {
  PatternEditorComponent,
  PatternEditorData,
} from './pattern-editor.component';

interface ComputedValues {
  scaleFactor: number;
  backGridPeriod: number;
  moireFringePeriod: number;
}

@Component({
  selector: 'app-control-panel',
  template: `
<div class="panel" [formGroup]="form">

  <!-- Grid Parameters -->
  <div class="section-title">Grid Parameters</div>

  <div class="field">
    <label matTooltip="Number of cells in each direction (both grids share this value)">
      Cells per axis: <strong>{{ form.value.cellCount }}</strong>
    </label>
    <mat-slider min="10" max="2000" step="1" discrete>
      <input matSliderThumb formControlName="cellCount">
    </mat-slider>
    <mat-form-field appearance="outline" class="number-input">
      <input matInput type="number" formControlName="cellCount" min="10" max="2000">
    </mat-form-field>
  </div>

  <div class="field">
    <label matTooltip="Fraction of the cell period that is opaque (line width / period)">
      Thickness ratio: <strong>{{ form.value.thicknessRatio | number:'1.2-2' }}</strong>
    </label>
    <mat-slider min="0.01" max="0.99" step="0.01" discrete>
      <input matSliderThumb formControlName="thicknessRatio">
    </mat-slider>
  </div>

  <mat-divider></mat-divider>

  <!-- Depth & Viewer -->
  <div class="section-title">Depth &amp; Viewer</div>

  <div class="field">
    <label matTooltip="Distance between the two grid planes in cm">
      Grid gap: <strong>{{ form.value.depthGap | number:'1.1-1' }} cm</strong>
    </label>
    <mat-slider min="0.1" max="100" step="0.1" discrete>
      <input matSliderThumb formControlName="depthGap">
    </mat-slider>
    <mat-form-field appearance="outline" class="number-input">
      <input matInput type="number" formControlName="depthGap" min="0.1" max="100" step="0.1">
    </mat-form-field>
  </div>

  <div class="field">
    <label matTooltip="Distance from the viewer to the front grid in cm">
      Viewer distance: <strong>{{ form.value.viewerDist | number:'1.0-0' }} cm</strong>
    </label>
    <mat-slider min="100" max="10000" step="10" discrete>
      <input matSliderThumb formControlName="viewerDist">
    </mat-slider>
    <mat-form-field appearance="outline" class="number-input">
      <input matInput type="number" formControlName="viewerDist" min="100" max="10000" step="10">
    </mat-form-field>
  </div>

  <div class="field">
    <label matTooltip="Horizontal offset of the viewer from the grid center in cm">
      Viewer X offset: <strong>{{ form.value.viewerX | number:'1.0-0' }} cm</strong>
    </label>
    <mat-slider min="-250" max="250" step="1" discrete>
      <input matSliderThumb formControlName="viewerX">
    </mat-slider>
    <mat-form-field appearance="outline" class="number-input">
      <input matInput type="number" formControlName="viewerX" min="-250" max="250">
    </mat-form-field>
  </div>

  <div class="field">
    <label matTooltip="Vertical offset of the viewer from the grid center in cm">
      Viewer Y offset: <strong>{{ form.value.viewerY | number:'1.0-0' }} cm</strong>
    </label>
    <mat-slider min="-250" max="250" step="1" discrete>
      <input matSliderThumb formControlName="viewerY">
    </mat-slider>
    <mat-form-field appearance="outline" class="number-input">
      <input matInput type="number" formControlName="viewerY" min="-250" max="250">
    </mat-form-field>
  </div>

  <mat-divider></mat-divider>

  <!-- Appearance -->
  <div class="section-title">Appearance</div>

  <div class="field">
    <label>Visible grids</label>
    <mat-button-toggle-group formControlName="gridVisibility" class="visibility-toggle">
      <mat-button-toggle value="front" matTooltip="Show front grid only">Front</mat-button-toggle>
      <mat-button-toggle value="both"  matTooltip="Show both grids (moiré)">Both</mat-button-toggle>
      <mat-button-toggle value="back"  matTooltip="Show back grid only">Back</mat-button-toggle>
    </mat-button-toggle-group>
  </div>

  <div class="field color-field">
    <label>Background</label>
    <input type="color" formControlName="bgColor" class="color-input">
  </div>

  <div class="field color-field">
    <label>Grid lines</label>
    <input type="color" formControlName="lineColor" class="color-input">
  </div>

  <mat-divider></mat-divider>

  <!-- Computed Values -->
  <div class="section-title">Computed Values</div>
  <ng-container *ngIf="computed$ | async as c">
    <div class="computed-row">
      <span>Scale factor f</span>
      <span class="value">{{ c.scaleFactor | number:'1.5-5' }}</span>
    </div>
    <div class="computed-row">
      <span>Back-grid period</span>
      <span class="value">{{ c.backGridPeriod | number:'1.4-4' }} cm</span>
    </div>
    <div class="computed-row">
      <span>Moiré fringe period</span>
      <span class="value">{{ c.moireFringePeriod | number:'1.1-1' }} cm</span>
    </div>
  </ng-container>

  <mat-divider></mat-divider>

  <!-- Pattern 1 -->
  <div class="section-title">Pattern 1 (front grid, X offsets)</div>

  <div class="pattern-status active" *ngIf="patternActive$ | async">
    <mat-icon color="primary">check_circle</mat-icon>
    <span>Pattern 1 active</span>
  </div>
  <div class="pattern-status pending" *ngIf="patternPending$ | async">
    <mat-icon color="warn">pending</mat-icon>
    <span>Pattern 1 inactive — click Apply</span>
  </div>

  <div class="actions">
    <button mat-stroked-button (click)="editPattern()"
            matTooltip="Open the pattern editor to draw pattern 1">
      <mat-icon>edit</mat-icon> Edit Pattern 1
    </button>
    <button mat-raised-button color="accent" (click)="applyPattern()"
            *ngIf="hasImage$ | async"
            matTooltip="Encode pattern 1 into front grid X offsets using the current viewer position">
      <mat-icon>play_arrow</mat-icon> Apply Pattern 1
    </button>
  </div>
  <div class="actions" *ngIf="hasImage$ | async">
    <button mat-stroked-button color="warn" (click)="clearPattern()"
            matTooltip="Remove all patterns and restore the uniform moiré">
      <mat-icon>delete</mat-icon> Remove Pattern
    </button>
  </div>

  <mat-divider></mat-divider>

  <!-- Pattern 2 -->
  <div class="section-title">Pattern 2 (back grid, Y offsets)</div>

  <div class="pattern-status active" *ngIf="pattern2Active$ | async">
    <mat-icon color="primary">check_circle</mat-icon>
    <span>Pattern 2 active</span>
  </div>
  <div class="pattern-status pending" *ngIf="pattern2Pending$ | async">
    <mat-icon color="warn">pending</mat-icon>
    <span>Pattern 2 inactive — click Apply</span>
  </div>
  <div class="pattern-status" *ngIf="(hasImage2$ | async) && !(patternActive$ | async)">
    <mat-icon>info</mat-icon>
    <span>Apply Pattern 1 first</span>
  </div>

  <div class="actions">
    <button mat-stroked-button (click)="editPattern2()"
            matTooltip="Draw pattern 2 (encoded into back grid Y offsets)">
      <mat-icon>edit</mat-icon> Edit Pattern 2
    </button>
    <button mat-raised-button color="accent" (click)="applyPattern2()"
            *ngIf="(hasImage2$ | async) && (patternActive$ | async)"
            matTooltip="Encode pattern 2 into back grid Y offsets using the current viewer position">
      <mat-icon>play_arrow</mat-icon> Apply Pattern 2
    </button>
  </div>

  <mat-divider></mat-divider>

  <!-- Actions -->
  <div class="actions">
    <button mat-stroked-button (click)="reset()" matTooltip="Reset all parameters to defaults">
      <mat-icon>restart_alt</mat-icon> Reset
    </button>
    <button mat-raised-button color="primary" (click)="exportSvg()" matTooltip="Download the current pattern as an SVG file">
      <mat-icon>download</mat-icon> Export SVG
    </button>
  </div>

</div>
`,
  styles: [`
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant, #666);
  margin-top: 8px;
  margin-bottom: 2px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 2px;

  label {
    font-size: 13px;
  }

  mat-slider {
    width: 100%;
  }
}

.number-input {
  width: 100%;

  ::ng-deep .mat-mdc-form-field-subscript-wrapper {
    display: none;
  }

  ::ng-deep .mat-mdc-text-field-wrapper {
    padding: 0 8px;
  }

  input {
    font-size: 13px;
  }
}

.color-field {
  flex-direction: row;
  align-items: center;
  gap: 12px;

  label {
    flex: 1;
  }
}

.visibility-toggle {
  width: 100%;

  mat-button-toggle { flex: 1; }
}

.color-input {
  width: 48px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 2px;
  background: none;
}

mat-divider {
  margin: 8px 0;
}

.computed-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 2px 0;

  .value {
    font-family: monospace;
    font-size: 12px;
    color: var(--mat-sys-primary, #1976d2);
  }
}

.pattern-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 4px;

  &.pending span { color: #e65100; }
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;

  button {
    flex: 1;
    min-width: 0;
  }
}
`],
})
export class ControlPanelComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  computed$!:       ReturnType<typeof this.buildComputed$>;
  hasImage$!:       ReturnType<typeof this.buildHasImage$>;
  hasImage2$!:      ReturnType<typeof this.buildHasImage2$>;
  patternActive$!:  ReturnType<typeof this.buildPatternActive$>;
  patternPending$!: ReturnType<typeof this.buildPatternPending$>;
  pattern2Active$!: ReturnType<typeof this.buildPattern2Active$>;
  pattern2Pending$!:ReturnType<typeof this.buildPattern2Pending$>;

  private subscription = new Subscription();

  constructor(
    private fb: FormBuilder,
    private state: MoireStateService,
    private svgExport: SvgExportService,
    private dialog: MatDialog,
  ) {
    this.computed$        = this.buildComputed$();
    this.hasImage$        = this.buildHasImage$();
    this.hasImage2$       = this.buildHasImage2$();
    this.patternActive$   = this.buildPatternActive$();
    this.patternPending$  = this.buildPatternPending$();
    this.pattern2Active$  = this.buildPattern2Active$();
    this.pattern2Pending$ = this.buildPattern2Pending$();
  }

  private buildComputed$() {
    return this.state.params$.pipe(
      map(p => {
        const D      = p.viewerDist;
        const d      = Math.max(0.001, p.depthGap);
        const period = p.gridSize / p.cellCount;
        const f      = D / (D + d);
        return {
          scaleFactor:       f,
          backGridPeriod:    period * f,
          moireFringePeriod: period * D / d,
        } as ComputedValues;
      })
    );
  }

  /** True when a pattern image has been drawn (regardless of whether offsets are computed). */
  private buildHasImage$() {
    return this.state.params$.pipe(map(p => !!p.patternImage));
  }

  /** True when encoded offsets are active (currently driving the renderer). */
  private buildPatternActive$() {
    return this.state.params$.pipe(map(p => !!p.customPattern));
  }

  /** True when image exists but offsets are not yet computed (e.g. after cellCount change). */
  private buildPatternPending$() {
    return this.state.params$.pipe(map(p => !!p.patternImage && !p.customPattern));
  }

  private buildHasImage2$() {
    return this.state.params$.pipe(map(p => !!p.patternImage2));
  }

  private buildPattern2Active$() {
    return this.state.params$.pipe(map(p => !!p.customPattern?.backPhaseY));
  }

  private buildPattern2Pending$() {
    return this.state.params$.pipe(map(p => !!p.patternImage2 && !!p.customPattern && !p.customPattern.backPhaseY));
  }

  ngOnInit(): void {
    const p = DEFAULT_PARAMS;
    this.form = this.fb.group({
      cellCount:      [p.cellCount],
      thicknessRatio: [p.thicknessRatio],
      depthGap:       [p.depthGap],
      viewerDist:     [p.viewerDist],
      viewerX:        [p.viewerX],
      viewerY:        [p.viewerY],
      bgColor:        [p.bgColor],
      lineColor:      [p.lineColor],
      gridVisibility: [p.gridVisibility],
    });

    this.subscription.add(
      this.form.valueChanges.pipe(debounceTime(16)).subscribe(values => {
        this.state.updateParams({
          cellCount:      Math.round(Math.max(1, values.cellCount)),
          thicknessRatio: Math.min(0.99, Math.max(0.01, values.thicknessRatio)),
          depthGap:       Math.max(0.1, values.depthGap),
          viewerDist:     Math.max(10, values.viewerDist),
          viewerX:        values.viewerX,
          viewerY:        values.viewerY,
          bgColor:        values.bgColor,
          lineColor:      values.lineColor,
          gridVisibility: values.gridVisibility,
        });
      })
    );
  }

  editPattern(): void {
    const current = this.state.currentParams;
    const data: PatternEditorData = {
      cellCount:     current.cellCount,
      existingImage: current.patternImage,
    };
    const ref = this.dialog.open<PatternEditorComponent, PatternEditorData, Uint8Array | null>(
      PatternEditorComponent,
      { data, disableClose: false },
    );
    ref.afterClosed().subscribe(image => {
      if (image) this.state.storePatternImage(image);
    });
  }

  applyPattern(): void {
    this.state.applyPattern();
  }

  editPattern2(): void {
    const current = this.state.currentParams;
    const data: PatternEditorData = {
      cellCount:     current.cellCount,
      existingImage: current.patternImage2,
    };
    const ref = this.dialog.open<PatternEditorComponent, PatternEditorData, Uint8Array | null>(
      PatternEditorComponent,
      { data, disableClose: false },
    );
    ref.afterClosed().subscribe(image => {
      if (image) this.state.storePatternImage2(image);
    });
  }

  applyPattern2(): void {
    this.state.applyPattern2();
  }

  clearPattern(): void {
    this.state.clearPattern();
  }

  reset(): void {
    this.form.setValue({
      cellCount:      DEFAULT_PARAMS.cellCount,
      thicknessRatio: DEFAULT_PARAMS.thicknessRatio,
      depthGap:       DEFAULT_PARAMS.depthGap,
      viewerDist:     DEFAULT_PARAMS.viewerDist,
      viewerX:        DEFAULT_PARAMS.viewerX,
      viewerY:        DEFAULT_PARAMS.viewerY,
      bgColor:        DEFAULT_PARAMS.bgColor,
      lineColor:      DEFAULT_PARAMS.lineColor,
      gridVisibility: DEFAULT_PARAMS.gridVisibility,
    });
  }

  exportSvg(): void {
    this.svgExport.exportCurrentState();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}
