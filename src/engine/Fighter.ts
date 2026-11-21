import { CHARACTERS } from './CharacterData';
import {
  AIR_DASH_ACTIVE_FRAMES,
  AIR_DASH_SPEED_BACK,
  AIR_DASH_SPEED_FWD,
  AIR_DASH_STARTUP_FRAMES,
  DASH_BRAKE_FRAMES,
  GRAVITY_FALL,
  GRAVITY_RISE,
  GROUND_FRICTION,
  GROUND_Y,
  JUMPSQUAT_FRAMES,
  LAND_RECOVERY_FRAMES,
  MAX_TENSION,
  STAGE_LEFT,
  STAGE_RIGHT,
  WALK_ACCEL,
  WALK_STRIDE_PX,
} from './constants';
import type {
  AfterimageSample,
  Box,
  CharacterId,
  CharacterProfile,
  FighterStateName,
  MoveDefinition,
  MoveId,
  PaletteSlot,
  PlayerInputState,
  SpecialTier,
  SpritePoseKey,
} from './types';

export interface LocomotionEvents {
  sound?: string;
  soundGain?: number;
  dust?: 'dash' | 'jump' | 'land' | 'step' | 'brake';
  heavyLand?: boolean;
  airDashBurst?: 1 | -1;
  groundBounce?: boolean;
}

export class Fighter {
  readonly slot: 1 | 2;
  readonly charId: CharacterId;
  readonly palette: PaletteSlot;
  readonly profile: CharacterProfile;

  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facing: 1 | -1;

  hp: number;
  maxHp: number;
  trailingHp: number;
  tension = 0;
  roundsWon = 0;

  state: FighterStateName = 'idle';
  stateFrame = 0;
  stateDuration = 0;

  currentMove: MoveDefinition | null = null;
  moveFrame = 0;
  moveHitConnected = false;
  moveCanCancel = false;
  projectileSpawned = false;
  triggeredMultiHits = new Set<number>();

  hitstunFrames = 0;
  knockdownFrames = 0;
  invulnFrames = 0;
  hitFlashFrames = 0;

  // Detailed damage reaction & knockdown bounce state
  hurtKind: 'light' | 'heavy' = 'light';
  hitstunElapsed = 0;
  hitstunTotal = 1;
  knockdownSlamFrames = 0;
  hitShakeFrames = 0;
  hitShakeX = 0;
  knockdownBounced = false;

  // Grounded locomotion & 3-phase air-dash tracking
  walkDist = 0;
  private lastWalkStepHalf = 0;
  private jumpDir: -1 | 0 | 1 = 0;
  private airDashUsed = false;
  private airDashDir: 1 | -1 = 1;
  private airDashForward = true;
  private animTick = 0;

  // Kinetic attack lunge offset (visual only, damped back during recovery)
  attackLungeX = 0;

  // Combo tracker on the defender side
  receivedComboCount = 0;
  receivedComboDamage = 0;
  comboCount = 0;
  comboDamage = 0;

  // Visual procedural animation parameters
  squashX = 1;
  squashY = 1;
  visualRotation = 0;
  afterimages: AfterimageSample[] = [];
  afterimageSpawnTick = 0;

  constructor(slot: 1 | 2, charId: CharacterId, palette: PaletteSlot) {
    this.slot = slot;
    this.charId = charId;
    this.palette = palette;
    this.profile = CHARACTERS[charId];
    this.maxHp = this.profile.maxHp;
    this.hp = this.maxHp;
    this.trailingHp = this.maxHp;
    this.x = slot === 1 ? 1050 : 1750;
    this.y = GROUND_Y;
    this.facing = slot === 1 ? 1 : -1;
  }

  resetForRound(keepTension = true): void {
    this.x = this.slot === 1 ? 1050 : 1750;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.slot === 1 ? 1 : -1;
    this.hp = this.maxHp;
    this.trailingHp = this.maxHp;
    if (!keepTension) {
      this.tension = 0;
    }
    this.state = 'idle';
    this.stateFrame = 0;
    this.stateDuration = 0;
    this.currentMove = null;
    this.moveFrame = 0;
    this.moveHitConnected = false;
    this.moveCanCancel = false;
    this.projectileSpawned = false;
    this.triggeredMultiHits.clear();
    this.hitstunFrames = 0;
    this.knockdownFrames = 0;
    this.invulnFrames = 0;
    this.hitFlashFrames = 0;
    this.hurtKind = 'light';
    this.hitstunElapsed = 0;
    this.hitstunTotal = 1;
    this.knockdownSlamFrames = 0;
    this.hitShakeFrames = 0;
    this.hitShakeX = 0;
    this.knockdownBounced = false;
    this.walkDist = 0;
    this.lastWalkStepHalf = 0;
    this.jumpDir = 0;
    this.airDashUsed = false;
    this.airDashDir = 1;
    this.airDashForward = true;
    this.animTick = 0;
    this.attackLungeX = 0;
    this.receivedComboCount = 0;
    this.receivedComboDamage = 0;
    this.comboCount = 0;
    this.comboDamage = 0;
    this.squashX = 1;
    this.squashY = 1;
    this.visualRotation = 0;
    this.afterimages = [];
  }

  get isGrounded(): boolean {
    return this.y >= GROUND_Y - 0.5;
  }

  get accentColor(): string {
    return this.palette === 2 ? this.profile.p2AccentColor : this.profile.accentColor;
  }

  addTension(amount: number): void {
    this.tension = Math.min(MAX_TENSION, Math.max(0, this.tension + amount));
  }

  getPushbox(): Box {
    const w = 96;
    const h = this.state === 'crouch' || this.state === 'block_low' ? 240 : 340;
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  getHurtbox(): Box | null {
    if (this.invulnFrames > 0 || this.state === 'knockdown' || this.state === 'ko') {
      return null;
    }
    const crouching =
      this.state === 'crouch' ||
      this.state === 'block_low' ||
      (this.state === 'attack' &&
        (this.currentMove?.id === '2L' || this.currentMove?.id === '2M' || this.currentMove?.id === '2H'));
    const w = 132;
    const h = crouching ? 255 : this.state === 'jumpsquat' || this.state === 'land' ? 320 : 375;
    return {
      x: this.x - w / 2,
      y: this.y - h,
      w,
      h,
    };
  }

  getActiveHitbox(): Box | null {
    if (this.state !== 'attack' || !this.currentMove) return null;
    const m = this.currentMove;
    const f = this.moveFrame;
    if (f < m.startup || f >= m.startup + m.active) return null;
    if (m.multiHitFrames && m.multiHitFrames.length > 0) {
      if (!m.multiHitFrames.includes(f)) return null;
    } else if (this.moveHitConnected) {
      return null;
    }

    const rel = m.hitbox;
    const worldX = this.facing === 1 ? this.x + rel.x : this.x - rel.x - rel.w;
    const worldY = this.y + rel.y;
    return { x: worldX, y: worldY, w: rel.w, h: rel.h };
  }

  canAct(): boolean {
    return (
      this.state === 'idle' ||
      this.state === 'walk' ||
      this.state === 'crouch' ||
      this.state === 'jump' ||
      this.state === 'dash_brake' ||
      this.state === 'land'
    );
  }

  canBlock(input: PlayerInputState): boolean {
    if (!input.back) return false;
    if (this.state === 'block_high' || this.state === 'block_low') return true;
    return (
      this.isGrounded &&
      (this.state === 'idle' ||
        this.state === 'walk' ||
        this.state === 'crouch' ||
        this.state === 'dash_brake' ||
        this.state === 'land')
    );
  }

  private buildMoveForTier(base: MoveDefinition, tier: SpecialTier): MoveDefinition {
    const ov = base.tierVariants?.[tier];
    if (!ov) return base;
    return {
      ...base,
      ...(ov.startup !== undefined ? { startup: ov.startup } : {}),
      ...(ov.active !== undefined ? { active: ov.active } : {}),
      ...(ov.recovery !== undefined ? { recovery: ov.recovery } : {}),
      ...(ov.damage !== undefined ? { damage: ov.damage } : {}),
      ...(ov.chipDamage !== undefined ? { chipDamage: ov.chipDamage } : {}),
      ...(ov.hitstop !== undefined ? { hitstop: ov.hitstop } : {}),
      ...(ov.hitstun !== undefined ? { hitstun: ov.hitstun } : {}),
      ...(ov.blockstun !== undefined ? { blockstun: ov.blockstun } : {}),
      ...(ov.pushback !== undefined ? { pushback: ov.pushback } : {}),
      ...(ov.launchVx !== undefined ? { launchVx: ov.launchVx } : {}),
      ...(ov.launchVy !== undefined ? { launchVy: ov.launchVy } : {}),
      ...(ov.velocityX !== undefined ? { velocityX: ov.velocityX } : {}),
      ...(ov.velocityY !== undefined ? { velocityY: ov.velocityY } : {}),
      ...(ov.activeVelocityX !== undefined ? { activeVelocityX: ov.activeVelocityX } : {}),
      ...(ov.activeVelocityY !== undefined ? { activeVelocityY: ov.activeVelocityY } : {}),
      ...(ov.multiHitFrames !== undefined ? { multiHitFrames: ov.multiHitFrames } : {}),
      ...(ov.vfxScale !== undefined ? { vfxScale: ov.vfxScale } : {}),
      ...(base.spawnProjectile
        ? {
            spawnProjectile: {
              ...base.spawnProjectile,
              ...(ov.projectile ?? {}),
            },
          }
        : {}),
    };
  }

  startMove(moveId: MoveId, tier: SpecialTier = 'medium'): boolean {
    const baseMove = this.profile.moves[moveId];
    if (!baseMove) return false;
    const move = this.buildMoveForTier(baseMove, tier);
    if (move.isSuper && this.tension < (move.tensionCost ?? MAX_TENSION)) {
      return false;
    }
    if (move.isSuper) {
      this.tension = Math.max(0, this.tension - (move.tensionCost ?? MAX_TENSION));
    }

    this.state = 'attack';
    this.stateFrame = 0;
    this.currentMove = move;
    this.moveFrame = 0;
    this.moveHitConnected = false;
    this.moveCanCancel = false;
    this.projectileSpawned = false;
    this.triggeredMultiHits.clear();
    this.attackLungeX = 0;

    if (move.invulnStartup) {
      this.invulnFrames = move.startup + 4;
    }
    if (move.velocityX !== undefined) {
      this.vx = this.facing * move.velocityX;
    } else if (this.isGrounded) {
      this.vx *= 0.25;
    }
    if (move.velocityY !== undefined) {
      this.vy = move.velocityY;
    }

    this.squashX = move.strength === 'heavy' || move.isSuper ? 1.05 : 1.025;
    this.squashY = move.strength === 'heavy' || move.isSuper ? 0.96 : 0.98;
    return true;
  }

  resolveMoveInput(input: PlayerInputState): { moveId: MoveId; tier: SpecialTier } | null {
    if (input.superPressed && this.tension >= MAX_TENSION && this.isGrounded) {
      return { moveId: 'super', tier: 'heavy' };
    }

    const shortcutTier: SpecialTier = input.heavyHeld ? 'heavy' : input.lightHeld ? 'light' : 'medium';

    if (!this.isGrounded) {
      if (input.specialPressed) return { moveId: 'special_3', tier: shortcutTier };
      if (input.heavyPressed) return { moveId: 'jH', tier: 'heavy' };
      if (input.mediumPressed) return { moveId: 'jM', tier: 'medium' };
      if (input.lightPressed) return { moveId: 'jL', tier: 'light' };
      return null;
    }

    if (input.specialPressed) {
      if (input.forward) return { moveId: 'special_2', tier: shortcutTier };
      if (input.back || input.down) return { moveId: 'special_3', tier: shortcutTier };
      return { moveId: 'special_1', tier: shortcutTier };
    }

    const anyAttack = input.lightPressed || input.mediumPressed || input.heavyPressed;
    if (anyAttack) {
      const motionTier: SpecialTier = input.heavyPressed ? 'heavy' : input.mediumPressed ? 'medium' : 'light';
      if (input.motion623) return { moveId: 'special_2', tier: motionTier };
      if (input.motion236) return { moveId: 'special_1', tier: motionTier };
      if (input.motion214) return { moveId: 'special_3', tier: motionTier };
    }

    if (input.down) {
      if (input.heavyPressed) return { moveId: '2H', tier: 'heavy' };
      if (input.mediumPressed) return { moveId: '2M', tier: 'medium' };
      if (input.lightPressed) return { moveId: '2L', tier: 'light' };
    } else {
      if (input.heavyPressed) return { moveId: '5H', tier: 'heavy' };
      if (input.mediumPressed) return { moveId: '5M', tier: 'medium' };
      if (input.lightPressed) return { moveId: '5L', tier: 'light' };
    }
    return null;
  }

  getActivePose(): SpritePoseKey {
    if (this.state === 'attack' && this.currentMove) {
      const m = this.currentMove;
      if (this.moveFrame < m.startup) return m.startupPose;
      if (this.moveFrame < m.startup + m.active) return m.activePose;
      return m.recoveryPose;
    }

    if (this.state === 'dash_fwd') {
      const idx = Math.floor(this.animTick / 3) % 4;
      return `run_${idx}` as SpritePoseKey;
    }
    if (this.state === 'air_dash') {
      if (this.stateFrame < AIR_DASH_STARTUP_FRAMES) return 'aerial';
      const idx = Math.floor(this.animTick / 2) % 4;
      return `run_${idx}` as SpritePoseKey;
    }
    if (this.state === 'dash_brake') return 'dash_brake';
    if (this.state === 'dash_back') return 'backdash';
    if (this.state === 'jumpsquat') return 'jumpsquat';
    if (this.state === 'land') return 'land_heavy';

    if (this.state === 'hitstun') {
      if (!this.isGrounded) {
        if (this.vy < -280) return 'hurt_air_up';
        if (this.vy > 280) return 'hurt_air_down';
        return 'hurt_air';
      }
      const t = this.hitstunElapsed / Math.max(1, this.hitstunTotal);
      if (this.hurtKind === 'light') {
        if (t < 0.28) return 'hurt_snap';
        if (t < 0.72) return 'hurt_light';
        return 'hurt_recover';
      }
      if (t < 0.22) return 'hurt_snap';
      if (t < 0.54) return 'hurt_heavy';
      if (t < 0.78) return 'hurt_reel_2';
      return 'hurt_recover';
    }
    if (this.state === 'knockdown' || this.state === 'ko') {
      if (this.knockdownSlamFrames > 0) return 'knockdown_slam';
      if (!this.isGrounded) {
        if (this.vy < -260) return 'hurt_air_up';
        if (this.vy > 260) return 'hurt_air_down';
        return 'hurt_air';
      }
      return 'knockdown_ground';
    }
    if (this.state === 'wakeup') {
      if (this.stateFrame < 6) return 'knockdown_ground';
      if (this.stateFrame < 14) return 'wakeup_rise';
      return 'land_heavy';
    }

    if (!this.isGrounded || this.state === 'jump') {
      if (this.vy < -220) return 'jump_rise';
      if (this.vy > 260) return 'jump_fall';
      return 'aerial';
    }

    if (this.state === 'crouch' || this.state === 'block_low') {
      const idx = Math.floor(this.animTick / 18) % 2;
      return `crouch_${idx}` as SpritePoseKey;
    }

    if (this.state === 'walk') {
      const movingForward = this.vx * this.facing >= 0;
      const stepIdx = Math.floor((this.walkDist / WALK_STRIDE_PX) * 8) % 8;
      return `${movingForward ? 'walk_fwd' : 'walk_back'}_${stepIdx}` as SpritePoseKey;
    }

    if (this.state === 'block_high') {
      return this.charId === 'rin' ? 'guard' : 'stance';
    }
    if (this.state === 'victory') {
      return this.charId === 'rin' ? 'thrust' : 'heroic';
    }

    const idleIdx = Math.floor(this.animTick / 10) % 4;
    return `idle_${idleIdx}` as SpritePoseKey;
  }

  updateControl(input: PlayerInputState, opponentX: number): LocomotionEvents {
    const events: LocomotionEvents = {};

    if (
      this.isGrounded &&
      (this.state === 'idle' || this.state === 'walk' || this.state === 'crouch' || this.state === 'land')
    ) {
      this.facing = opponentX >= this.x ? 1 : -1;
    }

    // Gatling / Special Canceling while in attack state
    if (this.state === 'attack' && this.currentMove && this.moveCanCancel) {
      const requested = this.resolveMoveInput(input);
      if (requested && this.currentMove.cancelInto.includes(requested.moveId)) {
        if (this.startMove(requested.moveId, requested.tier)) {
          return events;
        }
      }
    }

    // Allow cancelling active air-dash into jL / jM / jH / special_3 while preserving momentum!
    if (this.state === 'air_dash' && this.stateFrame >= AIR_DASH_STARTUP_FRAMES + 2) {
      const airMove = this.resolveMoveInput(input);
      if (airMove && this.startMove(airMove.moveId, airMove.tier)) {
        this.vx *= 0.78;
        return events;
      }
    }

    if (!this.canAct()) return events;

    const req = this.resolveMoveInput(input);
    if (req && this.startMove(req.moveId, req.tier)) {
      return events;
    }

    // Airborne control: NO float steering, only 1 crisp 3-phase air-dash per jump!
    if (!this.isGrounded) {
      const wantsAirFwd = (input.dashPressed && !input.back) || input.doubleForward;
      const wantsAirBack = (input.dashPressed && input.back) || input.doubleBack;
      if (!this.airDashUsed && this.y < GROUND_Y - 65 && (wantsAirFwd || wantsAirBack)) {
        this.airDashUsed = true;
        this.airDashForward = wantsAirFwd;
        this.airDashDir = wantsAirFwd ? this.facing : (-this.facing as 1 | -1);
        this.state = 'air_dash';
        this.stateFrame = 0;
        this.stateDuration = AIR_DASH_STARTUP_FRAMES + AIR_DASH_ACTIVE_FRAMES;
        this.vx *= 0.25;
        this.vy *= 0.15;
        events.sound = 'dash';
        events.airDashBurst = this.airDashDir;
      }
      return events;
    }

    if ((this.state === 'dash_brake' || this.state === 'land') && this.stateFrame < 3) {
      if (input.up) {
        this.enterJumpsquat(input);
        return events;
      }
      return events;
    }

    if ((input.dashPressed && !input.back) || input.doubleForward) {
      this.state = 'dash_fwd';
      this.stateFrame = 0;
      this.stateDuration = 13;
      this.vx = this.facing * this.profile.dashSpeed;
      this.squashX = 1.06;
      this.squashY = 0.95;
      events.sound = 'dash';
      events.dust = 'dash';
      return events;
    }
    if ((input.dashPressed && input.back) || input.doubleBack) {
      this.state = 'dash_back';
      this.stateFrame = 0;
      this.stateDuration = 18;
      this.vx = -this.facing * this.profile.backdashSpeed;
      this.vy = -660;
      this.y = GROUND_Y - 2;
      this.invulnFrames = 10;
      events.sound = 'dash';
      events.dust = 'dash';
      return events;
    }

    if (input.up) {
      this.enterJumpsquat(input);
      return events;
    }

    if (input.down) {
      this.state = 'crouch';
      return events;
    }

    if (input.left && !input.right) {
      this.state = 'walk';
      const targetVx = this.facing === -1 ? -this.profile.walkSpeed : -this.profile.backWalkSpeed;
      const stepDelta = WALK_ACCEL * (1 / 60);
      this.vx = this.vx > targetVx ? Math.max(targetVx, this.vx - stepDelta) : Math.min(targetVx, this.vx + stepDelta);
    } else if (input.right && !input.left) {
      this.state = 'walk';
      const targetVx = this.facing === 1 ? this.profile.walkSpeed : this.profile.backWalkSpeed;
      const stepDelta = WALK_ACCEL * (1 / 60);
      this.vx = this.vx < targetVx ? Math.min(targetVx, this.vx + stepDelta) : Math.max(targetVx, this.vx - stepDelta);
    } else {
      this.state = 'idle';
    }

    return events;
  }

  private enterJumpsquat(input: PlayerInputState): void {
    this.state = 'jumpsquat';
    this.stateFrame = 0;
    this.stateDuration = JUMPSQUAT_FRAMES;
    this.jumpDir = input.right && !input.left ? 1 : input.left && !input.right ? -1 : 0;
    this.vx *= 0.4;
  }

  stepPhysics(dt: number, freezeFrame: boolean): { landed: boolean; events: LocomotionEvents } {
    const events: LocomotionEvents = {};
    this.trailingHp += (this.hp - this.trailingHp) * 0.09;
    this.squashX += (1.0 - this.squashX) * 0.24;
    this.squashY += (1.0 - this.squashY) * 0.24;

    // Micro hit-vibration primarily during hitstop freeze so hitstun poses read cleanly!
    if (this.hitShakeFrames > 0) {
      this.hitShakeFrames--;
      const amp = freezeFrame ? 7.0 : 2.2;
      this.hitShakeX = Math.sin(this.hitShakeFrames * 2.3) * (amp * Math.min(1, this.hitShakeFrames / 8));
    } else {
      this.hitShakeX = 0;
    }

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].alpha -= 0.082;
      if (this.afterimages[i].alpha <= 0.02) {
        this.afterimages.splice(i, 1);
      }
    }

    if (this.hitFlashFrames > 0) this.hitFlashFrames--;
    if (freezeFrame) {
      return { landed: false, events };
    }

    if (this.invulnFrames > 0) this.invulnFrames--;
    if (this.knockdownSlamFrames > 0) this.knockdownSlamFrames--;
    this.stateFrame++;
    this.animTick++;

    // Keep subtle rotation ONLY for airborne tumble; zero out immediately when lying flat!
    let targetRot = 0;
    if (!this.isGrounded && (this.state === 'hitstun' || this.state === 'knockdown' || this.state === 'ko')) {
      targetRot = Math.max(-0.18, Math.min(0.22, this.vy / 2800));
    }
    if (this.isGrounded && (this.state === 'knockdown' || this.state === 'ko')) {
      this.visualRotation *= 0.4;
      if (Math.abs(this.visualRotation) < 0.01) this.visualRotation = 0;
    } else {
      this.visualRotation += (targetRot - this.visualRotation) * 0.25;
    }

    // Grounded friction when idle, crouching, waking up, knocked out, or posing in victory
    if (
      this.isGrounded &&
      (this.state === 'idle' ||
        this.state === 'crouch' ||
        this.state === 'victory' ||
        this.state === 'wakeup' ||
        this.state === 'ko')
    ) {
      const decel = GROUND_FRICTION * dt;
      this.vx = Math.abs(this.vx) <= decel ? 0 : this.vx - Math.sign(this.vx) * decel;
    }

    // Continuous boot skid dust when sliding backward across the shrine floor after a heavy hit
    if (
      this.isGrounded &&
      (this.state === 'hitstun' || this.state === 'knockdown' || this.state === 'ko') &&
      Math.abs(this.vx) > 90 &&
      this.stateFrame % 3 === 1
    ) {
      events.dust = 'step';
    }

    // Damp kinetic attack lunge outside active frames
    if (this.state !== 'attack') {
      this.attackLungeX *= 0.72;
    }

    if (this.state === 'jumpsquat') {
      this.vx *= 0.65;
      if (this.stateFrame >= this.stateDuration) {
        this.state = 'jump';
        this.stateFrame = 0;
        this.vy = this.profile.jumpVy;
        this.vx = this.jumpDir * this.profile.jumpVx;
        this.y = GROUND_Y - 2;
        this.airDashUsed = false;
        this.squashX = 0.94;
        this.squashY = 1.07;
        events.sound = 'jump';
        events.dust = 'jump';
      }
    } else if (this.state === 'dash_fwd') {
      if (this.stateFrame % 4 === 1) {
        events.dust = 'step';
      }
      if (this.stateFrame >= this.stateDuration) {
        this.state = 'dash_brake';
        this.stateFrame = 0;
        this.stateDuration = DASH_BRAKE_FRAMES;
        events.sound = 'skid';
        events.soundGain = 0.72;
        events.dust = 'brake';
      }
    } else if (this.state === 'dash_brake') {
      this.vx *= 0.74;
      if (this.stateFrame >= this.stateDuration) {
        this.state = 'idle';
        this.vx = 0;
      }
    } else if (this.state === 'dash_back') {
      this.vx *= 0.985;
    } else if (this.state === 'air_dash') {
      if (this.stateFrame < AIR_DASH_STARTUP_FRAMES) {
        // Brief mid-air kick-off stall before jet burst
        this.vx *= 0.65;
        this.vy *= 0.35;
      } else if (this.stateFrame === AIR_DASH_STARTUP_FRAMES) {
        // Explosive jet burst with slight aerodynamic lift
        const spd = this.airDashForward ? AIR_DASH_SPEED_FWD : AIR_DASH_SPEED_BACK;
        this.vx = this.airDashDir * spd;
        this.vy = -105;
        this.squashX = 1.07;
        this.squashY = 0.94;
      } else {
        // Long physical aerodynamic glide curve
        this.vx *= 0.980;
        this.vy += 20;
      }
      if (this.stateFrame >= this.stateDuration) {
        this.state = 'jump';
        this.stateFrame = 0;
        this.vx *= 0.74;
      }
    } else if (this.state === 'land') {
      this.vx *= 0.68;
      if (this.stateFrame >= this.stateDuration) {
        this.state = 'idle';
        this.vx = 0;
      }
    } else if (this.state === 'block_high' || this.state === 'block_low') {
      this.vx *= 0.80;
      this.hitstunFrames--;
      if (this.hitstunFrames <= 0) {
        this.state = this.state === 'block_low' ? 'crouch' : 'idle';
      }
    } else if (this.state === 'hitstun') {
      if (this.isGrounded) {
        this.vx *= 0.82;
        this.hitstunElapsed++;
        this.hitstunFrames--;
        if (this.hitstunFrames <= 0) {
          this.state = 'idle';
          this.hitstunElapsed = 0;
          this.receivedComboCount = 0;
          this.receivedComboDamage = 0;
        }
      }
    } else if (this.state === 'knockdown') {
      if (this.isGrounded) {
        this.vx *= 0.82;
        this.knockdownFrames--;
        if (this.knockdownFrames <= 0) {
          this.state = 'wakeup';
          this.stateFrame = 0;
          this.invulnFrames = 16;
          this.receivedComboCount = 0;
          this.receivedComboDamage = 0;
        }
      }
    } else if (this.state === 'ko') {
      if (this.isGrounded) {
        this.vx *= 0.80;
        if (Math.abs(this.vx) < 6) this.vx = 0;
      }
    } else if (this.state === 'victory') {
      if (this.isGrounded) {
        this.vx *= 0.72;
        if (Math.abs(this.vx) < 8) this.vx = 0;
      } else {
        this.vx *= 0.94;
      }
    } else if (this.state === 'wakeup') {
      if (this.stateFrame >= 19) {
        this.state = 'idle';
      }
    } else if (this.state === 'attack' && this.currentMove) {
      const m = this.currentMove;
      this.moveFrame++;
      if (this.moveFrame < m.startup) {
        // Subtle backward coil during windup
        this.attackLungeX = -6;
      } else if (this.moveFrame < m.startup + m.active) {
        this.attackLungeX = m.strength === 'heavy' || m.isSuper ? 18 : 10;
      } else {
        this.attackLungeX *= 0.78;
      }
      if (this.moveFrame === m.startup) {
        if (m.activeVelocityX !== undefined) this.vx = this.facing * m.activeVelocityX;
        if (m.activeVelocityY !== undefined) this.vy = m.activeVelocityY;
      }
      if (this.isGrounded && this.moveFrame >= m.startup + m.active) {
        this.vx *= 0.76;
      }
      const total = m.startup + m.active + m.recovery;
      if (this.moveFrame >= total) {
        this.currentMove = null;
        this.moveCanCancel = false;
        this.attackLungeX = 0;
        this.state = this.isGrounded ? 'idle' : 'jump';
        if (this.isGrounded) this.vx = 0;
      }
    }

    // Integrate motion with heavy asymmetric gravity (except during air_dash glide)
    const prevX = this.x;
    const wasAir = !this.isGrounded;
    if ((!this.isGrounded || this.vy < 0) && this.state !== 'air_dash') {
      const grav = this.vy < 0 ? GRAVITY_RISE : GRAVITY_FALL;
      this.vy += grav * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.x));

    if (this.isGrounded && this.state === 'walk') {
      this.walkDist += Math.abs(this.x - prevX);
      const stepHalf = Math.floor((this.walkDist / WALK_STRIDE_PX) * 2);
      if (stepHalf !== this.lastWalkStepHalf) {
        this.lastWalkStepHalf = stepHalf;
        events.sound = 'footstep';
        events.soundGain = 0.42;
        events.dust = 'step';
      }
    }

    let landed = false;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      if (wasAir && this.vy > 80) {
        landed = true;
        const impactVy = this.vy;
        if (
          this.state === 'jump' ||
          this.state === 'air_dash' ||
          this.state === 'dash_back' ||
          (this.state === 'attack' && this.currentMove?.isAirborne)
        ) {
          const fromBackdash = this.state === 'dash_back';
          this.currentMove = null;
          this.moveCanCancel = false;
          this.attackLungeX = 0;
          this.state = 'land';
          this.stateFrame = 0;
          this.stateDuration = fromBackdash ? 4 : LAND_RECOVERY_FRAMES;
          this.vx *= fromBackdash ? 0.42 : 0.25;
          this.squashX = 1.07;
          this.squashY = 0.93;
          events.sound = fromBackdash ? 'skid' : 'land';
          events.soundGain = fromBackdash ? 0.62 : 0.85;
          events.dust = fromBackdash ? 'brake' : 'land';
          events.heavyLand = !fromBackdash && impactVy > 950;
        } else if (this.state === 'victory') {
          this.vx = 0;
          this.squashX = 1.05;
          this.squashY = 0.95;
          events.dust = 'land';
        } else if (this.state === 'hitstun' || this.state === 'knockdown' || this.state === 'ko') {
          if (!this.knockdownBounced && impactVy > 340) {
            // Dramatic anime ground bounce with compressed slam frame, impact cracks & shockwave!
            this.knockdownBounced = true;
            if (this.state === 'hitstun') this.state = 'knockdown';
            this.knockdownSlamFrames = 3;
            this.vy = -Math.min(480, impactVy * 0.42);
            this.vx *= 0.58;
            this.y = GROUND_Y - 2;
            events.sound = 'knockdown';
            events.soundGain = 0.9;
            events.groundBounce = true;
            return { landed: true, events };
          } else {
            if (this.state === 'hitstun') this.state = 'knockdown';
            this.knockdownSlamFrames = 5;
            this.knockdownFrames = 34;
            this.vx *= 0.45;
            events.sound = 'knockdown';
            events.soundGain = 0.55;
            events.dust = 'land';
          }
        }
      }
      this.vy = 0;
    }

    const wantsAfterimage =
      this.state === 'dash_fwd' ||
      (this.state === 'air_dash' && this.stateFrame >= AIR_DASH_STARTUP_FRAMES) ||
      this.state === 'dash_back' ||
      (this.state === 'attack' && Boolean(this.currentMove?.isSpecial || this.currentMove?.isSuper));

    if (wantsAfterimage) {
      this.afterimageSpawnTick++;
      if (this.afterimageSpawnTick % 2 === 0) {
        this.afterimages.push({
          x: this.x,
          y: this.y,
          facing: this.facing,
          pose: this.getActivePose(),
          scaleX: this.squashX,
          scaleY: this.squashY,
          rotation: this.visualRotation,
          alpha: 0.50,
          tint: this.accentColor,
        });
      }
    } else {
      this.afterimageSpawnTick = 0;
    }

    return { landed, events };
  }
}
