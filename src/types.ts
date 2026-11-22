export type ScreenState = 'title' | 'prep' | 'cook' | 'result';

export type WokId = 'iron' | 'nonstick' | 'castiron' | 'copper';

export type IngredientCategory = 'base' | 'seafood' | 'meat' | 'vegetable';

export type SeasoningId = 'oil' | 'salt' | 'soy' | 'sugar' | 'msg' | 'spice' | 'honey';

export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type QteGrade = 'Excellent' | 'Great' | 'Good' | 'Bad';

export type ResultRank = 'S+' | 'S' | 'A' | 'B' | 'C';

export interface FlavorProfile {
  saltiness: number;
  umami: number;
  aroma: number;
  oiliness: number;
  sweetness: number;
}

export interface WokConfig {
  id: WokId;
  name: string;
  subtitle: string;
  image: string;
  accentColor: string;
  buffs: string[];
  debuffs: string[];
  // Mechanical multipliers
  heatRate: number;          // how fast it heats up
  coolRate: number;          // how fast it cools down (thermal inertia)
  maxTemp: number;           // ceiling temperature in °C
  wokHeiMult: number;        // multiplier for wok hei accumulation
  burnRateMult: number;      // multiplier for scorching speed
  oilNeedMult: number;       // multiplier for ideal oil dosage
  qteZoneMult: number;       // multiplier for QTE target zone width
  qteSpeedMult: number;      // multiplier for QTE cursor speed
  donenessWindowMult: number;// multiplier for meat/seafood doneness forgiveness
  excellentBonusMult: number;// multiplier for Excellent QTE technique points
  idealTempShift: number;    // temperature offset preference
}

export interface IngredientConfig {
  id: string;
  name: string;
  category: IngredientCategory;
  color: string;             // primary grain/cube visual color in pan
  accentColor: string;       // secondary highlight color
  iconShape: 'rice' | 'egg' | 'shrimp' | 'squid' | 'crab' | 'scallop' | 'clam' | 'eel' | 'sausage' | 'bacon' | 'charsiu' | 'chicken' | 'ham' | 'beef' | 'scallion' | 'corn' | 'carrot' | 'pea' | 'onion' | 'lettuce' | 'mushroom' | 'broccoli';
  buffs: string[];
  debuffs: string[];
  // Cooking simulation parameters
  idealCookSec: number;      // effective cook seconds at ideal temp to reach 100% ideal doneness
  donenessTolerance: number; // tolerance around 100 (e.g. 22 => 78~122 is prime)
  idealTempMin: number;      // °C
  idealTempMax: number;      // °C
  preferredStage: 'early' | 'mid' | 'late' | 'finish';
  coolingShock: number;      // °C drop when dropped into hot pan
  waterContent: number;      // dampens wok hei temporarily
  burnSensitivity: number;   // 0.6 ~ 1.6
  fragility: number;         // extra damage on Bad QTE or violent over-tossing
  timeBonusSec: number;      // adjusts optimal total cooking duration
  qteSpeedDelta: number;     // additive QTE speed modifier
  flavorContribution: Partial<FlavorProfile>;
  colorGroup: 'red' | 'gold' | 'green' | 'white' | 'brown';
  synergyTags: string[];
}

export interface SeasoningConfig {
  id: SeasoningId;
  name: string;
  shortName: string;
  unitLabel: string;
  color: string;
  liquid: boolean;
  description: string;
  tip: string;
  maxRecommended: number;
  flavorPerDose: Partial<FlavorProfile>;
}

export interface PanIngredientState {
  id: string;
  addedAt: number;           // elapsed seconds when added
  addedTemp: number;         // pan temp when added
  doneness: number;          // 0 -> 100 (ideal) -> 160+ (overcooked/burnt)
  quality: number;           // 0 -> 100 (affected by temp match & fragility)
  orderScore: number;        // 0 -> 100 (based on timing relative to rice/cooking phase)
}

export interface SeasoningEvent {
  id: SeasoningId;
  time: number;
  temp: number;
  riceInPan: boolean;
}

export interface QteRecord {
  grade: QteGrade;
  time: number;
  combo: number;
}

export interface UmiBubble {
  id: number;
  text: string;
  mood: 'happy' | 'excited' | 'warn' | 'panic' | 'curious';
}

export interface CookingSnapshot {
  wokId: WokId;
  selectedIngredientIds: string[];
  elapsedSec: number;
  targetDurationMin: number;
  targetDurationMax: number;
  heatLevel: HeatLevel;
  ignited: boolean;
  panTemp: number;
  wokHei: number;            // 0..100
  burnLevel: number;         // 0..100
  riceSeparation: number;    // 0..100 (粒粒分明)
  goldenEggCoating: boolean; // 金包银
  soySizzleTriggered: boolean;// 锅边呛酱油
  spiceBloomTriggered: boolean;// 热油爆香
  honeyGlazeTriggered: boolean;// 蜜汁焦糖
  darkHoneyPenalty: boolean; // 黑暗甜腻
  spillLoss: number;         // 0..100 from Bad QTE
  tempSamples: Array<{ temp: number; inIdeal: boolean; heat: HeatLevel }>;
  panIngredients: Record<string, PanIngredientState>;
  seasoningCounts: Record<SeasoningId, number>;
  seasoningEvents: SeasoningEvent[];
  qteRecords: QteRecord[];
  maxCombo: number;
  idleBurnSec: number;       // seconds spent hot without tossing
  finishedHeatLevel: HeatLevel;
  finishTemp: number;
}

export interface DimensionBreakdown {
  key: 'heat' | 'doneness' | 'technique' | 'seasoning' | 'harmony' | 'timing';
  label: string;
  score: number;             // 0..100
  highlights: string[];
  penalties: string[];
}

export interface ScoreReport {
  totalScore: number;        // strict average of 6 dimensions, clamped 0..100
  rank: ResultRank;
  title: string;
  umiQuote: string;
  dimensions: DimensionBreakdown[];
  badges: string[];
  synergies: string[];
  flavors: FlavorProfile;
  idealFlavors: FlavorProfile;
  stats: {
    elapsedSec: number;
    wokHei: number;
    burnLevel: number;
    maxCombo: number;
    qteCounts: Record<QteGrade, number>;
  };
}

export interface SavedRecord {
  id: string;
  date: string;
  score: number;
  rank: ResultRank;
  title: string;
  wokId: WokId;
  ingredients: string[];
}
