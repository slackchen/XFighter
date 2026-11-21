import { useCallback, useState } from 'react';
import { audioManager } from './engine/AudioManager';
import type { GameMode, MatchConfig } from './engine/types';
import { BattleScreen } from './ui/BattleScreen';
import { CharacterSelect } from './ui/CharacterSelect';
import { MoveListModal } from './ui/MoveListModal';
import { TitleScreen } from './ui/TitleScreen';
import { VsSplashScreen } from './ui/VsSplashScreen';

type ScreenName = 'title' | 'select' | 'vs' | 'battle';

const DEFAULT_CONFIG: MatchConfig = {
  mode: 'arcade',
  aiDifficulty: 'arcade',
  p1Char: 'rin',
  p2Char: 'lia',
  p1Palette: 1,
  p2Palette: 1,
};

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('title');
  const [matchConfig, setMatchConfig] = useState<MatchConfig>(DEFAULT_CONFIG);
  const [showTitleSettings, setShowTitleSettings] = useState(false);
  const [hitboxDebug, setHitboxDebug] = useState(false);
  const [battleKey, setBattleKey] = useState(1);

  const handleSelectMode = useCallback((mode: GameMode) => {
    setMatchConfig((prev) => ({ ...prev, mode }));
    setScreen('select');
  }, []);

  const handleConfirmCharacters = useCallback((nextConfig: MatchConfig) => {
    setMatchConfig(nextConfig);
    setScreen('vs');
  }, []);

  const handleVsComplete = useCallback(() => {
    setBattleKey((k) => k + 1);
    setScreen('battle');
    void audioManager.playBgm('bgm_battle', true, 0.45);
  }, []);

  const handleReturnToSelect = useCallback(() => {
    setHitboxDebug(false);
    setScreen('select');
    void audioManager.playBgm('bgm_menu', true, 0.5);
  }, []);

  const handleReturnToTitle = useCallback(() => {
    setHitboxDebug(false);
    setScreen('title');
    void audioManager.playBgm('bgm_menu', true, 0.5);
  }, []);

  const handleRematch = useCallback(() => {
    setBattleKey((k) => k + 1);
    void audioManager.playBgm('bgm_battle', true, 0.35);
  }, []);

  return (
    <div className="viewport-shell">
      <div className="stage-frame">
        {screen === 'title' && (
          <TitleScreen
            onSelectMode={handleSelectMode}
            onOpenSettings={() => setShowTitleSettings(true)}
          />
        )}

        {screen === 'select' && (
          <CharacterSelect
            initialConfig={matchConfig}
            onConfirm={handleConfirmCharacters}
            onBack={handleReturnToTitle}
          />
        )}

        {screen === 'vs' && (
          <VsSplashScreen
            config={matchConfig}
            onComplete={handleVsComplete}
          />
        )}

        {screen === 'battle' && (
          <BattleScreen
            key={battleKey}
            config={matchConfig}
            hitboxDebug={hitboxDebug}
            onToggleHitboxDebug={() => setHitboxDebug((v) => !v)}
            onRematch={handleRematch}
            onReturnSelect={handleReturnToSelect}
            onReturnTitle={handleReturnToTitle}
          />
        )}

        {showTitleSettings && (
          <MoveListModal
            isBattle={false}
            p1Char={matchConfig.p1Char}
            p2Char={matchConfig.p2Char}
            hitboxDebug={hitboxDebug}
            onToggleHitboxDebug={() => setHitboxDebug((v) => !v)}
            onClose={() => setShowTitleSettings(false)}
          />
        )}
      </div>
    </div>
  );
}
