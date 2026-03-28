import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
<div class="app-layout">
  <mat-toolbar color="primary" class="toolbar">
    <mat-icon class="toolbar-icon">grid_on</mat-icon>
    <span>Moiré Pattern Visualizer</span>
  </mat-toolbar>

  <mat-sidenav-container class="sidenav-container">
    <mat-sidenav mode="side" opened class="sidenav">
      <app-control-panel></app-control-panel>
    </mat-sidenav>
    <mat-sidenav-content class="canvas-area">
      <app-moire-canvas></app-moire-canvas>
    </mat-sidenav-content>
  </mat-sidenav-container>
</div>
`,
  styles: [`
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.toolbar {
  flex-shrink: 0;
  gap: 8px;
}

.toolbar-icon {
  margin-right: 4px;
}

.sidenav-container {
  flex: 1;
  overflow: hidden;
}

.sidenav {
  width: 320px;
  border-right: 1px solid rgba(0, 0, 0, 0.12);
}

.canvas-area {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
`],
})
export class AppComponent {}
