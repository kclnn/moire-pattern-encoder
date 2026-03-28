import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { map, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PARAMS } from '../../models/moire-params';
import { MoireStateService } from '../../services/moire-state.service';
import { SvgExportService } from '../../services/svg-export.service';

interface ComputedValues {
  scaleFactor: number;
  backGridPeriod: number;
  moireFringePeriod: number;
}

@Component({
  selector: 'app-control-panel',
  templateUrl: './control-panel.component.html',
  styleUrls: ['./control-panel.component.scss'],
})
export class ControlPanelComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  computed$!: ReturnType<typeof this.buildComputed$>;

  private subscription = new Subscription();

  constructor(
    private fb: FormBuilder,
    private state: MoireStateService,
    private svgExport: SvgExportService
  ) {
    this.computed$ = this.buildComputed$();
  }

  private buildComputed$() {
    return this.state.params$.pipe(
      map(p => {
        const D = p.viewerDist;
        const d = Math.max(0.001, p.depthGap);
        const period = p.gridSize / p.cellCount;
        const f = D / (D + d);
        return {
          scaleFactor: f,
          backGridPeriod: period * f,
          moireFringePeriod: period * D / d,
        } as ComputedValues;
      })
    );
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
        });
      })
    );
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
    });
  }

  exportSvg(): void {
    this.svgExport.exportCurrentState();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}
