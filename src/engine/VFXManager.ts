import type { Fighter } from './Fighter';
import type { CharacterId, MoveVfxSpec, Projectile } from './types';

interface SlashArcEffect {
  ownerSlot?: 1 | 2;
  localOffsetX: number;
  localOffsetY: number;
  x: number;
  y: number;
  facing: 1 | -1;
  radiusX: number;
  radiusY: number;
  startAngle: number;
  endAngle: number;
  color: string;
  thickness: number;
  age: number;
  maxAge: number;
}

interface ThrustBeamEffect {
  ownerSlot?: 1 | 2;
  localOffsetX: number;
  localOffsetY: number;
  x: number;
  y: number;
  facing: 1 | -1;
  length: number;
  width: number;
  angle: number;
  spiralRings: boolean;
  color: string;
  age: number;
  maxAge: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  scaleY: number;
  rotation: number;
  color: string;
  age: number;
  maxAge: number;
  lineWidth: number;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  kind: 'shard' | 'petal' | 'crystal' | 'dust' | 'streak';
  rot: number;
  vRot: number;
  age: number;
  maxAge: number;
}

interface GroundCrack {
  x: number;
  y: number;
  lines: { dx1: number; dy1: number; dx2: number; dy2: number }[];
  age: number;
  maxAge: number;
}

interface GuardBarrierEffect {
  x: number;
  y: number;
  facing: 1 | -1;
  color: string;
  age: number;
  maxAge: number;
}

interface SuperSpectacle {
  charId: CharacterId;
  color: string;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  age: number;
  maxAge: number;
  slashLines: { x1: number; y1: number; x2: number; y2: number; delay: number; width: number }[];
}

export class VFXManager {
  private slashes: SlashArcEffect[] = [];
  private beams: ThrustBeamEffect[] = [];
  private rings: ShockwaveRing[] = [];
  private particles: SparkParticle[] = [];
  private cracks: GroundCrack[] = [];
  private guards: GuardBarrierEffect[] = [];
  private spectacles: SuperSpectacle[] = [];

  impactFrameTimer = 0;

  clear(): void {
    this.slashes = [];
    this.beams = [];
    this.rings = [];
    this.particles = [];
    this.cracks = [];
    this.guards = [];
    this.spectacles = [];
    this.impactFrameTimer = 0;
  }

  triggerImpactFrame(frames = 2): void {
    this.impactFrameTimer = Math.max(this.impactFrameTimer, frames);
  }

  spawnMoveVfx(
    fighterX: number,
    fighterY: number,
    facing: 1 | -1,
    vfx?: MoveVfxSpec,
    colorOverride?: string,
    ownerSlot?: 1 | 2,
    scale = 1.0
  ): void {
    if (!vfx) return;
    if (vfx.slashArc) {
      const s = vfx.slashArc;
      this.slashes.push({
        ownerSlot: s.trackOwner ? ownerSlot : undefined,
        localOffsetX: s.offsetX,
        localOffsetY: s.offsetY,
        x: fighterX + facing * s.offsetX,
        y: fighterY + s.offsetY,
        facing,
        radiusX: s.radiusX * scale,
        radiusY: s.radiusY * scale,
        startAngle: s.startAngle,
        endAngle: s.endAngle,
        color: colorOverride ?? s.color,
        thickness: s.thickness * scale,
        age: 0,
        maxAge: 13,
      });
    }
    if (vfx.thrustBeam) {
      const b = vfx.thrustBeam;
      this.beams.push({
        ownerSlot: b.trackOwner ? ownerSlot : undefined,
        localOffsetX: b.offsetX,
        localOffsetY: b.offsetY,
        x: fighterX + facing * b.offsetX,
        y: fighterY + b.offsetY,
        facing,
        length: b.length * scale,
        width: b.width * scale,
        angle: b.angle ?? 0,
        spiralRings: Boolean(b.spiralRings),
        color: colorOverride ?? b.color,
        age: 0,
        maxAge: 14,
      });
    }
  }

  spawnAirDashBurst(x: number, y: number, dir: 1 | -1, color: string): void {
    // Crisp aerodynamic sonic shock ring perpendicular to dash vector
    this.rings.push({
      x: x - dir * 30,
      y,
      radius: 18,
      maxRadius: 135,
      scaleY: 1.0,
      rotation: 0,
      color,
      age: 0,
      maxAge: 14,
      lineWidth: 9,
    });
    this.rings.push({
      x: x - dir * 24,
      y,
      radius: 10,
      maxRadius: 90,
      scaleY: 1.0,
      rotation: 0,
      color: '#ffffff',
      age: 0,
      maxAge: 11,
      lineWidth: 5,
    });
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: x - dir * (10 + Math.random() * 65),
        y: y + (Math.random() - 0.5) * 140,
        vx: -dir * (10 + Math.random() * 14),
        vy: (Math.random() - 0.5) * 2.2,
        size: 32 + Math.random() * 38,
        color: i % 3 === 0 ? '#ffffff' : color,
        kind: 'streak',
        rot: 0,
        vRot: 0,
        age: 0,
        maxAge: 12 + Math.floor(Math.random() * 6),
      });
    }
  }

  spawnGroundImpact(x: number, y: number, color = '#cbd5e1'): void {
    // Expanding horizontal ground shockwave ellipse
    this.rings.push({
      x,
      y: y - 4,
      radius: 26,
      maxRadius: 210,
      scaleY: 0.28,
      rotation: 0,
      color,
      age: 0,
      maxAge: 16,
      lineWidth: 8,
    });
    // Ground fissure crack lines radiating from impact point
    const lines = [];
    for (let i = 0; i < 7; i++) {
      const ang = (Math.PI * i) / 6 + (Math.random() - 0.5) * 0.2;
      const len = 55 + Math.random() * 65;
      lines.push({
        dx1: Math.cos(ang) * 10,
        dy1: Math.sin(ang) * 3,
        dx2: Math.cos(ang) * len,
        dy2: (Math.random() - 0.35) * 22,
      });
    }
    this.cracks.push({ x, y: y - 2, lines, age: 0, maxAge: 38 });
    this.spawnDust(x, y, 0, 12);
  }

  spawnHitSpark(
    x: number,
    y: number,
    color: string,
    strength: 'light' | 'medium' | 'heavy' | 'super',
    charId: CharacterId
  ): void {
    const count = strength === 'super' ? 28 : strength === 'heavy' ? 20 : strength === 'medium' ? 13 : 8;
    const maxR = strength === 'super' ? 230 : strength === 'heavy' ? 175 : strength === 'medium' ? 120 : 80;
    this.rings.push({
      x,
      y,
      radius: 18,
      maxRadius: maxR,
      scaleY: 1.0,
      rotation: 0,
      color,
      age: 0,
      maxAge: strength === 'heavy' || strength === 'super' ? 18 : 12,
      lineWidth: strength === 'heavy' || strength === 'super' ? 12 : 7,
    });
    if (strength === 'heavy' || strength === 'super') {
      this.rings.push({
        x,
        y,
        radius: 8,
        maxRadius: maxR * 0.65,
        scaleY: 1.0,
        rotation: 0,
        color: '#ffffff',
        age: 0,
        maxAge: 14,
        lineWidth: 6,
      });
    }

    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = (strength === 'heavy' || strength === 'super' ? 9 : 6) + Math.random() * 14;
      const kind: SparkParticle['kind'] =
        i % 3 === 0 ? (charId === 'rin' ? 'petal' : 'crystal') : 'shard';
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 10 + Math.random() * 16,
        color: i % 4 === 0 ? '#ffffff' : color,
        kind,
        rot: ang,
        vRot: (Math.random() - 0.5) * 0.35,
        age: 0,
        maxAge: 14 + Math.floor(Math.random() * 14),
      });
    }
  }

  spawnHitRecoilBurst(
    x: number,
    y: number,
    knockDir: 1 | -1,
    strength: 'light' | 'medium' | 'heavy' | 'super',
    color: string
  ): void {
    const streakCount = strength === 'super' ? 14 : strength === 'heavy' ? 10 : strength === 'medium' ? 7 : 4;
    const baseAngle = knockDir === 1 ? 0 : Math.PI;
    for (let i = 0; i < streakCount; i++) {
      const ang = baseAngle + (Math.random() - 0.5) * 0.96;
      const spd = (strength === 'heavy' || strength === 'super' ? 15 : 10) + Math.random() * 11;
      const isStreak = i % 2 === 0;
      this.particles.push({
        x: x + knockDir * (12 + Math.random() * 24),
        y: y + (Math.random() - 0.5) * 110,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.2,
        size: isStreak ? 22 + Math.random() * 26 : 8 + Math.random() * 9,
        color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ff4d6d' : color,
        kind: isStreak ? 'streak' : 'shard',
        rot: ang,
        vRot: isStreak ? 0 : (Math.random() - 0.5) * 0.3,
        age: 0,
        maxAge: (isStreak ? 10 : 14) + Math.floor(Math.random() * 5),
      });
    }
  }

  spawnGuardSpark(x: number, y: number, facing: 1 | -1, color: string): void {
    this.guards.push({ x, y, facing, color, age: 0, maxAge: 14 });
    for (let i = 0; i < 9; i++) {
      const ang = (Math.random() - 0.5) * 2.2 + (facing === 1 ? Math.PI : 0);
      const spd = 5 + Math.random() * 10;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 8 + Math.random() * 10,
        color: i % 2 === 0 ? '#93e5ff' : '#ffffff',
        kind: 'shard',
        rot: ang,
        vRot: 0,
        age: 0,
        maxAge: 12,
      });
    }
  }

  spawnDust(x: number, y: number, dirX: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 65,
        y: y - 6 - Math.random() * 14,
        vx: dirX * (2.5 + Math.random() * 5.5) + (Math.random() - 0.5) * 4.5,
        vy: -0.6 - Math.random() * 2.4,
        size: 26 + Math.random() * 28,
        color: 'rgba(220, 226, 248, 0.45)',
        kind: 'dust',
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.08,
        age: 0,
        maxAge: 18 + Math.floor(Math.random() * 10),
      });
    }
  }

  spawnSuperSpectacle(
    charId: CharacterId,
    color: string,
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    facing: 1 | -1
  ): void {
    const slashLines: SuperSpectacle['slashLines'] = [];
    if (charId === 'rin') {
      const angles = [-0.55, 0.48, -0.22, 0.85, -0.95, 0.15, -0.45];
      for (let i = 0; i < angles.length; i++) {
        const a = angles[i];
        const len = i === angles.length - 1 ? 760 : 520;
        const cx = targetX + (Math.random() - 0.5) * 140;
        const cy = targetY - 190 + (Math.random() - 0.5) * 140;
        slashLines.push({
          x1: cx - Math.cos(a) * len * 0.5,
          y1: cy - Math.sin(a) * len * 0.5,
          x2: cx + Math.cos(a) * len * 0.5,
          y2: cy + Math.sin(a) * len * 0.5,
          delay: i * 5,
          width: i === angles.length - 1 ? 32 : 16,
        });
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const lx = targetX + (i - 2) * 105;
        slashLines.push({
          x1: lx - facing * 140,
          y1: targetY - 820,
          x2: lx + facing * 35,
          y2: targetY + 40,
          delay: i * 7,
          width: i === 2 ? 48 : 30,
        });
      }
    }

    this.spectacles.push({
      charId,
      color,
      originX,
      originY,
      targetX,
      targetY,
      facing,
      age: 0,
      maxAge: 46,
      slashLines,
    });
  }

  update(freezeFrame: boolean, fighters?: Fighter[]): void {
    if (this.impactFrameTimer > 0) this.impactFrameTimer--;
    if (freezeFrame) return;

    const findOwner = (slot?: 1 | 2) => (slot && fighters ? fighters.find((f) => f.slot === slot) : undefined);

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      const owner = findOwner(s.ownerSlot);
      if (owner) {
        s.x = owner.x + owner.facing * s.localOffsetX;
        s.y = owner.y + s.localOffsetY;
        s.facing = owner.facing;
      }
      s.age++;
      if (s.age >= s.maxAge) this.slashes.splice(i, 1);
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      const owner = findOwner(b.ownerSlot);
      if (owner) {
        b.x = owner.x + owner.facing * b.localOffsetX;
        b.y = owner.y + b.localOffsetY;
        b.facing = owner.facing;
      }
      b.age++;
      if (b.age >= b.maxAge) this.beams.splice(i, 1);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].age++;
      if (this.rings[i].age >= this.rings[i].maxAge) this.rings.splice(i, 1);
    }
    for (let i = this.cracks.length - 1; i >= 0; i--) {
      this.cracks[i].age++;
      if (this.cracks[i].age >= this.cracks[i].maxAge) this.cracks.splice(i, 1);
    }
    for (let i = this.guards.length - 1; i >= 0; i--) {
      this.guards[i].age++;
      if (this.guards[i].age >= this.guards[i].maxAge) this.guards.splice(i, 1);
    }
    for (let i = this.spectacles.length - 1; i >= 0; i--) {
      this.spectacles[i].age++;
      if (this.spectacles[i].age >= this.spectacles[i].maxAge) this.spectacles.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age++;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vRot;
      if (p.kind === 'dust') {
        p.vx *= 0.94;
        p.size *= 1.022;
      } else if (p.kind === 'streak') {
        p.vx *= 0.92;
      } else {
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
      if (p.age >= p.maxAge) this.particles.splice(i, 1);
    }
  }

  renderProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[]): void {
    for (const p of projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const s = p.scale ?? 1.0;
      ctx.scale(p.facing * s, s);
      ctx.globalCompositeOperation = 'lighter';

      if (p.kind === 'sakura_wave') {
        const pulse = 1 + Math.sin(p.age * 0.45) * 0.08;
        ctx.scale(pulse, pulse);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 28;

        ctx.beginPath();
        ctx.arc(-18, 0, 82, -1.05, 1.05, false);
        ctx.arc(-44, 0, 74, 1.05, -1.05, true);
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(-14, 0, 78, -0.95, 0.95, false);
        ctx.arc(-28, 0, 72, 0.95, -0.95, true);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        for (let k = 0; k < 4; k++) {
          const ox = -35 - k * 24;
          const oy = Math.sin(p.age * 0.5 + k * 1.6) * 32;
          ctx.fillStyle = k % 2 === 0 ? '#ffd1e0' : p.color;
          ctx.beginPath();
          ctx.ellipse(ox, oy, 10, 5, p.age * 0.2 + k, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 28;

        const grad = ctx.createLinearGradient(-110, 0, 90, 0);
        grad.addColorStop(0, 'rgba(42,216,255,0)');
        grad.addColorStop(0.45, p.color);
        grad.addColorStop(1, '#ffffff');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(95, 0);
        ctx.lineTo(15, -24);
        ctx.lineTo(-125, -8);
        ctx.lineTo(-95, 0);
        ctx.lineTo(-125, 8);
        ctx.lineTo(15, 24);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(88, 0);
        ctx.lineTo(18, -10);
        ctx.lineTo(-70, 0);
        ctx.lineTo(18, 10);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#b8f5ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(-12, 0, 14, 34, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  renderEffects(ctx: CanvasRenderingContext2D): void {
    // 0. Ground impact fissure cracks
    for (const c of this.cracks) {
      const alpha = 1 - Math.max(0, (c.age - 14) / Math.max(1, c.maxAge - 14));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#090b16';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (const l of c.lines) {
        ctx.beginPath();
        ctx.moveTo(l.dx1, l.dy1);
        ctx.lineTo(l.dx2, l.dy2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255, 212, 102, 0.35)';
      ctx.lineWidth = 1.5;
      for (const l of c.lines) {
        ctx.beginPath();
        ctx.moveTo(l.dx1, l.dy1 - 1);
        ctx.lineTo(l.dx2 * 0.65, l.dy2 - 1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 1. Soft gradient wispy dust puffs (zero hard-edge circles!)
    for (const p of this.particles) {
      if (p.kind !== 'dust') continue;
      const t = 1 - p.age / p.maxAge;
      ctx.save();
      ctx.globalAlpha = t * 0.52;
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.size);
      g.addColorStop(0, 'rgba(226, 232, 248, 0.85)');
      g.addColorStop(0.55, 'rgba(180, 195, 230, 0.35)');
      g.addColorStop(1, 'rgba(140, 160, 210, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 2. Progressive Sweeping Tapered Slash Arcs
    for (const s of this.slashes) {
      const progress = s.age / s.maxAge;
      const alpha = Math.sin((1 - progress) * Math.PI * 0.5);
      const sweepT = Math.min(1, progress * 3.2);
      const curEnd = s.startAngle + (s.endAngle - s.startAngle) * sweepT;
      const curStart = s.startAngle + (s.endAngle - s.startAngle) * Math.max(0, (progress - 0.25) * 0.85);

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.facing, 1);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 22;

      const anticlockwise = s.endAngle < s.startAngle;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.thickness * (1 - progress * 0.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(0, 0, s.radiusX, s.radiusY, 0, curStart, curEnd, anticlockwise);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(3, s.thickness * 0.38 * (1 - progress * 0.35));
      ctx.beginPath();
      ctx.ellipse(0, 0, s.radiusX * 1.02, s.radiusY * 1.02, 0, curStart, curEnd, anticlockwise);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Angled Weapon-Aligned Thrust Beams & Spiral Drill Vortices
    for (const b of this.beams) {
      const progress = b.age / b.maxAge;
      const alpha = 1 - progress;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.facing, 1);
      ctx.rotate(b.angle);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 24;

      const curLen = b.length * (0.7 + 0.38 * Math.min(1, progress * 3.5));
      const curW = b.width * (1 - progress * 0.6);

      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(curLen, 0);
      ctx.lineTo(0, -curW * 0.5);
      ctx.lineTo(-32, 0);
      ctx.lineTo(0, curW * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(curLen * 0.94, 0);
      ctx.lineTo(8, -curW * 0.22);
      ctx.lineTo(-14, 0);
      ctx.lineTo(8, curW * 0.22);
      ctx.closePath();
      ctx.fill();

      // Helical rotating vortex rings for Lia's Spiral Drive & Super
      if (b.spiralRings) {
        for (let r = 0; r < 3; r++) {
          const rx = ((r * 0.3 + progress * 1.4) % 1) * curLen * 0.85;
          const ry = curW * (0.68 - r * 0.12);
          ctx.strokeStyle = r % 2 === 0 ? '#ffffff' : b.color;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(rx, 0, 14, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 4. Guard Hex Barriers
    for (const g of this.guards) {
      const t = 1 - g.age / g.maxAge;
      ctx.save();
      ctx.translate(g.x + g.facing * 55, g.y);
      ctx.globalAlpha = t;
      ctx.strokeStyle = '#8ef0ff';
      ctx.fillStyle = 'rgba(80, 210, 255, 0.22)';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#2ad8ff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      const r = 68 + (1 - t) * 28;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = Math.cos(a) * r * 0.72;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 5. Shockwave Rings (circular or elliptical ground rings)
    for (const r of this.rings) {
      const t = r.age / r.maxAge;
      const rad = r.radius + (r.maxRadius - r.radius) * (1 - Math.pow(1 - t, 2.5));
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rotation);
      ctx.scale(1, r.scaleY);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lineWidth * (1 - t * 0.7);
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Super Art Full-Screen Spectacles
    for (const sp of this.spectacles) {
      ctx.save();
      if (sp.charId === 'lia') {
        const t = sp.age / sp.maxAge;
        const alpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.65) / 0.35);
        ctx.save();
        ctx.translate(sp.targetX, sp.targetY - 560);
        ctx.scale(1.3, 0.42);
        ctx.rotate(sp.age * 0.045);
        ctx.globalAlpha = alpha * 0.92;
        ctx.strokeStyle = sp.color;
        ctx.shadowColor = sp.color;
        ctx.shadowBlur = 24;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 230, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 175, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a1 = (Math.PI * 2 * k) / 6;
          const a2 = (Math.PI * 2 * ((k + 2) % 6)) / 6;
          ctx.moveTo(Math.cos(a1) * 225, Math.sin(a1) * 225);
          ctx.lineTo(Math.cos(a2) * 225, Math.sin(a2) * 225);
        }
        ctx.stroke();
        ctx.restore();
      } else {
        const t = sp.age / sp.maxAge;
        const alpha = t < 0.2 ? t / 0.2 : 1 - t;
        ctx.save();
        ctx.translate(sp.targetX, sp.targetY - 210);
        ctx.globalAlpha = alpha * 0.72;
        ctx.strokeStyle = sp.color;
        ctx.shadowColor = sp.color;
        ctx.shadowBlur = 32;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 240 + t * 80, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const line of sp.slashLines) {
        const localAge = sp.age - line.delay;
        if (localAge < 0 || localAge > 22) continue;
        const lt = localAge / 22;
        ctx.save();
        ctx.globalAlpha = 1 - lt;
        ctx.strokeStyle = sp.color;
        ctx.lineWidth = line.width * (1 - lt * 0.65);
        ctx.shadowColor = sp.color;
        ctx.shadowBlur = 28;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(3, line.width * 0.34 * (1 - lt * 0.5));
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // 7. Sparks, Petals, Crystals & Air-Dash Speed Streaks
    for (const p of this.particles) {
      if (p.kind === 'dust') continue;
      const t = 1 - p.age / p.maxAge;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;

      if (p.kind === 'streak') {
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.lineTo(p.size, 0);
        ctx.stroke();
      } else if (p.kind === 'shard') {
        ctx.beginPath();
        ctx.moveTo(p.size * 1.4, 0);
        ctx.lineTo(0, -p.size * 0.25);
        ctx.lineTo(-p.size * 0.7, 0);
        ctx.lineTo(0, p.size * 0.25);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'petal') {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 0.65, p.size * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -p.size * 0.8);
        ctx.lineTo(p.size * 0.45, 0);
        ctx.lineTo(0, p.size * 0.8);
        ctx.lineTo(-p.size * 0.45, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
