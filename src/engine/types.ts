export type CharacterId = 'rin' | 'lia';
export type GameMode = 'arcade' | 'versus' | 'training';
export type AIDifficulty = 'casual' | 'arcade' | 'master';
export type PaletteSlot = 1 | 2;

export type SpritePoseKey =
  | 'stance'
  | 'guard'
  | 'dash'
  | 'aerial'
  | 'thrust'
  | 'lunge'
  | 'heroic'
  | 'idle_0'
  | 'idle_1'
  | 'idle_2'
  | 'idle_3'
  | 'walk_fwd_0'
  | 'walk_fwd_1'
  | 'walk_fwd_2'
  | 'walk_fwd_3'
  | 'walk_fwd_4'
  | 'walk_fwd_5'
  | 'walk_fwd_6'
  | 'walk_fwd_7'
  | 'walk_back_0'
  | 'walk_back_1'
  | 'walk_back_2'
  | 'walk_back_3'
  | 'walk_back_4'
  | 'walk_back_5'
  | 'walk_back_6'
  | 'walk_back_7'
  | 'run_0'
  | 'run_1'
  | 'run_2'
  | 'run_3'
  | 'crouch_0'
  | 'crouch_1'
  | 'jumpsquat'
  | 'jump_rise'
  | 'jump_fall'
  | 'land_heavy'
  | 'dash_brake'
  | 'backdash'
  | 'atk_windup'
  | 'atk_light'
  | 'atk_mid'
  | 'atk_heavy_prep'
  | 'atk_heavy_cleave'
  | 'atk_crouch_low'
  | 'atk_crouch_up'
  | 'atk_air_slash'
  | 'atk_special_up'
  | 'atk_special_fwd'
  | 'hurt_light'
  | 'hurt_heavy'
  | 'hurt_snap'
  | 'hurt_reel_1'
  | 'hurt_reel_2'
  | 'hurt_recover'
  | 'hurt_air_up'
  | 'hurt_air'
  | 'hurt_air_down'
  | 'knockdown_slam'
  | 'knockdown_ground'
  | 'wakeup_rise';

export type MoveId =
  | '5L'
  | '5M'
  | '5H'
  | '2L'
  | '2M'
  | '2H'
  | 'jL'
  | 'jM'
  | 'jH'
  | 'special_1'
  | 'special_2'
  | 'special_3'
  | 'super';

export type SpecialTier = 'light' | 'medium' | 'heavy';

export interface SpecialTierOverride {
  startup?: number;
  active?: number;
  recovery?: number;
  damage?: number;
  chipDamage?: number;
  hitstop?: number;
  hitstun?: number;
  blockstun?: number;
  pushback?: number;
  launchVx?: number;
  launchVy?: number;
  velocityX?: number;
  velocityY?: number;
  activeVelocityX?: number;
  activeVelocityY?: number;
  multiHitFrames?: number[];
  vfxScale?: number;
  projectile?: {
    spawnFrame?: number;
    offsetX?: number;
    offsetY?: number;
    speed?: number;
    damage?: number;
    hitstun?: number;
    blockstun?: number;
    width?: number;
    height?: number;
    scale?: number;
  };
}

export type FighterStateName =
  | 'idle'
  | 'walk'
  | 'dash_fwd'
  | 'dash_brake'
  | 'dash_back'
  | 'jumpsquat'
  | 'jump'
  | 'air_dash'
  | 'land'
  | 'crouch'
  | 'block_high'
  | 'block_low'
  | 'attack'
  | 'hitstun'
  | 'knockdown'
  | 'wakeup'
  | 'ko'
  | 'victory';

export type HitHeight = 'high' | 'mid' | 'low';
export type HitStrength = 'light' | 'medium' | 'heavy' | 'super';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MoveVfxSpec {
  slashArc?: {
    offsetX: number;
    offsetY: number;
    radiusX: number;
    radiusY: number;
    startAngle: number;
    endAngle: number;
    color: string;
    thickness: number;
    trackOwner?: boolean;
  };
  thrustBeam?: {
    offsetX: number;
    offsetY: number;
    length: number;
    width: number;
    color: string;
    angle?: number;
    trackOwner?: boolean;
    spiralRings?: boolean;
  };
}

export interface MoveDefinition {
  id: MoveId;
  nameZh: string;
  nameEn: string;
  commandText: string;
  descriptionZh: string;
  isAirborne?: boolean;
  isSpecial?: boolean;
  isSuper?: boolean;
  tensionCost?: number;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  chipDamage: number;
  hitHeight: HitHeight;
  strength: HitStrength;
  hitstop: number;
  hitstun: number;
  blockstun: number;
  pushback: number;
  launchVx: number;
  launchVy: number;
  knockdown?: boolean;
  invulnStartup?: boolean;
  hitbox: Box; // Relative to fighter foot (facing right: +x forward, -y upward)
  velocityX?: number;
  velocityY?: number;
  activeVelocityX?: number;
  activeVelocityY?: number;
  spawnProjectile?: {
    kind: 'sakura_wave' | 'star_lance';
    spawnFrame: number;
    offsetX: number;
    offsetY: number;
    speed: number;
    damage: number;
    hitstun: number;
    blockstun: number;
    width: number;
    height: number;
    color: string;
    scale?: number;
  };
  multiHitFrames?: number[]; // Optional extra active hit re-trigger frames (for Spiral / Super)
  cancelInto: MoveId[];
  startupPose: SpritePoseKey;
  activePose: SpritePoseKey;
  recoveryPose: SpritePoseKey;
  sfxSwing: string;
  sfxHit: string;
  vfx?: MoveVfxSpec;
  vfxScale?: number;
  tierVariants?: Record<SpecialTier, SpecialTierOverride>;
}

export interface CharacterProfile {
  id: CharacterId;
  nameZh: string;
  nameEn: string;
  titleZh: string;
  titleEn: string;
  archetypeZh: string;
  accentColor: string;
  secondaryColor: string;
  p2AccentColor: string;
  maxHp: number;
  walkSpeed: number;
  backWalkSpeed: number;
  dashSpeed: number;
  backdashSpeed: number;
  jumpVx: number;
  jumpVy: number;
  stats: {
    power: number;
    speed: number;
    reach: number;
    technique: number;
  };
  quotes: string[];
  moves: Record<MoveId, MoveDefinition>;
}

export interface PlayerInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  lightPressed: boolean;
  mediumPressed: boolean;
  heavyPressed: boolean;
  lightHeld: boolean;
  mediumHeld: boolean;
  heavyHeld: boolean;
  specialPressed: boolean;
  superPressed: boolean;
  dashPressed: boolean;
  // Interpreted relative to facing
  forward: boolean;
  back: boolean;
  motion236: boolean;
  motion623: boolean;
  motion214: boolean;
  doubleForward: boolean;
  doubleBack: boolean;
}

export interface Projectile {
  id: number;
  ownerSlot: 1 | 2;
  charId: CharacterId;
  palette: PaletteSlot;
  kind: 'sakura_wave' | 'star_lance';
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  width: number;
  height: number;
  damage: number;
  chipDamage: number;
  hitstun: number;
  blockstun: number;
  color: string;
  scale: number;
  age: number;
  hitsRemaining: number;
  hitCooldown: number;
}

export interface AfterimageSample {
  x: number;
  y: number;
  facing: 1 | -1;
  pose: SpritePoseKey;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  tint: string;
}

export type MatchPhase =
  | 'INTRO'
  | 'ROUND_ANNOUNCE'
  | 'FIGHT'
  | 'KO_SLOWMO'
  | 'ROUND_END'
  | 'MATCH_OVER';

export interface SuperCutinEvent {
  id: number;
  slot: 1 | 2;
  charId: CharacterId;
  palette: PaletteSlot;
  moveNameZh: string;
  moveNameEn: string;
}

export interface CalloutBanner {
  id: number;
  slot: 1 | 2;
  text: string;
  subtext?: string;
  color: string;
}

export interface FighterHudState {
  charId: CharacterId;
  palette: PaletteSlot;
  hp: number;
  maxHp: number;
  trailingHp: number;
  tension: number;
  comboCount: number;
  comboDamage: number;
  roundsWon: number;
  hitFlash: number;
  isHurt: boolean;
}

export interface CombatHudSnapshot {
  phase: MatchPhase;
  roundNumber: number;
  timerSeconds: number;
  announceText: string;
  announceSubtext: string;
  winnerSlot: 0 | 1 | 2;
  winReason: string;
  p1: FighterHudState;
  p2: FighterHudState;
  superCutin: SuperCutinEvent | null;
  p1Callout: CalloutBanner | null;
  p2Callout: CalloutBanner | null;
}

export interface AudioVolumes {
  master: number;
  bgm: number;
  sfx: number;
  announcer: number;
}

export interface MatchConfig {
  mode: GameMode;
  aiDifficulty: AIDifficulty;
  p1Char: CharacterId;
  p2Char: CharacterId;
  p1Palette: PaletteSlot;
  p2Palette: PaletteSlot;
}
