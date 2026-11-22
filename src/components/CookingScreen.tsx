import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  Power,
  Sparkles,
  Volume2,
  VolumeX,
  Utensils,
} from 'lucide-react';
import {
  CookingSnapshot,
  HeatLevel,
  PanIngredientState,
  QteGrade,
  QteRecord,
  SeasoningEvent,
  SeasoningId,
  UmiBubble,
  WokId,
} from '../types';
import { WOK_MAP } from '../data/woks';
import { BASE_INGREDIENTS, INGREDIENT_MAP } from '../data/ingredients';
import { SEASONINGS, SEASONING_MAP } from '../data/seasonings';
import { computeIdealTempRange, computeTargetDuration } from '../engine/scoring';
import { audioEngine } from '../engine/audio';
import { IngredientIcon, SeasoningBottleIcon } from './Icons';

interface CookingScreenProps {
  wokId: WokId;
  selectedIngredientIds: string[];
  muted: boolean;
  onToggleMute: () => void;
  onBackToPrep: () => void;
  onFinish: (snapshot: CookingSnapshot) => void;
}

interface GrainParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  size: number;
  rot: number;
  kind: 'rice' | 'egg' | 'ingredient';
  color: string;
  accent: string;
  ingId?: string;
}

interface VisualParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'steam' | 'smoke' | 'sparkle' | 'splash';
}

interface QteSession {
  active: boolean;
  cursor: number; // 0..1
  dir: 1 | -1;
  speed: number;
  center: number; // 0.35..0.65
  excHalf: number;
  greatHalf: number;
  goodHalf: number;
}

const HEAT_LABELS: Array<{ level: HeatLevel; name: string; color: string; targetTemp: number }> = [
  { level: 0, name: '关火', color: '#64748b', targetTemp: 28 },
  { level: 1, name: '微火', color: '#38bdf8', targetTemp: 115 },
  { level: 2, name: '小火', color: '#0ea5e9', targetTemp: 155 },
  { level: 3, name: '中火', color: '#f59e0b', targetTemp: 195 },
  { level: 4, name: '大火', color: '#f97316', targetTemp: 235 },
  { level: 5, name: '猛火', color: '#ef4444', targetTemp: 280 },
];

export const CookingScreen: React.FC<CookingScreenProps> = ({
  wokId,
  selectedIngredientIds,
  muted,
  onToggleMute,
  onBackToPrep,
  onFinish,
}) => {
  const base = import.meta.env.BASE_URL || '/';
  const wok = WOK_MAP[wokId];
  const allTrayIds = useMemo(
    () => [...BASE_INGREDIENTS.map((b) => b.id), ...selectedIngredientIds],
    [selectedIngredientIds]
  );
  const targetDur = useMemo(
    () => computeTargetDuration(wokId, selectedIngredientIds),
    [wokId, selectedIngredientIds]
  );

  // React UI state (synced smoothly from simulation ref)
  const [helperMode, setHelperMode] = useState(true);
  const [ignited, setIgnited] = useState(false);
  const [heatLevel, setHeatLevel] = useState<HeatLevel>(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [panTemp, setPanTemp] = useState(28);
  const [wokHei, setWokHei] = useState(0);
  const [burnLevel, setBurnLevel] = useState(0);
  const [riceSeparation, setRiceSeparation] = useState(0);
  const [panIngredients, setPanIngredients] = useState<Record<string, PanIngredientState>>({});
  const [seasoningCounts, setSeasoningCounts] = useState<Record<SeasoningId, number>>({
    oil: 0,
    salt: 0,
    soy: 0,
    sugar: 0,
    msg: 0,
    spice: 0,
    honey: 0,
  });
  const [combo, setCombo] = useState(0);
  const [qtePopup, setQtePopup] = useState<{ id: number; grade: QteGrade; combo: number; note?: string } | null>(null);
  const [specialToast, setSpecialToast] = useState<{ id: number; text: string; color: string } | null>(null);
  const [umiBubble, setUmiBubble] = useState<UmiBubble>({
    id: 1,
    text: '先点击下方煤气灶点火热锅，再倒点食用油吧！食材顺序由你自由发挥哦♪',
    mood: 'happy',
  });
  const [tossAnimKey, setTossAnimKey] = useState(0);
  const [hoveredSeasoning, setHoveredSeasoning] = useState<SeasoningId | null>(null);

  // QTE state
  const [qte, setQte] = useState<QteSession>({
    active: false,
    cursor: 0,
    dir: 1,
    speed: 1.25,
    center: 0.5,
    excHalf: 0.065,
    greatHalf: 0.145,
    goodHalf: 0.25,
  });

  // Mutable simulation ref for smooth 60fps loop without stale closures
  const simRef = useRef({
    ignited: false,
    heatLevel: 0 as HeatLevel,
    elapsedSec: 0,
    panTemp: 28,
    wokHei: 0,
    burnLevel: 0,
    riceSeparation: 0,
    goldenEggCoating: false,
    soySizzleTriggered: false,
    spiceBloomTriggered: false,
    honeyGlazeTriggered: false,
    darkHoneyPenalty: false,
    spillLoss: 0,
    tempSamples: [] as Array<{ temp: number; inIdeal: boolean; heat: HeatLevel }>,
    panIngredients: {} as Record<string, PanIngredientState>,
    seasoningCounts: { oil: 0, salt: 0, soy: 0, sugar: 0, msg: 0, spice: 0, honey: 0 } as Record<SeasoningId, number>,
    seasoningEvents: [] as SeasoningEvent[],
    qteRecords: [] as QteRecord[],
    combo: 0,
    maxCombo: 0,
    sinceLastTossSec: 0,
    idleBurnSec: 0,
    waterDampen: 0,
    sampleAccum: 0,
    uiSyncAccum: 0,
    warnedBurn: false,
    warnedNoOil: false,
    warnedReady: false,
  });

  const qteRef = useRef(qte);
  qteRef.current = qte;

  // Canvases
  const flameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foodCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const grainsRef = useRef<GrainParticle[]>([]);
  const fxRef = useRef<VisualParticle[]>([]);

  const pushBubble = useCallback((text: string, mood: UmiBubble['mood'] = 'happy') => {
    setUmiBubble({ id: Date.now() + Math.random(), text, mood });
  }, []);

  const pushToast = useCallback((text: string, color = '#ea580c') => {
    setSpecialToast({ id: Date.now() + Math.random(), text, color });
  }, []);

  const spawnSplash = useCallback((color: string, count = 14) => {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * 75;
      fxRef.current.push({
        x: 210 + (Math.random() - 0.5) * 40,
        y: 195 + (Math.random() - 0.5) * 30,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 20,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.25,
        size: 3 + Math.random() * 4,
        color,
        kind: 'splash',
      });
    }
  }, []);

  const idealTempRange = useMemo(
    () => computeIdealTempRange(wokId, Object.keys(panIngredients)),
    [wokId, panIngredients]
  );

  // Ignition / heat controls
  const handleSetHeat = useCallback(
    (level: HeatLevel) => {
      const s = simRef.current;
      audioEngine.initBgm();
      if (level > 0 && !s.ignited) {
        s.ignited = true;
        setIgnited(true);
        audioEngine.playIgnite();
        pushBubble('点着火啦！热锅放油后就可以下食材咯~', 'excited');
      } else {
        audioEngine.playClick();
      }
      s.heatLevel = level;
      setHeatLevel(level);
      audioEngine.updateFlameAmbience(level, level > 0);
    },
    [pushBubble]
  );

  const handleToggleIgnite = useCallback(() => {
    if (simRef.current.heatLevel === 0) {
      handleSetHeat(3);
    } else {
      handleSetHeat(0);
      pushBubble('已关闭燃气火源，正好可以利用锅底余温准备出锅！', 'happy');
    }
  }, [handleSetHeat, pushBubble]);

  // Add ingredient to wok
  const handleAddIngredient = useCallback(
    (id: string) => {
      const s = simRef.current;
      if (s.panIngredients[id]) return;
      const cfg = INGREDIENT_MAP[id];
      if (!cfg) return;

      audioEngine.initBgm();
      const sizzleStrength = Math.max(0.25, Math.min(1, (s.panTemp - 60) / 160));
      audioEngine.playSizzle(sizzleStrength);

      // Evaluate sequencing order score
      const hasRice = Boolean(s.panIngredients['rice']);
      const hasEgg = Boolean(s.panIngredients['egg']);
      const progress = Math.min(1, s.elapsedSec / Math.max(25, targetDur.min));
      let orderScore = 78;

      if (cfg.id === 'egg') {
        orderScore = !hasRice && s.panTemp >= 130 ? 100 : s.panTemp >= 110 ? 86 : 65;
      } else if (cfg.id === 'rice') {
        orderScore = hasEgg && s.panTemp >= 145 ? 100 : s.panTemp >= 130 ? 85 : 64;
      } else if (cfg.preferredStage === 'early') {
        orderScore = !hasRice || progress < 0.35 ? 100 : progress < 0.6 ? 78 : 50;
      } else if (cfg.preferredStage === 'mid') {
        orderScore = progress >= 0.15 && progress <= 0.7 ? 98 : 74;
      } else if (cfg.preferredStage === 'late') {
        orderScore = hasRice || progress >= 0.35 ? 98 : 66;
      } else if (cfg.preferredStage === 'finish') {
        orderScore = hasRice && progress >= 0.55 ? 100 : hasRice ? 76 : 45;
      }

      s.panIngredients[id] = {
        id,
        addedAt: s.elapsedSec,
        addedTemp: s.panTemp,
        doneness: 0,
        quality: s.panTemp >= 110 ? 92 : 74,
        orderScore,
      };

      // Cooling shock & water dampen (cast iron halves shock!)
      const shockMult = wok.id === 'castiron' ? 0.5 : 1.0;
      s.panTemp = Math.max(40, s.panTemp - cfg.coolingShock * shockMult);
      s.waterDampen = Math.min(1, s.waterDampen + cfg.waterContent * 0.45);
      s.sinceLastTossSec = Math.max(0, s.sinceLastTossSec - 1.5);

      // Check Golden Egg Coating (金包银) setup!
      if (id === 'rice' && hasEgg && !s.goldenEggCoating) {
        const eggSt = s.panIngredients['egg'];
        if (eggSt && eggSt.doneness >= 15 && eggSt.doneness <= 95 && s.panTemp >= 140) {
          s.goldenEggCoating = true;
          pushToast('✨ 黄金炒饭·金包银触发！', '#f59e0b');
          pushBubble('哇啊！蛋液刚好裹住每一粒米饭，闪闪发光的金包银诞生啦！！', 'excited');
        }
      } else if (id === 'egg' && hasRice && !s.goldenEggCoating && s.panTemp >= 145) {
        s.goldenEggCoating = true;
        pushToast('✨ 蛋液裹饭·金包银触发！', '#f59e0b');
        pushBubble('趁热把蛋液快速翻匀，米粒正在变成诱人的金黄色！', 'excited');
      } else if (cfg.preferredStage === 'finish' && !hasRice) {
        pushBubble(`${cfg.name}这么早就下锅啦？小心炒太久变老变黑哦！`, 'warn');
      } else if (s.seasoningCounts.oil === 0 && !s.warnedNoOil) {
        s.warnedNoOil = true;
        pushBubble('呀，好像还没放食用油呢！干锅炒容易粘底哦！', 'warn');
      } else if (id === 'mushroom' || id === 'broccoli') {
        pushBubble(`香喷喷的${cfg.name}下锅啦，记得炒透才最美味！`, 'happy');
      }

      // Spawn physical grains/pieces in wok canvas!
      if (id === 'rice') {
        for (let i = 0; i < 115; i++) {
          const r = Math.sqrt(Math.random()) * 110;
          const th = Math.random() * Math.PI * 2;
          grainsRef.current.push({
            x: 210 + Math.cos(th) * r,
            y: 196 + Math.sin(th) * r * 0.72,
            vx: 0,
            vy: 0,
            z: 24 + Math.random() * 18,
            vz: 0,
            size: 4.2 + Math.random() * 2.2,
            rot: Math.random() * Math.PI,
            kind: 'rice',
            color: '#fff9eb',
            accent: '#f5e6c4',
          });
        }
      } else if (id === 'egg') {
        for (let i = 0; i < 32; i++) {
          const r = Math.sqrt(Math.random()) * 95;
          const th = Math.random() * Math.PI * 2;
          grainsRef.current.push({
            x: 210 + Math.cos(th) * r,
            y: 196 + Math.sin(th) * r * 0.72,
            vx: 0,
            vy: 0,
            z: 20 + Math.random() * 14,
            vz: 0,
            size: 7.5 + Math.random() * 4.5,
            rot: Math.random() * Math.PI,
            kind: 'egg',
            color: '#ffd147',
            accent: '#f59e0b',
          });
        }
      } else {
        for (let i = 0; i < 18; i++) {
          const r = Math.sqrt(Math.random()) * 102;
          const th = Math.random() * Math.PI * 2;
          grainsRef.current.push({
            x: 210 + Math.cos(th) * r,
            y: 196 + Math.sin(th) * r * 0.72,
            vx: 0,
            vy: 0,
            z: 28 + Math.random() * 18,
            vz: 0,
            size: 6.5 + Math.random() * 4,
            rot: Math.random() * Math.PI,
            kind: 'ingredient',
            color: cfg.color,
            accent: cfg.accentColor,
            ingId: id,
          });
        }
      }

      spawnSplash(cfg.color, 12);
      setPanIngredients({ ...s.panIngredients });
    },
    [pushBubble, pushToast, spawnSplash, targetDur.min, wok.id]
  );

  // Add seasoning
  const handleAddSeasoning = useCallback(
    (sId: SeasoningId) => {
      const s = simRef.current;
      const cfg = SEASONING_MAP[sId];
      audioEngine.initBgm();
      audioEngine.playSeasoning(cfg.liquid);
      if (cfg.liquid && s.panTemp > 130) {
        audioEngine.playSizzle(0.65);
      }

      s.seasoningCounts[sId] += 1;
      const count = s.seasoningCounts[sId];
      s.seasoningEvents.push({
        id: sId,
        time: s.elapsedSec,
        temp: s.panTemp,
        riceInPan: Boolean(s.panIngredients['rice']),
      });

      spawnSplash(cfg.color, 16);

      // Special seasoning chemistry triggers!
      if (sId === 'soy' && s.panTemp >= 170 && s.panTemp <= 230 && !s.soySizzleTriggered) {
        s.soySizzleTriggered = true;
        s.wokHei = Math.min(100, s.wokHei + 12);
        pushToast('🔥 锅边呛酱油！焦香四溢！', '#92400e');
        pushBubble('滋啦——！酱油沿锅边呛出的焦香味好绝呀！！', 'excited');
      } else if (sId === 'spice' && s.seasoningCounts.oil >= 1 && s.panTemp >= 135 && !s.spiceBloomTriggered) {
        s.spiceBloomTriggered = true;
        pushToast('✨ 热油爆香成功！', '#b45309');
        pushBubble('哇，香料遇热油瞬间爆出好浓郁的香气！', 'happy');
      } else if (sId === 'honey') {
        const hasHoneyFriendly = Object.keys(s.panIngredients).some((id) =>
          INGREDIENT_MAP[id]?.synergyTags.includes('honey-friendly')
        );
        const hasSeafood = Object.keys(s.panIngredients).some(
          (id) => INGREDIENT_MAP[id]?.category === 'seafood' && id !== 'eel'
        );
        if (count === 1 && hasHoneyFriendly && !hasSeafood) {
          s.honeyGlazeTriggered = true;
          pushToast('🍯 隐藏触发【蜜汁焦糖】！', '#d97706');
          pushBubble('诶？！居然加了蜂蜜！但配上肉香居然意外地超诱人诶！！', 'excited');
        } else if (count >= 2 || hasSeafood) {
          s.darkHoneyPenalty = true;
          pushToast('🐝 警告：蜂蜜甜腻冲击！', '#7e22ce');
          pushBubble('等、等一下！炒饭里放这么多蜂蜜真的没问题吗……？！', 'panic');
        } else {
          pushBubble('加了一滴夏日百花蜜！甜甜的味道会变成什么风味呢？', 'curious');
        }
      } else if (sId === 'msg' && count >= 3) {
        pushBubble('味精抖太多啦！吃完肯定会狂喝三杯麦茶的！', 'warn');
      } else if (sId === 'salt' && count >= 4) {
        pushBubble('盐好像放超多啦，会变成海水味炒饭的！', 'panic');
      } else if (sId === 'oil' && count === 1 && s.panTemp >= 120) {
        pushBubble('油面微微泛起油纹了，正是下蛋或爆香的好时机！', 'happy');
      }

      setSeasoningCounts({ ...s.seasoningCounts });
    },
    [pushBubble, pushToast, spawnSplash]
  );

  // Start QTE Toss
  const startTossQte = useCallback(() => {
    if (qteRef.current.active) return;
    audioEngine.initBgm();

    const s = simRef.current;
    // Compute QTE speed & target zone based on wok + in-pan ingredients Buffs/Debuffs
    let speedDelta = 0;
    for (const id of Object.keys(s.panIngredients)) {
      speedDelta += INGREDIENT_MAP[id]?.qteSpeedDelta ?? 0;
    }
    const speed = Math.max(0.85, Math.min(2.0, (1.18 + speedDelta) * wok.qteSpeedMult));
    const zone = wok.qteZoneMult;
    const center = 0.34 + Math.random() * 0.32;

    setQte({
      active: true,
      cursor: 0,
      dir: 1,
      speed,
      center,
      excHalf: 0.062 * zone,
      greatHalf: 0.145 * zone,
      goodHalf: 0.255 * zone,
    });
  }, [wok.qteSpeedMult, wok.qteZoneMult]);

  // Resolve QTE Strike
  const strikeQte = useCallback(() => {
    const q = qteRef.current;
    if (!q.active) return;

    const dist = Math.abs(q.cursor - q.center);
    let grade: QteGrade;
    if (dist <= q.excHalf) grade = 'Excellent';
    else if (dist <= q.greatHalf) grade = 'Great';
    else if (dist <= q.goodHalf) grade = 'Good';
    else grade = 'Bad';

    setQte((prev) => ({ ...prev, active: false }));
    setTossAnimKey((k) => k + 1);
    audioEngine.playTossQte(grade);

    const s = simRef.current;
    s.sinceLastTossSec = 0;

    if (grade === 'Bad') {
      s.combo = 0;
    } else {
      s.combo += 1;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
    }
    setCombo(s.combo);

    s.qteRecords.push({ grade, time: s.elapsedSec, combo: s.combo });

    const hasFood = Object.keys(s.panIngredients).length > 0;
    const hasRice = Boolean(s.panIngredients['rice']);
    let note = '';

    // Apply physical & scoring effects of the toss!
    if (grade === 'Excellent') {
      if (hasFood && s.panTemp >= 150) {
        const heiGain = (12.5 + Math.min(5, s.combo * 1.1)) * wok.wokHeiMult * (1 - s.waterDampen * 0.45);
        s.wokHei = Math.min(100, s.wokHei + heiGain);
      }
      if (hasRice) s.riceSeparation = Math.min(100, s.riceSeparation + 24);
      s.panTemp = Math.max(40, s.panTemp - 11);
      s.waterDampen = Math.max(0, s.waterDampen - 0.35);
      // Spawn golden wok-hei sparkles
      for (let i = 0; i < 16; i++) {
        fxRef.current.push({
          x: 210 + (Math.random() - 0.5) * 140,
          y: 185 + (Math.random() - 0.5) * 80,
          vx: (Math.random() - 0.5) * 65,
          vy: -45 - Math.random() * 80,
          life: 0,
          maxLife: 0.75 + Math.random() * 0.35,
          size: 4 + Math.random() * 4,
          color: '#fbbf24',
          kind: 'sparkle',
        });
      }
      if (s.combo >= 3) {
        note = `锅气暴涨！${s.combo} 连击！`;
        pushBubble(`好厉害的颠勺节奏！已经 ${s.combo} 连击啦，锅气香到不行！`, 'excited');
      }
    } else if (grade === 'Great') {
      if (hasFood && s.panTemp >= 145) {
        s.wokHei = Math.min(100, s.wokHei + 8 * wok.wokHeiMult * (1 - s.waterDampen * 0.45));
      }
      if (hasRice) s.riceSeparation = Math.min(100, s.riceSeparation + 17);
      s.panTemp = Math.max(40, s.panTemp - 8);
      s.waterDampen = Math.max(0, s.waterDampen - 0.25);
    } else if (grade === 'Good') {
      if (hasFood && s.panTemp >= 145) {
        s.wokHei = Math.min(100, s.wokHei + 4 * wok.wokHeiMult);
      }
      if (hasRice) s.riceSeparation = Math.min(100, s.riceSeparation + 10);
      s.panTemp = Math.max(40, s.panTemp - 5);
    } else {
      // Bad toss: spill loss + fragile damage!
      let fragMult = 1.0;
      for (const id of Object.keys(s.panIngredients)) {
        const cfg = INGREDIENT_MAP[id];
        if (cfg && cfg.fragility > 1) fragMult += 0.35;
      }
      s.spillLoss = Math.min(100, s.spillLoss + 9 * fragMult);
      note = '哎呀，米粒飞出锅啦！';
      pushBubble('哇呀！颠得太猛，米粒差点飞到我头发上啦！', 'warn');
    }

    // Launch all grains upward in parabolic toss!
    const power = grade === 'Excellent' ? 1.25 : grade === 'Great' ? 1.0 : grade === 'Good' ? 0.75 : 1.45;
    for (const g of grainsRef.current) {
      g.vz = (95 + Math.random() * 85) * power;
      const spread = grade === 'Bad' ? 130 : 65;
      g.vx = (Math.random() - 0.5) * spread;
      g.vy = (Math.random() - 0.5) * spread * 0.7;
    }

    setQtePopup({ id: Date.now(), grade, combo: s.combo, note });
  }, [pushBubble, wok.wokHeiMult]);

  // Keyboard shortcuts: Space for Toss/QTE, 0-5 for heat
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (qteRef.current.active) {
          strikeQte();
        } else {
          startTossQte();
        }
      } else if (e.key >= '0' && e.key <= '5') {
        handleSetHeat(Number(e.key) as HeatLevel);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSetHeat, startTossQte, strikeQte]);

  // Cleanup flame sound on unmount
  useEffect(() => {
    return () => {
      audioEngine.stopFlameAmbience();
    };
  }, []);

  // Main 60fps Simulation & Dual Canvas Render Loop
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const s = simRef.current;

      // 1. Update QTE cursor if active
      if (qteRef.current.active) {
        setQte((prev) => {
          if (!prev.active) return prev;
          let next = prev.cursor + prev.dir * prev.speed * dt;
          let dir = prev.dir;
          if (next >= 1) {
            next = 1;
            dir = -1;
          } else if (next <= 0) {
            next = 0;
            dir = 1;
          }
          return { ...prev, cursor: next, dir };
        });
      }

      // 2. Simulation clock starts once ignited OR once any ingredient is added
      const hasAnyFood = Object.keys(s.panIngredients).length > 0;
      const cookingActive = s.ignited || hasAnyFood;
      if (cookingActive) {
        s.elapsedSec += dt;
      }

      // 3. Temperature physics
      const targetHeat = HEAT_LABELS[s.heatLevel].targetTemp;
      const clampedTarget = Math.min(wok.maxTemp, targetHeat);
      if (s.panTemp < clampedTarget) {
        s.panTemp += (clampedTarget - s.panTemp) * 0.42 * wok.heatRate * dt;
      } else {
        s.panTemp += (clampedTarget - s.panTemp) * 0.28 * wok.coolRate * dt;
      }
      s.waterDampen = Math.max(0, s.waterDampen - dt * 0.08);

      // 4. Per-ingredient doneness & quality accumulation
      const inPanIds = Object.keys(s.panIngredients);
      const currIdeal = computeIdealTempRange(wokId, inPanIds);

      if (hasAnyFood) {
        if (s.panTemp > 120) {
          s.sinceLastTossSec += dt;
        }
        // Check idle hot burn
        const noOilFactor = s.seasoningCounts.oil === 0 ? 1.85 : 1.0;
        const idleThreshold = wok.id === 'iron' ? 4.5 : 5.8;
        if (s.panTemp > 175 && s.sinceLastTossSec > idleThreshold) {
          s.idleBurnSec += dt;
        }

        // Update each ingredient's doneness
        let maxBurnSens = 1.0;
        for (const id of inPanIds) {
          const st = s.panIngredients[id];
          const cfg = INGREDIENT_MAP[id];
          if (!cfg) continue;
          maxBurnSens = Math.max(maxBurnSens, cfg.burnSensitivity);

          if (s.panTemp > 85) {
            const tempFactor = Math.max(0.15, (s.panTemp - 75) / 115);
            st.doneness += (100 / cfg.idealCookSec) * tempFactor * dt;

            // Quality drifts gently based on whether panTemp is in ingredient's ideal band
            const inBand = s.panTemp >= cfg.idealTempMin - 12 && s.panTemp <= cfg.idealTempMax + 15;
            if (inBand) {
              st.quality = Math.min(100, st.quality + 2.5 * dt);
            } else if (s.panTemp > cfg.idealTempMax + 25) {
              st.quality = Math.max(20, st.quality - 6.5 * dt);
            } else if (s.panTemp < cfg.idealTempMin - 25) {
              st.quality = Math.max(30, st.quality - 3.5 * dt);
            }
          }
        }

        // Scorch / burn calculation
        const overheat = Math.max(0, s.panTemp - (currIdeal.max + 10));
        const idleOver = Math.max(0, s.sinceLastTossSec - idleThreshold);
        if (overheat > 0 || (idleOver > 0 && s.panTemp > 165) || (s.seasoningCounts.oil === 0 && s.panTemp > 165)) {
          const burnDelta =
            ((overheat * 0.085) + (idleOver * 0.95) + (s.seasoningCounts.oil === 0 && s.panTemp > 165 ? 2.4 : 0)) *
            wok.burnRateMult *
            maxBurnSens *
            noOilFactor *
            dt;
          s.burnLevel = Math.min(100, s.burnLevel + burnDelta);
        }

        if (s.burnLevel >= 25 && !s.warnedBurn) {
          s.warnedBurn = true;
          pushBubble('呜哇！锅里开始冒焦烟了！快调小火或用力翻炒救场！！', 'panic');
        }
        if (s.elapsedSec >= targetDur.min && !s.warnedReady && s.panIngredients['rice']) {
          s.warnedReady = true;
          pushBubble('香气已经满厨房飘啦！感觉熟度差不多就可以关火盛盘出锅咯♪', 'excited');
        }
      }

      // 5. Periodic sampling for heat accuracy
      s.sampleAccum += dt;
      if (cookingActive && s.sampleAccum >= 0.4) {
        s.sampleAccum = 0;
        const inIdeal = s.panTemp >= currIdeal.min && s.panTemp <= currIdeal.max;
        s.tempSamples.push({ temp: s.panTemp, inIdeal, heat: s.heatLevel });
      }

      // 6. Sync React HUD ~12fps to keep UI super crisp & lightweight
      s.uiSyncAccum += dt;
      if (s.uiSyncAccum >= 0.085) {
        s.uiSyncAccum = 0;
        setElapsedSec(s.elapsedSec);
        setPanTemp(s.panTemp);
        setWokHei(s.wokHei);
        setBurnLevel(s.burnLevel);
        setRiceSeparation(s.riceSeparation);
        setPanIngredients({ ...s.panIngredients });
      }

      // 7. Render Burner Flame Canvas
      const fCanvas = flameCanvasRef.current;
      if (fCanvas) {
        const fctx = fCanvas.getContext('2d');
        if (fctx) {
          fctx.clearRect(0, 0, fCanvas.width, fCanvas.height);
          if (s.heatLevel > 0) {
            const cx = fCanvas.width / 2;
            const cy = fCanvas.height / 2;
            const t = now * 0.012;
            const baseR = 54 + s.heatLevel * 12;
            const flameCount = 18 + s.heatLevel * 4;

            // Ambient blue glow
            const glow = fctx.createRadialGradient(cx, cy, 10, cx, cy, baseR + 48);
            glow.addColorStop(0, `rgba(56, 189, 248, ${0.22 + s.heatLevel * 0.08})`);
            glow.addColorStop(0.6, `rgba(37, 99, 235, ${0.14 + s.heatLevel * 0.05})`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            fctx.fillStyle = glow;
            fctx.beginPath();
            fctx.ellipse(cx, cy, baseR + 48, (baseR + 48) * 0.65, 0, 0, Math.PI * 2);
            fctx.fill();

            // Individual gas jets around the burner ring
            for (let i = 0; i < flameCount; i++) {
              const ang = (i / flameCount) * Math.PI * 2;
              const flicker = 0.84 + Math.sin(t * 2.3 + i * 1.7) * 0.16;
              const len = (14 + s.heatLevel * 7.5) * flicker;
              const rx = cx + Math.cos(ang) * baseR;
              const ry = cy + Math.sin(ang) * baseR * 0.62;
              const tx = cx + Math.cos(ang) * (baseR + len);
              const ty = cy + Math.sin(ang) * (baseR + len) * 0.62 - (4 + s.heatLevel * 2);

              const grad = fctx.createLinearGradient(rx, ry, tx, ty);
              grad.addColorStop(0, '#93c5fd');
              grad.addColorStop(0.55, s.heatLevel >= 4 ? '#3b82f6' : '#2563eb');
              grad.addColorStop(1, s.heatLevel === 5 ? '#fb923c' : '#60a5fa');

              fctx.strokeStyle = grad;
              fctx.lineWidth = 4 + s.heatLevel * 0.9;
              fctx.lineCap = 'round';
              fctx.beginPath();
              fctx.moveTo(rx, ry);
              fctx.lineTo(tx, ty);
              fctx.stroke();
            }
          }
        }
      }

      // 8. Render Wok Food + Particles Canvas
      const foodCanvas = foodCanvasRef.current;
      if (foodCanvas) {
        const ctx = foodCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, foodCanvas.width, foodCanvas.height);

          // Oil sheen in pan center
          if (s.seasoningCounts.oil > 0) {
            const oilAlpha = Math.min(0.45, 0.14 + s.seasoningCounts.oil * 0.08);
            const oilGrad = ctx.createRadialGradient(210, 200, 12, 210, 200, 118);
            oilGrad.addColorStop(0, `rgba(255, 204, 77, ${oilAlpha})`);
            oilGrad.addColorStop(0.75, `rgba(245, 158, 11, ${oilAlpha * 0.45})`);
            oilGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
            ctx.fillStyle = oilGrad;
            ctx.beginPath();
            ctx.ellipse(210, 200, 118, 86, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          // Compute dynamic rice tint based on golden egg coating, soy sauce, and burn level
          const soyFactor = Math.min(1, s.seasoningCounts.soy / 3);
          const burnFactor = Math.min(1, s.burnLevel / 100);
          const eggTint = s.goldenEggCoating ? 1 : s.panIngredients['egg'] ? 0.55 : 0;

          const baseR = Math.round(255 - soyFactor * 55 - burnFactor * 185);
          const baseG = Math.round(248 - eggTint * 24 - soyFactor * 95 - burnFactor * 190);
          const baseB = Math.round(230 - eggTint * 125 - soyFactor * 135 - burnFactor * 185);
          const riceColor = `rgb(${Math.max(28, baseR)}, ${Math.max(24, baseG)}, ${Math.max(20, baseB)})`;

          // Update & draw grains
          for (const g of grainsRef.current) {
            if (g.z > 0 || g.vz > 0) {
              g.z += g.vz * dt;
              g.vz -= 460 * dt;
              g.x += g.vx * dt;
              g.y += g.vy * dt;
              if (g.z <= 0) {
                g.z = 0;
                g.vz = 0;
                g.vx = 0;
                g.vy = 0;
                // Keep inside pan ellipse
                const dx = (g.x - 210) / 112;
                const dy = (g.y - 196) / 80;
                const d = Math.hypot(dx, dy);
                if (d > 1) {
                  g.x = 210 + (dx / d) * 105;
                  g.y = 196 + (dy / d) * 74;
                }
              }
            } else if (s.panTemp > 130 && Math.random() < 0.03) {
              // subtle sizzle jitter
              g.x += (Math.random() - 0.5) * 1.4;
              g.y += (Math.random() - 0.5) * 1.0;
            }

            const drawY = g.y - g.z * 0.72;
            const scale = 1 + g.z * 0.0055;
            ctx.save();
            ctx.translate(g.x, drawY);
            ctx.rotate(g.rot);
            ctx.scale(scale, scale);

            if (g.kind === 'rice') {
              ctx.fillStyle = riceColor;
              ctx.beginPath();
              ctx.ellipse(0, 0, g.size, g.size * 0.56, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = 'rgba(110, 75, 35, 0.25)';
              ctx.lineWidth = 0.7;
              ctx.stroke();
            } else if (g.kind === 'egg') {
              ctx.fillStyle = burnFactor > 0.5 ? '#5c4028' : '#ffd147';
              ctx.beginPath();
              ctx.ellipse(0, 0, g.size, g.size * 0.68, 0, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Colored ingredient cube/piece (darkens slightly if burnt)
              ctx.fillStyle = burnFactor > 0.65 ? '#3b2b23' : g.color;
              ctx.beginPath();
              ctx.roundRect(-g.size / 2, -g.size / 2, g.size, g.size * 0.82, 2.5);
              ctx.fill();
              ctx.strokeStyle = g.accent;
              ctx.lineWidth = 1.2;
              ctx.stroke();
            }
            ctx.restore();
          }

          // Spawn steam / smoke particles continuously when hot
          if (hasAnyFood && s.panTemp > 115 && Math.random() < (s.panTemp - 95) / 280) {
            const smoky = s.burnLevel > 22 && Math.random() < s.burnLevel / 90;
            fxRef.current.push({
              x: 210 + (Math.random() - 0.5) * 140,
              y: 190 + (Math.random() - 0.5) * 60,
              vx: (Math.random() - 0.5) * 16,
              vy: -32 - Math.random() * 35,
              life: 0,
              maxLife: 1.1 + Math.random() * 0.7,
              size: smoky ? 14 + Math.random() * 14 : 10 + Math.random() * 12,
              color: smoky ? 'rgba(55, 48, 52, 0.45)' : 'rgba(255, 255, 255, 0.42)',
              kind: smoky ? 'smoke' : 'steam',
            });
          }

          // Update & draw FX particles
          const alive: VisualParticle[] = [];
          for (const p of fxRef.current) {
            p.life += dt;
            if (p.life >= p.maxLife) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.kind === 'splash') p.vy += 220 * dt;
            const prog = p.life / p.maxLife;
            const alpha = p.kind === 'sparkle' ? 1 - prog : Math.sin(prog * Math.PI);

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            if (p.kind === 'sparkle') {
              ctx.fillStyle = p.color;
              ctx.translate(p.x, p.y);
              ctx.beginPath();
              const r = p.size * (1 - prog * 0.3);
              ctx.moveTo(0, -r);
              ctx.lineTo(r * 0.32, -r * 0.32);
              ctx.lineTo(r, 0);
              ctx.lineTo(r * 0.32, r * 0.32);
              ctx.lineTo(0, r);
              ctx.lineTo(-r * 0.32, r * 0.32);
              ctx.lineTo(-r, 0);
              ctx.lineTo(-r * 0.32, -r * 0.32);
              ctx.closePath();
              ctx.fill();
            } else {
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size * (p.kind === 'steam' || p.kind === 'smoke' ? 0.8 + prog * 0.9 : 1), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
            alive.push(p);
          }
          fxRef.current = alive;
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [pushBubble, targetDur.min, wok.burnRateMult, wok.coolRate, wok.heatRate, wok.id, wok.maxTemp, wokId]);

  const handleServeDish = () => {
    const s = simRef.current;
    audioEngine.stopFlameAmbience();
    audioEngine.playFinish(s.burnLevel < 45 && Boolean(s.panIngredients['rice']));
    const snapshot: CookingSnapshot = {
      wokId,
      selectedIngredientIds,
      elapsedSec: s.elapsedSec,
      targetDurationMin: targetDur.min,
      targetDurationMax: targetDur.max,
      heatLevel: s.heatLevel,
      ignited: s.ignited,
      panTemp: s.panTemp,
      wokHei: s.wokHei,
      burnLevel: s.burnLevel,
      riceSeparation: s.riceSeparation,
      goldenEggCoating: s.goldenEggCoating,
      soySizzleTriggered: s.soySizzleTriggered,
      spiceBloomTriggered: s.spiceBloomTriggered,
      honeyGlazeTriggered: s.honeyGlazeTriggered,
      darkHoneyPenalty: s.darkHoneyPenalty,
      spillLoss: s.spillLoss,
      tempSamples: [...s.tempSamples],
      panIngredients: JSON.parse(JSON.stringify(s.panIngredients)),
      seasoningCounts: { ...s.seasoningCounts },
      seasoningEvents: [...s.seasoningEvents],
      qteRecords: [...s.qteRecords],
      maxCombo: s.maxCombo,
      idleBurnSec: s.idleBurnSec,
      finishedHeatLevel: s.heatLevel,
      finishTemp: s.panTemp,
    };
    onFinish(snapshot);
  };

  // Compute temperature meter percentage (25..285°C)
  const tempPct = Math.max(0, Math.min(100, ((panTemp - 25) / 260) * 100));
  const idealMinPct = Math.max(0, Math.min(100, ((idealTempRange.min - 25) / 260) * 100));
  const idealMaxPct = Math.max(0, Math.min(100, ((idealTempRange.max - 25) / 260) * 100));
  const inIdealNow = panTemp >= idealTempRange.min && panTemp <= idealTempRange.max;

  const getDonenessLabel = (d: number) => {
    if (d < 65) return { text: '偏生', color: '#38bdf8' };
    if (d <= 122) return { text: '嫩熟★', color: '#16a34a' };
    if (d <= 145) return { text: '略老', color: '#f59e0b' };
    return { text: '焦老', color: '#dc2626' };
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#1e2420',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Background: Denoised first-person kitchen stove CG */}
      <img
        src={`${base}assets/images/kitchen_stove_bg.png`}
        alt="鸟白岛厨房灶台"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center center',
        }}
      />

      {/* TOP HUD BAR (Guaranteed single compact row, zero collision) */}
      <header
        style={{
          position: 'relative',
          zIndex: 25,
          padding: '8px 12px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Left Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => {
              audioEngine.stopFlameAmbience();
              onBackToPrep();
            }}
            className="btn-ghost"
            style={{ padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
          >
            <ArrowLeft size={14} /> 换配置
          </button>
          <span
            className="summer-card"
            style={{
              padding: '5px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              color: '#9a3412',
              whiteSpace: 'nowrap',
            }}
          >
            🍳 {wok.name}
          </span>
        </div>

        {/* Center Telemetry Gauges */}
        <div
          className="summer-card"
          style={{
            padding: '5px 12px',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          {/* Timer */}
          <div style={{ whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#6b5b4e' }}>
              计时 {helperMode && `(${targetDur.min}~${targetDur.max}s)`}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 900,
                lineHeight: 1.1,
                color:
                  elapsedSec >= targetDur.min && elapsedSec <= targetDur.max
                    ? '#16a34a'
                    : elapsedSec > targetDur.max
                      ? '#dc2626'
                      : '#2c241e',
              }}
            >
              {elapsedSec.toFixed(1)}s
            </div>
          </div>

          {/* Temperature Bar */}
          <div style={{ width: 'clamp(115px, 14vw, 175px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
              <span style={{ color: inIdealNow ? '#15803d' : '#786655' }}>
                {Math.round(panTemp)}°C {inIdealNow && '✓'}
              </span>
              {helperMode && (
                <span style={{ color: '#0284c7' }}>
                  {idealTempRange.min}~{idealTempRange.max}°
                </span>
              )}
            </div>
            <div
              style={{
                position: 'relative',
                height: 8,
                borderRadius: 999,
                background: '#e2e8f0',
                marginTop: 3,
                overflow: 'hidden',
              }}
            >
              {helperMode && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${idealMinPct}%`,
                    width: `${Math.max(6, idealMaxPct - idealMinPct)}%`,
                    top: 0,
                    bottom: 0,
                    background: 'rgba(34, 197, 94, 0.42)',
                    borderLeft: '2px solid #16a34a',
                    borderRight: '2px solid #16a34a',
                  }}
                />
              )}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${tempPct}%`,
                  background:
                    panTemp > idealTempRange.max + 10
                      ? 'linear-gradient(90deg, #f97316, #dc2626)'
                      : 'linear-gradient(90deg, #38bdf8, #f59e0b)',
                  borderRadius: 999,
                  transition: 'width 0.08s linear',
                }}
              />
            </div>
          </div>

          {/* Wok Hei */}
          <div style={{ width: 'clamp(68px, 8vw, 98px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
              <span style={{ color: '#d97706' }}>🔥锅气</span>
              <span>{Math.round(wokHei)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#fef3c7', marginTop: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${wokHei}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #fbbf24, #f97316)',
                  transition: 'width 0.12s',
                }}
              />
            </div>
          </div>

          {/* Scorch / Burn */}
          <div style={{ width: 'clamp(64px, 7.5vw, 92px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
              <span style={{ color: burnLevel > 25 ? '#dc2626' : '#64748b' }}>💨焦糊</span>
              <span style={{ color: burnLevel > 25 ? '#dc2626' : '#475569' }}>{Math.round(burnLevel)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', marginTop: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${burnLevel}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #78716c, #991b1b)',
                  transition: 'width 0.12s',
                }}
              />
            </div>
          </div>

          {combo >= 2 && (
            <div
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 11.5,
                whiteSpace: 'nowrap',
              }}
            >
              {combo}×
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setHelperMode((v) => !v)}
            className="btn-ghost"
            style={{ padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            title="切换新手辅助提示 / 无提示大师模式"
          >
            {helperMode ? <Eye size={14} /> : <EyeOff size={14} />}
            {helperMode ? '辅助' : '大师'}
          </button>
          <button
            onClick={onToggleMute}
            className="btn-ghost"
            style={{ padding: '6px 9px', display: 'inline-flex', alignItems: 'center' }}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </header>

      {/* MAIN 3-COLUMN FLEX STAGE (Mathematically Zero-Overlap Across All Viewport Widths!) */}
      <div
        style={{
          position: 'relative',
          zIndex: 15,
          flex: 1,
          minHeight: 0,
          padding: '6px 12px 12px',
          display: 'grid',
          gridTemplateColumns: 'clamp(196px, 23vw, 252px) minmax(0, 1fr) clamp(210px, 24vw, 272px)',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        {/* LEFT COLUMN: UMI BUBBLE (top) + INGREDIENT BOWLS (bottom) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8, minHeight: 0 }}>
          {/* UMI LIVE COMMENTARY BUBBLE */}
          <div
            key={umiBubble.id}
            className="summer-card anim-pop"
            style={{
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderColor:
                umiBubble.mood === 'panic'
                  ? '#ef4444'
                  : umiBubble.mood === 'warn'
                    ? '#f59e0b'
                    : 'rgba(236, 72, 153, 0.45)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid #f472b6',
                background: '#fff5f7',
                flexShrink: 0,
              }}
            >
              <img
                src={`${base}assets/images/${
                  umiBubble.mood === 'panic'
                    ? 'umi_c.png'
                    : umiBubble.mood === 'warn'
                      ? 'umi_b.png'
                      : umiBubble.mood === 'excited'
                        ? 'umi_splus.png'
                        : 'umi_s.png'
                }`}
                alt="羽未"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 18%', transform: 'scale(1.6)' }}
              />
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.4, fontWeight: 700, color: '#3b2c22', minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, color: '#db2777', marginBottom: 1 }}>加藤羽未</div>
              {umiBubble.text}
            </div>
          </div>

          {/* LEFT WOODEN COUNTERTOP: INGREDIENT BOWLS */}
          <div
            className="summer-card"
            style={{
              padding: '10px 9px',
              background: 'rgba(255, 249, 236, 0.92)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <span style={{ fontWeight: 900, fontSize: 12.5, color: '#78350f' }}>🥣 备菜碟（点击下锅）</span>
              {helperMode && panIngredients['rice'] && (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#d97706' }}>
                  松散 {Math.round(riceSeparation)}%
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {allTrayIds.map((id) => {
                const cfg = INGREDIENT_MAP[id];
                const st = panIngredients[id];
                const added = Boolean(st);
                const doneMeta = st ? getDonenessLabel(st.doneness) : null;

                return (
                  <button
                    key={id}
                    onClick={() => handleAddIngredient(id)}
                    disabled={added}
                    style={{
                      padding: '6px 5px',
                      borderRadius: 10,
                      background: added ? 'rgba(241, 245, 249, 0.92)' : '#fff',
                      border: added ? '1.5px solid #94a3b8' : '2px solid #f59e0b',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      position: 'relative',
                      opacity: added ? 0.92 : 1,
                    }}
                  >
                    <IngredientIcon shape={cfg.iconShape} size={28} />
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#2c241e', textAlign: 'center', lineHeight: 1.2 }}>
                      {cfg.name}
                    </div>
                    {!added ? (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#ea580c' }}>点击下锅</span>
                    ) : helperMode && st && doneMeta ? (
                      <div style={{ width: '100%' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 9.5,
                            fontWeight: 800,
                            color: doneMeta.color,
                          }}
                        >
                          <span>入锅</span>
                          <span>{doneMeta.text}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: '#e2e8f0', marginTop: 2, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, (st.doneness / 135) * 100)}%`,
                              height: '100%',
                              background: doneMeta.color,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <CheckCircle2 size={10} /> 已入锅
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: TOAST / QTE + WOK STAGE + BOTTOM STOVE DIAL */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {/* Upper center slot: Special Toast or Active QTE */}
          <div style={{ minHeight: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', zIndex: 40 }}>
            {specialToast && !qte.active && (
              <div
                key={specialToast.id}
                className="anim-pop"
                style={{
                  padding: '6px 16px',
                  borderRadius: 999,
                  background: specialToast.color,
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 13.5,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
                  border: '2px solid #fff',
                  pointerEvents: 'none',
                }}
              >
                {specialToast.text}
              </div>
            )}
          </div>

          {/* Center Stove Interactive Stage: Flame + Wok + Food Canvas + Spatula */}
          <div
            style={{
              position: 'relative',
              width: 'min(400px, 100%)',
              aspectRatio: '420 / 370',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 1,
            }}
          >
            {/* Dynamic Gas Flame Canvas UNDER the wok */}
            <canvas
              ref={flameCanvasRef}
              width={440}
              height={340}
              style={{
                position: 'absolute',
                left: '-2%',
                top: '14%',
                width: '104%',
                height: '86%',
                pointerEvents: 'none',
              }}
            />

            {/* Chosen Wok Sprite + Food Canvas */}
            <div
              key={tossAnimKey}
              className={tossAnimKey > 0 ? 'anim-wok-toss' : undefined}
              style={{
                position: 'relative',
                width: '94%',
                height: '94%',
                cursor: 'pointer',
              }}
              onClick={() => (qte.active ? strikeQte() : startTossQte())}
              title="点击锅体/木铲或按 Space 键翻炒"
            >
              <img
                src={`${base}${wok.image}`}
                alt={wok.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.38))',
                }}
              />
              <canvas
                ref={foodCanvasRef}
                width={420}
                height={400}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
              />
            </div>

            {/* Interactive Wooden Spatula (docked cleanly at upper-right of the wok) */}
            <button
              key={`sp-${tossAnimKey}`}
              className={tossAnimKey > 0 ? 'anim-spatula-sweep' : undefined}
              onClick={() => (qte.active ? strikeQte() : startTossQte())}
              style={{
                position: 'absolute',
                right: '-6%',
                top: '2%',
                width: '32%',
                aspectRatio: '1 / 1',
                background: 'transparent',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 18,
              }}
              title="使用木铲翻炒（快捷键 Space）"
            >
              <img
                src={`${base}assets/images/spatula.png`}
                alt="木铲翻炒"
                style={{
                  width: '92%',
                  height: '92%',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.34))',
                }}
              />
              <span
                style={{
                  marginTop: -12,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  color: '#fff',
                  fontSize: 11.5,
                  fontWeight: 900,
                  boxShadow: '0 4px 12px rgba(234,88,12,0.45)',
                  border: '1.5px solid #fff',
                  whiteSpace: 'nowrap',
                }}
              >
                🥄 翻炒 (Space)
              </span>
            </button>

            {/* QTE Floating Result Popup */}
            {qtePopup && (
              <div
                key={qtePopup.id}
                className="anim-qte-float"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '8%',
                  zIndex: 35,
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    letterSpacing: 1,
                    color:
                      qtePopup.grade === 'Excellent'
                        ? '#f59e0b'
                        : qtePopup.grade === 'Great'
                          ? '#22c55e'
                          : qtePopup.grade === 'Good'
                            ? '#38bdf8'
                            : '#ef4444',
                    textShadow: '0 3px 0 #fff, 0 -2px 0 #fff, 2px 0 0 #fff, -2px 0 0 #fff, 0 6px 14px rgba(0,0,0,0.35)',
                  }}
                >
                  {qtePopup.grade}!
                </div>
                {qtePopup.note && (
                  <div
                    style={{
                      marginTop: 2,
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.92)',
                      color: '#2c241e',
                      fontSize: 11.5,
                      fontWeight: 800,
                    }}
                  >
                    {qtePopup.note}
                  </div>
                )}
              </div>
            )}

            {/* ACTIVE QTE PRECISION BAR OVERLAY */}
            {qte.active && (
              <div
                className="summer-card anim-pop"
                onClick={strikeQte}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '-6%',
                  transform: 'translateX(-50%)',
                  zIndex: 45,
                  width: 'min(360px, 98%)',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  borderColor: '#f97316',
                  boxShadow: '0 14px 36px rgba(234, 88, 12, 0.38)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 900, fontSize: 13.5, color: '#ea580c', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={15} /> 翻炒时机 QTE！
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0369a1' }}>点击或按 Space！</span>
                </div>

                <div
                  style={{
                    position: 'relative',
                    height: 26,
                    borderRadius: 999,
                    background: '#ef4444',
                    overflow: 'hidden',
                    border: '2.5px solid #2c241e',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.max(0, (qte.center - qte.goodHalf) * 100)}%`,
                      width: `${Math.min(100, qte.goodHalf * 200)}%`,
                      top: 0,
                      bottom: 0,
                      background: '#38bdf8',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.max(0, (qte.center - qte.greatHalf) * 100)}%`,
                      width: `${Math.min(100, qte.greatHalf * 200)}%`,
                      top: 0,
                      bottom: 0,
                      background: '#22c55e',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.max(0, (qte.center - qte.excHalf) * 100)}%`,
                      width: `${Math.min(100, qte.excHalf * 200)}%`,
                      top: 0,
                      bottom: 0,
                      background: 'linear-gradient(180deg, #fef08a, #f59e0b)',
                      boxShadow: '0 0 12px #fbbf24',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: `calc(${qte.cursor * 100}% - 4px)`,
                      top: -2,
                      bottom: -2,
                      width: 8,
                      background: '#fff',
                      border: '2px solid #1e1b4b',
                      borderRadius: 4,
                      boxShadow: '0 0 10px rgba(0,0,0,0.45)',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 5,
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: '#6b5b4e',
                  }}
                >
                  <span style={{ color: '#dc2626' }}>■ Bad</span>
                  <span style={{ color: '#0284c7' }}>■ Good</span>
                  <span style={{ color: '#16a34a' }}>■ Great</span>
                  <span style={{ color: '#d97706' }}>★ Excellent</span>
                </div>
              </div>
            )}
          </div>

          {/* BOTTOM CENTER: GAS STOVE IGNITION & FLAME CONTROL PANEL (Fits cleanly inside center column!) */}
          <div
            className="summer-card"
            style={{
              zIndex: 25,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'rgba(30, 36, 44, 0.92)',
              borderColor: 'rgba(203, 213, 225, 0.45)',
              color: '#fff',
              maxWidth: '100%',
              flexWrap: 'nowrap',
            }}
          >
            <button
              onClick={handleToggleIgnite}
              style={{
                padding: '7px 11px',
                borderRadius: 10,
                background: heatLevel > 0 ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : 'linear-gradient(135deg, #22c55e, #15803d)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <Power size={14} />
              {heatLevel > 0 ? '关火' : '点火'}
            </button>

            <div style={{ display: 'flex', gap: 4 }}>
              {HEAT_LABELS.slice(1).map((h) => {
                const active = heatLevel === h.level;
                return (
                  <button
                    key={h.level}
                    onClick={() => handleSetHeat(h.level)}
                    style={{
                      padding: '5px 7px',
                      borderRadius: 9,
                      background: active ? h.color : 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 11.5,
                      border: active ? '2px solid #fff' : '1.5px solid rgba(255,255,255,0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      minWidth: 40,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
                      <Flame size={10} /> {h.name}
                    </span>
                    <span style={{ fontSize: 9.5, opacity: 0.85 }}>键{h.level}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SEASONING TOOLTIP + 7 SEASONINGS RACK + SERVE BUTTON */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: 8,
            minHeight: 0,
          }}
        >
          {/* Seasoning Tooltip cleanly contained inside right column */}
          {hoveredSeasoning && (
            <div
              className="summer-card anim-pop"
              style={{ padding: '7px 10px', fontSize: 11, lineHeight: 1.4, color: '#3b2c22' }}
            >
              <strong style={{ color: '#ea580c' }}>{SEASONING_MAP[hoveredSeasoning].name}：</strong>
              {SEASONING_MAP[hoveredSeasoning].description}
              <div style={{ color: '#0369a1', fontWeight: 700, marginTop: 2 }}>
                💡 {SEASONING_MAP[hoveredSeasoning].tip}
              </div>
            </div>
          )}

          <div className="summer-card" style={{ padding: '10px 9px', background: 'rgba(255, 252, 245, 0.92)' }}>
            <div style={{ fontWeight: 900, fontSize: 12.5, color: '#78350f', marginBottom: 7 }}>
              🧂 调味架（点击定量添加）
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
              {SEASONINGS.map((s) => {
                const cnt = seasoningCounts[s.id];
                return (
                  <button
                    key={s.id}
                    onClick={() => handleAddSeasoning(s.id)}
                    onMouseEnter={() => setHoveredSeasoning(s.id)}
                    onMouseLeave={() => setHoveredSeasoning(null)}
                    style={{
                      position: 'relative',
                      padding: '5px 2px 4px',
                      borderRadius: 10,
                      background: cnt > 0 ? '#fff7ed' : '#fff',
                      border: cnt > 0 ? '2px solid #f97316' : '1.5px solid rgba(180,145,106,0.38)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    {cnt > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: -5,
                          right: -4,
                          background: cnt > s.maxRecommended + 1 ? '#dc2626' : '#ea580c',
                          color: '#fff',
                          borderRadius: 999,
                          padding: '1px 5px',
                          fontSize: 9.5,
                          fontWeight: 900,
                        }}
                      >
                        ×{cnt}
                      </span>
                    )}
                    <SeasoningBottleIcon id={s.id} size={32} />
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#2c241e' }}>{s.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Big Serve Button */}
          <button
            onClick={handleServeDish}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '11px 12px',
              fontSize: 14.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background:
                heatLevel === 0 && panIngredients['rice']
                  ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                  : undefined,
            }}
          >
            <Utensils size={18} /> 盛盘出锅，请羽未品尝！
          </button>
        </div>
      </div>
    </div>
  );
};
