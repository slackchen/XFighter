import { INPUT_BUFFER_FRAMES } from './constants';
import type { PlayerInputState } from './types';

interface KeyBindingMap {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  light: string[];
  medium: string[];
  heavy: string[];
  special: string[];
  super: string[];
  dash: string[];
}

const P1_KEYS: KeyBindingMap = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  light: ['KeyJ'],
  medium: ['KeyK'],
  heavy: ['KeyL'],
  special: ['KeyU'],
  super: ['KeyI'],
  dash: ['KeyO'],
};

const P2_KEYS: KeyBindingMap = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  light: ['Numpad1', 'Comma'],
  medium: ['Numpad2', 'Period'],
  heavy: ['Numpad3', 'Slash'],
  special: ['Numpad4', 'Semicolon'],
  super: ['Numpad5', 'Quote'],
  dash: ['Numpad6', 'BracketLeft'],
};

interface BufferedFrame {
  dir: number; // Numpad 1..9 relative to facing (6 = forward, 4 = back, 2 = down, 8 = up)
  light: boolean;
  medium: boolean;
  heavy: boolean;
  special: boolean;
  superBtn: boolean;
  dash: boolean;
}

export class InputManager {
  private keysDown = new Set<string>();
  private prevBtns: Record<1 | 2, Record<string, boolean>> = {
    1: {},
    2: {},
  };
  private history: Record<1 | 2, BufferedFrame[]> = {
    1: [],
    2: [],
  };
  private singlePlayerMirrorArrows = false;

  constructor(singlePlayer = false) {
    this.singlePlayerMirrorArrows = singlePlayer;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  setSinglePlayer(singlePlayer: boolean): void {
    this.singlePlayerMirrorArrows = singlePlayer;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.keysDown.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private handleBlur = (): void => {
    this.keysDown.clear();
  };

  private isAnyKeyDown(codes: string[]): boolean {
    for (const c of codes) {
      if (this.keysDown.has(c)) return true;
    }
    return false;
  }

  private readGamepad(slot: 1 | 2): {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    light: boolean;
    medium: boolean;
    heavy: boolean;
    special: boolean;
    superBtn: boolean;
    dash: boolean;
  } | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    const activePads = Array.from(pads).filter((p): p is Gamepad => Boolean(p && p.connected));
    const pad = activePads[slot - 1];
    if (!pad) return null;

    const axX = pad.axes[0] ?? 0;
    const axY = pad.axes[1] ?? 0;
    const btn = (idx: number) => Boolean(pad.buttons[idx]?.pressed);

    return {
      left: axX < -0.35 || btn(14),
      right: axX > 0.35 || btn(15),
      up: axY < -0.45 || btn(12),
      down: axY > 0.45 || btn(13),
      light: btn(2), // Square / X
      medium: btn(3), // Triangle / Y
      heavy: btn(1), // Circle / B
      special: btn(0), // Cross / A
      superBtn: btn(5) || btn(7), // RB / RT
      dash: btn(4) || btn(6), // LB / LT
    };
  }

  sample(slot: 1 | 2, facing: 1 | -1): PlayerInputState {
    const map = slot === 1 ? P1_KEYS : P2_KEYS;
    const gp = this.readGamepad(slot);

    let left = this.isAnyKeyDown(map.left) || Boolean(gp?.left);
    let right = this.isAnyKeyDown(map.right) || Boolean(gp?.right);
    let up = this.isAnyKeyDown(map.up) || Boolean(gp?.up);
    let down = this.isAnyKeyDown(map.down) || Boolean(gp?.down);

    if (slot === 1 && this.singlePlayerMirrorArrows) {
      left = left || this.keysDown.has('ArrowLeft');
      right = right || this.keysDown.has('ArrowRight');
      up = up || this.keysDown.has('ArrowUp');
      down = down || this.keysDown.has('ArrowDown');
    }

    const light = this.isAnyKeyDown(map.light) || Boolean(gp?.light);
    const medium = this.isAnyKeyDown(map.medium) || Boolean(gp?.medium);
    const heavy = this.isAnyKeyDown(map.heavy) || Boolean(gp?.heavy);
    const special = this.isAnyKeyDown(map.special) || Boolean(gp?.special);
    const superBtn = this.isAnyKeyDown(map.super) || Boolean(gp?.superBtn);
    const dash = this.isAnyKeyDown(map.dash) || Boolean(gp?.dash);

    const prev = this.prevBtns[slot];
    const lightPressed = light && !prev.light;
    const mediumPressed = medium && !prev.medium;
    const heavyPressed = heavy && !prev.heavy;
    const specialPressed = special && !prev.special;
    const superPressed = superBtn && !prev.superBtn;
    const dashPressed = dash && !prev.dash;

    this.prevBtns[slot] = { light, medium, heavy, special, superBtn, dash };

    const forward = facing === 1 ? right && !left : left && !right;
    const back = facing === 1 ? left && !right : right && !left;

    const hx = forward ? 1 : back ? -1 : 0;
    const hy = up && !down ? 1 : down && !up ? -1 : 0;
    // Numpad notation relative to facing: 5 = neutral, 6 = fwd, 2 = down, 3 = down-fwd, etc.
    const dir = 5 + hx + hy * 3;

    const hist = this.history[slot];
    hist.push({
      dir,
      light: lightPressed,
      medium: mediumPressed,
      heavy: heavyPressed,
      special: specialPressed,
      superBtn: superPressed,
      dash: dashPressed,
    });
    if (hist.length > INPUT_BUFFER_FRAMES) {
      hist.shift();
    }

    return {
      left,
      right,
      up,
      down,
      lightPressed,
      mediumPressed,
      heavyPressed,
      lightHeld: light,
      mediumHeld: medium,
      heavyHeld: heavy,
      specialPressed,
      superPressed,
      dashPressed,
      forward,
      back,
      motion236: this.matchSequence(hist, [2, 3, 6]),
      motion623: this.matchSequence(hist, [6, 2, 3]),
      motion214: this.matchSequence(hist, [2, 1, 4]),
      doubleForward: this.matchDoubleTap(hist, 6),
      doubleBack: this.matchDoubleTap(hist, 4),
    };
  }

  private matchSequence(hist: BufferedFrame[], seq: number[]): boolean {
    if (hist.length < seq.length) return false;
    let idx = 0;
    for (let i = 0; i < hist.length; i++) {
      if (hist[i].dir === seq[idx]) {
        idx++;
        if (idx === seq.length) return true;
      }
    }
    return false;
  }

  private matchDoubleTap(hist: BufferedFrame[], targetDir: number): boolean {
    if (hist.length < 4) return false;
    // Look for targetDir -> neutral/other -> targetDir transition ending on current frame
    const last = hist[hist.length - 1];
    const prev = hist[hist.length - 2];
    if (last.dir !== targetDir || prev.dir === targetDir) return false;

    let sawGap = false;
    for (let i = hist.length - 2; i >= 0; i--) {
      const d = hist[i].dir;
      if (!sawGap && d !== targetDir) {
        sawGap = true;
      } else if (sawGap && d === targetDir) {
        return true;
      }
    }
    return false;
  }

  clearHistory(): void {
    this.history[1] = [];
    this.history[2] = [];
  }
}
