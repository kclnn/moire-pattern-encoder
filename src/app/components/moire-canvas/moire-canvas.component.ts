import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { MoireStateService } from '../../services/moire-state.service';
import { render } from '../../utils/canvas-renderer';

@Component({
  selector: 'app-moire-canvas',
  templateUrl: './moire-canvas.component.html',
  styleUrls: ['./moire-canvas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoireCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;

  private subscription = new Subscription();
  private resizeObserver!: ResizeObserver;
  private rafId = 0;

  constructor(private state: MoireStateService, private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;

    // Run rendering outside Angular's zone to avoid unnecessary CD cycles
    this.ngZone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => {
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
          render(canvas, this.state.currentParams);
        });
      });
      this.resizeObserver.observe(container);

      this.subscription.add(
        this.state.params$.subscribe(params => {
          cancelAnimationFrame(this.rafId);
          this.rafId = requestAnimationFrame(() => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            render(canvas, params);
          });
        })
      );
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.rafId);
  }
}
