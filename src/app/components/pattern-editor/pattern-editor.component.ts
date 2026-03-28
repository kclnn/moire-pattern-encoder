import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface PatternEditorData {
  cellCount: number;
  existingImage?: Uint8Array;
}

type PaintMode = 'white' | 'black';

@Component({
  selector: 'app-pattern-editor',
  templateUrl: './pattern-editor.component.html',
  styleUrls: ['./pattern-editor.component.scss'],
})
export class PatternEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly cellCount: number;
  paintMode: PaintMode = 'black';

  private image!: Uint8Array;
  private isDrawing = false;
  private lastCell = { i: -1, j: -1 };

  private readonly boundMouseMove  = this.onMouseMove.bind(this);
  private readonly boundMouseUp    = this.onMouseUp.bind(this);
  private readonly boundTouchMove  = this.onTouchMove.bind(this);
  private readonly boundTouchEnd   = this.onTouchEnd.bind(this);

  constructor(
    public dialogRef: MatDialogRef<PatternEditorComponent, Uint8Array | null>,
    @Inject(MAT_DIALOG_DATA) data: PatternEditorData,
  ) {
    this.cellCount = data.cellCount;
    const N = this.cellCount;
    this.image = data.existingImage
      ? new Uint8Array(data.existingImage)
      : new Uint8Array(N * N).fill(255); // default: all white
  }

  ngAfterViewInit(): void {
    this.redraw();
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mouseup',   this.boundMouseUp);
    window.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    window.addEventListener('touchend',  this.boundTouchEnd);
  }

  ngOnDestroy(): void {
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mouseup',   this.boundMouseUp);
    window.removeEventListener('touchmove', this.boundTouchMove);
    window.removeEventListener('touchend',  this.boundTouchEnd);
  }

  // ---- Canvas event handlers ----

  onMouseDown(event: MouseEvent): void {
    this.isDrawing = true;
    this.lastCell = { i: -1, j: -1 };
    this.paintAt(event.clientX, event.clientY);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isDrawing) return;
    this.paintAt(event.clientX, event.clientY);
  }

  private onMouseUp(): void {
    this.isDrawing = false;
  }

  onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    this.isDrawing = true;
    this.lastCell = { i: -1, j: -1 };
    const t = event.touches[0];
    this.paintAt(t.clientX, t.clientY);
  }

  private onTouchMove(event: TouchEvent): void {
    if (!this.isDrawing) return;
    event.preventDefault();
    const t = event.touches[0];
    this.paintAt(t.clientX, t.clientY);
  }

  private onTouchEnd(): void {
    this.isDrawing = false;
  }

  // ---- Drawing logic ----

  private paintAt(clientX: number, clientY: number): void {
    const canvas = this.canvasRef.nativeElement;
    const rect   = canvas.getBoundingClientRect();
    const N      = this.cellCount;

    const i = Math.floor(((clientX - rect.left) / rect.width)  * N);
    const j = Math.floor(((clientY - rect.top)  / rect.height) * N);

    if (i < 0 || i >= N || j < 0 || j >= N) return;
    if (i === this.lastCell.i && j === this.lastCell.j) return;
    this.lastCell = { i, j };

    const idx = i * N + j;
    this.image[idx] = this.paintMode === 'white' ? 255 : 0;
    this.redrawCell(i, j);
  }

  // ---- Toolbar actions ----

  fillCheckerboard(size = 50): void {
    const N = this.cellCount;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const checker = (Math.floor(i / size) + Math.floor(j / size)) % 2 === 0;
        this.image[i * N + j] = checker ? 255 : 0;
      }
    }
    this.redraw();
  }

  fillAll(value: 0 | 255): void {
    this.image.fill(value);
    this.redraw();
  }

  // ---- Rendering ----

  private redraw(): void {
    const canvas = this.canvasRef.nativeElement;
    const N      = this.cellCount;
    canvas.width  = N;
    canvas.height = N;

    const ctx  = canvas.getContext('2d')!;
    const data = ctx.createImageData(N, N);
    const buf  = data.data;

    for (let idx = 0; idx < N * N; idx++) {
      const v    = this.image[idx];
      const base = idx * 4;
      buf[base]     = v;
      buf[base + 1] = v;
      buf[base + 2] = v;
      buf[base + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  }

  private redrawCell(i: number, j: number): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx    = canvas.getContext('2d')!;
    const N      = this.cellCount;
    const v      = this.image[i * N + j];
    ctx.fillStyle = v === 255 ? '#ffffff' : '#000000';
    ctx.fillRect(i, j, 1, 1);
  }

  // ---- Dialog actions ----

  apply(): void {
    this.dialogRef.close(this.image);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
