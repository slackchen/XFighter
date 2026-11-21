import { AIController } from './AIController';
import type { AudioManager } from './AudioManager';
import type { Camera } from './Camera';
import {
  GROUND_Y,
  LOGICAL_WIDTH,
  MAX_TENSION,
  ROUND_TIME_SECONDS,
  ROUNDS_TO_WIN,
  STAGE_LEFT,
  STAGE_RIGHT,
  STAGE_WIDTH,
  SUPER_FLASH_FRAMES,
} from './constants';
import { Fighter, type LocomotionEvents } from './Fighter';
import type { InputManager } from './InputManager';
import type {
  Box,
  CalloutBanner,
  CombatHudSnapshot,
  MatchConfig,
  MatchPhase,
  MoveDefinition,
  Projectile,
  SuperCutinEvent,
} from './types';
import type { VFXManager } from './VFXManager';

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function getComboRank(hits: number): string {
  if (hits >= 12) return 'GODLIKE!!';
  if (hits >= 8) return 'BRILLIANT!';
  if (hits >= 5) return 'EXCELLENT!';
  if (hits >= 3) return 'GREAT!';
  return 'NICE!';
}

export class CombatEngine {
  readonly config: MatchConfig;
  readonly p1: Fighter;
  readonly p2: Fighter;
  projectiles: Projectile[] = [];

  phase: MatchPhase = 'INTRO';
  roundNumber = 1;
  timerFrames = ROUND_TIME_SECONDS * 60;
  phaseFrames = 0;

  announceText = '';
  announceSubtext = '';
  winnerSlot: 0 | 1 | 2 = 0;
  winReason = '';

  hitstopFrames = 0;
  superFreezeFrames = 0;
  superFreezeColor = '#ff2a5f';
  koSlowmoFrames = 0;

  private superCutin: SuperCutinEvent | null = null;
  private superCutinTimer = 0;
  private p1Callout: CalloutBanner | null = null;
  private p2Callout: CalloutBanner | null = null;
  private p1CalloutTimer = 0;
  private p2CalloutTimer = 0;
  private firstAttackClaimed = false;

  private ai: AIController;
  private nextEntityId = 1;
  private prevStateSig = { p1Move: '', p1Frame: -1, p2Move: '', p2Frame: -1 };
  private trainingHealCooldown = 0;

  constructor(
    config: MatchConfig,
    private input: InputManager,
    private camera: Camera,
    private vfx: VFXManager,
    private audio: AudioManager
  ) {
    this.config = config;
    this.p1 = new Fighter(1, config.p1Char, config.p1Palette);
    this.p2 = new Fighter(2, config.p2Char, config.p2Palette);
    this.ai = new AIController(config.aiDifficulty);
    this.input.setSinglePlayer(config.mode !== 'versus');
    this.startRound(1, false);
  }

  resetMatch(): void {
    this.p1.roundsWon = 0;
    this.p2.roundsWon = 0;
    this.winnerSlot = 0;
    this.winReason = '';
    this.startRound(1, false);
  }

  private startRound(roundNum: number, keepTension: boolean): void {
    this.roundNumber = roundNum;
    this.p1.resetForRound(keepTension);
    this.p2.resetForRound(keepTension);
    if (this.config.mode === 'training') {
      this.p1.tension = MAX_TENSION;
      this.p2.tension = MAX_TENSION;
    }
    this.ai.reset();
    this.projectiles = [];
    this.vfx.clear();
    this.camera.reset();
    this.input.clearHistory();
    this.hitstopFrames = 0;
    this.superFreezeFrames = 0;
    this.koSlowmoFrames = 0;
    this.superCutin = null;
    this.superCutinTimer = 0;
    this.p1Callout = null;
    this.p2Callout = null;
    this.firstAttackClaimed = false;
    this.timerFrames = ROUND_TIME_SECONDS * 60;

    if (this.config.mode === 'training') {
      this.phase = 'FIGHT';
      this.phaseFrames = 0;
      this.announceText = 'TRAINING MODE';
      this.announceSubtext = '自由连段练习 · 气槽自动回满';
      setTimeout(() => {
        if (this.phase === 'FIGHT' && this.announceText === 'TRAINING MODE') {
          this.announceText = '';
          this.announceSubtext = '';
        }
      }, 1500);
      return;
    }

    this.phase = 'ROUND_ANNOUNCE';
    this.phaseFrames = 0;
    if (roundNum === 1) {
      this.announceText = 'ROUND 1';
      this.announceSubtext = '绯月星穹神社';
      this.audio.playSfx('ann_round1', 0, 1.0, 0);
    } else if (roundNum === 2) {
      this.announceText = 'ROUND 2';
      this.announceSubtext = 'READY YOUR BLADE';
      this.audio.playSfx('ann_round2', 0, 1.0, 0);
    } else {
      this.announceText = 'FINAL ROUND';
      this.announceSubtext = '命运的最终对决';
      this.audio.playSfx('ann_final', 0, 1.0, 0);
    }
  }

  private enterVictoryPose(winner: Fighter): void {
    winner.state = 'victory';
    winner.stateFrame = 0;
    winner.currentMove = null;
    winner.moveCanCancel = false;
    winner.attackLungeX = 0;
    winner.vx = winner.isGrounded ? 0 : winner.vx * 0.25;
  }

  private panForX(wx: number): number {
    return Math.max(-0.8, Math.min(0.8, (wx - this.camera.x) / (LOGICAL_WIDTH * 0.5)));
  }

  private setCallout(slot: 1 | 2, text: string, subtext: string | undefined, color: string): void {
    const banner: CalloutBanner = { id: this.nextEntityId++, slot, text, subtext, color };
    if (slot === 1) {
      this.p1Callout = banner;
      this.p1CalloutTimer = 68;
    } else {
      this.p2Callout = banner;
      this.p2CalloutTimer = 68;
    }
  }

  step(dt: number): void {
    this.phaseFrames++;
    if (this.superCutinTimer > 0) {
      this.superCutinTimer--;
      if (this.superCutinTimer === 0) this.superCutin = null;
    }
    if (this.p1CalloutTimer > 0) {
      this.p1CalloutTimer--;
      if (this.p1CalloutTimer === 0) this.p1Callout = null;
    }
    if (this.p2CalloutTimer > 0) {
      this.p2CalloutTimer--;
      if (this.p2CalloutTimer === 0) this.p2Callout = null;
    }

    // Round Announce -> FIGHT!
    if (this.phase === 'ROUND_ANNOUNCE') {
      if (this.phaseFrames === 68) {
        this.announceText = 'FIGHT!';
        this.announceSubtext = '';
        this.audio.playSfx('ann_fight', 0, 1.0, 0);
      } else if (this.phaseFrames >= 104) {
        this.phase = 'FIGHT';
        this.phaseFrames = 0;
        this.announceText = '';
        this.announceSubtext = '';
      }
      this.p1.stepPhysics(dt, false);
      this.p2.stepPhysics(dt, false);
      this.camera.update(this.p1.x, this.p1.y, this.p2.x, this.p2.y);
      this.vfx.update(false);
      return;
    }

    // KO Slow-motion cinematic finish
    if (this.phase === 'KO_SLOWMO') {
      this.koSlowmoFrames--;
      // Step simulation at ~1/3 speed during slow-mo
      const slowTick = this.phaseFrames % 3 === 0;
      const kph1 = this.p1.stepPhysics(dt, !slowTick);
      const kph2 = this.p2.stepPhysics(dt, !slowTick);
      this.handleLocomotionEvents(this.p1, kph1.events);
      this.handleLocomotionEvents(this.p2, kph2.events);
      this.vfx.update(!slowTick, [this.p1, this.p2]);
      this.camera.update(this.p1.x, this.p1.y, this.p2.x, this.p2.y);

      if (this.koSlowmoFrames <= 0) {
        this.phase = 'ROUND_END';
        this.phaseFrames = 0;
        const winFighter = this.winnerSlot === 1 ? this.p1 : this.winnerSlot === 2 ? this.p2 : null;
        if (winFighter) {
          this.enterVictoryPose(winFighter);
          if (winFighter.hp === winFighter.maxHp) {
            this.announceText = 'PERFECT!';
            this.announceSubtext = winFighter.profile.nameZh;
            this.audio.playSfx('ann_perfect', 0, 1.0, 0);
          } else {
            this.announceText = `${winFighter.profile.nameZh} 胜出`;
            this.announceSubtext = winFighter.profile.quotes[this.roundNumber % winFighter.profile.quotes.length];
          }
        } else {
          this.announceText = 'DRAW GAME';
        }
      }
      return;
    }

    if (this.phase === 'ROUND_END') {
      this.p1.stepPhysics(dt, false);
      this.p2.stepPhysics(dt, false);
      this.vfx.update(false);
      this.camera.update(this.p1.x, this.p1.y, this.p2.x, this.p2.y);

      if (this.phaseFrames >= 120) {
        if (this.p1.roundsWon >= ROUNDS_TO_WIN || this.p2.roundsWon >= ROUNDS_TO_WIN) {
          this.phase = 'MATCH_OVER';
          this.phaseFrames = 0;
          this.winnerSlot = this.p1.roundsWon >= ROUNDS_TO_WIN ? 1 : 2;
          const champion = this.winnerSlot === 1 ? this.p1 : this.p2;
          this.announceText = 'WINNER';
          this.announceSubtext = `${champion.profile.nameZh} · ${champion.profile.nameEn}`;
          this.audio.playSfx('ann_winner', 0, 1.0, 0);
          void this.audio.playBgm('bgm_victory', false, 0.5);
        } else {
          this.startRound(this.roundNumber + 1, true);
        }
      }
      return;
    }

    if (this.phase === 'MATCH_OVER') {
      this.p1.stepPhysics(dt, false);
      this.p2.stepPhysics(dt, false);
      this.vfx.update(false);
      this.camera.update(this.p1.x, this.p1.y, this.p2.x, this.p2.y);
      return;
    }

    // Active FIGHT phase
    if (this.superFreezeFrames > 0) {
      this.superFreezeFrames--;
      this.vfx.update(false);
      this.camera.update(this.p1.x, this.p1.y, this.p2.x, this.p2.y);
      return;
    }

    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      this.p1.stepPhysics(dt, true);
      this.p2.stepPhysics(dt, true);
      this.vfx.update(true);
      this.camera.update(this.p1.x, this.p1.y, this.p2.x, this.p2.y);
      return;
    }

    // Timer countdown (not in training mode)
    if (this.config.mode !== 'training') {
      if (this.timerFrames > 0) {
        this.timerFrames--;
      } else {
        this.endRoundByTimeout();
        return;
      }
    } else {
      // Training mode auto-heal & auto-tension refill when idle
      if (this.p2.state === 'idle' && this.p2.hp < this.p2.maxHp) {
        this.trainingHealCooldown++;
        if (this.trainingHealCooldown > 55) {
          this.p2.hp = Math.min(this.p2.maxHp, this.p2.hp + 35);
          this.p1.hp = this.p1.maxHp;
          this.p1.tension = MAX_TENSION;
          this.p2.tension = MAX_TENSION;
        }
      } else {
        this.trainingHealCooldown = 0;
      }
      if (this.p1.tension < MAX_TENSION && this.p1.state === 'idle') {
        this.p1.addTension(1.2);
      }
    }

    // Sample inputs
    const in1 = this.input.sample(1, this.p1.facing);
    const in2 =
      this.config.mode === 'versus'
        ? this.input.sample(2, this.p2.facing)
        : this.config.mode === 'arcade'
        ? this.ai.decide(this.p2, this.p1, this.projectiles)
        : this.aiIdleDummy(this.p2);

    const prevMove1 = this.p1.currentMove?.id ?? '';
    const prevMove2 = this.p2.currentMove?.id ?? '';

    const ev1 = this.p1.updateControl(in1, this.p2.x);
    const ev2 = this.p2.updateControl(in2, this.p1.x);
    this.handleLocomotionEvents(this.p1, ev1);
    this.handleLocomotionEvents(this.p2, ev2);

    // Check newly started moves (for Super Flash, Swing SFX & VFX!)
    this.checkMoveActivation(this.p1, this.p2, prevMove1);
    this.checkMoveActivation(this.p2, this.p1, prevMove2);

    // Step fighter physics
    const ph1 = this.p1.stepPhysics(dt, false);
    const ph2 = this.p2.stepPhysics(dt, false);
    this.handleLocomotionEvents(this.p1, ph1.events);
    this.handleLocomotionEvents(this.p2, ph2.events);

    // Resolve pushbox collision (no overlap & keep max camera distance <= 1560)
    this.resolvePushboxes();

    // Update move-frame VFX & projectile spawns
    this.updateMoveFrameTriggers(this.p1, 1);
    this.updateMoveFrameTriggers(this.p2, 2);

    // Update projectiles & projectile clashes
    this.stepProjectiles(dt);

    // Resolve melee & projectile hits!
    this.resolveMeleeHit(this.p1, this.p2, in2);
    this.resolveMeleeHit(this.p2, this.p1, in1);
    this.resolveProjectileHits(this.p1, in1);
    this.resolveProjectileHits(this.p2, in2);

    this.vfx.update(false, [this.p1, this.p2]);
    this.camera.update(this.p1.x, this.p1.y, this.p2.x, this.p2.y);

    // Check K.O.
    if (this.config.mode !== 'training' && (this.p1.hp <= 0 || this.p2.hp <= 0)) {
      this.triggerKO();
    } else if (this.config.mode === 'training') {
      if (this.p1.hp <= 0) this.p1.hp = 1;
      if (this.p2.hp <= 0) this.p2.hp = 1;
    }
  }

  private aiIdleDummy(dummy: Fighter) {
    // Training dummy stays calm & resets facing
    dummy.facing = this.p1.x >= dummy.x ? 1 : -1;
    return {
      left: false,
      right: false,
      up: false,
      down: false,
      lightPressed: false,
      mediumPressed: false,
      heavyPressed: false,
      lightHeld: false,
      mediumHeld: false,
      heavyHeld: false,
      specialPressed: false,
      superPressed: false,
      dashPressed: false,
      forward: false,
      back: false,
      motion236: false,
      motion623: false,
      motion214: false,
      doubleForward: false,
      doubleBack: false,
    };
  }

  private handleLocomotionEvents(f: Fighter, ev: LocomotionEvents): void {
    if (ev.sound) {
      this.audio.playSfx(ev.sound, this.panForX(f.x), ev.soundGain ?? 0.78);
    }
    if (ev.dust === 'dash') {
      this.vfx.spawnDust(f.x, GROUND_Y, -f.facing, 7);
    } else if (ev.dust === 'jump') {
      this.vfx.spawnDust(f.x, GROUND_Y, 0, 6);
    } else if (ev.dust === 'land') {
      this.vfx.spawnDust(f.x, GROUND_Y, 0, 8);
    } else if (ev.dust === 'brake') {
      this.vfx.spawnDust(f.x + f.facing * 24, GROUND_Y, f.facing, 6);
    } else if (ev.dust === 'step') {
      this.vfx.spawnDust(f.x, GROUND_Y, -Math.sign(f.vx) || 0, 2);
    }
    if (ev.heavyLand) {
      this.camera.addShake(3.2, 0, 1);
    }
    if (ev.airDashBurst) {
      this.vfx.spawnAirDashBurst(f.x, f.y - 230, ev.airDashBurst, f.accentColor);
    }
    if (ev.groundBounce) {
      this.vfx.spawnGroundImpact(f.x, GROUND_Y, f.accentColor);
      this.camera.addShake(12, 0, 1);
    }
  }

  private checkMoveActivation(attacker: Fighter, defender: Fighter, prevMoveId: string): void {
    if (attacker.state !== 'attack' || !attacker.currentMove) return;
    const m = attacker.currentMove;
    const sigKey = attacker.slot === 1 ? 'p1Move' : 'p2Move';
    const frameKey = attacker.slot === 1 ? 'p1Frame' : 'p2Frame';

    // Trigger when new move starts OR moveFrame restarted at 0
    if (m.id !== prevMoveId || attacker.moveFrame === 0) {
      this.prevStateSig[sigKey] = m.id;
      this.prevStateSig[frameKey] = attacker.moveFrame;

      if (m.isSuper) {
        this.superFreezeFrames = SUPER_FLASH_FRAMES;
        this.superFreezeColor = attacker.accentColor;
        this.camera.triggerCinematicFocus(attacker.x + attacker.facing * 80, attacker.y - 230, 1.28, SUPER_FLASH_FRAMES + 10);
        this.camera.addShake(16, 0, 1);
        this.audio.duckBgm(0.32, 2.2);
        this.audio.playSfx('super_flash', this.panForX(attacker.x), 1.0, 0);
        this.superCutin = {
          id: this.nextEntityId++,
          slot: attacker.slot,
          charId: attacker.charId,
          palette: attacker.palette,
          moveNameZh: m.nameZh,
          moveNameEn: m.nameEn,
        };
        this.superCutinTimer = 54;
        this.vfx.spawnSuperSpectacle(
          attacker.charId,
          attacker.accentColor,
          attacker.x,
          attacker.y,
          defender.x,
          defender.y,
          attacker.facing
        );
      }
    }
  }

  private updateMoveFrameTriggers(f: Fighter, slot: 1 | 2): void {
    if (f.state !== 'attack' || !f.currentMove) return;
    const m = f.currentMove;

    // Swing SFX + weapon-aligned tracking VFX at exact startup frame
    if (f.moveFrame === m.startup) {
      this.audio.playSfx(m.sfxSwing, this.panForX(f.x), m.isSuper ? 1.0 : 0.88);
      if (m.vfx) {
        this.vfx.spawnMoveVfx(f.x, f.y, f.facing, m.vfx, f.accentColor, slot, m.vfxScale ?? 1.0);
      }
    }

    // Spawn Projectile if applicable
    if (m.spawnProjectile && !f.projectileSpawned && f.moveFrame >= m.spawnProjectile.spawnFrame) {
      f.projectileSpawned = true;
      const sp = m.spawnProjectile;
      this.projectiles.push({
        id: this.nextEntityId++,
        ownerSlot: slot,
        charId: f.charId,
        palette: f.palette,
        kind: sp.kind,
        x: f.x + f.facing * sp.offsetX,
        y: f.y + sp.offsetY,
        vx: f.facing * sp.speed,
        facing: f.facing,
        width: sp.width,
        height: sp.height,
        damage: sp.damage,
        chipDamage: Math.round(sp.damage * 0.16),
        hitstun: sp.hitstun,
        blockstun: sp.blockstun,
        color: f.accentColor,
        scale: sp.scale ?? 1.0,
        age: 0,
        hitsRemaining: 1,
        hitCooldown: 0,
      });
    }
  }

  private resolvePushboxes(): void {
    const b1 = this.p1.getPushbox();
    const b2 = this.p2.getPushbox();
    if (boxesOverlap(b1, b2)) {
      const center1 = b1.x + b1.w * 0.5;
      const center2 = b2.x + b2.w * 0.5;
      const minDist = (b1.w + b2.w) * 0.5;
      const actual = Math.abs(center1 - center2);
      const overlap = minDist - actual;
      const dir = center1 <= center2 ? -1 : 1;
      this.p1.x += dir * overlap * 0.5;
      this.p2.x -= dir * overlap * 0.5;
    }

    // Clamp stage bounds and maximum distance between fighters (keeps both visible!)
    this.p1.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.p1.x));
    this.p2.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.p2.x));

    const maxSpread = 1520;
    const dist = Math.abs(this.p1.x - this.p2.x);
    if (dist > maxSpread) {
      const mid = (this.p1.x + this.p2.x) * 0.5;
      if (this.p1.x < this.p2.x) {
        this.p1.x = mid - maxSpread * 0.5;
        this.p2.x = mid + maxSpread * 0.5;
      } else {
        this.p2.x = mid - maxSpread * 0.5;
        this.p1.x = mid + maxSpread * 0.5;
      }
    }
  }

  private stepProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age++;
      if (p.hitCooldown > 0) p.hitCooldown--;
      p.x += p.vx * dt;
      if (p.x < -100 || p.x > STAGE_WIDTH + 100 || p.hitsRemaining <= 0) {
        this.projectiles.splice(i, 1);
      }
    }

    // Projectile-vs-Projectile Clash!
    for (let i = 0; i < this.projectiles.length; i++) {
      for (let j = i + 1; j < this.projectiles.length; j++) {
        const a = this.projectiles[i];
        const b = this.projectiles[j];
        if (a.ownerSlot === b.ownerSlot || a.hitsRemaining <= 0 || b.hitsRemaining <= 0) continue;
        const boxA: Box = { x: a.x - a.width * 0.5, y: a.y - a.height * 0.5, w: a.width, h: a.height };
        const boxB: Box = { x: b.x - b.width * 0.5, y: b.y - b.height * 0.5, w: b.width, h: b.height };
        if (boxesOverlap(boxA, boxB)) {
          a.hitsRemaining = 0;
          b.hitsRemaining = 0;
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;
          this.vfx.spawnHitSpark(mx, my, '#ffffff', 'heavy', a.charId);
          this.audio.playSfx('guard_block', this.panForX(mx), 0.9);
          this.camera.addShake(10, 0, 0);
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.hitsRemaining > 0);
  }

  private resolveMeleeHit(attacker: Fighter, defender: Fighter, defInput: ReturnType<InputManager['sample']>): void {
    const hitbox = attacker.getActiveHitbox();
    const hurtbox = defender.getHurtbox();
    if (!hitbox || !hurtbox || !attacker.currentMove) return;

    const move = attacker.currentMove;
    if (move.multiHitFrames && move.multiHitFrames.length > 0) {
      if (attacker.triggeredMultiHits.has(attacker.moveFrame)) return;
    } else if (attacker.moveHitConnected) {
      return;
    }

    if (!boxesOverlap(hitbox, hurtbox)) return;

    // Hit registered!
    if (move.multiHitFrames && move.multiHitFrames.length > 0) {
      attacker.triggeredMultiHits.add(attacker.moveFrame);
    } else {
      attacker.moveHitConnected = true;
    }
    attacker.moveCanCancel = true;

    const contactX = Math.max(hurtbox.x, Math.min(hurtbox.x + hurtbox.w, hitbox.x + hitbox.w * 0.5));
    const contactY = Math.max(hurtbox.y, Math.min(hurtbox.y + hurtbox.h, hitbox.y + hitbox.h * 0.5));

    // Check block eligibility
    const isBlocking =
      defender.canBlock(defInput) &&
      (move.hitHeight === 'mid' ||
        (move.hitHeight === 'low' && defInput.down) ||
        (move.hitHeight === 'high' && !defInput.down));

    if (isBlocking) {
      defender.hp = Math.max(1, defender.hp - move.chipDamage);
      defender.state = defInput.down ? 'block_low' : 'block_high';
      defender.hitstunFrames = move.blockstun;
      defender.vx = attacker.facing * (move.pushback * 6.5);
      if (defender.x <= STAGE_LEFT + 25 || defender.x >= STAGE_RIGHT - 25) {
        attacker.vx = -attacker.facing * (move.pushback * 4.5);
      }
      defender.addTension(4);
      attacker.addTension(move.isSuper ? 0 : 4);

      this.hitstopFrames = Math.max(4, Math.floor(move.hitstop * 0.7));
      this.camera.addShake(move.strength === 'heavy' || move.strength === 'super' ? 8 : 4, attacker.facing, 0);
      this.vfx.spawnGuardSpark(defender.x, defender.y - 210, defender.facing, defender.accentColor);
      this.audio.playSfx('guard_block', this.panForX(contactX), 0.92);
      return;
    }

    // Clean Hit! Check Counter Hit!
    const isCounter =
      defender.state === 'attack' &&
      defender.currentMove !== null &&
      defender.moveFrame < defender.currentMove.startup + defender.currentMove.active;

    if (!this.firstAttackClaimed && this.config.mode !== 'training') {
      this.firstAttackClaimed = true;
      this.setCallout(attacker.slot, 'FIRST ATTACK!', undefined, '#ffd466');
    }

    if (isCounter && defender.receivedComboCount === 0) {
      this.setCallout(attacker.slot, 'COUNTER!', '破招暴击 +20%', '#ff4d4d');
      this.vfx.triggerImpactFrame(2);
      this.audio.playSfx('hit_counter', this.panForX(contactX), 1.0);
      this.audio.playSfx('ann_counter', 0, 0.92, 0);
    } else if (move.strength === 'heavy' || move.strength === 'super') {
      this.vfx.triggerImpactFrame(move.isSuper ? 3 : 2);
      this.audio.playSfx(move.sfxHit, this.panForX(contactX), 0.96);
    } else {
      this.audio.playSfx(move.sfxHit, this.panForX(contactX), 0.90);
    }

    // Apply combo scaling
    defender.receivedComboCount++;
    const scale = Math.max(0.35, 1 - (defender.receivedComboCount - 1) * 0.08);
    const counterMult = isCounter ? 1.2 : 1.0;
    const dmg = Math.max(8, Math.round(move.damage * scale * counterMult));

    defender.hp = Math.max(0, defender.hp - dmg);
    defender.receivedComboDamage += dmg;
    attacker.comboCount = defender.receivedComboCount;
    attacker.comboDamage = defender.receivedComboDamage;

    // Tension rewards
    attacker.addTension(move.isSuper ? 0 : move.strength === 'heavy' ? 12 : move.strength === 'medium' ? 8 : 5);
    defender.addTension(6);

    // Hit reaction & knockdown
    const isFinalMultiHit =
      !move.multiHitFrames ||
      attacker.moveFrame === move.multiHitFrames[move.multiHitFrames.length - 1];

    defender.currentMove = null;
    defender.moveCanCancel = false;
    defender.hitFlashFrames = 6;
    defender.hurtKind = move.strength === 'heavy' || move.strength === 'super' || isCounter ? 'heavy' : 'light';
    defender.hitstunElapsed = 0;
    defender.knockdownSlamFrames = 0;
    defender.hitShakeFrames = move.hitstop + 6;
    defender.knockdownBounced = false;
    defender.squashX = 0.92;
    defender.squashY = 1.08;

    if ((move.knockdown && isFinalMultiHit) || move.launchVy < -100) {
      defender.state = 'hitstun';
      defender.hitstunFrames = move.hitstun + (isCounter ? 5 : 0);
      defender.vx = attacker.facing * (move.launchVx || move.pushback * 6);
      defender.vy = move.launchVy || -420;
      if (defender.y >= GROUND_Y) defender.y = GROUND_Y - 2;
    } else if (!defender.isGrounded) {
      defender.state = 'hitstun';
      defender.hitstunFrames = move.hitstun;
      defender.vx = attacker.facing * 240;
      defender.vy = -440;
    } else {
      defender.state = 'hitstun';
      defender.hitstunFrames = move.hitstun + (isCounter ? 4 : 0);
      defender.vx = attacker.facing * (move.pushback * 7.2);
    }
    defender.hitstunTotal = Math.max(1, defender.hitstunFrames);

    // Corner pushback on attacker so corner combos feel clean
    if (defender.x <= STAGE_LEFT + 30 || defender.x >= STAGE_RIGHT - 30) {
      attacker.vx = -attacker.facing * (move.pushback * 4.0);
    }

    this.hitstopFrames = move.hitstop + (isCounter ? 4 : 0);
    const shakePow = move.isSuper ? 22 : move.strength === 'heavy' ? 16 : move.strength === 'medium' ? 9 : 5;
    this.camera.addShake(shakePow, attacker.facing, -0.3);
    const effectiveStrength = isCounter && move.strength !== 'super' ? 'heavy' : move.strength;
    this.vfx.spawnHitSpark(
      contactX,
      contactY,
      attacker.accentColor,
      effectiveStrength,
      attacker.charId
    );
    this.vfx.spawnHitRecoilBurst(
      defender.x,
      defender.y - 240,
      attacker.facing,
      effectiveStrength,
      attacker.accentColor
    );
  }

  private resolveProjectileHits(defender: Fighter, defInput: ReturnType<InputManager['sample']>): void {
    const hurt = defender.getHurtbox();
    if (!hurt) return;
    for (const p of this.projectiles) {
      if (p.ownerSlot === defender.slot || p.hitsRemaining <= 0 || p.hitCooldown > 0) continue;
      const pBox: Box = {
        x: p.x - p.width * 0.5,
        y: p.y - p.height * 0.5,
        w: p.width,
        h: p.height,
      };
      if (!boxesOverlap(pBox, hurt)) continue;

      p.hitsRemaining--;
      const attacker = p.ownerSlot === 1 ? this.p1 : this.p2;
      const isBlocking = defender.canBlock(defInput);

      if (isBlocking) {
        defender.hp = Math.max(1, defender.hp - p.chipDamage);
        defender.state = defInput.down ? 'block_low' : 'block_high';
        defender.hitstunFrames = p.blockstun;
        defender.vx = p.facing * 280;
        this.vfx.spawnGuardSpark(defender.x, defender.y - 210, defender.facing, defender.accentColor);
        this.audio.playSfx('guard_block', this.panForX(p.x), 0.9);
        this.camera.addShake(6, p.facing, 0);
      } else {
        defender.receivedComboCount++;
        const scale = Math.max(0.35, 1 - (defender.receivedComboCount - 1) * 0.08);
        const dmg = Math.max(8, Math.round(p.damage * scale));
        defender.hp = Math.max(0, defender.hp - dmg);
        defender.receivedComboDamage += dmg;
        attacker.comboCount = defender.receivedComboCount;
        attacker.comboDamage = defender.receivedComboDamage;
        attacker.addTension(9);
        defender.addTension(5);

        defender.currentMove = null;
        defender.state = 'hitstun';
        defender.hitstunFrames = p.hitstun;
        defender.hitstunTotal = Math.max(1, p.hitstun);
        defender.hitstunElapsed = 0;
        defender.hitFlashFrames = 6;
        defender.hurtKind = 'heavy';
        defender.knockdownSlamFrames = 0;
        defender.hitShakeFrames = 10;
        defender.knockdownBounced = false;
        defender.vx = p.facing * 320;
        if (!defender.isGrounded) defender.vy = -480;

        this.hitstopFrames = 7;
        this.camera.addShake(11, p.facing, 0);
        this.vfx.spawnHitSpark(p.x, p.y, p.color, 'heavy', attacker.charId);
        this.vfx.spawnHitRecoilBurst(defender.x, defender.y - 240, p.facing, 'heavy', p.color);
        this.audio.playSfx('hit_heavy', this.panForX(p.x), 0.95);
      }
    }
  }

  private triggerKO(): void {
    this.phase = 'KO_SLOWMO';
    this.phaseFrames = 0;
    this.koSlowmoFrames = 72;
    this.hitstopFrames = 0;
    this.superFreezeFrames = 0;
    this.vfx.triggerImpactFrame(4);
    this.audio.duckBgm(0.25, 2.5);
    this.audio.playSfx('ko_finish', 0, 1.0, 0);
    this.audio.playSfx('ann_ko', 0, 1.0, 0);

    if (this.p1.hp <= 0 && this.p2.hp <= 0) {
      this.winnerSlot = 0;
      this.p1.state = 'ko';
      this.p2.state = 'ko';
      this.announceText = 'DOUBLE K.O.!';
    } else if (this.p2.hp <= 0) {
      this.winnerSlot = 1;
      if (this.p1.isGrounded) this.p1.vx *= 0.30;
      this.p2.state = 'ko';
      this.p2.knockdownBounced = false;
      this.p2.knockdownSlamFrames = 0;
      this.p2.hitShakeFrames = 14;
      this.p2.vx = -this.p2.facing * 590;
      this.p2.vy = -1020;
      if (this.p2.y >= GROUND_Y) this.p2.y = GROUND_Y - 2;
      this.p1.roundsWon++;
      this.announceText = 'K.O.!';
      this.camera.triggerCinematicFocus(this.p2.x, this.p2.y - 200, 1.25, 70);
    } else {
      this.winnerSlot = 2;
      if (this.p2.isGrounded) this.p2.vx *= 0.30;
      this.p1.state = 'ko';
      this.p1.knockdownBounced = false;
      this.p1.knockdownSlamFrames = 0;
      this.p1.hitShakeFrames = 14;
      this.p1.vx = -this.p1.facing * 590;
      this.p1.vy = -1020;
      if (this.p1.y >= GROUND_Y) this.p1.y = GROUND_Y - 2;
      this.p2.roundsWon++;
      this.announceText = 'K.O.!';
      this.camera.triggerCinematicFocus(this.p1.x, this.p1.y - 200, 1.25, 70);
    }
    this.announceSubtext = '';
    this.camera.addShake(28, 0, 1);
  }

  private endRoundByTimeout(): void {
    this.phase = 'ROUND_END';
    this.phaseFrames = 0;
    this.announceText = 'TIME OVER';
    const pct1 = this.p1.hp / this.p1.maxHp;
    const pct2 = this.p2.hp / this.p2.maxHp;
    if (Math.abs(pct1 - pct2) < 0.001) {
      this.winnerSlot = 0;
      this.announceSubtext = '平局';
    } else if (pct1 > pct2) {
      this.winnerSlot = 1;
      this.p1.roundsWon++;
      this.enterVictoryPose(this.p1);
      this.announceSubtext = `${this.p1.profile.nameZh} 判定胜出`;
    } else {
      this.winnerSlot = 2;
      this.p2.roundsWon++;
      this.enterVictoryPose(this.p2);
      this.announceSubtext = `${this.p2.profile.nameZh} 判定胜出`;
    }
  }

  getHudSnapshot(): CombatHudSnapshot {
    const p1ComboRank = this.p1.comboCount >= 2 ? getComboRank(this.p1.comboCount) : '';
    const p2ComboRank = this.p2.comboCount >= 2 ? getComboRank(this.p2.comboCount) : '';

    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      timerSeconds: Math.ceil(this.timerFrames / 60),
      announceText: this.announceText,
      announceSubtext: this.announceSubtext,
      winnerSlot: this.winnerSlot,
      winReason: p1ComboRank || p2ComboRank,
      p1: {
        charId: this.p1.charId,
        palette: this.p1.palette,
        hp: this.p1.hp,
        maxHp: this.p1.maxHp,
        trailingHp: this.p1.trailingHp,
        tension: this.p1.tension,
        comboCount: this.p2.receivedComboCount,
        comboDamage: this.p2.receivedComboDamage,
        roundsWon: this.p1.roundsWon,
        hitFlash: this.p1.hitFlashFrames,
        isHurt: this.p1.state === 'hitstun' || this.p1.state === 'knockdown' || this.p1.state === 'ko',
      },
      p2: {
        charId: this.p2.charId,
        palette: this.p2.palette,
        hp: this.p2.hp,
        maxHp: this.p2.maxHp,
        trailingHp: this.p2.trailingHp,
        tension: this.p2.tension,
        comboCount: this.p1.receivedComboCount,
        comboDamage: this.p1.receivedComboDamage,
        roundsWon: this.p2.roundsWon,
        hitFlash: this.p2.hitFlashFrames,
        isHurt: this.p2.state === 'hitstun' || this.p2.state === 'knockdown' || this.p2.state === 'ko',
      },
      superCutin: this.superCutin,
      p1Callout: this.p1Callout,
      p2Callout: this.p2Callout,
    };
  }
}

export type { MoveDefinition };
