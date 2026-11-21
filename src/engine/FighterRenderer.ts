import { MAX_TENSION } from './constants';
import type { Fighter } from './Fighter';
import type { CharacterId, PaletteSlot, SpritePoseKey } from './types';

interface SpriteMetaEntry {
  file: string;
  fileP2: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

type CharacterSpriteSet = {
  meta: Record<string, SpriteMetaEntry>;
  p1: Record<string, HTMLImageElement>;
  p2: Record<string, HTMLImageElement>;
  ready: boolean;
};

export class FighterRenderer {
  private sets: Record<CharacterId, CharacterSpriteSet> = {
    rin: { meta: {}, p1: {}, p2: {}, ready: false },
    lia: { meta: {}, p1: {}, p2: {}, ready: false },
  };
  private flashCanvas: HTMLCanvasElement;
  private flashCtx: CanvasRenderingContext2D;
  private tick = 0;

  constructor() {
    this.flashCanvas = document.createElement('canvas');
    this.flashCanvas.width = 640;
    this.flashCanvas.height = 680;
    const c = this.flashCanvas.getContext('2d');
    if (!c) throw new Error('Unable to create offscreen flash canvas');
    this.flashCtx = c;
    void this.loadCharacter('rin');
    void this.loadCharacter('lia');
  }

  get isReady(): boolean {
    return this.sets.rin.ready && this.sets.lia.ready;
  }

  private async loadCharacter(charId: CharacterId): Promise<void> {
    try {
      const base = `/assets/images/${charId}_sprites`;
      const res = await fetch(`${base}/meta.json`);
      const meta = (await res.json()) as Record<string, SpriteMetaEntry>;
      this.sets[charId].meta = meta;

      const jobs: Promise<void>[] = [];
      for (const [pose, entry] of Object.entries(meta)) {
        jobs.push(
          this.loadImage(`${base}/${entry.file}`).then((img) => {
            this.sets[charId].p1[pose] = img;
          })
        );
        jobs.push(
          this.loadImage(`${base}/${entry.fileP2}`).then((img) => {
            this.sets[charId].p2[pose] = img;
          })
        );
      }
      await Promise.all(jobs);
      this.sets[charId].ready = true;
    } catch {
      // ignore load issues
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = src;
    });
  }

  private getSprite(charId: CharacterId, palette: PaletteSlot, pose: SpritePoseKey): {
    img: HTMLImageElement | undefined;
    meta: SpriteMetaEntry | undefined;
  } {
    const set = this.sets[charId];
    const bank = palette === 2 ? set.p2 : set.p1;
    const fallbackPose = 'stance';
    const img = bank[pose] ?? bank[fallbackPose];
    const meta = set.meta[pose] ?? set.meta[fallbackPose];
    return { img, meta };
  }

  updateTick(): void {
    this.tick++;
  }

  renderReflection(ctx: CanvasRenderingContext2D, f: Fighter): void {
    const pose = f.getActivePose();
    const { img, meta } = this.getSprite(f.charId, f.palette, pose);
    if (!img || !meta || !img.complete || img.naturalWidth === 0) return;

    const drawX = f.x + f.hitShakeX + f.facing * f.attackLungeX;
    ctx.save();
    ctx.translate(drawX, f.y);
    ctx.scale(f.facing * f.squashX, f.squashY);
    if (Math.abs(f.visualRotation) > 0.002) {
      ctx.translate(0, -140);
      ctx.rotate(f.visualRotation);
      ctx.translate(0, 140);
    }
    ctx.drawImage(img, -meta.anchorX, -meta.anchorY, meta.width, meta.height);
    ctx.restore();
  }

  renderFighter(ctx: CanvasRenderingContext2D, f: Fighter, showHitboxes = false): void {
    // 1. Afterimage trails
    for (const ghost of f.afterimages) {
      const { img, meta } = this.getSprite(f.charId, f.palette, ghost.pose);
      if (!img || !meta || !img.complete || img.naturalWidth === 0) continue;
      this.drawTintedGhost(
        ctx,
        img,
        meta,
        ghost.x,
        ghost.y,
        ghost.facing,
        ghost.scaleX,
        ghost.scaleY,
        ghost.rotation,
        ghost.tint,
        ghost.alpha * 0.65
      );
    }

    // 2. Main sprite pinned directly at physical foot position f.y (zero floating walkBob!)
    const pose = f.getActivePose();
    const { img, meta } = this.getSprite(f.charId, f.palette, pose);
    if (!img || !meta || !img.complete || img.naturalWidth === 0) return;

    const drawX = f.x + f.hitShakeX + f.facing * f.attackLungeX;
    const sx = f.squashX;
    const victoryBreath = f.state === 'victory' ? 1 + Math.sin(this.tick * 0.09) * 0.008 : 1;
    const sy = f.squashY * victoryBreath;

    ctx.save();
    ctx.translate(drawX, f.y);

    // Invulnerable wakeup blink / Max Tension overdrive aura
    if (f.invulnFrames > 0 && f.state === 'wakeup' && Math.floor(this.tick / 2) % 2 === 0) {
      ctx.globalAlpha = 0.65;
    }

    if (f.tension >= MAX_TENSION) {
      ctx.shadowColor = f.accentColor;
      ctx.shadowBlur = 18 + Math.sin(this.tick * 0.2) * 8;
    }

    ctx.scale(f.facing * sx, sy);

    if (Math.abs(f.visualRotation) > 0.002) {
      // Rotate around hips/center-of-mass (~145px above foot anchor)
      ctx.translate(0, -145);
      ctx.rotate(f.visualRotation);
      ctx.translate(0, 145);
    }

    ctx.drawImage(img, -meta.anchorX, -meta.anchorY, meta.width, meta.height);
    ctx.restore();

    // 3. Two-stage ArcSys Hit Flash overlay: crisp white impact -> crimson pain flash
    if (f.hitFlashFrames > 0) {
      const isInitialImpact = f.hitFlashFrames >= 4;
      const flashColor = isInitialImpact ? '#ffffff' : '#ff2e58';
      const flashAlpha = isInitialImpact ? 0.85 : 0.48 * (f.hitFlashFrames / 3);
      this.drawTintedGhost(
        ctx,
        img,
        meta,
        drawX,
        f.y,
        f.facing,
        sx,
        sy,
        f.visualRotation,
        flashColor,
        flashAlpha
      );
    }

    // 4. Optional Training Mode Hitbox / Hurtbox Overlay
    if (showHitboxes) {
      const push = f.getPushbox();
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(push.x, push.y, push.w, push.h);

      const hurt = f.getHurtbox();
      if (hurt) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.fillRect(hurt.x, hurt.y, hurt.w, hurt.h);
        ctx.strokeRect(hurt.x, hurt.y, hurt.w, hurt.h);
      }

      const hit = f.getActiveHitbox();
      if (hit) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.30)';
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.98)';
        ctx.fillRect(hit.x, hit.y, hit.w, hit.h);
        ctx.strokeRect(hit.x, hit.y, hit.w, hit.h);
      }
      ctx.restore();
    }
  }

  private drawTintedGhost(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    meta: SpriteMetaEntry,
    x: number,
    y: number,
    facing: 1 | -1,
    scaleX: number,
    scaleY: number,
    rotation: number,
    tint: string,
    alpha: number
  ): void {
    const cw = Math.max(meta.width, 64);
    const ch = Math.max(meta.height, 64);
    if (this.flashCanvas.width < cw || this.flashCanvas.height < ch) {
      this.flashCanvas.width = Math.max(this.flashCanvas.width, cw);
      this.flashCanvas.height = Math.max(this.flashCanvas.height, ch);
    }

    const fc = this.flashCtx;
    fc.clearRect(0, 0, cw, ch);
    fc.globalCompositeOperation = 'source-over';
    fc.drawImage(img, 0, 0, meta.width, meta.height);
    fc.globalCompositeOperation = 'source-in';
    fc.fillStyle = tint;
    fc.fillRect(0, 0, cw, ch);
    fc.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(x, y);
    ctx.scale(facing * scaleX, scaleY);
    if (Math.abs(rotation) > 0.002) {
      ctx.translate(0, -145);
      ctx.rotate(rotation);
      ctx.translate(0, 145);
    }
    ctx.drawImage(this.flashCanvas, 0, 0, meta.width, meta.height, -meta.anchorX, -meta.anchorY, meta.width, meta.height);
    ctx.restore();
  }
}
