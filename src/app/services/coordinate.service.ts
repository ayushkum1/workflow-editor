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

  /**
   * Translates screen coordinates (clientX/Y) to SVG World coordinates.
   */
  screenToWorld(screenX: number, screenY: number, svgElement: SVGSVGElement) {
    const CTM = svgElement.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };

    return {
      x: (screenX - CTM.e) / CTM.a,
      y: (screenY - CTM.f) / CTM.d,
    };
  }
}
