import { GROUND_Y, LOGICAL_HEIGHT, LOGICAL_WIDTH, STAGE_WIDTH } from './constants';

export class Camera {
  x = STAGE_WIDTH * 0.5;
  y = GROUND_Y - 255;
  zoom = 1.0;

  private targetZoom = 1.0;
  private shakePower = 0;
  private shakeDirX = 0;
  private shakeDirY = 0;
  shakeOffsetX = 0;
  shakeOffsetY = 0;

  private focusOverrideFrames = 0;
  private focusX = STAGE_WIDTH * 0.5;
  private focusY = GROUND_Y - 255;
  private focusZoom = 1.24;

  reset(): void {
    this.x = STAGE_WIDTH * 0.5;
    this.y = GROUND_Y - 255;
    this.zoom = 1.0;
    this.targetZoom = 1.0;
    this.shakePower = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.focusOverrideFrames = 0;
  }

  addShake(power: number, dirX = 0, dirY = 0): void {
    this.shakePower = Math.min(48, Math.max(this.shakePower, power));
    this.shakeDirX = dirX;
    this.shakeDirY = dirY;
  }

  triggerCinematicFocus(x: number, y: number, zoom: number, frames: number): void {
    this.focusOverrideFrames = frames;
    this.focusX = x;
    this.focusY = y;
    this.focusZoom = zoom;
  }

  update(p1X: number, p1Y: number, p2X: number, p2Y: number): void {
    let destX: number;
    let destY: number;

    if (this.focusOverrideFrames > 0) {
      this.focusOverrideFrames--;
      destX = this.focusX;
      destY = this.focusY;
      this.targetZoom = this.focusZoom;
    } else {
      destX = (p1X + p2X) * 0.5;
      const highestY = Math.min(p1Y, p2Y);
      const highestAir = Math.max(0, GROUND_Y - highestY);
      const lift = highestAir * 0.52;
      destY = GROUND_Y - 265 - lift;

      const dist = Math.abs(p1X - p2X);
      // Close = 1.14x zoom in; far = 0.89x; high jump zooms out gently to keep apex below top HUD
      const t = Math.max(0, Math.min(1, (dist - 320) / 1150));
      const airZoomOut = Math.min(0.22, highestAir / 1550);
      this.targetZoom = Math.max(0.77, 1.14 - t * 0.25 - airZoomOut);
    }

    this.zoom += (this.targetZoom - this.zoom) * 0.12;

    const halfViewW = (LOGICAL_WIDTH * 0.5) / this.zoom;
    const minX = halfViewW;
    const maxX = STAGE_WIDTH - halfViewW;
    if (minX <= maxX) {
      destX = Math.max(minX, Math.min(maxX, destX));
    } else {
      destX = STAGE_WIDTH * 0.5;
    }

    const halfViewH = (LOGICAL_HEIGHT * 0.5) / this.zoom;
    const maxCenterY = STAGE_WIDTH > 0 ? GROUND_Y + 145 - halfViewH : destY;
    destY = Math.min(maxCenterY, destY);

    this.x += (destX - this.x) * 0.16;
    this.y += (destY - this.y) * 0.16;

    if (this.shakePower > 0.4) {
      this.shakeOffsetX = (Math.random() * 2 - 1) * this.shakePower + this.shakeDirX * this.shakePower * 0.35;
      this.shakeOffsetY = (Math.random() * 2 - 1) * this.shakePower * 0.75 + this.shakeDirY * this.shakePower * 0.25;
      this.shakePower *= 0.80;
    } else {
      this.shakePower = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(LOGICAL_WIDTH * 0.5 + this.shakeOffsetX, LOGICAL_HEIGHT * 0.5 + this.shakeOffsetY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + LOGICAL_WIDTH * 0.5 + this.shakeOffsetX,
      y: (wy - this.y) * this.zoom + LOGICAL_HEIGHT * 0.5 + this.shakeOffsetY,
    };
  }
}
