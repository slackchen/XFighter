import { GROUND_Y, MAX_TENSION } from './constants';
import type { Fighter } from './Fighter';
import type { AIDifficulty, MoveId, PlayerInputState, Projectile, SpecialTier } from './types';

function emptyInput(): PlayerInputState {
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

type AITactic = 'footsies' | 'zoning' | 'pressure' | 'disengage' | 'defensive';
type MoveGoal = 'approach' | 'retreat' | 'idle' | 'crouch';

interface QueuedStep {
  move: MoveId;
  tier?: SpecialTier;
}

export class AIController {
  private difficulty: AIDifficulty;
  private tactic: AITactic = 'footsies';
  private tacticTimer = 40;
  private decisionCooldown = 14;
  private moveGoal: MoveGoal = 'idle';
  private moveGoalTimer = 18;
  private blockTimer = 0;
  private blockLow = false;
  private closeRangeTicks = 0;
  private threatSeenFrames = 0;
  private queuedCombo: QueuedStep[] = [];
  private comboStepCooldown = 0;

  constructor(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
  }

  setDifficulty(diff: AIDifficulty): void {
    this.difficulty = diff;
  }

  reset(): void {
    this.tactic = 'footsies';
    this.tacticTimer = 36;
    this.decisionCooldown = 16;
    this.moveGoal = 'idle';
    this.moveGoalTimer = 18;
    this.blockTimer = 0;
    this.blockLow = false;
    this.closeRangeTicks = 0;
    this.threatSeenFrames = 0;
    this.queuedCombo = [];
    this.comboStepCooldown = 0;
  }

  private nextDecisionCooldown(): number {
    if (this.difficulty === 'master') return 10 + Math.floor(Math.random() * 8);
    if (this.difficulty === 'arcade') return 16 + Math.floor(Math.random() * 11);
    return 28 + Math.floor(Math.random() * 15);
  }

  decide(self: Fighter, opponent: Fighter, projectiles: Projectile[]): PlayerInputState {
    const input = emptyInput();
    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const facing: 1 | -1 = dx >= 0 ? 1 : -1;

    const reactionScale = this.difficulty === 'master' ? 1.0 : this.difficulty === 'arcade' ? 0.65 : 0.34;
    const prefMin = self.charId === 'lia' ? 460 : 340;
    const prefMax = self.charId === 'lia' ? 680 : 500;

    // 1. Track crowding inside preferred neutral band so AI avoids smothering the player
    if (dist < prefMin - 20) {
      this.closeRangeTicks++;
    } else {
      this.closeRangeTicks = Math.max(0, this.closeRangeTicks - 2);
    }
    if (self.state !== 'attack') {
      this.queuedCombo = [];
    }

    // 2. Hit-confirmed combo chain (Master/Arcade only advance on actual hit connect)
    if (this.queuedCombo.length > 0 && self.state === 'attack' && self.moveCanCancel) {
      const canConfirm = self.moveHitConnected && (this.difficulty !== 'casual' || Math.random() < 0.45);
      if (canConfirm && this.comboStepCooldown <= 0) {
        const nextStep = this.queuedCombo.shift()!;
        this.applyMoveButton(input, nextStep.move, facing, nextStep.tier ?? 'medium');
        this.comboStepCooldown = 4;
        return input;
      }
    }
    if (this.comboStepCooldown > 0) this.comboStepCooldown--;

    // 3. Human-like visual reaction delay for incoming attacks / projectiles
    const threatProj = projectiles.some((p) => {
      if (p.ownerSlot === self.slot) return false;
      const movingTowardSelf = (self.x - p.x) * p.vx > 0;
      return movingTowardSelf && Math.abs(p.x - self.x) < 340;
    });
    const oppAttackingNear =
      opponent.state === 'attack' &&
      dist < 350 &&
      opponent.moveFrame <= (opponent.currentMove?.startup ?? 8) + 6;

    if (threatProj || oppAttackingNear) {
      this.threatSeenFrames++;
    } else {
      this.threatSeenFrames = Math.max(0, this.threatSeenFrames - 2);
    }

    const needFrames = this.difficulty === 'master' ? 4 : this.difficulty === 'arcade' ? 8 : 13;
    const blockProb = this.difficulty === 'master' ? 0.82 : this.difficulty === 'arcade' ? 0.58 : 0.32;
    if (
      this.blockTimer <= 0 &&
      self.canAct() &&
      (this.threatSeenFrames === needFrames || (this.threatSeenFrames > needFrames && this.threatSeenFrames % 10 === 0))
    ) {
      if (Math.random() < blockProb) {
        this.blockTimer = 14 + Math.floor(Math.random() * 9);
        this.blockLow = opponent.currentMove?.hitHeight === 'low';
      }
    }

    if (this.blockTimer > 0) {
      this.blockTimer--;
      this.setBack(input, facing);
      if (this.blockLow) input.down = true;
      return input;
    }

    // 4. Anti-air vs jumping opponent
    if (
      !opponent.isGrounded &&
      opponent.y < GROUND_Y - 120 &&
      dist < 290 &&
      self.isGrounded &&
      self.canAct() &&
      this.decisionCooldown <= 0
    ) {
      const antiAirProb = this.difficulty === 'master' ? 0.72 : this.difficulty === 'arcade' ? 0.45 : 0.20;
      if (Math.random() < antiAirProb) {
        const tier: SpecialTier = opponent.y < GROUND_Y - 310 ? 'heavy' : 'medium';
        if (self.charId === 'rin') {
          this.applyMoveButton(input, Math.random() < 0.65 ? 'special_2' : '2H', facing, tier);
        } else {
          this.applyMoveButton(input, '2H', facing, tier);
        }
        this.decisionCooldown = this.difficulty === 'master' ? 14 : this.difficulty === 'arcade' ? 22 : 34;
        return input;
      }
    }

    // 5. Whiff punish if opponent misses a heavy/medium swing nearby
    if (
      opponent.state === 'attack' &&
      opponent.currentMove &&
      opponent.moveFrame >= opponent.currentMove.startup + opponent.currentMove.active + 3 &&
      dist < 380 &&
      self.isGrounded &&
      self.canAct() &&
      this.decisionCooldown <= 0
    ) {
      const whiffProb = this.difficulty === 'master' ? 0.65 : this.difficulty === 'arcade' ? 0.38 : 0.14;
      if (Math.random() < whiffProb) {
        const roll = Math.random();
        if (roll < 0.45) {
          this.applyMoveButton(input, '5M', facing);
          if (this.difficulty !== 'casual') {
            this.queuedCombo = [{ move: '5H' }, { move: 'special_3', tier: 'medium' }];
          }
        } else if (roll < 0.75) {
          this.applyMoveButton(input, '2M', facing);
          if (this.difficulty !== 'casual') {
            this.queuedCombo = [{ move: '2H' }, { move: 'special_2', tier: 'medium' }];
          }
        } else {
          this.applyMoveButton(input, 'special_3', facing, 'medium');
        }
        this.decisionCooldown = this.nextDecisionCooldown();
        return input;
      }
    }

    // 6. Respect downed / waking opponent instead of crowding on top of them
    if (opponent.state === 'knockdown' || opponent.state === 'wakeup') {
      if (dist < 305) {
        if (dist < 215 && self.isGrounded && self.canAct() && Math.random() < 0.08) {
          input.dashPressed = true;
          this.setBack(input, facing);
          return input;
        }
        this.setBack(input, facing);
        return input;
      }
      if (dist <= 430) {
        if (this.decisionCooldown <= 0 && Math.random() < 0.28 * reactionScale) {
          this.applyMoveButton(input, 'special_1', facing, 'light');
          this.decisionCooldown = this.nextDecisionCooldown();
          return input;
        }
        input.down = Math.random() < 0.4;
        return input;
      }
    }

    // 7. Update tactical state (Anti-crowding disengage -> neutral footsies / zoning / pressure)
    if (this.closeRangeTicks > 42 && this.tactic !== 'disengage' && this.tactic !== 'pressure') {
      this.tactic = 'disengage';
      this.tacticTimer = 42 + Math.floor(Math.random() * 26);
      this.moveGoal = 'retreat';
      this.moveGoalTimer = 26;
    } else if (this.tacticTimer > 0) {
      this.tacticTimer--;
    } else {
      this.chooseNextTactic(dist, prefMin, prefMax, self.charId);
    }

    // Disengage mode: explicitly step/backdash out to comfortable neutral spacing
    if (this.tactic === 'disengage') {
      if (dist >= prefMin + 35) {
        this.tactic = 'footsies';
        this.tacticTimer = 48;
      } else {
        if (dist < 280 && self.isGrounded && self.canAct() && this.decisionCooldown <= 0 && Math.random() < 0.30) {
          input.dashPressed = true;
          this.setBack(input, facing);
          this.decisionCooldown = this.nextDecisionCooldown();
          return input;
        }
        this.setBack(input, facing);
        return input;
      }
    }

    // 8. Micro-step shimmy locomotion around preferred spacing band
    if (this.moveGoalTimer > 0) {
      this.moveGoalTimer--;
    } else {
      this.moveGoalTimer = 14 + Math.floor(Math.random() * 16);
      this.pickMicroMoveGoal(dist, prefMin, prefMax);
    }

    // 9. Paced decision tick for pokes, specials, and air-checks
    if (this.decisionCooldown > 0) {
      this.decisionCooldown--;
    } else if (self.isGrounded && self.canAct()) {
      this.decisionCooldown = this.nextDecisionCooldown();
      const roll = Math.random();

      if (self.tension >= MAX_TENSION && dist < 440 && roll < 0.34 * reactionScale) {
        input.superPressed = true;
        return input;
      }

      if (dist > prefMax + 40) {
        // Long / zoning range: maintain composure with projectiles & patient footsies
        if (roll < 0.44 * (0.55 + reactionScale * 0.45)) {
          const projTier: SpecialTier = dist > 640 ? 'heavy' : 'medium';
          this.applyMoveButton(input, 'special_1', facing, projTier);
          return input;
        } else if (self.charId === 'lia' && dist < 720 && this.tactic === 'pressure' && roll < 0.56) {
          this.applyMoveButton(input, 'special_3', facing, 'heavy');
          return input;
        } else if (dist > 840 && roll < 0.72) {
          input.dashPressed = true;
          this.setForward(input, facing);
          return input;
        } else if (roll < 0.82) {
          this.moveGoal = 'approach';
        } else {
          this.moveGoal = 'idle';
        }
      } else if (dist >= prefMin - 50) {
        // Sweet-spot neutral footsies band [300..500 for Rin, 410..680 for Lia]
        if (roll < 0.28) {
          this.applyMoveButton(input, 'special_1', facing, dist > prefMin + 60 ? 'medium' : 'light');
          return input;
        } else if (roll < 0.46) {
          this.applyMoveButton(input, '5M', facing);
          if (this.difficulty !== 'casual') {
            this.queuedCombo = [{ move: '5H' }, { move: 'special_3', tier: 'medium' }];
          }
          return input;
        } else if (roll < 0.58) {
          this.applyMoveButton(input, '2M', facing);
          if (this.difficulty !== 'casual') {
            this.queuedCombo = [{ move: '2H' }, { move: 'special_1', tier: 'heavy' }];
          }
          return input;
        } else if (this.tactic === 'pressure' && roll < 0.72) {
          this.applyMoveButton(input, self.charId === 'lia' ? 'special_2' : 'special_3', facing, 'medium');
          return input;
        } else if (this.tactic === 'pressure' && roll < 0.80) {
          input.up = true;
          this.setForward(input, facing);
          return input;
        } else {
          this.pickMicroMoveGoal(dist, prefMin, prefMax);
        }
      } else if (dist >= 255) {
        // Slightly inside comfortable spacing: mostly disengage back to neutral OR throw defensive poke
        if (roll < 0.46) {
          this.tactic = 'disengage';
          this.tacticTimer = 38;
          this.setBack(input, facing);
          return input;
        } else if (roll < 0.66) {
          this.applyMoveButton(input, '5M', facing);
          return input;
        } else if (roll < 0.82) {
          this.applyMoveButton(input, '2M', facing);
          return input;
        } else {
          this.applyMoveButton(input, 'special_1', facing, 'light');
          return input;
        }
      } else {
        // Close skirmish (< 255px): disengage / backdash OR fast check
        if (roll < 0.44) {
          this.tactic = 'disengage';
          this.tacticTimer = 38;
          if (Math.random() < 0.45) input.dashPressed = true;
          this.setBack(input, facing);
          return input;
        } else if (roll < 0.64) {
          this.applyMoveButton(input, '5L', facing);
          if (this.difficulty === 'master') {
            this.queuedCombo =
              self.tension >= MAX_TENSION
                ? [{ move: '5M' }, { move: '5H' }, { move: 'super' }]
                : [{ move: '5M' }, { move: '5H' }, { move: 'special_3', tier: 'light' }];
          } else if (this.difficulty === 'arcade') {
            this.queuedCombo = [{ move: '5M' }, { move: 'special_1', tier: 'light' }];
          }
          return input;
        } else if (roll < 0.80) {
          this.applyMoveButton(input, '2L', facing);
          if (this.difficulty !== 'casual') {
            this.queuedCombo = [{ move: '2M' }, { move: 'special_2', tier: 'light' }];
          }
          return input;
        } else if (roll < 0.90) {
          this.applyMoveButton(input, '5H', facing);
          return input;
        } else {
          this.applyMoveButton(input, 'special_2', facing, 'light');
          return input;
        }
      }
    }

    // Air attack if currently airborne near opponent
    if (!self.isGrounded && self.vy > -140 && dist < 260 && Math.random() < 0.22) {
      if (Math.random() < 0.5) input.mediumPressed = true;
      else input.heavyPressed = true;
      return input;
    }

    // Apply micro locomotion goal — never blindly push inside prefMin unless actively pressuring
    if (this.moveGoal === 'approach' && (dist > prefMin - 15 || this.tactic === 'pressure')) {
      this.setForward(input, facing);
    } else if (this.moveGoal === 'retreat') {
      this.setBack(input, facing);
    } else if (this.moveGoal === 'crouch') {
      input.down = true;
    }

    return input;
  }

  private chooseNextTactic(dist: number, prefMin: number, prefMax: number, charId: Fighter['charId']): void {
    const r = Math.random();
    if (dist < prefMin - 40) {
      this.tactic = r < 0.55 ? 'disengage' : r < 0.80 ? 'footsies' : 'pressure';
      this.tacticTimer = 34 + Math.floor(Math.random() * 24);
    } else if (dist > prefMax + 100) {
      this.tactic = charId === 'lia' && r < 0.52 ? 'zoning' : r < 0.78 ? 'footsies' : 'pressure';
      this.tacticTimer = 42 + Math.floor(Math.random() * 28);
    } else {
      if (r < 0.56) {
        this.tactic = 'footsies';
        this.tacticTimer = 45 + Math.floor(Math.random() * 30);
      } else if (r < 0.78) {
        this.tactic = 'zoning';
        this.tacticTimer = 40 + Math.floor(Math.random() * 25);
      } else if (r < 0.90) {
        this.tactic = 'pressure';
        this.tacticTimer = 36 + Math.floor(Math.random() * 20);
      } else {
        this.tactic = 'disengage';
        this.tacticTimer = 32 + Math.floor(Math.random() * 18);
      }
    }
  }

  private pickMicroMoveGoal(dist: number, prefMin: number, prefMax: number): void {
    const r = Math.random();
    if (dist < prefMin - 30) {
      this.moveGoal = r < 0.65 ? 'retreat' : r < 0.90 ? 'idle' : 'crouch';
    } else if (dist > prefMax + 40) {
      this.moveGoal = r < 0.68 ? 'approach' : 'idle';
    } else {
      if (r < 0.34) this.moveGoal = 'idle';
      else if (r < 0.62) this.moveGoal = 'retreat';
      else if (r < 0.86) this.moveGoal = 'approach';
      else this.moveGoal = 'crouch';
    }
  }

  private setForward(input: PlayerInputState, facing: 1 | -1): void {
    input.forward = true;
    if (facing === 1) input.right = true;
    else input.left = true;
  }

  private setBack(input: PlayerInputState, facing: 1 | -1): void {
    input.back = true;
    if (facing === 1) input.left = true;
    else input.right = true;
  }

  private applyMoveButton(
    input: PlayerInputState,
    move: MoveId,
    facing: 1 | -1,
    tier: SpecialTier = 'medium'
  ): void {
    switch (move) {
      case '5L':
        input.lightPressed = true;
        break;
      case '5M':
        input.mediumPressed = true;
        break;
      case '5H':
        input.heavyPressed = true;
        break;
      case '2L':
        input.down = true;
        input.lightPressed = true;
        break;
      case '2M':
        input.down = true;
        input.mediumPressed = true;
        break;
      case '2H':
        input.down = true;
        input.heavyPressed = true;
        break;
      case 'jL':
        input.lightPressed = true;
        break;
      case 'jM':
        input.mediumPressed = true;
        break;
      case 'jH':
        input.heavyPressed = true;
        break;
      case 'special_1':
        input.specialPressed = true;
        if (tier === 'light') input.lightHeld = true;
        else if (tier === 'heavy') input.heavyHeld = true;
        break;
      case 'special_2':
        input.specialPressed = true;
        if (tier === 'light') input.lightHeld = true;
        else if (tier === 'heavy') input.heavyHeld = true;
        this.setForward(input, facing);
        break;
      case 'special_3':
        input.specialPressed = true;
        if (tier === 'light') input.lightHeld = true;
        else if (tier === 'heavy') input.heavyHeld = true;
        input.down = true;
        break;
      case 'super':
        input.superPressed = true;
        break;
    }
  }
}
