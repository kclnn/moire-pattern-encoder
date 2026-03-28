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
  @ViewChild('fileInput')    fileInputRef!: ElementRef<HTMLInputElement>;

  readonly cellCount: number;
  paintMode: PaintMode = 'black';
  importError: string | null = null;

  private image!: Uint8Array;
  private isDrawing = false;
  private lastCell = { i: -1, j: -1 };

  private readonly boundMouseMove = this.onMouseMove.bind(this);
  private readonly boundMouseUp   = this.onMouseUp.bind(this);
  private readonly boundTouchMove = this.onTouchMove.bind(this);
  private readonly boundTouchEnd  = this.onTouchEnd.bind(this);

  constructor(
    public dialogRef: MatDialogRef<PatternEditorComponent, Uint8Array | null>,
    @Inject(MAT_DIALOG_DATA) data: PatternEditorData,
  ) {
    this.cellCount = data.cellCount;
    const N = this.cellCount;
    this.image = data.existingImage
      ? new Uint8Array(data.existingImage)
      : new Uint8Array(N * N).fill(255);
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

  fillCheckerboard(size = 10): void {
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

  triggerImport(): void {
    this.fileInputRef.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    // Reset so the same file can be re-selected later
    input.value = '';
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const N = this.cellCount;

      if (img.naturalWidth !== N || img.naturalHeight !== N) {
        this.importError =
          `Image must be ${N}×${N} pixels, but the selected file is ` +
          `${img.naturalWidth}×${img.naturalHeight}.`;
        return;
      }

      this.importError = null;

      // Draw to a temporary canvas to read pixel data
      const tmp = document.createElement('canvas');
      tmp.width  = N;
      tmp.height = N;
      const ctx  = tmp.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, N, N);

      // PNG pixels are in row-major order (x varies faster per row).
      // Our image array is column-major (i*N+j where i=column, j=row),
      // so we transpose: png pixel at (x, y) → our index x*N + y.
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const pngBase = (y * N + x) * 4;
          const r = data[pngBase];
          const g = data[pngBase + 1];
          const b = data[pngBase + 2];
          // Perceived luminance
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          this.image[x * N + y] = luma >= 128 ? 255 : 0;
        }
      }

      this.redraw();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.importError = 'Could not read the file. Make sure it is a valid PNG image.';
    };

    img.src = url;
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

    // canvas ImageData is row-major; our array is column-major — transpose on write
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        const v    = this.image[x * N + y];
        const base = (y * N + x) * 4;
        buf[base]     = v;
        buf[base + 1] = v;
        buf[base + 2] = v;
        buf[base + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  private redrawCell(i: number, j: number): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx    = canvas.getContext('2d')!;
    const v      = this.image[i * this.cellCount + j];
    ctx.fillStyle = v === 255 ? '#ffffff' : '#000000';
    // canvas is row-major: fillRect(x, y, w, h) where x=column, y=row → x=i, y=j
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
