import { ArrowLeft, Check, Palette, Shield, Sparkles, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import { audioManager } from '../engine/AudioManager';
import { CHARACTERS } from '../engine/CharacterData';
import type { AIDifficulty, CharacterId, MatchConfig, PaletteSlot } from '../engine/types';

interface CharacterSelectProps {
  initialConfig: MatchConfig;
  onConfirm: (config: MatchConfig) => void;
  onBack: () => void;
}

const ROSTER: CharacterId[] = ['rin', 'lia'];
const DIFFICULTIES: { id: AIDifficulty; label: string }[] = [
  { id: 'casual', label: '入门 CASUAL' },
  { id: 'arcade', label: '街机 ARCADE' },
  { id: 'master', label: '大师 MASTER' },
];

export function CharacterSelect({ initialConfig, onConfirm, onBack }: CharacterSelectProps) {
  const [p1Char, setP1Char] = useState<CharacterId>(initialConfig.p1Char);
  const [p2Char, setP2Char] = useState<CharacterId>(initialConfig.p2Char);
  const [p1Pal, setP1Pal] = useState<PaletteSlot>(initialConfig.p1Palette);
  const [p2Pal, setP2Pal] = useState<PaletteSlot>(initialConfig.p2Palette);
  const [difficulty, setDifficulty] = useState<AIDifficulty>(initialConfig.aiDifficulty);
  const [p1Locked, setP1Locked] = useState(false);
  const [p2Locked, setP2Locked] = useState(initialConfig.mode !== 'versus');

  const p1Profile = CHARACTERS[p1Char];
  const p2Profile = CHARACTERS[p2Char];

  const p1Img = `/assets/images/${p1Char}_portrait${p1Pal === 2 ? '_p2' : ''}.png`;
  const p2Img = `/assets/images/${p2Char}_portrait${p2Pal === 2 ? '_p2' : ''}.png`;

  const p1Color = p1Pal === 2 ? p1Profile.p2AccentColor : p1Profile.accentColor;
  const p2Color = p2Pal === 2 ? p2Profile.p2AccentColor : p2Profile.accentColor;

  const toggleP1Char = (cid: CharacterId) => {
    if (p1Char !== cid) {
      setP1Char(cid);
      audioManager.playSfx('ui_move', -0.4, 0.8);
    }
  };

  const toggleP2Char = (cid: CharacterId) => {
    if (p2Char !== cid) {
      setP2Char(cid);
      audioManager.playSfx('ui_move', 0.4, 0.8);
    }
  };

  const handleLaunchBattle = (
    c1 = p1Char,
    c2 = p2Char,
    pal1 = p1Pal,
    pal2 = p2Pal,
    diff = difficulty
  ) => {
    audioManager.playSfx('ui_select_lock', 0, 1.0);
    onConfirm({
      mode: initialConfig.mode,
      aiDifficulty: diff,
      p1Char: c1,
      p2Char: c2,
      p1Palette: pal1,
      p2Palette: pal2,
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        audioManager.playSfx('ui_cancel', 0, 0.8);
        onBack();
        return;
      }
      if (!p1Locked) {
        if (e.code === 'KeyA' || e.code === 'KeyD') {
          toggleP1Char(p1Char === 'rin' ? 'lia' : 'rin');
        } else if (e.code === 'KeyW' || e.code === 'KeyS') {
          setP1Pal((p) => (p === 1 ? 2 : 1));
          audioManager.playSfx('ui_move', -0.4, 0.8);
        } else if (e.code === 'KeyJ' || e.code === 'Enter') {
          audioManager.playSfx('ui_select_lock', -0.4, 0.9);
          if (initialConfig.mode !== 'versus') {
            handleLaunchBattle();
          } else {
            setP1Locked(true);
            if (p2Locked) handleLaunchBattle();
          }
        }
      }
      if (initialConfig.mode === 'versus' && !p2Locked) {
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          toggleP2Char(p2Char === 'rin' ? 'lia' : 'rin');
        } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
          setP2Pal((p) => (p === 1 ? 2 : 1));
          audioManager.playSfx('ui_move', 0.4, 0.8);
        } else if (e.code === 'Numpad1' || e.code === 'Comma') {
          audioManager.playSfx('ui_select_lock', 0.4, 0.9);
          setP2Locked(true);
          if (p1Locked) handleLaunchBattle();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const renderStatBar = (label: string, val: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5cqw', fontSize: '0.74cqw' }}>
      <span style={{ width: '3.2cqw', color: '#cbd5e1', fontWeight: 700 }}>{label}</span>
      <div style={{ display: 'flex', gap: '0.25cqw', flex: 1 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: '0.42cqw',
              flex: 1,
              transform: 'skewX(-18deg)',
              background: i <= val ? color : 'rgba(255,255,255,0.14)',
              boxShadow: i <= val ? `0 0 8px ${color}` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#070815',
      }}
    >
      {/* Parallax Shrine Sky Background */}
      <img
        src="/assets/images/stage_sky.png"
        alt="Stage Sky"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.55,
          filter: 'blur(2px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 22% 55%, ${p1Color}26 0%, transparent 48%), radial-gradient(circle at 78% 55%, ${p2Color}26 0%, transparent 48%), linear-gradient(180deg, rgba(6,8,20,0.82) 0%, rgba(6,8,20,0.45) 50%, rgba(5,6,16,0.94) 100%)`,
        }}
      />

      {/* Top Header Bar */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.6% 3%',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(8,10,24,0.68)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            audioManager.playSfx('ui_cancel', 0, 0.8);
            onBack();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45cqw',
            padding: '0.45cqw 1cqw',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#e2e8f0',
            fontSize: '0.82cqw',
            fontWeight: 700,
            transform: 'skewX(-14deg)',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4cqw', transform: 'skewX(14deg)' }}>
            <ArrowLeft size={16} /> 返回标题
          </span>
        </button>

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-tech)',
              fontSize: '1.65cqw',
              fontWeight: 900,
              letterSpacing: '0.2em',
              color: '#ffffff',
              textShadow: '0 0 18px rgba(255, 212, 102, 0.45)',
            }}
          >
            CHARACTER SELECT · 角色选择
          </div>
        </div>

        <div
          style={{
            padding: '0.45cqw 1.1cqw',
            background: 'linear-gradient(90deg, rgba(255,42,95,0.75), rgba(42,216,255,0.75))',
            transform: 'skewX(-14deg)',
            fontFamily: 'var(--font-tech)',
            fontSize: '0.8cqw',
            fontWeight: 800,
            letterSpacing: '0.12em',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(14deg)' }}>
            {initialConfig.mode === 'arcade'
              ? 'VS CPU 街机模式'
              : initialConfig.mode === 'versus'
              ? 'LOCAL 2P 双人对战'
              : 'TRAINING 道场修行'}
          </span>
        </div>
      </div>

      {/* Left (P1) & Right (P2) Character Showcases */}
      <div
        style={{
          position: 'relative',
          zIndex: 5,
          display: 'grid',
          gridTemplateColumns: '1fr 27% 1fr',
          height: '87%',
          padding: '0 2.5%',
          alignItems: 'center',
        }}
      >
        {/* P1 Showcase */}
        <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '4.5%' }}>
          <img
            src={p1Img}
            alt={p1Profile.nameZh}
            className="breath-float"
            style={{
              position: 'absolute',
              left: '1%',
              bottom: '6%',
              height: '86%',
              width: 'auto',
              objectFit: 'contain',
              filter: `drop-shadow(0 0 26px ${p1Color}88)`,
              pointerEvents: 'none',
            }}
          />

          {/* P1 Info Card */}
          <div
            style={{
              position: 'relative',
              zIndex: 8,
              width: '86%',
              padding: '1.1cqw 1.3cqw',
              background: 'linear-gradient(135deg, rgba(10,12,28,0.92), rgba(20,16,38,0.82))',
              borderLeft: `5px solid ${p1Color}`,
              borderTop: '1px solid rgba(255,255,255,0.16)',
              boxShadow: `0 12px 35px rgba(0,0,0,0.65), 0 0 20px ${p1Color}33`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-tech)', fontSize: '0.78cqw', fontWeight: 900, color: p1Color, letterSpacing: '0.16em' }}>
                PLAYER 1 · {p1Locked ? 'READY!' : 'SELECTING'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setP1Pal((p) => (p === 1 ? 2 : 1));
                  audioManager.playSfx('ui_move', -0.4, 0.8);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35cqw',
                  padding: '0.25cqw 0.7cqw',
                  background: `${p1Color}33`,
                  border: `1px solid ${p1Color}`,
                  color: '#fff',
                  fontSize: '0.72cqw',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Palette size={13} /> 配色 {p1Pal}P
              </button>
            </div>
            <div style={{ marginTop: '0.25cqw', fontSize: '2.1cqw', fontWeight: 900, letterSpacing: '0.06em' }}>
              {p1Profile.nameZh}
            </div>
            <div style={{ fontSize: '0.82cqw', color: '#ffd466', fontWeight: 700 }}>
              {p1Profile.titleZh} · {p1Profile.archetypeZh}
            </div>
            <div style={{ marginTop: '0.65cqw', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35cqw 1cqw' }}>
              {renderStatBar('攻击力', p1Profile.stats.power, p1Color)}
              {renderStatBar('机动性', p1Profile.stats.speed, p1Color)}
              {renderStatBar('攻击距', p1Profile.stats.reach, p1Color)}
              {renderStatBar('技巧度', p1Profile.stats.technique, p1Color)}
            </div>
          </div>
        </div>

        {/* Center Roster Picker + Stage Card + Launch Button */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.1cqw',
            height: '100%',
          }}
        >
          {/* Character Roster Cards */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75cqw' }}>
            <div style={{ textAlign: 'center', fontSize: '0.76cqw', fontFamily: 'var(--font-tech)', color: '#94a3b8', letterSpacing: '0.18em' }}>
              ROSTER · 点击切换 1P / 2P 角色
            </div>
            {ROSTER.map((cid) => {
              const prof = CHARACTERS[cid];
              const isP1 = p1Char === cid;
              const isP2 = p2Char === cid;
              return (
                <div
                  key={cid}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85cqw',
                    padding: '0.65cqw 0.85cqw',
                    background: 'rgba(12, 14, 32, 0.9)',
                    border: `2px solid ${isP1 || isP2 ? prof.accentColor : 'rgba(255,255,255,0.16)'}`,
                    boxShadow: isP1 || isP2 ? `0 0 20px ${prof.accentColor}44` : 'none',
                  }}
                >
                  <img
                    src={`/assets/images/${cid}_hud.png`}
                    alt={prof.nameZh}
                    style={{
                      width: '4.4cqw',
                      height: '4.4cqw',
                      objectFit: 'cover',
                      background: `radial-gradient(circle, ${prof.accentColor}44, #0a0b18)`,
                      border: `1px solid ${prof.accentColor}88`,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.1cqw', fontWeight: 900 }}>{prof.nameZh}</div>
                    <div style={{ fontSize: '0.7cqw', color: '#94a3b8', fontFamily: 'var(--font-tech)' }}>{prof.nameEn}</div>
                    <div style={{ marginTop: '0.38cqw', display: 'flex', gap: '0.4cqw' }}>
                      <button
                        type="button"
                        onClick={() => toggleP1Char(cid)}
                        style={{
                          padding: '0.2cqw 0.6cqw',
                          fontSize: '0.68cqw',
                          fontWeight: 900,
                          background: isP1 ? '#ff2a5f' : 'rgba(255,255,255,0.1)',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        设为 1P
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleP2Char(cid)}
                        style={{
                          padding: '0.2cqw 0.6cqw',
                          fontSize: '0.68cqw',
                          fontWeight: 900,
                          background: isP2 ? '#2ad8ff' : 'rgba(255,255,255,0.1)',
                          color: isP2 ? '#051020' : '#fff',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        设为 2P
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stage Banner */}
          <div
            style={{
              width: '100%',
              padding: '0.75cqw',
              background: 'rgba(10, 12, 26, 0.88)',
              border: '1px solid rgba(255, 212, 102, 0.35)',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4cqw', fontSize: '0.72cqw', color: '#ffd466', fontFamily: 'var(--font-tech)', letterSpacing: '0.15em' }}>
              <Sparkles size={13} /> BATTLE STAGE
            </div>
            <div style={{ marginTop: '0.2cqw', fontSize: '1.05cqw', fontWeight: 900 }}>
              绯月星穹神社 · 樱落天台
            </div>
            <div style={{ fontSize: '0.68cqw', color: '#94a3b8' }}>
              Crimson Moon Astral Shrine · 2.5D Parallax
            </div>
          </div>

          {/* AI Difficulty Selector (Arcade Mode) */}
          {initialConfig.mode === 'arcade' && (
            <div style={{ width: '100%', display: 'flex', gap: '0.35cqw' }}>
              {DIFFICULTIES.map((d) => {
                const active = difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDifficulty(d.id);
                      audioManager.playSfx('ui_move', 0, 0.7);
                    }}
                    style={{
                      flex: 1,
                      padding: '0.42cqw 0.2cqw',
                      background: active ? '#ffd466' : 'rgba(255,255,255,0.08)',
                      color: active ? '#0b0c18' : '#cbd5e1',
                      border: 'none',
                      fontSize: '0.68cqw',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Fight Start CTA */}
          <button
            type="button"
            onClick={() => handleLaunchBattle()}
            className="pulse-glow"
            style={{
              width: '100%',
              padding: '0.95cqw 1cqw',
              background: 'linear-gradient(90deg, #ff2a5f 0%, #c026d3 50%, #2ad8ff 100%)',
              border: '2px solid #ffd466',
              transform: 'skewX(-12deg)',
              color: '#fff',
              fontSize: '1.25cqw',
              fontWeight: 900,
              letterSpacing: '0.16em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6cqw',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5cqw', transform: 'skewX(12deg)' }}>
              <Swords size={20} /> 出战对决 · FIGHT!
            </span>
          </button>
        </div>

        {/* P2 Showcase */}
        <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end', paddingBottom: '4.5%' }}>
          <div
            className="breath-float"
            style={{
              position: 'absolute',
              right: '1%',
              bottom: '6%',
              height: '86%',
              pointerEvents: 'none',
            }}
          >
            <img
              src={p2Img}
              alt={p2Profile.nameZh}
              style={{
                height: '100%',
                width: 'auto',
                display: 'block',
                objectFit: 'contain',
                transform: 'scaleX(-1)',
                filter: `drop-shadow(0 0 26px ${p2Color}88)`,
              }}
            />
          </div>

          {/* P2 Info Card */}
          <div
            style={{
              position: 'relative',
              zIndex: 8,
              width: '86%',
              padding: '1.1cqw 1.3cqw',
              background: 'linear-gradient(225deg, rgba(10,12,28,0.92), rgba(16,22,42,0.82))',
              borderRight: `5px solid ${p2Color}`,
              borderTop: '1px solid rgba(255,255,255,0.16)',
              boxShadow: `0 12px 35px rgba(0,0,0,0.65), 0 0 20px ${p2Color}33`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => {
                  setP2Pal((p) => (p === 1 ? 2 : 1));
                  audioManager.playSfx('ui_move', 0.4, 0.8);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35cqw',
                  padding: '0.25cqw 0.7cqw',
                  background: `${p2Color}33`,
                  border: `1px solid ${p2Color}`,
                  color: '#fff',
                  fontSize: '0.72cqw',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Palette size={13} /> 配色 {p2Pal}P
              </button>
              <span style={{ fontFamily: 'var(--font-tech)', fontSize: '0.78cqw', fontWeight: 900, color: p2Color, letterSpacing: '0.16em' }}>
                {initialConfig.mode === 'arcade'
                  ? 'CPU RIVAL'
                  : initialConfig.mode === 'training'
                  ? 'TRAINING DUMMY'
                  : p2Locked
                  ? 'P2 READY!'
                  : 'P2 SELECTING'}
              </span>
            </div>
            <div style={{ marginTop: '0.25cqw', fontSize: '2.1cqw', fontWeight: 900, letterSpacing: '0.06em', textAlign: 'right' }}>
              {p2Profile.nameZh}
            </div>
            <div style={{ fontSize: '0.82cqw', color: '#ffd466', fontWeight: 700, textAlign: 'right' }}>
              {p2Profile.titleZh} · {p2Profile.archetypeZh}
            </div>
            <div style={{ marginTop: '0.65cqw', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35cqw 1cqw' }}>
              {renderStatBar('攻击力', p2Profile.stats.power, p2Color)}
              {renderStatBar('机动性', p2Profile.stats.speed, p2Color)}
              {renderStatBar('攻击距', p2Profile.stats.reach, p2Color)}
              {renderStatBar('技巧度', p2Profile.stats.technique, p2Color)}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls Strip */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2cqw',
          padding: '0.45cqw',
          background: 'rgba(6, 7, 16, 0.9)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: '0.74cqw',
          color: '#cbd5e1',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3cqw' }}>
          <Shield size={13} color="#ff2a5f" /> 1P: WASD移动 · J/K/L 轻中重 · U 必杀 · I 奥义 · O 冲刺
        </span>
        {initialConfig.mode === 'versus' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3cqw' }}>
            <Check size={13} color="#2ad8ff" /> 2P: 方向键 · 小键盘123/456 (或 ,./;'[ )
          </span>
        )}
      </div>
    </div>
  );
}
