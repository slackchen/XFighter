import { useEffect } from 'react';
import { audioManager } from '../engine/AudioManager';
import { CHARACTERS } from '../engine/CharacterData';
import type { MatchConfig } from '../engine/types';

interface VsSplashScreenProps {
  config: MatchConfig;
  onComplete: () => void;
}

export function VsSplashScreen({ config, onComplete }: VsSplashScreenProps) {
  const p1 = CHARACTERS[config.p1Char];
  const p2 = CHARACTERS[config.p2Char];
  const p1Img = `/assets/images/${config.p1Char}_portrait${config.p1Palette === 2 ? '_p2' : ''}.png`;
  const p2Img = `/assets/images/${config.p2Char}_portrait${config.p2Palette === 2 ? '_p2' : ''}.png`;
  const p1Col = config.p1Palette === 2 ? p1.p2AccentColor : p1.accentColor;
  const p2Col = config.p2Palette === 2 ? p2.p2AccentColor : p2.accentColor;

  useEffect(() => {
    audioManager.playSfx('vs_clash', 0, 1.0, 0);
    const t = setTimeout(onComplete, 2150);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#050612',
      }}
    >
      {/* Diagonal Split Colored Backdrops */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: 'polygon(0 0, 56% 0, 44% 100%, 0 100%)',
          background: `radial-gradient(circle at 28% 48%, ${p1Col}66, #140512 78%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: 'polygon(56% 0, 100% 0, 100% 100%, 44% 100%)',
          background: `radial-gradient(circle at 72% 48%, ${p2Col}66, #061224 78%)`,
        }}
      />

      {/* P1 Slam Portrait */}
      <div
        style={{
          position: 'absolute',
          left: '2%',
          bottom: '-4%',
          height: '96%',
          pointerEvents: 'none',
          animation: 'vsPortraitInLeft 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <img
          src={p1Img}
          alt={p1.nameZh}
          style={{
            height: '100%',
            width: 'auto',
            display: 'block',
            objectFit: 'contain',
            filter: `drop-shadow(0 0 36px ${p1Col})`,
          }}
        />
      </div>

      {/* P2 Slam Portrait (mirrored to face 1P) */}
      <div
        style={{
          position: 'absolute',
          right: '2%',
          bottom: '-4%',
          height: '96%',
          pointerEvents: 'none',
          animation: 'vsPortraitInRight 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <img
          src={p2Img}
          alt={p2.nameZh}
          style={{
            height: '100%',
            width: 'auto',
            display: 'block',
            objectFit: 'contain',
            transform: 'scaleX(-1)',
            filter: `drop-shadow(0 0 36px ${p2Col})`,
          }}
        />
      </div>

      {/* Diagonal Lightning Divider */}
      <div
        style={{
          position: 'absolute',
          left: '49.5%',
          top: '-10%',
          bottom: '-10%',
          width: '6px',
          background: 'linear-gradient(180deg, #ff2a5f, #ffffff 50%, #2ad8ff)',
          transform: 'rotate(11deg)',
          boxShadow: '0 0 36px #ffffff, 0 0 70px #ffd466',
        }}
      />

      {/* Central VS Emblem */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '48%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-tech)',
            fontSize: '7.5cqw',
            fontWeight: 900,
            fontStyle: 'italic',
            background: 'linear-gradient(180deg, #ffffff 10%, #ffd466 55%, #ff2a5f 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 28px rgba(255, 212, 102, 0.9))',
            animation: 'vsImpactPop 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          VS
        </div>
      </div>

      {/* Bottom Nameplates */}
      <div
        style={{
          position: 'absolute',
          left: '3.5%',
          bottom: '7%',
          padding: '0.8cqw 2cqw',
          background: 'rgba(8, 8, 18, 0.88)',
          borderLeft: `6px solid ${p1Col}`,
          transform: 'skewX(-16deg)',
          boxShadow: `0 0 28px ${p1Col}55`,
        }}
      >
        <div style={{ transform: 'skewX(16deg)' }}>
          <div style={{ fontSize: '2.2cqw', fontWeight: 900 }}>{p1.nameZh}</div>
          <div style={{ fontFamily: 'var(--font-tech)', fontSize: '0.85cqw', color: p1Col, letterSpacing: '0.18em' }}>
            {p1.nameEn}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: '3.5%',
          bottom: '7%',
          padding: '0.8cqw 2cqw',
          background: 'rgba(8, 8, 18, 0.88)',
          borderRight: `6px solid ${p2Col}`,
          transform: 'skewX(-16deg)',
          textAlign: 'right',
          boxShadow: `0 0 28px ${p2Col}55`,
        }}
      >
        <div style={{ transform: 'skewX(16deg)' }}>
          <div style={{ fontSize: '2.2cqw', fontWeight: 900 }}>{p2.nameZh}</div>
          <div style={{ fontFamily: 'var(--font-tech)', fontSize: '0.85cqw', color: p2Col, letterSpacing: '0.18em' }}>
            {p2.nameEn}
          </div>
        </div>
      </div>

      {/* Top Stage Header */}
      <div
        style={{
          position: 'absolute',
          top: '4%',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0.4cqw 2cqw',
          background: 'rgba(6, 8, 22, 0.82)',
          border: '1px solid rgba(255, 212, 102, 0.45)',
          fontSize: '0.95cqw',
          fontWeight: 800,
          letterSpacing: '0.18em',
          color: '#ffd466',
        }}
      >
        STAGE · 绯月星穹神社 · 樱落天台
      </div>
    </div>
  );
}
