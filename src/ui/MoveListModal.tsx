import { Eye, RotateCcw, Swords, Volume2, X } from 'lucide-react';
import { useState } from 'react';
import { audioManager } from '../engine/AudioManager';
import { CHARACTERS } from '../engine/CharacterData';
import type { AudioVolumes, CharacterId, MoveId } from '../engine/types';

interface MoveListModalProps {
  isBattle: boolean;
  p1Char: CharacterId;
  p2Char: CharacterId;
  hitboxDebug: boolean;
  onToggleHitboxDebug: () => void;
  onClose: () => void;
  onRematch?: () => void;
  onReturnSelect?: () => void;
  onReturnTitle?: () => void;
}

const ORDERED_MOVES: MoveId[] = [
  '5L',
  '5M',
  '5H',
  '2L',
  '2M',
  '2H',
  'jL',
  'jM',
  'jH',
  'special_1',
  'special_2',
  'special_3',
  'super',
];

export function MoveListModal({
  isBattle,
  p1Char,
  p2Char,
  hitboxDebug,
  onToggleHitboxDebug,
  onClose,
  onRematch,
  onReturnSelect,
  onReturnTitle,
}: MoveListModalProps) {
  const [tabChar, setTabChar] = useState<CharacterId>(p1Char);
  const [volumes, setVolumes] = useState<AudioVolumes>(() => audioManager.getVolumes());
  const profile = CHARACTERS[tabChar];

  const updateVol = (key: keyof AudioVolumes, val: number) => {
    const next = { ...volumes, [key]: val };
    setVolumes(next);
    audioManager.setVolumes({ [key]: val });
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        background: 'rgba(5, 7, 18, 0.86)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5%',
      }}
    >
      <div
        style={{
          width: '92%',
          height: '90%',
          background: 'linear-gradient(145deg, rgba(14,16,36,0.98), rgba(8,10,22,0.98))',
          border: '1px solid rgba(255, 212, 102, 0.38)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.1cqw 1.8cqw',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8cqw' }}>
            <Swords size={22} color="#ffd466" />
            <span style={{ fontFamily: 'var(--font-tech)', fontSize: '1.25cqw', fontWeight: 900, letterSpacing: '0.14em' }}>
              {isBattle ? 'PAUSE · 出招表与对战设置' : 'COMMAND LIST & AUDIO · 出招指南与音效'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              audioManager.playSfx('ui_cancel', 0, 0.8);
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4cqw',
              padding: '0.4cqw 1cqw',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: '0.82cqw',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <X size={16} /> 继续 / 关闭 (ESC)
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '66% 34%', minHeight: 0 }}>
          {/* Left: Move List */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '1.1cqw 1.5cqw', borderRight: '1px solid rgba(255,255,255,0.1)', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: '0.7cqw', marginBottom: '0.9cqw' }}>
              {(['rin', 'lia'] as CharacterId[]).map((cid) => {
                const prof = CHARACTERS[cid];
                const active = tabChar === cid;
                const badge = cid === p1Char && cid === p2Char ? '1P / 2P' : cid === p1Char ? '1P' : cid === p2Char ? '2P' : '';
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => {
                      setTabChar(cid);
                      audioManager.playSfx('ui_move', 0, 0.7);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6cqw',
                      padding: '0.5cqw 1.1cqw',
                      background: active ? `${prof.accentColor}33` : 'rgba(255,255,255,0.05)',
                      border: `2px solid ${active ? prof.accentColor : 'rgba(255,255,255,0.15)'}`,
                      color: '#fff',
                      fontSize: '0.9cqw',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{prof.nameZh}</span>
                    {badge && (
                      <span style={{ fontSize: '0.68cqw', padding: '0.1cqw 0.4cqw', background: prof.accentColor, color: '#080912' }}>
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.42cqw', paddingRight: '0.4cqw' }}>
              {ORDERED_MOVES.map((mid) => {
                const m = profile.moves[mid];
                const tagColor = m.isSuper ? '#ffd466' : m.isSpecial ? profile.accentColor : '#94a3b8';
                return (
                  <div
                    key={mid}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.25fr 1.05fr 0.55fr 1.65fr',
                      alignItems: 'center',
                      gap: '0.6cqw',
                      padding: '0.5cqw 0.8cqw',
                      background: m.isSuper ? 'rgba(255, 212, 102, 0.1)' : 'rgba(255,255,255,0.04)',
                      borderLeft: `3px solid ${tagColor}`,
                      fontSize: '0.76cqw',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, color: m.isSuper ? '#ffd466' : '#f8fafc' }}>{m.nameZh}</div>
                      <div style={{ fontSize: '0.65cqw', color: '#94a3b8', fontFamily: 'var(--font-tech)' }}>{m.nameEn}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-tech)', fontWeight: 700, color: '#7dd3fc', fontSize: '0.73cqw' }}>
                      {m.commandText}
                    </div>
                    <div style={{ color: '#fda4af', fontWeight: 700, fontSize: '0.72cqw' }}>
                      伤害 {m.multiHitFrames ? `${m.damage}×${m.multiHitFrames.length}` : m.damage}
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.72cqw' }}>{m.descriptionZh}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Controls, Audio Sliders, Actions */}
          <div style={{ padding: '1.2cqw 1.4cqw', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1cqw' }}>
            <div>
              <div style={{ fontSize: '0.9cqw', fontWeight: 900, color: '#ffd466', marginBottom: '0.6cqw', display: 'flex', alignItems: 'center', gap: '0.4cqw' }}>
                <Volume2 size={17} /> 音频混音控制
              </div>
              {(
                [
                  ['master', '总音量 MASTER'],
                  ['bgm', '战斗音乐 BGM'],
                  ['sfx', '打击与刀光 SFX'],
                  ['announcer', '播报语音 VOICE'],
                ] as [keyof AudioVolumes, string][]
              ).map(([key, label]) => (
                <div key={key} style={{ marginBottom: '0.65cqw' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75cqw', color: '#e2e8f0', marginBottom: '0.2cqw' }}>
                    <span>{label}</span>
                    <span>{Math.round(volumes[key] * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volumes[key]}
                    onChange={(e) => updateVol(key, parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#ff2a5f', cursor: 'pointer' }}
                  />
                </div>
              ))}

              <div style={{ marginTop: '0.9cqw', padding: '0.7cqw', background: 'rgba(255,255,255,0.05)', fontSize: '0.72cqw', lineHeight: 1.6, color: '#cbd5e1' }}>
                <div style={{ fontWeight: 900, color: '#7dd3fc', marginBottom: '0.25cqw' }}>按键与连招技巧</div>
                <div>• 连携取消：轻(J) → 中(K) → 重(L) → 必杀(U) → 奥义(I)</div>
                <div>• 必杀大中小三档：搓招 ↓↘→ / →↓↘ / ↓↙← + J(轻)/K(中)/L(重)，或按住 J+U(轻) / U(中) / L+U(重)</div>
                <div>• 按住「后方向键」防御，低段攻击需按「↓+后」蹲防</div>
                <div>• 1P: WASD + J/K/L/U/I/O · 2P: 方向键 + 1~6 / ,./;'[</div>
              </div>

              <button
                type="button"
                onClick={onToggleHitboxDebug}
                style={{
                  marginTop: '0.75cqw',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55cqw 0.9cqw',
                  background: hitboxDebug ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${hitboxDebug ? '#38bdf8' : 'rgba(255,255,255,0.18)'}`,
                  color: '#fff',
                  fontSize: '0.78cqw',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.45cqw' }}>
                  <Eye size={15} /> 显示判定框 (Hitbox/Hurtbox)
                </span>
                <span>{hitboxDebug ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {isBattle && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5cqw' }}>
                {onRematch && (
                  <button
                    type="button"
                    onClick={() => {
                      audioManager.playSfx('ui_confirm', 0, 0.9);
                      onRematch();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45cqw',
                      padding: '0.65cqw',
                      background: 'linear-gradient(90deg, #ff2a5f, #e11d48)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.88cqw',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={16} /> 重新开局 REMATCH
                  </button>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5cqw' }}>
                  {onReturnSelect && (
                    <button
                      type="button"
                      onClick={() => {
                        audioManager.playSfx('ui_cancel', 0, 0.8);
                        onReturnSelect();
                      }}
                      style={{
                        padding: '0.55cqw',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        fontSize: '0.78cqw',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      返回选人
                    </button>
                  )}
                  {onReturnTitle && (
                    <button
                      type="button"
                      onClick={() => {
                        audioManager.playSfx('ui_cancel', 0, 0.8);
                        onReturnTitle();
                      }}
                      style={{
                        padding: '0.55cqw',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.16)',
                        color: '#cbd5e1',
                        fontSize: '0.78cqw',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      返回标题
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
