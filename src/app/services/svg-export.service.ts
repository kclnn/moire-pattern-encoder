import { Injectable } from '@angular/core';
import { MoireParams } from '../models/moire-params';
import { render } from '../utils/canvas-renderer';
import { MoireStateService } from './moire-state.service';

@Injectable({ providedIn: 'root' })
export class SvgExportService {
  constructor(private state: MoireStateService) {}

  exportCurrentState(): void {
    const params = this.state.currentParams;
    if (params.customPattern) {
      this.exportAsPngInSvg(params);
    } else {
      this.downloadSvg(this.generateUniformSvg(params));
    }
  }

  // ---------------------------------------------------------------------------
  // Custom-pattern export: render to OffscreenCanvas, embed PNG in SVG wrapper
  // ---------------------------------------------------------------------------

  private exportAsPngInSvg(params: MoireParams): void {
    const size   = 2048; // render resolution for export
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    render(canvas, params);

    const dataUrl = canvas.toDataURL('image/png');
    const gs      = params.gridSize;
    const half    = gs / 2;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="${-half} ${-half} ${gs} ${gs}"
     width="${gs}cm" height="${gs}cm">
  <title>Moiré Pattern (custom)</title>
  <image x="${-half}" y="${-half}" width="${gs}" height="${gs}"
         xlink:href="${dataUrl}" image-rendering="pixelated"/>
</svg>`;
    this.downloadSvg(svg, 'moire-custom.svg');
  }

  // ---------------------------------------------------------------------------
  // Uniform moiré export: clean vector SVG with two grid groups
  // ---------------------------------------------------------------------------

  private generateUniformSvg(params: MoireParams): string {
    const { gridSize, viewerX, viewerY, viewerDist, depthGap, bgColor, lineColor } = params;
    const half = gridSize / 2;
    const D    = viewerDist;
    const d    = Math.max(0.001, depthGap);
    const f    = D / (D + d);
    const tx   = viewerX * (1 - f);
    const ty   = viewerY * (1 - f);

    const backTransform = `matrix(${f} 0 0 ${f} ${tx} ${ty})`;
    const rects = this.gridToSvgRects(params);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${-half} ${-half} ${gridSize} ${gridSize}"
     width="${gridSize}cm" height="${gridSize}cm">
  <title>Moiré Pattern</title>
  <rect x="${-half}" y="${-half}" width="${gridSize}" height="${gridSize}" fill="${bgColor}"/>
  <g fill="${lineColor}" transform="${backTransform}">
    ${rects}
  </g>
  <g fill="${lineColor}">
    ${rects}
  </g>
</svg>`;
  }

  private gridToSvgRects(params: MoireParams): string {
    const { cellCount, thicknessRatio, gridSize } = params;
    const period = gridSize / cellCount;
    const T      = thicknessRatio * period;
    const half   = gridSize / 2;
    const parts: string[] = [];

    for (let i = 0; i <= cellCount; i++) {
      const x = -half + i * period - T / 2;
      parts.push(`<rect x="${x.toFixed(4)}" y="${-half}" width="${T.toFixed(4)}" height="${gridSize}"/>`);
    }
    for (let j = 0; j <= cellCount; j++) {
      const y = -half + j * period - T / 2;
      parts.push(`<rect x="${-half}" y="${y.toFixed(4)}" width="${gridSize}" height="${T.toFixed(4)}"/>`);
    }
    return parts.join('\n    ');
  }

  // ---------------------------------------------------------------------------
  // Download helper
  // ---------------------------------------------------------------------------

  private downloadSvg(svgString: string, filename = 'moire.svg'): void {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
