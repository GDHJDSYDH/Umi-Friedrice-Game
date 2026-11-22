import React, { useEffect, useState } from 'react';
import { CookingSnapshot, SavedRecord, ScoreReport, ScreenState, WokId } from './types';
import { MAX_OPTIONAL_INGREDIENTS, OPTIONAL_INGREDIENTS } from './data/ingredients';
import { WOKS } from './data/woks';
import { evaluateCooking } from './engine/scoring';
import { audioEngine } from './engine/audio';
import { TitleScreen } from './components/TitleScreen';
import { PrepScreen } from './components/PrepScreen';
import { CookingScreen } from './components/CookingScreen';
import { ResultScreen } from './components/ResultScreen';

const STORAGE_KEY = 'umi_friedrice_records_v1';

function loadRecords(): SavedRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>('title');
  const [selectedWok, setSelectedWok] = useState<WokId>('iron');
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([
    'shrimp',
    'mushroom',
    'broccoli',
    'scallion',
  ]);
  const [muted, setMuted] = useState(false);
  const [report, setReport] = useState<ScoreReport | null>(null);
  const [records, setRecords] = useState<SavedRecord[]>(() => loadRecords());
  const [cookSessionKey, setCookSessionKey] = useState(1);

  // Unlock BGM smoothly on first user interaction anywhere
  useEffect(() => {
    const unlock = () => {
      audioEngine.initBgm();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const handleToggleMute = () => {
    audioEngine.initBgm();
    const next = !muted;
    setMuted(next);
    audioEngine.setMuted(next);
  };

  const handleToggleIngredient = (id: string) => {
    audioEngine.playClick();
    setSelectedIngredients((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= MAX_OPTIONAL_INGREDIENTS) return prev;
      return [...prev, id];
    });
  };

  const handleRandomize = () => {
    audioEngine.playClick();
    const randomWok = WOKS[Math.floor(Math.random() * WOKS.length)].id;
    const shuffled = [...OPTIONAL_INGREDIENTS].sort(() => Math.random() - 0.5);
    setSelectedWok(randomWok);
    setSelectedIngredients(shuffled.slice(0, MAX_OPTIONAL_INGREDIENTS).map((i) => i.id));
  };

  const handleFinishCook = (snapshot: CookingSnapshot) => {
    const result = evaluateCooking(snapshot);
    setReport(result);

    const newRec: SavedRecord = {
      id: String(Date.now()),
      date: new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      score: result.totalScore,
      rank: result.rank,
      title: result.title,
      wokId: selectedWok,
      ingredients: [...selectedIngredients],
    };

    setRecords((prev) => {
      const updated = [newRec, ...prev].slice(0, 20);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore quota errors
      }
      return updated;
    });
    setScreen('result');
  };

  if (screen === 'title') {
    return (
      <TitleScreen
        onStart={() => {
          audioEngine.initBgm();
          audioEngine.playClick();
          setScreen('prep');
        }}
        muted={muted}
        onToggleMute={handleToggleMute}
        records={records}
      />
    );
  }

  if (screen === 'prep') {
    return (
      <PrepScreen
        selectedWok={selectedWok}
        selectedIngredients={selectedIngredients}
        onSelectWok={(id) => {
          audioEngine.playClick();
          setSelectedWok(id);
        }}
        onToggleIngredient={handleToggleIngredient}
        onRandomize={handleRandomize}
        onBack={() => {
          audioEngine.playClick();
          setScreen('title');
        }}
        onStartCook={() => {
          audioEngine.initBgm();
          audioEngine.playClick();
          setCookSessionKey((k) => k + 1);
          setScreen('cook');
        }}
      />
    );
  }

  if (screen === 'cook') {
    return (
      <CookingScreen
        key={cookSessionKey}
        wokId={selectedWok}
        selectedIngredientIds={selectedIngredients}
        muted={muted}
        onToggleMute={handleToggleMute}
        onBackToPrep={() => setScreen('prep')}
        onFinish={handleFinishCook}
      />
    );
  }

  return (
    report && (
      <ResultScreen
        report={report}
        wokId={selectedWok}
        selectedIngredientIds={selectedIngredients}
        onRetrySame={() => {
          audioEngine.playClick();
          setCookSessionKey((k) => k + 1);
          setScreen('cook');
        }}
        onChangePrep={() => {
          audioEngine.playClick();
          setScreen('prep');
        }}
        onReturnTitle={() => {
          audioEngine.playClick();
          setScreen('title');
        }}
      />
    )
  );
};

export default App;
