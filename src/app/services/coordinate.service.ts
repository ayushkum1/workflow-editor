import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CoordinateService {
  translateX: number = 0;
  translateY: number = 0;
  scale: number = 1;

  readonly MAX_SCALE = 3;
  readonly MIN_SCALE = 0.2;
  readonly STEP = 0.1;

  zoomIn(): void {
    this.scale = Math.min(this.scale + this.STEP, this.MAX_SCALE);
  }

  zoomOut(): void {
    this.scale = Math.max(this.scale - this.STEP, this.MIN_SCALE);
  }

  resetZoom(): void {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
  }

  screenToWorld(screenX: number, screenY: number, svgElement: SVGSVGElement) {
    const rect = svgElement.getBoundingClientRect();
    const localX = screenX - rect.left;
    const localY = screenY - rect.top;

    return {
      x: (localX - this.translateX) / this.scale,
      y: (localY - this.translateY) / this.scale,
    };
  }
}
