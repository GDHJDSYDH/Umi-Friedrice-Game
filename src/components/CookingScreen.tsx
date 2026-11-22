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

// Normalized bowl-interior center inside each 1:1 wok sprite (excluding bottom-right handle)
const WOK_BOWL_CENTERS: Record<WokId, { cx: number; cy: number; rx: number; ry: number }> = {
  iron: { cx: 0.409, cy: 0.389, rx: 108, ry: 80 },
  nonstick: { cx: 0.41, cy: 0.396, rx: 112, ry: 82 },
  castiron: { cx: 0.435, cy: 0.424, rx: 108, ry: 80 },
  copper: { cx: 0.41, cy: 0.36, rx: 110, ry: 82 },
};

const BG_NATURAL_W = 1440;
const BG_NATURAL_H = 960;

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
  const bowl = WOK_BOWL_CENTERS[wokId];
  const bowlCenterX = bowl.cx * 420;
  const bowlCenterY = bowl.cy * 420;
  const allTrayIds = useMemo(
    () => [...BASE_INGREDIENTS.map((b) => b.id), ...selectedIngredientIds],
    [selectedIngredientIds]
  );
  const targetDur = useMemo(
    () => computeTargetDuration(wokId, selectedIngredientIds),
    [wokId, selectedIngredientIds]
  );

  // Viewport & responsive mode tracking
  const [viewport, setViewport] = useState<{ vw: number; vh: number }>(() => ({
    vw: typeof window !== 'undefined' ? window.innerWidth : 1280,
    vh: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const [mobileDockTab, setMobileDockTab] = useState<'ingredients' | 'seasonings'>('ingredients');

  useEffect(() => {
    const updateVp = () => {
      setViewport({ vw: window.innerWidth, vh: window.innerHeight });
    };
    window.addEventListener('resize', updateVp);
    return () => window.removeEventListener('resize', updateVp);
  }, []);

  const isMobilePortrait = viewport.vw < 768;
  const isCompactLandscape = !isMobilePortrait && viewport.vh < 560;

  // Compute exact background stage rectangle locked to kitchen_stove_bg.png (1440x960):
  // - On desktop/landscape: full-bleed object-fit: cover centered on screen.
  // - On mobile portrait: shifts stove burner (50%, 66.2%) cleanly into the open middle visual stage
  //   between the slim top HUD and bottom thumb dock, scaled so the full wok + dipping spatula fit comfortably!
  const bgRect = useMemo(() => {
    const { vw, vh } = viewport;
    if (isMobilePortrait) {
      // Target wok width ~78% of screen width -> wok is 49% of bgW -> bgW ~= vw * 1.56
      const w = Math.max(vw * 1.52, vh * 0.92);
      const h = (w * BG_NATURAL_H) / BG_NATURAL_W;
      const desiredBurnerY = vh * 0.375;
      return {
        w,
        h,
        left: (vw - w) / 2,
        top: desiredBurnerY - h * 0.662,
      };
    }
    const scale = Math.max(vw / BG_NATURAL_W, vh / BG_NATURAL_H);
    const w = BG_NATURAL_W * scale;
    const h = BG_NATURAL_H * scale;
    return { w, h, left: (vw - w) / 2, top: (vh - h) / 2 };
  }, [isMobilePortrait, viewport]);

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

  const spawnSplash = useCallback(
    (color: string, count = 14) => {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 25 + Math.random() * 75;
        fxRef.current.push({
          x: bowlCenterX + (Math.random() - 0.5) * 44,
          y: bowlCenterY + (Math.random() - 0.5) * 32,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 20,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.25,
          size: 3 + Math.random() * 4,
          color,
          kind: 'splash',
        });
      }
    },
    [bowlCenterX, bowlCenterY]
  );

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
      } else if (id === 'uni') {
        pushBubble('哇啊！金黄绵密的鸟白岛海胆！！轻轻翻拌一下就可以出锅咯♪', 'excited');
      } else if (id === 'lobster') {
        pushBubble('居然是大龙虾肉！！今天的炒饭也太豪华了吧，千万别炒老哦！', 'excited');
      } else if (id === 'lamb') {
        pushBubble('鲜嫩羊肉下锅啦！大火快炒再撒点秘制香料，肯定香喷喷的！', 'happy');
      } else if (id === 'pigeon') {
        pushBubble('好讲究的乳鸽肉丁呀！中火稳住火候，配一点酱油或蜂蜜超绝！', 'happy');
      } else if (id === 'mushroom' || id === 'broccoli') {
        pushBubble(`香喷喷的${cfg.name}下锅啦，记得炒透才最美味！`, 'happy');
      }

      // Spawn physical grains/pieces in wok bowl interior!
      if (id === 'rice') {
        for (let i = 0; i < 125; i++) {
          const r = Math.sqrt(Math.random());
          const th = Math.random() * Math.PI * 2;
          grainsRef.current.push({
            x: bowlCenterX + Math.cos(th) * r * (bowl.rx * 0.88),
            y: bowlCenterY + Math.sin(th) * r * (bowl.ry * 0.85),
            vx: 0,
            vy: 0,
            z: 24 + Math.random() * 18,
            vz: 0,
            size: 4.5 + Math.random() * 2.2,
            rot: Math.random() * Math.PI,
            kind: 'rice',
            color: '#fff9eb',
            accent: '#f5e6c4',
          });
        }
      } else if (id === 'egg') {
        for (let i = 0; i < 36; i++) {
          const r = Math.sqrt(Math.random());
          const th = Math.random() * Math.PI * 2;
          grainsRef.current.push({
            x: bowlCenterX + Math.cos(th) * r * (bowl.rx * 0.82),
            y: bowlCenterY + Math.sin(th) * r * (bowl.ry * 0.8),
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
        for (let i = 0; i < 20; i++) {
          const r = Math.sqrt(Math.random());
          const th = Math.random() * Math.PI * 2;
          grainsRef.current.push({
            x: bowlCenterX + Math.cos(th) * r * (bowl.rx * 0.84),
            y: bowlCenterY + Math.sin(th) * r * (bowl.ry * 0.82),
            vx: 0,
            vy: 0,
            z: 28 + Math.random() * 18,
            vz: 0,
            size: 6.8 + Math.random() * 4,
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
    [bowl.rx, bowl.ry, bowlCenterX, bowlCenterY, pushBubble, pushToast, spawnSplash, targetDur.min, wok.id]
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
    if (!s.ignited || s.panTemp < 95) {
      note = '还没热锅呢，先点火吧！';
      pushBubble('锅子还是凉凉的呢，先点击下方「点火」再开炒吧！', 'curious');
    } else if (grade === 'Excellent') {
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
          x: bowlCenterX + (Math.random() - 0.5) * bowl.rx * 1.3,
          y: bowlCenterY + (Math.random() - 0.5) * bowl.ry * 1.1,
          vx: (Math.random() - 0.5) * 65,
          vy: -45 - Math.random() * 80,
          life: 0,
          maxLife: 0.75 + Math.random() * 0.35,
          size: 4 + Math.random() * 4,
          color: '#fbbf24',
          kind: 'sparkle',
        });
      }
      if (s.combo >= 3 && hasFood && s.panTemp >= 130) {
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
  }, [bowl.rx, bowl.ry, bowlCenterX, bowlCenterY, pushBubble, wok.wokHeiMult]);

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
            const cy = fCanvas.height / 2 + 12;
            const t = now * 0.014;
            const baseR = 92 + s.heatLevel * 18;
            const flameCount = 24 + s.heatLevel * 5;

            // Vivid under-wok blue/orange heat halo that peeks clearly around the wok base
            const glow = fctx.createRadialGradient(cx, cy, 45, cx, cy, baseR + 72);
            glow.addColorStop(0, `rgba(56, 189, 248, ${0.38 + s.heatLevel * 0.1})`);
            glow.addColorStop(0.55, s.heatLevel >= 4 ? `rgba(249, 115, 22, ${0.26 + s.heatLevel * 0.06})` : `rgba(37, 99, 235, ${0.24 + s.heatLevel * 0.07})`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            fctx.fillStyle = glow;
            fctx.beginPath();
            fctx.ellipse(cx, cy, baseR + 72, (baseR + 72) * 0.68, 0, 0, Math.PI * 2);
            fctx.fill();

            // Individual licking gas jets radiating visibly around the wok rim
            for (let i = 0; i < flameCount; i++) {
              const ang = (i / flameCount) * Math.PI * 2;
              const flicker = 0.8 + Math.sin(t * 2.5 + i * 1.9) * 0.2;
              const len = (24 + s.heatLevel * 13) * flicker;
              const rx = cx + Math.cos(ang) * baseR;
              const ry = cy + Math.sin(ang) * baseR * 0.68;
              const tx = cx + Math.cos(ang) * (baseR + len);
              const ty = cy + Math.sin(ang) * (baseR + len) * 0.68 - (6 + s.heatLevel * 3.5);

              const grad = fctx.createLinearGradient(rx, ry, tx, ty);
              grad.addColorStop(0, '#bfdbfe');
              grad.addColorStop(0.5, s.heatLevel >= 4 ? '#3b82f6' : '#2563eb');
              grad.addColorStop(1, s.heatLevel >= 4 ? '#fb923c' : '#60a5fa');

              fctx.strokeStyle = grad;
              fctx.lineWidth = 5 + s.heatLevel * 1.3;
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
            const oilGrad = ctx.createRadialGradient(bowlCenterX, bowlCenterY, 10, bowlCenterX, bowlCenterY, bowl.rx);
            oilGrad.addColorStop(0, `rgba(255, 204, 77, ${oilAlpha})`);
            oilGrad.addColorStop(0.75, `rgba(245, 158, 11, ${oilAlpha * 0.45})`);
            oilGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
            ctx.fillStyle = oilGrad;
            ctx.beginPath();
            ctx.ellipse(bowlCenterX, bowlCenterY, bowl.rx, bowl.ry, 0, 0, Math.PI * 2);
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
                // Keep strictly inside pan bowl interior ellipse!
                const dx = (g.x - bowlCenterX) / (bowl.rx * 0.9);
                const dy = (g.y - bowlCenterY) / (bowl.ry * 0.88);
                const d = Math.hypot(dx, dy);
                if (d > 1) {
                  g.x = bowlCenterX + (dx / d) * (bowl.rx * 0.86);
                  g.y = bowlCenterY + (dy / d) * (bowl.ry * 0.84);
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
              x: bowlCenterX + (Math.random() - 0.5) * bowl.rx * 1.25,
              y: bowlCenterY + (Math.random() - 0.5) * bowl.ry * 0.75,
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
  }, [bowl.rx, bowl.ry, bowlCenterX, bowlCenterY, pushBubble, targetDur.min, wok.burnRateMult, wok.coolRate, wok.heatRate, wok.id, wok.maxTemp, wokId]);

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
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        background: '#1e2420',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* BACKGROUND-LOCKED KITCHEN STOVE STAGE
          Locked 1:1 to kitchen_stove_bg.png (1440x960) so the flame, enlarged wok bowl,
          food canvas, and enlarged wooden spatula dipping inside the wok stay aligned everywhere! */}
      <div
        style={{
          position: 'absolute',
          left: bgRect.left,
          top: bgRect.top,
          width: bgRect.w,
          height: bgRect.h,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <img
          src={`${base}assets/images/kitchen_stove_bg.png`}
          alt="鸟白岛厨房灶台"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            pointerEvents: 'none',
          }}
        />

        {/* Dynamic Gas Flame Canvas LOCKED directly under the enlarged wok (50%, 69.5%) */}
        <canvas
          ref={flameCanvasRef}
          width={560}
          height={420}
          style={{
            position: 'absolute',
            left: '50%',
            top: '69.5%',
            width: '54%',
            height: 'auto',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        {/* Enlarged Wok + Food Canvas — bowl center locked directly over burner grate (50%, 66.2%) */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '66.2%',
            width: '49%',
            aspectRatio: '1 / 1',
            transform: `translate(-${bowl.cx * 100}%, -${bowl.cy * 100}%)`,
            zIndex: 4,
            pointerEvents: 'none',
          }}
        >
          <div
            key={tossAnimKey}
            className={tossAnimKey > 0 ? 'anim-wok-toss' : undefined}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              pointerEvents: 'auto',
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
                filter: 'drop-shadow(0 18px 24px rgba(0,0,0,0.42))',
              }}
            />
            <canvas
              ref={foodCanvasRef}
              width={420}
              height={420}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>

        {/* Enlarged Wooden Spatula — blade head (28.2%, 24.9%) dips directly INSIDE the wok bowl
            at (56.5%, 63.0%), angled naturally over the right rim for authentic stir-fry feel! */}
        <div
          style={{
            position: 'absolute',
            left: '56.5%',
            top: '63.0%',
            width: '27.5%',
            aspectRatio: '1 / 1',
            transform: 'translate(-28.2%, -24.9%) rotate(-54deg)',
            transformOrigin: '28.2% 24.9%',
            zIndex: 12,
            pointerEvents: 'none',
          }}
        >
          <button
            key={`sp-${tossAnimKey}`}
            className={tossAnimKey > 0 ? 'anim-spatula-stir' : undefined}
            onClick={() => (qte.active ? strikeQte() : startTossQte())}
            style={{
              width: '100%',
              height: '100%',
              background: 'transparent',
              padding: 0,
              pointerEvents: 'auto',
              display: 'block',
            }}
            title="使用木铲翻炒（快捷键 Space）"
          >
            <img
              src={`${base}assets/images/spatula.png`}
              alt="木铲翻炒"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.34))',
              }}
            />
          </button>
        </div>

        {/* Upright Floating Stir-Fry Pill anchored cleanly right beside the spatula handle */}
        {!isMobilePortrait && (
          <button
            onClick={() => (qte.active ? strikeQte() : startTossQte())}
            style={{
              position: 'absolute',
              left: '72.5%',
              top: '56.5%',
              transform: 'translate(-50%, -50%)',
              padding: '6px 14px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #ff9f38, #ea580c)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 900,
              boxShadow: '0 6px 16px rgba(234,88,12,0.48)',
              border: '2px solid #fff',
              whiteSpace: 'nowrap',
              zIndex: 14,
              pointerEvents: 'auto',
            }}
          >
            🥄 翻炒 (Space)
          </button>
        )}
      </div>

      {/* TOP HUD BAR (Adapts cleanly between Desktop 1-row and Mobile Portrait 2-row) */}
      <header
        style={{
          position: 'relative',
          zIndex: 25,
          padding: isMobilePortrait
            ? 'max(6px, env(safe-area-inset-top)) 8px 4px'
            : isCompactLandscape
              ? '4px 10px 2px'
              : '8px 12px 4px',
          display: 'flex',
          flexDirection: isMobilePortrait ? 'column' : 'row',
          alignItems: isMobilePortrait ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: isMobilePortrait ? 5 : 8,
          flexShrink: 0,
        }}
      >
        {isMobilePortrait ? (
          <>
            {/* Mobile Row 1: Nav + Wok + Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <button
                  onClick={() => {
                    audioEngine.stopFlameAmbience();
                    onBackToPrep();
                  }}
                  className="btn-ghost"
                  style={{ padding: '5px 9px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}
                >
                  <ArrowLeft size={13} /> 返回
                </button>
                <span
                  className="summer-card"
                  style={{
                    padding: '4px 9px',
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 800,
                    color: '#9a3412',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  🍳 {wok.name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <button
                  onClick={() => setHelperMode((v) => !v)}
                  className="btn-ghost"
                  style={{ padding: '5px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  {helperMode ? <Eye size={13} /> : <EyeOff size={13} />}
                  {helperMode ? '辅助' : '大师'}
                </button>
                <button
                  onClick={onToggleMute}
                  className="btn-ghost"
                  style={{ padding: '5px 8px', display: 'inline-flex', alignItems: 'center' }}
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>
            </div>

            {/* Mobile Row 2: Compact Telemetry Strip */}
            <div
              className="summer-card"
              style={{
                padding: '5px 10px',
                borderRadius: 12,
                display: 'grid',
                gridTemplateColumns: 'auto 1.5fr 1fr 1fr',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: '#6b5b4e' }}>
                  {helperMode ? `${targetDur.min}~${targetDur.max}s` : '计时'}
                </div>
                <div
                  style={{
                    fontSize: 13.5,
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
                  {elapsedSec.toFixed(0)}s
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800 }}>
                  <span style={{ color: inIdealNow ? '#15803d' : '#786655' }}>{Math.round(panTemp)}°C</span>
                  {helperMode && <span style={{ color: '#0284c7' }}>{idealTempRange.min}~{idealTempRange.max}°</span>}
                </div>
                <div style={{ position: 'relative', height: 7, borderRadius: 99, background: '#e2e8f0', marginTop: 2, overflow: 'hidden' }}>
                  {helperMode && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${idealMinPct}%`,
                        width: `${Math.max(6, idealMaxPct - idealMinPct)}%`,
                        top: 0,
                        bottom: 0,
                        background: 'rgba(34, 197, 94, 0.45)',
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
                      background: panTemp > idealTempRange.max + 10 ? '#ef4444' : '#f59e0b',
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800 }}>
                  <span style={{ color: '#d97706' }}>锅气</span>
                  <span>{Math.round(wokHei)}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: '#fef3c7', marginTop: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${wokHei}%`, height: '100%', background: '#f59e0b' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800 }}>
                  <span style={{ color: burnLevel > 25 ? '#dc2626' : '#64748b' }}>焦糊</span>
                  <span>{Math.round(burnLevel)}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: '#e2e8f0', marginTop: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${burnLevel}%`, height: '100%', background: '#b91c1c' }} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Desktop / Landscape Left Nav */}
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
          </>
        )}
      </header>

      {/* BODY: MOBILE PORTRAIT VERTICAL STUDIO vs DESKTOP/LANDSCAPE 3-COLUMN STAGE */}
      {isMobilePortrait ? (
        <div
          style={{
            position: 'relative',
            zIndex: 15,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            pointerEvents: 'none',
          }}
        >
          {/* Upper Open Visual Area: Slim Umi Bubble + Toast + QTE Bar + QTE Grade Popup */}
          <div
            style={{
              padding: '2px 8px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              pointerEvents: 'none',
            }}
          >
            {/* Slim Mobile Umi Bubble */}
            <div
              key={umiBubble.id}
              className="summer-card anim-pop"
              style={{
                width: '100%',
                padding: '5px 9px',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                pointerEvents: 'auto',
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
                  width: 30,
                  height: 30,
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
              <div style={{ fontSize: 11.5, lineHeight: 1.35, fontWeight: 700, color: '#3b2c22', minWidth: 0 }}>
                <span style={{ color: '#db2777', fontWeight: 900, marginRight: 5 }}>羽未：</span>
                {umiBubble.text}
              </div>
            </div>

            {specialToast && !qte.active && (
              <div
                key={specialToast.id}
                className="anim-pop"
                style={{
                  padding: '5px 14px',
                  borderRadius: 999,
                  background: specialToast.color,
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 12.5,
                  boxShadow: '0 6px 16px rgba(0,0,0,0.28)',
                  border: '2px solid #fff',
                }}
              >
                {specialToast.text}
              </div>
            )}

            {/* Mobile Active QTE Bar (big thumb-friendly hit area!) */}
            {qte.active && (
              <div
                className="summer-card anim-pop"
                onClick={strikeQte}
                style={{
                  width: '100%',
                  maxWidth: 360,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  borderColor: '#f97316',
                  boxShadow: '0 14px 36px rgba(234, 88, 12, 0.42)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 900, fontSize: 13.5, color: '#ea580c', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={15} /> 翻炒时机 QTE！
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#0369a1' }}>轻点此处击打！</span>
                </div>
                <div
                  style={{
                    position: 'relative',
                    height: 32,
                    borderRadius: 999,
                    background: '#ef4444',
                    overflow: 'hidden',
                    border: '2.5px solid #2c241e',
                  }}
                >
                  <div style={{ position: 'absolute', left: `${Math.max(0, (qte.center - qte.goodHalf) * 100)}%`, width: `${Math.min(100, qte.goodHalf * 200)}%`, top: 0, bottom: 0, background: '#38bdf8' }} />
                  <div style={{ position: 'absolute', left: `${Math.max(0, (qte.center - qte.greatHalf) * 100)}%`, width: `${Math.min(100, qte.greatHalf * 200)}%`, top: 0, bottom: 0, background: '#22c55e' }} />
                  <div style={{ position: 'absolute', left: `${Math.max(0, (qte.center - qte.excHalf) * 100)}%`, width: `${Math.min(100, qte.excHalf * 200)}%`, top: 0, bottom: 0, background: 'linear-gradient(180deg, #fef08a, #f59e0b)' }} />
                  <div style={{ position: 'absolute', left: `calc(${qte.cursor * 100}% - 4.5px)`, top: -2, bottom: -2, width: 9, background: '#fff', border: '2px solid #1e1b4b', borderRadius: 4 }} />
                </div>
              </div>
            )}

            {qtePopup && (
              <div
                key={qtePopup.id}
                className="anim-qte-float"
                style={{
                  position: 'relative',
                  left: '50%',
                  marginTop: 8,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color:
                      qtePopup.grade === 'Excellent'
                        ? '#f59e0b'
                        : qtePopup.grade === 'Great'
                          ? '#22c55e'
                          : qtePopup.grade === 'Good'
                            ? '#38bdf8'
                            : '#ef4444',
                    textShadow: '0 2px 0 #fff, 0 -2px 0 #fff, 2px 0 0 #fff, -2px 0 0 #fff',
                  }}
                >
                  {qtePopup.grade}!
                </div>
                {qtePopup.note && (
                  <div style={{ padding: '2px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.94)', fontSize: 11.5, fontWeight: 800 }}>
                    {qtePopup.note}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM MOBILE THUMB-ZONE CONTROL DOCK */}
          <div
            style={{
              pointerEvents: 'auto',
              background: 'rgba(255, 251, 242, 0.96)',
              borderTop: '2px solid rgba(234, 88, 12, 0.35)',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: '8px 10px calc(10px + env(safe-area-inset-bottom))',
              boxShadow: '0 -10px 26px rgba(0,0,0,0.22)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Row 1: Gas Stove Flame Bar + Big Thumb Flip Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  flex: 1,
                  background: 'rgba(30, 36, 44, 0.94)',
                  borderRadius: 12,
                  padding: '5px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <button
                  onClick={handleToggleIgnite}
                  style={{
                    padding: '8px 8px',
                    borderRadius: 9,
                    background: heatLevel > 0 ? '#ef4444' : '#22c55e',
                    color: '#fff',
                    fontWeight: 900,
                    fontSize: 11.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    flexShrink: 0,
                  }}
                >
                  <Power size={13} />
                  {heatLevel > 0 ? '关' : '点'}
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3, flex: 1 }}>
                  {HEAT_LABELS.slice(1).map((h) => {
                    const active = heatLevel === h.level;
                    return (
                      <button
                        key={h.level}
                        onClick={() => handleSetHeat(h.level)}
                        style={{
                          padding: '7px 2px',
                          borderRadius: 8,
                          background: active ? h.color : 'rgba(255,255,255,0.12)',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 11,
                          border: active ? '1.5px solid #fff' : '1px solid rgba(255,255,255,0.16)',
                        }}
                      >
                        {h.name.slice(0, 1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => (qte.active ? strikeQte() : startTossQte())}
                className="btn-primary"
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 13.5,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  background: qte.active
                    ? 'linear-gradient(135deg, #f59e0b, #dc2626)'
                    : undefined,
                }}
              >
                {qte.active ? '⚡ 击打!' : '🥄 翻炒'}
              </button>
            </div>

            {/* Row 2: Tab Switcher (备菜碟 / 调味架) + Serve Dish Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  onClick={() => setMobileDockTab('ingredients')}
                  style={{
                    padding: '6px 11px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 900,
                    background: mobileDockTab === 'ingredients' ? '#0284c7' : '#f1f5f9',
                    color: mobileDockTab === 'ingredients' ? '#fff' : '#475569',
                  }}
                >
                  🥣 备菜 ({allTrayIds.filter((id) => !panIngredients[id]).length})
                </button>
                <button
                  onClick={() => setMobileDockTab('seasonings')}
                  style={{
                    padding: '6px 11px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 900,
                    background: mobileDockTab === 'seasonings' ? '#ea580c' : '#f1f5f9',
                    color: mobileDockTab === 'seasonings' ? '#fff' : '#475569',
                  }}
                >
                  🧂 调味架
                </button>
              </div>

              <button
                onClick={handleServeDish}
                className="btn-primary"
                style={{
                  padding: '7px 13px',
                  fontSize: 12.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background:
                    heatLevel === 0 && panIngredients['rice']
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : undefined,
                }}
              >
                <Utensils size={14} /> 盛盘出锅
              </button>
            </div>

            {/* Row 3: Active Tray Grid */}
            {mobileDockTab === 'ingredients' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
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
                        padding: '6px 4px',
                        borderRadius: 11,
                        background: added ? '#f1f5f9' : '#fff',
                        border: added ? '1.5px solid #94a3b8' : '2px solid #f59e0b',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <IngredientIcon shape={cfg.iconShape} size={26} />
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#2c241e', lineHeight: 1.15 }}>
                        {cfg.name}
                      </span>
                      {!added ? (
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: '#ea580c' }}>点击下锅</span>
                      ) : helperMode && st && doneMeta ? (
                        <span style={{ fontSize: 9.5, fontWeight: 900, color: doneMeta.color }}>{doneMeta.text}</span>
                      ) : (
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: '#16a34a' }}>已入锅</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {hoveredSeasoning && (
                  <div style={{ fontSize: 11, color: '#78350f', background: '#fff7ed', padding: '4px 8px', borderRadius: 8, fontWeight: 700 }}>
                    💡 {SEASONING_MAP[hoveredSeasoning].name}：{SEASONING_MAP[hoveredSeasoning].tip}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {SEASONINGS.map((s) => {
                    const cnt = seasoningCounts[s.id];
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          setHoveredSeasoning(s.id);
                          handleAddSeasoning(s.id);
                        }}
                        style={{
                          position: 'relative',
                          padding: '6px 2px 5px',
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
                        <SeasoningBottleIcon id={s.id} size={30} />
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#2c241e' }}>{s.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
      /* DESKTOP & LANDSCAPE 3-COLUMN UI OVERLAY (pointerEvents: none on container so wok & spatula remain directly clickable!) */
      <div
        style={{
          position: 'relative',
          zIndex: 15,
          flex: 1,
          minHeight: 0,
          padding: isCompactLandscape ? '3px 8px 6px' : '6px 12px 12px',
          display: 'grid',
          gridTemplateColumns: isCompactLandscape
            ? '168px minmax(0, 1fr) 184px'
            : 'clamp(196px, 22vw, 250px) minmax(0, 1fr) clamp(210px, 23vw, 270px)',
          gap: isCompactLandscape ? 6 : 10,
          alignItems: 'stretch',
          pointerEvents: 'none',
        }}
      >
        {/* LEFT COLUMN: UMI BUBBLE (top) + INGREDIENT BOWLS (bottom) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8, minHeight: 0, pointerEvents: 'none' }}>
          {/* UMI LIVE COMMENTARY BUBBLE */}
          <div
            key={umiBubble.id}
            className="summer-card anim-pop"
            style={{
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              pointerEvents: 'auto',
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
              pointerEvents: 'auto',
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

        {/* CENTER COLUMN: TOAST / QTE POPUP / ACTIVE QTE + BOTTOM STOVE DIAL (Wok & Spatula live in bgRect stage behind!) */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            minWidth: 0,
            minHeight: 0,
            pointerEvents: 'none',
          }}
        >
          {/* Upper center slot: Special Toast, QTE bar, and Floating Grade Popup */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              paddingTop: 4,
              zIndex: 40,
            }}
          >
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

            {/* ACTIVE QTE PRECISION BAR OVERLAY */}
            {qte.active && (
              <div
                className="summer-card anim-pop"
                onClick={strikeQte}
                style={{
                  width: 'min(370px, 96%)',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
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

            {/* QTE Floating Result Popup */}
            {qtePopup && (
              <div
                key={qtePopup.id}
                className="anim-qte-float"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 68,
                  zIndex: 35,
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 32,
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
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {qtePopup.note}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM CENTER: GAS STOVE IGNITION & FLAME CONTROL PANEL */}
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
              pointerEvents: 'auto',
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
            pointerEvents: 'none',
          }}
        >
          {/* Seasoning Tooltip cleanly contained inside right column */}
          {hoveredSeasoning && (
            <div
              className="summer-card anim-pop"
              style={{ padding: '7px 10px', fontSize: 11, lineHeight: 1.4, color: '#3b2c22', pointerEvents: 'auto' }}
            >
              <strong style={{ color: '#ea580c' }}>{SEASONING_MAP[hoveredSeasoning].name}：</strong>
              {SEASONING_MAP[hoveredSeasoning].description}
              <div style={{ color: '#0369a1', fontWeight: 700, marginTop: 2 }}>
                💡 {SEASONING_MAP[hoveredSeasoning].tip}
              </div>
            </div>
          )}

          <div className="summer-card" style={{ padding: '10px 9px', background: 'rgba(255, 252, 245, 0.92)', pointerEvents: 'auto' }}>
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
              padding: isCompactLandscape ? '8px 10px' : '11px 12px',
              fontSize: isCompactLandscape ? 12.5 : 14.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              pointerEvents: 'auto',
              background:
                heatLevel === 0 && panIngredients['rice']
                  ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                  : undefined,
            }}
          >
            <Utensils size={isCompactLandscape ? 15 : 18} /> 盛盘出锅，请羽未品尝！
          </button>
        </div>
      </div>
      )}
    </div>
  );
};
