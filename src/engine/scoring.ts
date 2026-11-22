import {
  CookingSnapshot,
  DimensionBreakdown,
  FlavorProfile,
  QteGrade,
  ResultRank,
  ScoreReport,
} from '../types';
import { INGREDIENT_MAP } from '../data/ingredients';
import { SEASONING_MAP } from '../data/seasonings';
import { WOK_MAP } from '../data/woks';

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export function computeTargetDuration(wokId: string, selectedIngredientIds: string[]): { min: number; max: number } {
  const wok = WOK_MAP[wokId];
  let base = 42;
  for (const id of selectedIngredientIds) {
    const ing = INGREDIENT_MAP[id];
    if (ing) base += ing.timeBonusSec;
  }
  if (wok) {
    if (wok.id === 'copper') base -= 4;
    if (wok.id === 'castiron') base += 4;
  }
  base = clamp(base, 30, 75);
  return { min: Math.round(base - 8), max: Math.round(base + 12) };
}

export function computeIdealTempRange(wokId: string, inPanIds: string[]): { min: number; max: number } {
  const wok = WOK_MAP[wokId];
  const shift = wok ? wok.idealTempShift : 0;
  if (inPanIds.length === 0) {
    return { min: 155 + shift, max: 215 + shift };
  }
  let sumMin = 0;
  let sumMax = 0;
  let count = 0;
  for (const id of inPanIds) {
    const ing = INGREDIENT_MAP[id];
    if (ing) {
      sumMin += ing.idealTempMin;
      sumMax += ing.idealTempMax;
      count++;
    }
  }
  const avgMin = count > 0 ? sumMin / count : 160;
  const avgMax = count > 0 ? sumMax / count : 220;
  return {
    min: Math.round(clamp(avgMin + shift, 130, 220)),
    max: Math.round(clamp(avgMax + shift, 185, wok ? wok.maxTemp - 10 : 250)),
  };
}

export function evaluateCooking(snapshot: CookingSnapshot): ScoreReport {
  const wok = WOK_MAP[snapshot.wokId];
  const allExpectedIds = ['rice', 'egg', ...snapshot.selectedIngredientIds];
  const inPanList = Object.values(snapshot.panIngredients);
  const hasRice = Boolean(snapshot.panIngredients['rice']);
  const hasEgg = Boolean(snapshot.panIngredients['egg']);

  const badges: string[] = [];
  const synergies: string[] = [];

  // =========================================================================
  // 1. 火候与锅气 (Heat & Wok Hei) 0..100
  // =========================================================================
  const heatHighlights: string[] = [];
  const heatPenalties: string[] = [];

  const totalSamples = Math.max(1, snapshot.tempSamples.length);
  const idealSamples = snapshot.tempSamples.filter((s) => s.inIdeal).length;
  const idealRatio = idealSamples / totalSamples;
  const coldSamples = snapshot.tempSamples.filter((s) => s.temp < 110).length;
  const coldRatio = coldSamples / totalSamples;

  let heatScore = 34 + idealRatio * 34 + (snapshot.wokHei / 100) * 34;

  if (snapshot.wokHei >= 82) {
    heatHighlights.push(`锅气十足（${Math.round(snapshot.wokHei)}%），焦香扑鼻`);
    badges.push('烈火锅气大师');
  } else if (snapshot.wokHei >= 55) {
    heatHighlights.push(`锅气良好（${Math.round(snapshot.wokHei)}%）`);
  } else {
    heatPenalties.push(`锅气偏弱（${Math.round(snapshot.wokHei)}%），可适当提高中后期火力并勤翻炒`);
  }

  if (idealRatio >= 0.7) {
    heatHighlights.push(`全程温控精准，${Math.round(idealRatio * 100)}% 时间处于理想温区`);
  } else if (idealRatio < 0.35) {
    heatPenalties.push(`控温波动较大，仅 ${Math.round(idealRatio * 100)}% 时间落在最佳温区`);
  }

  if (snapshot.burnLevel > 5) {
    const burnPenalty = snapshot.burnLevel * 0.85;
    heatScore -= burnPenalty;
    heatPenalties.push(
      snapshot.burnLevel >= 50
        ? `严重烧焦（焦糊度 ${Math.round(snapshot.burnLevel)}%），苦味明显`
        : `出现轻微焦糊（焦糊度 ${Math.round(snapshot.burnLevel)}%）`
    );
  }
  if (coldRatio > 0.45) {
    heatScore -= (coldRatio - 0.45) * 35;
    heatPenalties.push('长时间低温冷锅闷炒，火力不足');
  }
  if (!snapshot.ignited) {
    heatScore = 5;
    heatPenalties.push('全程未点火！这可是生拌冷饭呀');
  }
  heatScore = clamp(heatScore);

  // =========================================================================
  // 2. 熟度与时序 (Doneness & Sequencing) 0..100
  // =========================================================================
  const donenessHighlights: string[] = [];
  const donenessPenalties: string[] = [];

  let sumIngScore = 0;
  let sumOrderScore = 0;
  let perfectCount = 0;
  let rawList: string[] = [];
  let overList: string[] = [];

  for (const id of allExpectedIds) {
    const cfg = INGREDIENT_MAP[id];
    const st = snapshot.panIngredients[id];
    if (!cfg) continue;
    if (!st) {
      rawList.push(`${cfg.name}(未下锅)`);
      continue;
    }
    const tol =
      cfg.donenessTolerance *
      (cfg.category === 'meat' || cfg.category === 'seafood' ? wok.donenessWindowMult : 1);
    const diff = Math.abs(st.doneness - 100);
    let itemScore: number;
    if (diff <= tol * 0.5) {
      itemScore = 100;
      perfectCount++;
    } else if (diff <= tol) {
      itemScore = 88 + (1 - (diff - tol * 0.5) / (tol * 0.5)) * 12;
      perfectCount++;
    } else if (st.doneness < 100) {
      // undercooked
      itemScore = Math.max(0, 88 - ((diff - tol) / Math.max(12, 100 - tol)) * 95);
      if (st.doneness < 72) rawList.push(cfg.name);
    } else {
      // overcooked
      itemScore = Math.max(0, 88 - (diff - tol) * 1.35);
      if (st.doneness > 125) overList.push(cfg.name);
    }
    // blend with cooking temp quality
    itemScore = itemScore * 0.8 + st.quality * 0.2;
    sumIngScore += itemScore;
    sumOrderScore += st.orderScore;
  }

  const avgIngDoneness = allExpectedIds.length > 0 ? sumIngScore / allExpectedIds.length : 0;
  const avgOrder = allExpectedIds.length > 0 ? sumOrderScore / allExpectedIds.length : 0;
  let donenessScore = avgIngDoneness * 0.68 + avgOrder * 0.16 + snapshot.riceSeparation * 0.16;

  if (snapshot.goldenEggCoating) {
    donenessScore += 8;
    donenessHighlights.push('达成【黄金炒饭·金包银】！蛋液完美裹住每粒米饭');
    badges.push('金包银传承');
  }
  if (snapshot.riceSeparation >= 80 && hasRice) {
    donenessHighlights.push(`米粒松散度 ${Math.round(snapshot.riceSeparation)}%，颗颗分明弹牙`);
  } else if (hasRice && snapshot.riceSeparation < 45) {
    donenessPenalties.push('冷米饭未充分打散，仍有结块现象');
  }
  if (perfectCount === allExpectedIds.length && allExpectedIds.length > 0) {
    donenessHighlights.push('全部食材熟度精准落入黄金嫩熟区间！');
  }
  if (rawList.length > 0) {
    donenessPenalties.push(`部分食材偏生或未入锅：${rawList.slice(0, 3).join('、')}`);
  }
  if (overList.length > 0) {
    donenessPenalties.push(`部分食材炒老过熟：${overList.slice(0, 3).join('、')}`);
  }
  if (!hasRice) {
    donenessScore = Math.min(donenessScore, 22);
    donenessPenalties.push('居然忘记放隔夜米饭了！炒饭没有饭怎么行');
  }
  if (!hasEgg) {
    donenessScore -= 14;
    donenessPenalties.push('缺少鸡蛋，失去了蛋炒饭的灵魂香气');
  }
  donenessScore = clamp(donenessScore);

  // =========================================================================
  // 3. 翻炒技法 (Wok Technique & QTE) 0..100
  // =========================================================================
  const techHighlights: string[] = [];
  const techPenalties: string[] = [];
  const qteCounts: Record<QteGrade, number> = { Excellent: 0, Great: 0, Good: 0, Bad: 0 };

  let qteWeightedSum = 0;
  for (const r of snapshot.qteRecords) {
    qteCounts[r.grade]++;
    if (r.grade === 'Excellent') qteWeightedSum += 100 * wok.excellentBonusMult;
    else if (r.grade === 'Great') qteWeightedSum += 84;
    else if (r.grade === 'Good') qteWeightedSum += 62;
    else qteWeightedSum += 18;
  }

  const totalTosses = snapshot.qteRecords.length;
  let techniqueScore = 0;
  if (totalTosses === 0) {
    techniqueScore = 10;
    techPenalties.push('一次都没有翻炒！全靠锅底硬烤');
  } else {
    const qteAvg = qteWeightedSum / totalTosses;
    // Ideal toss count scales with elapsed time (~1 toss every 4~6 sec)
    const idealTossMin = Math.max(4, Math.floor(snapshot.elapsedSec / 7.5));
    const coverageRatio = Math.min(1, totalTosses / idealTossMin);
    const comboBonus = Math.min(12, snapshot.maxCombo * 2.2);
    const idlePenalty = Math.min(28, snapshot.idleBurnSec * 2.4);

    techniqueScore = qteAvg * (0.55 + 0.45 * coverageRatio) + comboBonus - idlePenalty;

    if (qteCounts.Excellent >= 4 && qteCounts.Bad === 0) {
      techHighlights.push(`手法如行云流水！零失误并达成 ${qteCounts.Excellent} 次 Excellent`);
      badges.push('中华颠勺之魂');
    } else if (qteCounts.Excellent >= 2) {
      techHighlights.push(`精准打出 ${qteCounts.Excellent} 次 Excellent 翻炒`);
    }
    if (snapshot.maxCombo >= 5) {
      techHighlights.push(`最高连击 ${snapshot.maxCombo} Combo，翻炒节奏极佳`);
    }
    if (totalTosses < idealTossMin) {
      techPenalties.push(`翻炒次数偏少（仅 ${totalTosses} 次），米粒受热不够均匀`);
    }
    if (qteCounts.Bad >= 2) {
      techPenalties.push(`出现 ${qteCounts.Bad} 次 Bad 失误，颠勺时撒出不少米粒`);
    }
    if (snapshot.idleBurnSec >= 6) {
      techPenalties.push(`有 ${Math.round(snapshot.idleBurnSec)} 秒高温停炒，锅底容易糊`);
    }
  }
  techniqueScore = clamp(techniqueScore);

  // =========================================================================
  // 4. 调味平衡 (Seasoning & Five-Flavor Chemistry) 0..100
  // =========================================================================
  const seasonHighlights: string[] = [];
  const seasonPenalties: string[] = [];

  const flavors: FlavorProfile = {
    saltiness: 0,
    umami: 0,
    aroma: 0,
    oiliness: 0,
    sweetness: 0,
  };

  // Contribute from in-pan ingredients
  for (const st of inPanList) {
    const cfg = INGREDIENT_MAP[st.id];
    if (!cfg) continue;
    flavors.saltiness += cfg.flavorContribution.saltiness ?? 0;
    flavors.umami += cfg.flavorContribution.umami ?? 0;
    flavors.aroma += cfg.flavorContribution.aroma ?? 0;
    flavors.oiliness += cfg.flavorContribution.oiliness ?? 0;
    flavors.sweetness += cfg.flavorContribution.sweetness ?? 0;
  }

  // Contribute from seasonings
  (Object.keys(snapshot.seasoningCounts) as Array<keyof typeof snapshot.seasoningCounts>).forEach(
    (sId) => {
      const count = snapshot.seasoningCounts[sId];
      const cfg = SEASONING_MAP[sId];
      if (!cfg || count <= 0) return;
      flavors.saltiness += (cfg.flavorPerDose.saltiness ?? 0) * count;
      flavors.umami += (cfg.flavorPerDose.umami ?? 0) * count;
      flavors.aroma += (cfg.flavorPerDose.aroma ?? 0) * count;
      flavors.oiliness += (cfg.flavorPerDose.oiliness ?? 0) * count;
      flavors.sweetness += (cfg.flavorPerDose.sweetness ?? 0) * count;
    }
  );

  // Clamp flavor readings for radar display
  flavors.oiliness = Math.max(0, flavors.oiliness);

  // Ideal target flavor profile (adjusted slightly by wok oil need & honey-friendly ingredients)
  const hasHoneyFriendly = inPanList.some((st) =>
    INGREDIENT_MAP[st.id]?.synergyTags.includes('honey-friendly')
  );
  const idealFlavors: FlavorProfile = {
    saltiness: 52,
    umami: 66,
    aroma: 64,
    oiliness: Math.round(42 * wok.oilNeedMult),
    sweetness: hasHoneyFriendly ? 24 : 12,
  };

  const saltErr = Math.abs(flavors.saltiness - idealFlavors.saltiness);
  const umamiErr = flavors.umami < idealFlavors.umami ? idealFlavors.umami - flavors.umami : Math.max(0, flavors.umami - 115);
  const aromaErr = flavors.aroma < idealFlavors.aroma ? idealFlavors.aroma - flavors.aroma : 0;
  const oilErr = Math.abs(flavors.oiliness - idealFlavors.oiliness);
  const sweetErr = Math.abs(flavors.sweetness - idealFlavors.sweetness);

  let seasoningScore =
    100 -
    saltErr * 0.72 -
    umamiErr * 0.45 -
    aromaErr * 0.45 -
    oilErr * 0.65 -
    sweetErr * 0.62;

  // Oil check
  if (snapshot.seasoningCounts.oil === 0) {
    seasoningScore -= 18;
    seasonPenalties.push('完全没有放食用油！口感干涩且极易粘锅');
  } else if (flavors.oiliness > idealFlavors.oiliness + 28) {
    seasonPenalties.push('整体偏油腻（注意培根/腊肠也会出油哦）');
  }

  // Salt check
  if (flavors.saltiness < 22) {
    seasonPenalties.push('底味寡淡，盐或酱油放得太少了');
  } else if (flavors.saltiness > 82) {
    seasonPenalties.push('咸度超标！盐与酱油/咸肉叠加过咸了');
  } else if (saltErr <= 14) {
    seasonHighlights.push('咸淡拿捏恰到好处，百吃不腻');
  }

  // Soy sizzle bonus
  if (snapshot.soySizzleTriggered) {
    seasoningScore += 9;
    seasonHighlights.push('高温锅边呛入酱油，触发【焦香酱油反应】！');
    badges.push('呛锅酱香');
  }

  // Spice bloom bonus
  if (snapshot.spiceBloomTriggered) {
    seasoningScore += 7;
    seasonHighlights.push('热油爆出秘制香料底香，触发【热油爆香】！');
  }

  // MSG timing & overdose check
  const msgCount = snapshot.seasoningCounts.msg;
  if (msgCount >= 3) {
    seasoningScore -= (msgCount - 2) * 14;
    seasonPenalties.push(`味精抖了 ${msgCount} 次！吃完会疯狂想喝水啦`);
  } else if (msgCount === 1) {
    const msgEv = snapshot.seasoningEvents.find((e) => e.id === 'msg');
    if (msgEv && snapshot.elapsedSec - msgEv.time <= 15) {
      seasoningScore += 5;
      seasonHighlights.push('出锅前恰到好处轻撒味精，鲜味倍增');
    } else if (msgEv && msgEv.temp > 215) {
      seasoningScore -= 4;
      seasonPenalties.push('味精在超高温下久炒，鲜效略有折损');
    }
  }

  // Honey special chemistry
  if (snapshot.honeyGlazeTriggered) {
    seasoningScore += 10;
    seasonHighlights.push('隐藏配方达成【蜜汁焦糖】！微量百花蜜与肉香绝配');
    badges.push('蜜汁奇迹');
  }
  if (snapshot.darkHoneyPenalty) {
    seasoningScore -= 24;
    seasonPenalties.push('蜂蜜放太多或与海鲜冲撞，变成了微妙的甜腻黑暗料理…');
    badges.push('蜂巢炼金术士');
  }

  seasoningScore = clamp(seasoningScore);

  // =========================================================================
  // 5. 搭配与色泽 (Harmony, Synergies & Visual Appeal) 0..100
  // =========================================================================
  const harmonyHighlights: string[] = [];
  const harmonyPenalties: string[] = [];

  const colorSet = new Set<string>();
  const categorySet = new Set<string>();
  const tagCounts: Record<string, number> = {};

  for (const st of inPanList) {
    const cfg = INGREDIENT_MAP[st.id];
    if (!cfg) continue;
    colorSet.add(cfg.colorGroup);
    if (cfg.category !== 'base') categorySet.add(cfg.category);
    for (const tag of cfg.synergyTags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  let harmonyScore = 54 + colorSet.size * 8 + categorySet.size * 6;

  // Check named synergies!
  if ((tagCounts['island'] ?? 0) >= 2) {
    harmonyScore += 10;
    synergies.push('鸟白岛海鲜盛宴');
    harmonyHighlights.push('触发羁绊【鸟白岛海鲜盛宴】！海味鲜甜层层递进');
  }
  if (
    inPanList.some((s) => s.id === 'mushroom') &&
    inPanList.some((s) => s.id === 'broccoli')
  ) {
    harmonyScore += 9;
    synergies.push('田园鲜蔬二重奏');
    harmonyHighlights.push('触发羁绊【田园鲜蔬二重奏】！香菇鲜香配西兰花翠绿清爽');
  }
  if ((tagCounts['classic'] ?? 0) >= 3) {
    harmonyScore += 10;
    synergies.push('经典扬州金炒');
    harmonyHighlights.push('触发羁绊【经典扬州金炒】！配色与口感堪称教科书');
  }
  if ((tagCounts['healthy'] ?? 0) >= 2 && (tagCounts['meat'] ?? 0) >= 1) {
    harmonyScore += 7;
    synergies.push('夏日营养均衡');
    harmonyHighlights.push('触发羁绊【夏日营养均衡】！荤素搭配清爽不腻');
  }
  if (
    (snapshot.wokId === 'iron' || snapshot.wokId === 'copper') &&
    (tagCounts['highheat'] ?? 0) >= 1
  ) {
    harmonyScore += 7;
    synergies.push('猛火绝配');
    harmonyHighlights.push(`锅具【${wok.name}】与猛火食材完美契合！`);
  }
  if (snapshot.wokId === 'castiron' && ((tagCounts['meat'] ?? 0) >= 1 || (tagCounts['seafood'] ?? 0) >= 1)) {
    harmonyScore += 6;
    synergies.push('厚底锁鲜');
    harmonyHighlights.push('铸铁锅稳定蓄热锁住了肉类/海鲜原汁');
  }

  if (snapshot.goldenEggCoating) harmonyScore += 6;
  if (colorSet.size >= 4) {
    harmonyHighlights.push('红黄绿白五彩斑斓，光是看着就令人垂涎欲滴');
  } else if (colorSet.size <= 2) {
    harmonyPenalties.push('配菜色泽略显单调，可以尝试加入不同色系食材');
  }

  if (snapshot.spillLoss > 0) {
    harmonyScore -= snapshot.spillLoss * 0.55;
    harmonyPenalties.push(`翻炒失误导致食材飞溅损失（-${Math.round(snapshot.spillLoss * 0.55)} 分）`);
  }
  if (snapshot.burnLevel >= 30) {
    harmonyScore -= (snapshot.burnLevel - 25) * 0.6;
    harmonyPenalties.push('焦黑颗粒影响了炒饭金黄卖相');
  }
  if (snapshot.seasoningCounts.soy >= 4) {
    harmonyScore -= 12;
    harmonyPenalties.push('酱油倒得太多，整盘变成乌黑老抽饭啦');
  }
  if (snapshot.selectedIngredientIds.length === 0) {
    harmonyHighlights.push('极简纯粹蛋炒饭路线！考验纯粹基本功');
  }
  harmonyScore = clamp(harmonyScore);

  // =========================================================================
  // 6. 出锅把控 (Timing & Serving Control) 0..100
  // =========================================================================
  const timingHighlights: string[] = [];
  const timingPenalties: string[] = [];

  let timingScore = 100;
  const { targetDurationMin, targetDurationMax, elapsedSec } = snapshot;
  if (elapsedSec < targetDurationMin) {
    const shortBy = targetDurationMin - elapsedSec;
    timingScore -= shortBy * 2.4;
    timingPenalties.push(
      `出锅过早（用时 ${Math.round(elapsedSec)} 秒，推荐 ${targetDurationMin}~${targetDurationMax} 秒），香气未完全融合`
    );
  } else if (elapsedSec > targetDurationMax) {
    const overBy = elapsedSec - targetDurationMax;
    timingScore -= overBy * 2.0;
    timingPenalties.push(
      `炒制偏久（用时 ${Math.round(elapsedSec)} 秒，推荐 ${targetDurationMin}~${targetDurationMax} 秒），水分流失变干`
    );
  } else {
    timingHighlights.push(
      `黄金时间窗完美出锅！（用时 ${Math.round(elapsedSec)} 秒，目标 ${targetDurationMin}~${targetDurationMax} 秒）`
    );
    badges.push('黄金出锅时机');
  }

  // Check if stove was turned off or low before serving
  if (snapshot.finishedHeatLevel === 0) {
    timingHighlights.push('出锅前及时关火利用余温收尾，非常专业！');
  } else if (snapshot.finishedHeatLevel >= 4) {
    timingScore -= 12;
    timingPenalties.push('开着大火/猛火直接出锅，锅底余热容易焦底哦');
  } else if (snapshot.finishedHeatLevel >= 2) {
    timingScore -= 4;
    timingPenalties.push('出锅前若先关火或转微火会更安全');
  }

  if (snapshot.finishTemp < 115 && snapshot.ignited) {
    timingScore -= 14;
    timingPenalties.push('出锅时锅温已经凉下来了，少了热气腾腾的锅香');
  } else if (snapshot.finishTemp >= 145 && snapshot.finishTemp <= 215) {
    timingHighlights.push(`装盘温度 ${Math.round(snapshot.finishTemp)}°C，热气腾腾香气四溢`);
  }

  timingScore = clamp(timingScore);

  // =========================================================================
  // TOTAL SCORE = STRICT ARITHMETIC AVERAGE OF THE 6 DIMENSIONS (<= 100)
  // =========================================================================
  const dimensions: DimensionBreakdown[] = [
    {
      key: 'heat',
      label: '火候与锅气',
      score: Math.round(heatScore * 10) / 10,
      highlights: heatHighlights,
      penalties: heatPenalties,
    },
    {
      key: 'doneness',
      label: '熟度与时序',
      score: Math.round(donenessScore * 10) / 10,
      highlights: donenessHighlights,
      penalties: donenessPenalties,
    },
    {
      key: 'technique',
      label: '翻炒技法',
      score: Math.round(techniqueScore * 10) / 10,
      highlights: techHighlights,
      penalties: techPenalties,
    },
    {
      key: 'seasoning',
      label: '调味平衡',
      score: Math.round(seasoningScore * 10) / 10,
      highlights: seasonHighlights,
      penalties: seasonPenalties,
    },
    {
      key: 'harmony',
      label: '搭配与色泽',
      score: Math.round(harmonyScore * 10) / 10,
      highlights: harmonyHighlights,
      penalties: harmonyPenalties,
    },
    {
      key: 'timing',
      label: '出锅把控',
      score: Math.round(timingScore * 10) / 10,
      highlights: timingHighlights,
      penalties: timingPenalties,
    },
  ];

  const avg = dimensions.reduce((acc, d) => acc + d.score, 0) / dimensions.length;
  const totalScore = Math.round(clamp(avg, 0, 100) * 10) / 10;

  let rank: ResultRank;
  let title: string;
  let umiQuote: string;

  if (totalScore >= 94) {
    rank = 'S+';
    title = '鸟白岛传说级黄金炒饭！';
    umiQuote =
      '「唔哇——！！这、这也太好吃了吧！！每一粒米都在发光！这是今年夏天最棒最棒的炒饭，我还能再吃三盘！！」';
  } else if (totalScore >= 84) {
    rank = 'S';
    title = '大满足的夏日绝品炒饭！';
    umiQuote =
      '「好好吃呀~♪ 锅气香喷喷的，配菜火候刚刚好！呐呐，明天午饭也可以再做一次这个炒饭吗？」';
  } else if (totalScore >= 70) {
    rank = 'A';
    title = '温馨可口的家常炒饭';
    umiQuote =
      '「嗯嗯，很有夏天的家常味道呢！虽然有一点点小瑕疵，但吃起来很安心，谢谢款待！」';
  } else if (totalScore >= 50) {
    rank = 'B';
    title = '微妙的实验性炒饭…';
    umiQuote =
      '「唔…嗯……味道稍微有点特别呢（擦汗）……不过不能浪费粮食，我会努力全部吃完的！」';
  } else {
    rank = 'C';
    title = '鸟白岛神秘黑暗料理！';
    umiQuote = snapshot.darkHoneyPenalty
      ? '「呜哇哇——！为什么炒饭里会有浓浓的蜂蜜甜味啊！！眼睛都要转圈圈了啦！！」'
      : snapshot.burnLevel >= 45
        ? '「咳咳…冒黑烟了啦！这盘炒饭已经进化成炭烤化石了呜呜……」'
        : '「呜……头晕晕的……下次我们一定要认真看火候和调味再重新挑战哦！」';
  }

  return {
    totalScore,
    rank,
    title,
    umiQuote,
    dimensions,
    badges: Array.from(new Set(badges)),
    synergies,
    flavors,
    idealFlavors,
    stats: {
      elapsedSec: Math.round(snapshot.elapsedSec),
      wokHei: Math.round(snapshot.wokHei),
      burnLevel: Math.round(snapshot.burnLevel),
      maxCombo: snapshot.maxCombo,
      qteCounts,
    },
  };
}
