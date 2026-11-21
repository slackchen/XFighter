import { useEffect, useRef, useState } from 'react';
import { audioManager } from '../engine/AudioManager';
import { Camera } from '../engine/Camera';
import { CombatEngine } from '../engine/CombatEngine';
import { FIXED_DT, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../engine/constants';
import { FighterRenderer } from '../engine/FighterRenderer';
import { InputManager } from '../engine/InputManager';
import { StageRenderer } from '../engine/StageRenderer';
import type { CombatHudSnapshot, MatchConfig } from '../engine/types';
import { VFXManager } from '../engine/VFXManager';
import { BattleHUD } from './BattleHUD';
import { MoveListModal } from './MoveListModal';

interface BattleScreenProps {
  config: MatchConfig;
  hitboxDebug: boolean;
  onToggleHitboxDebug: () => void;
  onRematch: () => void;
  onReturnSelect: () => void;
  onReturnTitle: () => void;
}

export function BattleScreen({
  config,
  hitboxDebug,
  onToggleHitboxDebug,
  onRematch,
  onReturnSelect,
  onReturnTitle,
}: BattleScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(false);
  const hitboxDebugRef = useRef(hitboxDebug);
  hitboxDebugRef.current = hitboxDebug;

  const [paused, setPaused] = useState(false);
  pausedRef.current = paused;

  const engineRef = useRef<CombatEngine | null>(null);
  const [hud, setHud] = useState<CombatHudSnapshot>(() => ({
    phase: 'ROUND_ANNOUNCE',
    roundNumber: 1,
    timerSeconds: 99,
    announceText: 'ROUND 1',
    announceSubtext: '绯月星穹神社',
    winnerSlot: 0,
    winReason: '',
    p1: {
      charId: config.p1Char,
      palette: config.p1Palette,
      hp: 1000,
      maxHp: 1000,
      trailingHp: 1000,
      tension: 0,
      comboCount: 0,
      comboDamage: 0,
      roundsWon: 0,
      hitFlash: 0,
      isHurt: false,
    },
    p2: {
      charId: config.p2Char,
      palette: config.p2Palette,
      hp: 950,
      maxHp: 950,
      trailingHp: 950,
      tension: 0,
      comboCount: 0,
      comboDamage: 0,
      roundsWon: 0,
      hitFlash: 0,
      isHurt: false,
    },
    superCutin: null,
    p1Callout: null,
    p2Callout: null,
  }));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        setPaused((p) => {
          const next = !p;
          audioManager.playSfx(next ? 'ui_confirm' : 'ui_cancel', 0, 0.8);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const input = new InputManager(config.mode !== 'versus');
    const camera = new Camera();
    const vfx = new VFXManager();
    const stageRenderer = new StageRenderer();
    const fighterRenderer = new FighterRenderer();
    const engine = new CombatEngine(config, input, camera, vfx, audioManager);
    engineRef.current = engine;

    setHud(engine.getHudSnapshot());

    let raf = 0;
    let lastTime = performance.now();
    let acc = 0;
    let hudSyncCounter = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (!pausedRef.current) {
        acc += dt;
        let steps = 0;
        while (acc >= FIXED_DT && steps < 4) {
          engine.step(FIXED_DT);
          stageRenderer.update();
          fighterRenderer.updateTick();
          acc -= FIXED_DT;
          steps++;
        }
      }

      // Render Scene
      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      stageRenderer.renderBackground(
        ctx,
        camera,
        engine.superFreezeFrames,
        engine.superFreezeColor
      );

      ctx.save();
      camera.applyTransform(ctx);
      stageRenderer.renderWorldFloorAndReflections(
        ctx,
        [engine.p1, engine.p2],
        (c, f) => fighterRenderer.renderReflection(c, f)
      );
      stageRenderer.renderAmbientPetals(ctx, 'mid');

      // Render non-attacking fighter behind active attacker for crisp clash overlap
      if (engine.p2.state === 'attack' && engine.p1.state !== 'attack') {
        fighterRenderer.renderFighter(ctx, engine.p1, hitboxDebugRef.current);
        fighterRenderer.renderFighter(ctx, engine.p2, hitboxDebugRef.current);
      } else {
        fighterRenderer.renderFighter(ctx, engine.p2, hitboxDebugRef.current);
        fighterRenderer.renderFighter(ctx, engine.p1, hitboxDebugRef.current);
      }

      vfx.renderProjectiles(ctx, engine.projectiles);
      vfx.renderEffects(ctx);
      stageRenderer.renderAmbientPetals(ctx, 'front');
      ctx.restore();

      // Dramatic 2-frame monochrome Impact Frame flash on heavy/counter/KO blows
      if (vfx.impactFrameTimer > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = vfx.impactFrameTimer % 2 === 0 ? 'rgba(255,255,255,0.88)' : 'rgba(220,240,255,0.65)';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        ctx.restore();
      }

      hudSyncCounter++;
      if (hudSyncCounter % 2 === 0) {
        setHud(engine.getHudSnapshot());
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      input.destroy();
    };
  }, [config]);

  const handleInstantRematch = () => {
    setPaused(false);
    if (engineRef.current) {
      engineRef.current.resetMatch();
      setHud(engineRef.current.getHudSnapshot());
      void audioManager.playBgm('bgm_battle', true, 0.35);
    } else {
      onRematch();
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#050610' }}>
      <canvas
        ref={canvasRef}
        width={LOGICAL_WIDTH}
        height={LOGICAL_HEIGHT}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />

      <BattleHUD
        hud={hud}
        mode={config.mode}
        onOpenPause={() => {
          setPaused(true);
          audioManager.playSfx('ui_confirm', 0, 0.8);
        }}
        onRematch={handleInstantRematch}
        onReturnSelect={onReturnSelect}
        onReturnTitle={onReturnTitle}
      />

      {paused && (
        <MoveListModal
          isBattle
          p1Char={config.p1Char}
          p2Char={config.p2Char}
          hitboxDebug={hitboxDebug}
          onToggleHitboxDebug={onToggleHitboxDebug}
          onClose={() => setPaused(false)}
          onRematch={handleInstantRematch}
          onReturnSelect={onReturnSelect}
          onReturnTitle={onReturnTitle}
        />
      )}
    </div>
  );
}
