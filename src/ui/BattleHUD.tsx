import { BookOpen, Flame, Pause, RotateCcw, Users } from 'lucide-react';
import { CHARACTERS } from '../engine/CharacterData';
import { MAX_TENSION, ROUNDS_TO_WIN } from '../engine/constants';
import type { CombatHudSnapshot, GameMode } from '../engine/types';

interface BattleHUDProps {
  hud: CombatHudSnapshot;
  mode: GameMode;
  onOpenPause: () => void;
  onRematch: () => void;
  onReturnSelect: () => void;
  onReturnTitle: () => void;
}

export function BattleHUD({
  hud,
  mode,
  onOpenPause,
  onRematch,
  onReturnSelect,
  onReturnTitle,
}: BattleHUDProps) {
  const p1Prof = CHARACTERS[hud.p1.charId];
  const p2Prof = CHARACTERS[hud.p2.charId];
  const p1Col = hud.p1.palette === 2 ? p1Prof.p2AccentColor : p1Prof.accentColor;
  const p2Col = hud.p2.palette === 2 ? p2Prof.p2AccentColor : p2Prof.accentColor;

  const p1HpPct = Math.max(0, Math.min(100, (hud.p1.hp / hud.p1.maxHp) * 100));
  const p1TrailPct = Math.max(p1HpPct, Math.min(100, (hud.p1.trailingHp / hud.p1.maxHp) * 100));
  const p2HpPct = Math.max(0, Math.min(100, (hud.p2.hp / hud.p2.maxHp) * 100));
  const p2TrailPct = Math.max(p2HpPct, Math.min(100, (hud.p2.trailingHp / hud.p2.maxHp) * 100));

  const p1TenPct = Math.max(0, Math.min(100, (hud.p1.tension / MAX_TENSION) * 100));
  const p2TenPct = Math.max(0, Math.min(100, (hud.p2.tension / MAX_TENSION) * 100));

  const p1HudImg = `/assets/images/${hud.p1.charId}_hud${hud.p1.palette === 2 ? '_p2' : ''}.png`;
  const p2HudImg = `/assets/images/${hud.p2.charId}_hud${hud.p2.palette === 2 ? '_p2' : ''}.png`;

  const cutinFlip =
    hud.superCutin &&
    ((hud.superCutin.charId === 'rin' && hud.superCutin.slot === 2) ||
      (hud.superCutin.charId === 'lia' && hud.superCutin.slot === 1));

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      {/* Top Health Bars & Timer */}
      <div
        style={{
          position: 'absolute',
          top: '2.2%',
          left: '2.5%',
          right: '2.5%',
          display: 'grid',
          gridTemplateColumns: '1fr 8.8cqw 1fr',
          alignItems: 'start',
          gap: '0.8cqw',
        }}
      >
        {/* P1 Left Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7cqw' }}>
          <div
            style={{
              width: '5.1cqw',
              height: '5.1cqw',
              flexShrink: 0,
              background: `radial-gradient(circle, ${p1Col}55, #0a0b1a)`,
              border: `2px solid ${p1Col}`,
              boxShadow: `0 0 18px ${p1Col}66`,
              transform: hud.p1.isHurt ? 'translateX(-4px)' : 'none',
              overflow: 'hidden',
            }}
          >
            <img
              src={p1HudImg}
              alt={p1Prof.nameZh}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.28cqw' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5cqw' }}>
                <span style={{ fontSize: '1.1cqw', fontWeight: 900, textShadow: '0 2px 8px #000' }}>
                  {p1Prof.nameZh}
                </span>
                <span style={{ fontFamily: 'var(--font-tech)', fontSize: '0.68cqw', color: p1Col, fontWeight: 800 }}>
                  1P
                </span>
              </div>
              {/* Round Orbs */}
              <div style={{ display: 'flex', gap: '0.35cqw' }}>
                {Array.from({ length: ROUNDS_TO_WIN }).map((_, i) => {
                  const won = i < hud.p1.roundsWon;
                  return (
                    <div
                      key={i}
                      style={{
                        width: '0.9cqw',
                        height: '0.9cqw',
                        transform: 'rotate(45deg)',
                        background: won ? '#ffd466' : 'rgba(255,255,255,0.16)',
                        border: '1px solid rgba(255,255,255,0.45)',
                        boxShadow: won ? '0 0 12px #ffd466' : 'none',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Slanted Health Bar (drains outward to the left edge toward center or right-to-left) */}
            <div
              style={{
                position: 'relative',
                height: '1.65cqw',
                background: 'rgba(10, 12, 24, 0.88)',
                border: '2px solid rgba(255, 255, 255, 0.55)',
                transform: 'skewX(-18deg)',
                overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
              }}
            >
              {/* Trailing red/white delayed drain */}
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: `${p1TrailPct}%`,
                  background: '#ef4444',
                }}
              />
              {/* Active HP */}
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: `${p1HpPct}%`,
                  background:
                    p1HpPct < 26
                      ? 'linear-gradient(90deg, #ff1e56, #ff8a3d)'
                      : `linear-gradient(90deg, ${p1Col}, #ffe066)`,
                  boxShadow: `0 0 14px ${p1Col}`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 45%)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Center Timer & Pause Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              width: '100%',
              padding: '0.25cqw 0',
              background: 'linear-gradient(180deg, rgba(16,18,38,0.95), rgba(8,9,20,0.92))',
              border: '2px solid rgba(255, 212, 102, 0.65)',
              clipPath: 'polygon(10% 0, 90% 0, 100% 50%, 86% 100%, 14% 100%, 0 50%)',
              textAlign: 'center',
              boxShadow: '0 0 24px rgba(0,0,0,0.75)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-tech)', fontSize: '0.58cqw', color: '#ffd466', letterSpacing: '0.16em' }}>
              {mode === 'training' ? 'TRAINING' : `ROUND ${hud.roundNumber}`}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-tech)',
                fontSize: '2.3cqw',
                fontWeight: 900,
                lineHeight: 1.05,
                color: mode !== 'training' && hud.timerSeconds <= 15 ? '#ff4d6d' : '#ffffff',
                textShadow: '0 0 14px rgba(255,255,255,0.45)',
              }}
            >
              {mode === 'training' ? '∞' : String(hud.timerSeconds).padStart(2, '0')}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenPause}
            style={{
              pointerEvents: 'auto',
              marginTop: '0.35cqw',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3cqw',
              padding: '0.2cqw 0.7cqw',
              background: 'rgba(10, 12, 26, 0.8)',
              border: '1px solid rgba(255,255,255,0.22)',
              color: '#e2e8f0',
              fontSize: '0.66cqw',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Pause size={11} /> 菜单 / 出招表 (ESC)
          </button>
        </div>

        {/* P2 Right Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7cqw' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.28cqw' }}>
              <div style={{ display: 'flex', gap: '0.35cqw' }}>
                {Array.from({ length: ROUNDS_TO_WIN }).map((_, i) => {
                  const won = i < hud.p2.roundsWon;
                  return (
                    <div
                      key={i}
                      style={{
                        width: '0.9cqw',
                        height: '0.9cqw',
                        transform: 'rotate(45deg)',
                        background: won ? '#ffd466' : 'rgba(255,255,255,0.16)',
                        border: '1px solid rgba(255,255,255,0.45)',
                        boxShadow: won ? '0 0 12px #ffd466' : 'none',
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5cqw' }}>
                <span style={{ fontFamily: 'var(--font-tech)', fontSize: '0.68cqw', color: p2Col, fontWeight: 800 }}>
                  {mode === 'arcade' ? 'CPU' : mode === 'training' ? 'DUMMY' : '2P'}
                </span>
                <span style={{ fontSize: '1.1cqw', fontWeight: 900, textShadow: '0 2px 8px #000' }}>
                  {p2Prof.nameZh}
                </span>
              </div>
            </div>

            <div
              style={{
                position: 'relative',
                height: '1.65cqw',
                background: 'rgba(10, 12, 24, 0.88)',
                border: '2px solid rgba(255, 255, 255, 0.55)',
                transform: 'skewX(18deg)',
                overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${p2TrailPct}%`,
                  background: '#ef4444',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${p2HpPct}%`,
                  background:
                    p2HpPct < 26
                      ? 'linear-gradient(270deg, #ff1e56, #ff8a3d)'
                      : `linear-gradient(270deg, ${p2Col}, #a5f3fc)`,
                  boxShadow: `0 0 14px ${p2Col}`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 45%)',
                }}
              />
            </div>
          </div>

          <div
            style={{
              width: '5.1cqw',
              height: '5.1cqw',
              flexShrink: 0,
              background: `radial-gradient(circle, ${p2Col}55, #0a0b1a)`,
              border: `2px solid ${p2Col}`,
              boxShadow: `0 0 18px ${p2Col}66`,
              transform: hud.p2.isHurt ? 'translateX(4px)' : 'none',
              overflow: 'hidden',
            }}
          >
            <img
              src={p2HudImg}
              alt={p2Prof.nameZh}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
          </div>
        </div>
      </div>

      {/* Combo Counters & Callout Banners */}
      {hud.p1.comboCount >= 2 && (
        <div
          key={`c1-${hud.p1.comboCount}`}
          style={{
            position: 'absolute',
            left: '3.2%',
            top: '23%',
            animation: 'comboPop 0.22s ease-out',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-tech)',
              fontSize: '4.4cqw',
              fontWeight: 900,
              fontStyle: 'italic',
              lineHeight: 0.95,
              background: `linear-gradient(180deg, #ffffff 15%, ${p1Col} 90%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 0 16px ${p1Col})`,
            }}
          >
            {hud.p1.comboCount} <span style={{ fontSize: '1.8cqw' }}>HITS!</span>
          </div>
          <div style={{ fontSize: '0.88cqw', fontWeight: 900, color: '#ffd466', letterSpacing: '0.12em', textShadow: '0 2px 6px #000' }}>
            DAMAGE {hud.p1.comboDamage}
          </div>
        </div>
      )}

      {hud.p2.comboCount >= 2 && (
        <div
          key={`c2-${hud.p2.comboCount}`}
          style={{
            position: 'absolute',
            right: '3.2%',
            top: '23%',
            textAlign: 'right',
            animation: 'comboPop 0.22s ease-out',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-tech)',
              fontSize: '4.4cqw',
              fontWeight: 900,
              fontStyle: 'italic',
              lineHeight: 0.95,
              background: `linear-gradient(180deg, #ffffff 15%, ${p2Col} 90%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 0 16px ${p2Col})`,
            }}
          >
            {hud.p2.comboCount} <span style={{ fontSize: '1.8cqw' }}>HITS!</span>
          </div>
          <div style={{ fontSize: '0.88cqw', fontWeight: 900, color: '#ffd466', letterSpacing: '0.12em', textShadow: '0 2px 6px #000' }}>
            DAMAGE {hud.p2.comboDamage}
          </div>
        </div>
      )}

      {hud.p1Callout && (
        <div
          key={hud.p1Callout.id}
          style={{
            position: 'absolute',
            left: '3.2%',
            top: '15.5%',
            padding: '0.28cqw 0.95cqw',
            background: 'rgba(8,10,24,0.86)',
            borderLeft: `4px solid ${hud.p1Callout.color}`,
            transform: 'skewX(-14deg)',
          }}
        >
          <div style={{ transform: 'skewX(14deg)', fontFamily: 'var(--font-tech)', fontSize: '1.05cqw', fontWeight: 900, color: hud.p1Callout.color }}>
            {hud.p1Callout.text}
          </div>
          {hud.p1Callout.subtext && (
            <div style={{ transform: 'skewX(14deg)', fontSize: '0.72cqw', color: '#fff' }}>
              {hud.p1Callout.subtext}
            </div>
          )}
        </div>
      )}

      {hud.p2Callout && (
        <div
          key={hud.p2Callout.id}
          style={{
            position: 'absolute',
            right: '3.2%',
            top: '15.5%',
            padding: '0.28cqw 0.95cqw',
            background: 'rgba(8,10,24,0.86)',
            borderRight: `4px solid ${hud.p2Callout.color}`,
            transform: 'skewX(14deg)',
            textAlign: 'right',
          }}
        >
          <div style={{ transform: 'skewX(-14deg)', fontFamily: 'var(--font-tech)', fontSize: '1.05cqw', fontWeight: 900, color: hud.p2Callout.color }}>
            {hud.p2Callout.text}
          </div>
          {hud.p2Callout.subtext && (
            <div style={{ transform: 'skewX(-14deg)', fontSize: '0.72cqw', color: '#fff' }}>
              {hud.p2Callout.subtext}
            </div>
          )}
        </div>
      )}

      {/* Super Cut-in Full-Width Anime Banner */}
      {hud.superCutin && (
        <div
          key={hud.superCutin.id}
          style={{
            position: 'absolute',
            left: '-6%',
            right: '-6%',
            top: '27%',
            height: '34%',
            background:
              hud.superCutin.charId === 'rin'
                ? 'linear-gradient(90deg, rgba(255,30,85,0.95), rgba(35,6,24,0.94), rgba(255,180,60,0.85))'
                : 'linear-gradient(90deg, rgba(35,205,255,0.95), rgba(8,18,48,0.94), rgba(165,243,252,0.85))',
            borderTop: '4px solid #ffffff',
            borderBottom: '4px solid #ffd466',
            boxShadow: '0 0 60px rgba(0,0,0,0.95)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'cutinSweep 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <img
            src={`/assets/images/${hud.superCutin.charId}_cutin.png`}
            alt={hud.superCutin.moveNameZh}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: cutinFlip ? 'scaleX(-1)' : 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                hud.superCutin.slot === 1
                  ? 'linear-gradient(90deg, rgba(5,6,18,0.15) 35%, rgba(5,6,18,0.82) 100%)'
                  : 'linear-gradient(270deg, rgba(5,6,18,0.15) 35%, rgba(5,6,18,0.82) 100%)',
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 5,
              width: '100%',
              padding: '0 10%',
              textAlign: hud.superCutin.slot === 1 ? 'right' : 'left',
            }}
          >
            <div style={{ fontFamily: 'var(--font-tech)', fontSize: '1.15cqw', fontWeight: 900, color: '#ffd466', letterSpacing: '0.28em' }}>
              ASTRAL OVERDRIVE · {hud.superCutin.moveNameEn}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '3.6cqw',
                fontWeight: 900,
                color: '#ffffff',
                textShadow: '0 0 24px rgba(255,42,95,0.9), 0 4px 12px #000',
              }}
            >
              {hud.superCutin.moveNameZh}
            </div>
          </div>
        </div>
      )}

      {/* Center Announcer Text (ROUND 1 / FIGHT! / K.O.! / WINNER) */}
      {hud.announceText && (
        <div
          key={hud.announceText}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '38%',
            textAlign: 'center',
            animation: 'announceSlam 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-tech)',
              fontSize: hud.announceText === 'K.O.!' || hud.announceText === 'FIGHT!' ? '6.8cqw' : '4.6cqw',
              fontWeight: 900,
              fontStyle: 'italic',
              background: 'linear-gradient(180deg, #ffffff 15%, #ffd466 60%, #ff2a5f 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0.45cqw 1.4cqw rgba(0, 0, 0, 0.95))',
            }}
          >
            {hud.announceText}
          </div>
          {hud.announceSubtext && (
            <div
              style={{
                marginTop: '0.35cqw',
                display: 'inline-block',
                padding: '0.35cqw 1.8cqw',
                background: 'rgba(6, 8, 22, 0.85)',
                borderTop: '1px solid #ffd466',
                borderBottom: '1px solid #ffd466',
                fontSize: '1.1cqw',
                fontWeight: 800,
                color: '#f8fafc',
                letterSpacing: '0.16em',
              }}
            >
              {hud.announceSubtext}
            </div>
          )}
        </div>
      )}

      {/* Match Over Rematch Overlay */}
      {hud.phase === 'MATCH_OVER' && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '13%',
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            display: 'flex',
            gap: '1cqw',
            padding: '1cqw 1.5cqw',
            background: 'rgba(8, 10, 24, 0.92)',
            border: '2px solid rgba(255, 212, 102, 0.7)',
            boxShadow: '0 14px 40px rgba(0,0,0,0.85)',
          }}
        >
          <button
            type="button"
            onClick={onRematch}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45cqw',
              padding: '0.65cqw 1.6cqw',
              background: 'linear-gradient(90deg, #ff2a5f, #e11d48)',
              border: 'none',
              color: '#fff',
              fontSize: '0.95cqw',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={17} /> 再战一局 REMATCH
          </button>
          <button
            type="button"
            onClick={onReturnSelect}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45cqw',
              padding: '0.65cqw 1.4cqw',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.28)',
              color: '#fff',
              fontSize: '0.95cqw',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Users size={17} /> 更换角色
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45cqw',
              padding: '0.65cqw 1.2cqw',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#cbd5e1',
              fontSize: '0.95cqw',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            返回标题
          </button>
        </div>
      )}

      {/* Bottom Tension Gauges + Control Strip */}
      <div
        style={{
          position: 'absolute',
          left: '2.5%',
          right: '2.5%',
          bottom: '2.2%',
          display: 'grid',
          gridTemplateColumns: '34% 1fr 34%',
          alignItems: 'center',
          gap: '1cqw',
        }}
      >
        {/* P1 Tension */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72cqw', fontFamily: 'var(--font-tech)', marginBottom: '0.2cqw' }}>
            <span style={{ color: p1TenPct >= 100 ? '#ffd466' : '#cbd5e1', fontWeight: 900 }}>
              {p1TenPct >= 100 ? '★ OVERDRIVE READY [按 I 释放奥义]' : 'TENSION GAUGE'}
            </span>
            <span style={{ color: '#fff', fontWeight: 900 }}>{Math.floor(hud.p1.tension)}%</span>
          </div>
          <div
            style={{
              height: '0.95cqw',
              background: 'rgba(8,10,24,0.88)',
              border: `1px solid ${p1TenPct >= 100 ? '#ffd466' : 'rgba(255,255,255,0.4)'}`,
              transform: 'skewX(-18deg)',
              overflow: 'hidden',
              boxShadow: p1TenPct >= 100 ? '0 0 18px rgba(255,212,102,0.85)' : 'none',
            }}
          >
            <div
              style={{
                width: `${p1TenPct}%`,
                height: '100%',
                backgroundImage:
                  p1TenPct >= 100
                    ? `linear-gradient(90deg, ${p1Col}, #ffd466, #ffffff, ${p1Col})`
                    : `linear-gradient(90deg, #64748b, ${p1Col})`,
                backgroundSize: '200% 100%',
                animation: p1TenPct >= 100 ? 'maxTensionShimmer 1.4s linear infinite' : 'none',
              }}
            />
          </div>
        </div>

        {/* Center Compact Controls Hint */}
        <div
          style={{
            textAlign: 'center',
            padding: '0.32cqw 0.6cqw',
            background: 'rgba(6, 8, 20, 0.72)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontSize: '0.66cqw',
            color: '#cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45cqw',
          }}
        >
          <Flame size={12} color="#ffd466" />
          <span>WASD · J轻 K中 L重 · U/方向+U必杀 · I奥义 · O冲刺</span>
          <button
            type="button"
            onClick={onOpenPause}
            style={{
              pointerEvents: 'auto',
              background: 'transparent',
              border: 'none',
              color: '#7dd3fc',
              fontSize: '0.66cqw',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2cqw',
            }}
          >
            <BookOpen size={12} /> 出招表
          </button>
        </div>

        {/* P2 Tension */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72cqw', fontFamily: 'var(--font-tech)', marginBottom: '0.2cqw' }}>
            <span style={{ color: '#fff', fontWeight: 900 }}>{Math.floor(hud.p2.tension)}%</span>
            <span style={{ color: p2TenPct >= 100 ? '#ffd466' : '#cbd5e1', fontWeight: 900 }}>
              {p2TenPct >= 100 ? 'OVERDRIVE READY ★' : 'TENSION GAUGE'}
            </span>
          </div>
          <div
            style={{
              height: '0.95cqw',
              background: 'rgba(8,10,24,0.88)',
              border: `1px solid ${p2TenPct >= 100 ? '#ffd466' : 'rgba(255,255,255,0.4)'}`,
              transform: 'skewX(18deg)',
              overflow: 'hidden',
              boxShadow: p2TenPct >= 100 ? '0 0 18px rgba(255,212,102,0.85)' : 'none',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <div
              style={{
                width: `${p2TenPct}%`,
                height: '100%',
                backgroundImage:
                  p2TenPct >= 100
                    ? `linear-gradient(270deg, ${p2Col}, #ffd466, #ffffff, ${p2Col})`
                    : `linear-gradient(270deg, #64748b, ${p2Col})`,
                backgroundSize: '200% 100%',
                animation: p2TenPct >= 100 ? 'maxTensionShimmer 1.4s linear infinite' : 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
