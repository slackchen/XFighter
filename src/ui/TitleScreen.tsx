import { BookOpen, Cpu, Dumbbell, Swords, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { audioManager } from '../engine/AudioManager';
import type { GameMode } from '../engine/types';

interface TitleScreenProps {
  onSelectMode: (mode: GameMode) => void;
  onOpenSettings: () => void;
}

interface MenuItem {
  id: string;
  labelZh: string;
  labelEn: string;
  sub: string;
  mode?: GameMode;
  icon: typeof Swords;
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'arcade',
    labelZh: '街机对决 · VS CPU',
    labelEn: 'ARCADE BATTLE',
    sub: '三局两胜 · 挑战 AI 宿敌',
    mode: 'arcade',
    icon: Cpu,
  },
  {
    id: 'versus',
    labelZh: '本地双人 · 2P 对战',
    labelEn: 'LOCAL VERSUS 2P',
    sub: '同屏双打 · 键盘或手柄对战',
    mode: 'versus',
    icon: Users,
  },
  {
    id: 'training',
    labelZh: '道场修行 · 训练模式',
    labelEn: 'TRAINING DOJO',
    sub: '无限能量 · 自由连段与判定框调试',
    mode: 'training',
    icon: Dumbbell,
  },
  {
    id: 'settings',
    labelZh: '出招指南与音效设置',
    labelEn: 'MOVE LIST & AUDIO',
    sub: '查看双女主出招表与音量调节',
    icon: BookOpen,
  },
];

export function TitleScreen({ onSelectMode, onOpenSettings }: TitleScreenProps) {
  const [unlocked, setUnlocked] = useState(() => audioManager.isUnlocked());
  const [focusIdx, setFocusIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ambient sakura + astral sparks particle overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles = Array.from({ length: 58 }, (_, i) => ({
      x: Math.random() * 1920,
      y: Math.random() * 1080,
      vx: -0.9 - Math.random() * 1.8,
      vy: 0.7 + Math.random() * 1.6,
      size: 5 + Math.random() * 10,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.06,
      isAstral: i % 3 === 0,
    }));

    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, 1920, 1080);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vRot;
        if (p.y > 1120) {
          p.y = -30;
          p.x = Math.random() * 2100;
        }
        if (p.x < -40) p.x = 1960;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.isAstral) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(85, 225, 255, 0.78)';
          ctx.shadowColor = '#2ad8ff';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.32, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255, 132, 175, 0.75)';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.48, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const activateUnlock = () => {
    if (unlocked) return;
    setUnlocked(true);
    void audioManager.unlock().then(() => {
      audioManager.playSfx('ui_confirm', 0, 0.9);
      void audioManager.playBgm('bgm_menu', true, 0.65);
    });
  };

  const triggerMenuItem = (idx: number) => {
    const item = MENU_ITEMS[idx];
    if (!item) return;
    audioManager.playSfx('ui_confirm', 0, 0.9);
    if (item.mode) {
      onSelectMode(item.mode);
    } else {
      onOpenSettings();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!unlocked) {
        activateUnlock();
        return;
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        setFocusIdx((i) => {
          const next = (i + 1) % MENU_ITEMS.length;
          audioManager.playSfx('ui_move', 0, 0.75);
          return next;
        });
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        setFocusIdx((i) => {
          const next = (i - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
          audioManager.playSfx('ui_move', 0, 0.75);
          return next;
        });
      } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') {
        e.preventDefault();
        triggerMenuItem(focusIdx);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      onClick={!unlocked ? activateUnlock : undefined}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: !unlocked ? 'pointer' : 'default',
      }}
    >
      {/* Animated Key Art Backdrop */}
      <img
        src="/assets/images/keyart_title.png"
        alt="Crimson Astral Blade Key Visual"
        className="ken-burns"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Cinematic Vignette & Contrast Gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(105deg, rgba(6,5,18,0.88) 0%, rgba(10,8,24,0.48) 44%, rgba(6,8,20,0.28) 72%, rgba(5,5,14,0.72) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(4,4,12,0.92) 0%, rgba(4,4,12,0) 38%)',
        }}
      />

      {/* Live Particles */}
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Console Version Tag */}
      <div
        style={{
          position: 'absolute',
          top: '3.2%',
          right: '3%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.7cqw',
          padding: '0.45cqw 1.1cqw',
          background: 'rgba(10, 12, 26, 0.72)',
          border: '1px solid rgba(255, 212, 102, 0.45)',
          transform: 'skewX(-14deg)',
          fontFamily: 'var(--font-tech)',
          fontSize: '0.78cqw',
          letterSpacing: '0.14em',
          color: '#ffd466',
        }}
      >
        <Swords size={15} />
        <span>CONSOLE EDITION DEMO · 60FPS</span>
      </div>

      {/* Main Game Title Logo */}
      <div
        style={{
          position: 'absolute',
          left: '4.5%',
          top: unlocked ? '8%' : '14%',
          transition: 'top 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
          maxWidth: '48%',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '0.3cqw 1.1cqw',
            marginBottom: '0.9cqw',
            background: 'linear-gradient(90deg, rgba(255,42,95,0.88), rgba(42,216,255,0.72))',
            transform: 'skewX(-16deg)',
            fontFamily: 'var(--font-tech)',
            fontSize: '0.82cqw',
            fontWeight: 800,
            letterSpacing: '0.24em',
            color: '#fff',
            boxShadow: '0 0 22px rgba(255,42,95,0.55)',
          }}
        >
          2D ANIME VERSUS FIGHTING
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '5.5cqw',
            fontWeight: 900,
            lineHeight: 1.04,
            letterSpacing: '0.08em',
            background: 'linear-gradient(180deg, #ffffff 0%, #ffe6ef 48%, #ff4778 82%, #ffb84d 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0.4cqw 1.4cqw rgba(255, 36, 92, 0.7))',
          }}
        >
          绯月星刃
        </h1>

        <div
          style={{
            marginTop: '0.35cqw',
            fontFamily: 'var(--font-tech)',
            fontSize: '1.65cqw',
            fontWeight: 900,
            letterSpacing: '0.26em',
            background: 'linear-gradient(90deg, #ff7096 0%, #ffffff 50%, #45e1ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 24px rgba(42, 216, 255, 0.35)',
          }}
        >
          CRIMSON ASTRAL BLADE
        </div>

        <div
          style={{
            marginTop: '0.9cqw',
            height: '3px',
            width: '86%',
            background: 'linear-gradient(90deg, #ff2a5f 0%, #ffd466 50%, rgba(42,216,255,0) 100%)',
          }}
        />
      </div>

      {/* First-Gesture Unlock Gate vs Mode Select Menu */}
      {!unlocked ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '9%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.7cqw',
          }}
        >
          <button
            type="button"
            onClick={activateUnlock}
            className="pulse-glow"
            style={{
              padding: '0.95cqw 3.8cqw',
              background: 'linear-gradient(90deg, rgba(255,42,95,0.88), rgba(140,22,72,0.88), rgba(42,216,255,0.82))',
              border: '2px solid rgba(255, 220, 140, 0.9)',
              transform: 'skewX(-16deg)',
              color: '#ffffff',
              fontFamily: 'var(--font-tech)',
              fontSize: '1.35cqw',
              fontWeight: 900,
              letterSpacing: '0.22em',
              cursor: 'pointer',
              boxShadow: '0 0 36px rgba(255, 42, 95, 0.55)',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(16deg)' }}>
              点击屏幕或按任意键进入 · PRESS START
            </span>
          </button>
          <span
            style={{
              fontSize: '0.85cqw',
              color: 'rgba(226, 232, 240, 0.85)',
              letterSpacing: '0.15em',
            }}
          >
            支持键盘单/双人对战 &amp; 游戏手柄即插即用 · 含原声摇滚战斗音乐与音效
          </span>
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: '4.5%',
            bottom: '8.5%',
            width: '36%',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.78cqw',
          }}
        >
          {MENU_ITEMS.map((item, idx) => {
            const active = idx === focusIdx;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => {
                  if (focusIdx !== idx) {
                    setFocusIdx(idx);
                    audioManager.playSfx('ui_move', -0.2, 0.65);
                  }
                }}
                onClick={() => triggerMenuItem(idx)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.1cqw',
                  padding: '0.95cqw 1.5cqw',
                  border: active
                    ? '2px solid #ffd466'
                    : '1px solid rgba(255, 255, 255, 0.22)',
                  background: active
                    ? 'linear-gradient(90deg, rgba(255,42,95,0.92) 0%, rgba(165,24,78,0.85) 60%, rgba(42,216,255,0.42) 100%)'
                    : 'rgba(10, 12, 28, 0.78)',
                  transform: `skewX(-14deg) translateX(${active ? '1.1cqw' : '0'})`,
                  transition: 'all 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: active ? '0 0 28px rgba(255, 42, 95, 0.55)' : 'none',
                  color: '#fff',
                }}
              >
                <div
                  style={{
                    transform: 'skewX(14deg)',
                    color: active ? '#ffd466' : '#7dd3fc',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Icon size={24} />
                </div>
                <div style={{ transform: 'skewX(14deg)', flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: '0.8cqw',
                    }}
                  >
                    <span style={{ fontSize: '1.25cqw', fontWeight: 900, letterSpacing: '0.06em' }}>
                      {item.labelZh}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-tech)',
                        fontSize: '0.7cqw',
                        letterSpacing: '0.14em',
                        color: active ? '#ffe8a3' : 'rgba(148, 163, 184, 0.85)',
                      }}
                    >
                      {item.labelEn}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: '0.18cqw',
                      fontSize: '0.78cqw',
                      color: active ? 'rgba(255,255,255,0.92)' : 'rgba(203, 213, 225, 0.72)',
                    }}
                  >
                    {item.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom Right Key Hint */}
      <div
        style={{
          position: 'absolute',
          right: '3%',
          bottom: '3.2%',
          padding: '0.45cqw 1cqw',
          background: 'rgba(8, 10, 22, 0.72)',
          border: '1px solid rgba(255,255,255,0.16)',
          fontSize: '0.78cqw',
          color: 'rgba(226, 232, 240, 0.86)',
          letterSpacing: '0.08em',
        }}
      >
        ↑↓ 选择模式 · Enter / 鼠标点击确认
      </div>
    </div>
  );
}
