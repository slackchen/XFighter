import { GROUND_Y, LOGICAL_HEIGHT, LOGICAL_WIDTH, STAGE_WIDTH } from './constants';
import type { Camera } from './Camera';
import type { Fighter } from './Fighter';

interface AmbientPetal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vRot: number;
  depth: number; // <1 mid, >1 foreground
  hue: 'sakura' | 'astral';
}

export class StageRenderer {
  private skyImg = new Image();
  private midImg = new Image();
  private floorImg = new Image();
  private loadedCount = 0;

  private petals: AmbientPetal[] = [];
  private tick = 0;

  constructor() {
    const onDone = () => {
      this.loadedCount++;
    };
    this.skyImg.onload = onDone;
    this.midImg.onload = onDone;
    this.floorImg.onload = onDone;

    this.skyImg.src = '/assets/images/stage_sky.png';
    this.midImg.src = '/assets/images/stage_midground.png';
    this.floorImg.src = '/assets/images/stage_floor.png';

    for (let i = 0; i < 54; i++) {
      this.petals.push({
        x: Math.random() * STAGE_WIDTH,
        y: Math.random() * (GROUND_Y + 120),
        vx: -1.4 - Math.random() * 2.2,
        vy: 1.1 + Math.random() * 1.9,
        size: 7 + Math.random() * 11,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.08,
        depth: i < 36 ? 0.65 : 1.32,
        hue: i % 4 === 0 ? 'astral' : 'sakura',
      });
    }
  }

  get isReady(): boolean {
    return this.loadedCount >= 3;
  }

  update(): void {
    this.tick++;
    for (const p of this.petals) {
      p.x += p.vx * p.depth + Math.sin(this.tick * 0.03 + p.y * 0.01) * 0.7;
      p.y += p.vy * p.depth;
      p.rot += p.vRot;
      if (p.y > GROUND_Y + 150) {
        p.y = -40;
        p.x = Math.random() * (STAGE_WIDTH + 300);
      }
      if (p.x < -80) {
        p.x = STAGE_WIDTH + 80;
      }
    }
  }

  renderBackground(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    superFreezeFrames: number,
    superColor: string
  ): void {
    const camOffset = camera.x - STAGE_WIDTH * 0.5;
    const camYOffset = camera.y - (GROUND_Y - 265);

    // 1. Far Sky Layer (Screen-space 0.14x parallax, overscanned for high-jump lift & shake safety)
    ctx.save();
    ctx.fillStyle = '#090918';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    if (this.skyImg.complete && this.skyImg.naturalWidth > 0) {
      const overscan = 1.28;
      const drawW = LOGICAL_WIDTH * overscan;
      const drawH = LOGICAL_HEIGHT * overscan;
      const sx = (LOGICAL_WIDTH - drawW) * 0.5 - camOffset * 0.12 + camera.shakeOffsetX * 0.15;
      const sy = (LOGICAL_HEIGHT - drawH) * 0.5 - camYOffset * 0.12 + camera.shakeOffsetY * 0.15;
      ctx.drawImage(this.skyImg, sx, sy, drawW, drawH);

      // Pulsing Crimson Moon atmospheric bloom
      const moonX = sx + drawW * 0.5;
      const moonY = sy + drawH * 0.25;
      const pulse = 0.24 + Math.sin(this.tick * 0.035) * 0.05;
      const moonGrad = ctx.createRadialGradient(moonX, moonY, 30, moonX, moonY, 440);
      moonGrad.addColorStop(0, `rgba(255, 110, 120, ${pulse})`);
      moonGrad.addColorStop(0.5, `rgba(255, 50, 90, ${pulse * 0.4})`);
      moonGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = moonGrad;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 2. Midground Shrine Architecture & Weeping Sakura (0.42x parallax)
    if (this.midImg.complete && this.midImg.naturalWidth > 0) {
      const midW = LOGICAL_WIDTH * 1.38;
      const midH = LOGICAL_HEIGHT * 1.16;
      const mx = (LOGICAL_WIDTH - midW) * 0.5 - camOffset * 0.42 + camera.shakeOffsetX * 0.42;
      const my = LOGICAL_HEIGHT - midH - 90 - camYOffset * 0.34 + camera.shakeOffsetY * 0.35;
      ctx.drawImage(this.midImg, mx, my, midW, midH);

      // Soft warm golden glow behind center shrine pavilion lanterns
      const glowAlpha = 0.18 + Math.sin(this.tick * 0.06) * 0.05;
      const lg = ctx.createRadialGradient(
        mx + midW * 0.5,
        my + midH * 0.72,
        15,
        mx + midW * 0.5,
        my + midH * 0.72,
        290
      );
      lg.addColorStop(0, `rgba(255, 195, 90, ${glowAlpha})`);
      lg.addColorStop(1, 'rgba(255, 140, 40, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Super Flash dramatic background veil + radial anime speedlines!
    if (superFreezeFrames > 0) {
      ctx.fillStyle = 'rgba(4, 6, 22, 0.78)';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      ctx.save();
      ctx.translate(LOGICAL_WIDTH * 0.5, LOGICAL_HEIGHT * 0.5);
      ctx.globalCompositeOperation = 'lighter';
      const lineCount = 46;
      for (let i = 0; i < lineCount; i++) {
        const angle = (Math.PI * 2 * i) / lineCount + this.tick * 0.04;
        const innerR = 260 + ((i * 37 + this.tick * 19) % 180);
        const outerR = 1280;
        ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : superColor;
        ctx.globalAlpha = 0.28 + ((i % 4) * 0.12);
        ctx.lineWidth = i % 2 === 0 ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
        ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  renderWorldFloorAndReflections(
    ctx: CanvasRenderingContext2D,
    fighters: Fighter[],
    renderReflectionFn: (ctx: CanvasRenderingContext2D, fighter: Fighter) => void
  ): void {
    const floorTop = GROUND_Y - 125;
    const floorBottom = GROUND_Y + 420;
    const floorHeight = floorBottom - floorTop;

    // 1. Perspective-projected shrine stone floor strips
    ctx.save();
    const baseGrad = ctx.createLinearGradient(0, floorTop, 0, floorBottom);
    baseGrad.addColorStop(0, '#0e1124');
    baseGrad.addColorStop(0.28, '#171c36');
    baseGrad.addColorStop(1, '#090b16');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(-400, floorTop, STAGE_WIDTH + 800, floorHeight);

    if (this.floorImg.complete && this.floorImg.naturalWidth > 0) {
      const tw = this.floorImg.naturalWidth;
      const th = this.floorImg.naturalHeight;
      const strips = 26;
      const stripDestH = floorHeight / strips;
      const stageCenter = STAGE_WIDTH * 0.5;

      for (let s = 0; s < strips; s++) {
        const t0 = s / strips;
        const t1 = (s + 1) / strips;
        const persp = 0.72 + t0 * 0.78;
        const srcY = Math.floor(t0 * (th - 1));
        const srcH = Math.max(2, Math.ceil((t1 - t0) * th));
        const destY = floorTop + s * stripDestH;
        const tileDestW = 540 * persp;

        ctx.globalAlpha = 0.42 + t0 * 0.42;
        for (let k = -4; k <= 4; k++) {
          const dx = stageCenter + k * tileDestW - tileDestW * 0.5;
          ctx.drawImage(this.floorImg, 0, srcY, tw, srcH, dx, destY, tileDestW + 1.5, stripDestH + 1.5);
        }
      }
    }

    // Crisp atmospheric mist & golden horizon line along the back edge of the arena
    ctx.globalAlpha = 1;
    const horizonGlow = ctx.createLinearGradient(0, floorTop - 16, 0, floorTop + 80);
    horizonGlow.addColorStop(0, 'rgba(14, 15, 34, 0.92)');
    horizonGlow.addColorStop(0.32, 'rgba(255, 110, 145, 0.18)');
    horizonGlow.addColorStop(1, 'rgba(14, 15, 34, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(-400, floorTop - 16, STAGE_WIDTH + 800, 96);

    // Subtle sacred duel ring under center stage
    ctx.strokeStyle = 'rgba(255, 200, 120, 0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(STAGE_WIDTH * 0.5, GROUND_Y + 12, 620, 56, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Wet-stone subtle mirrored fighter reflections
    ctx.save();
    ctx.beginPath();
    ctx.rect(-300, GROUND_Y - 10, STAGE_WIDTH + 600, 360);
    ctx.clip();
    for (const f of fighters) {
      ctx.save();
      ctx.globalAlpha = 0.17;
      ctx.translate(0, GROUND_Y * 2 + 12);
      ctx.scale(1, -0.45);
      renderReflectionFn(ctx, f);
      ctx.restore();
    }
    ctx.restore();

    // 3. Soft ground contact shadows (wider & darker when crouched/braced/landing/knocked down)
    for (const f of fighters) {
      const airHeight = Math.max(0, GROUND_Y - f.y);
      const isDown = (f.state === 'knockdown' || f.state === 'ko') && f.isGrounded;
      const isLowWeight =
        f.state === 'crouch' ||
        f.state === 'block_low' ||
        f.state === 'jumpsquat' ||
        f.state === 'land' ||
        f.state === 'dash_brake';
      const weightBoost = isDown ? 1.45 : isLowWeight ? 1.15 : 1.0;
      const airRatio = Math.max(0.32, 1 - airHeight / 780);
      const shadowScale = airRatio * weightBoost;
      const alphaCore = (isLowWeight || isDown ? 0.84 : 0.74) * airRatio;
      const shadGrad = ctx.createRadialGradient(f.x, GROUND_Y + 4, 8, f.x, GROUND_Y + 4, 124 * shadowScale);
      shadGrad.addColorStop(0, `rgba(4, 4, 14, ${alphaCore})`);
      shadGrad.addColorStop(1, 'rgba(4, 4, 14, 0)');
      ctx.fillStyle = shadGrad;
      ctx.beginPath();
      ctx.ellipse(f.x, GROUND_Y + 4, 128 * shadowScale, 28 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  renderAmbientPetals(ctx: CanvasRenderingContext2D, layer: 'mid' | 'front'): void {
    ctx.save();
    for (const p of this.petals) {
      const isFront = p.depth > 1.0;
      if ((layer === 'front') !== isFront) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = isFront ? 0.62 : 0.78;
      if (p.hue === 'sakura') {
        ctx.fillStyle = isFront ? '#ff7aa8' : '#ffa6c9';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#7de8ff';
        ctx.shadowColor = '#2ad8ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
