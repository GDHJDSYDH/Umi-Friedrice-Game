import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Flame, Sparkles, UtensilsCrossed, Shuffle, AlertTriangle, Plus } from 'lucide-react';
import { IngredientCategory, WokId } from '../types';
import { WOKS, WOK_MAP } from '../data/woks';
import {
  BASE_INGREDIENTS,
  INGREDIENT_MAP,
  MAX_OPTIONAL_INGREDIENTS,
  OPTIONAL_INGREDIENTS,
} from '../data/ingredients';
import { computeIdealTempRange, computeTargetDuration } from '../engine/scoring';
import { IngredientIcon } from './Icons';

interface PrepScreenProps {
  selectedWok: WokId;
  selectedIngredients: string[];
  onSelectWok: (id: WokId) => void;
  onToggleIngredient: (id: string) => void;
  onRandomize: () => void;
  onBack: () => void;
  onStartCook: () => void;
}

const STAGE_LABELS: Record<string, { text: string; bg: string; fg: string }> = {
  early: { text: '推荐早下', bg: '#fef3c7', fg: '#b45309' },
  mid: { text: '推荐中段', bg: '#e0f2fe', fg: '#0369a1' },
  late: { text: '推荐后下', bg: '#fce7f3', fg: '#be185d' },
  finish: { text: '出锅前下', bg: '#dcfce7', fg: '#15803d' },
};

export const PrepScreen: React.FC<PrepScreenProps> = ({
  selectedWok,
  selectedIngredients,
  onSelectWok,
  onToggleIngredient,
  onRandomize,
  onBack,
  onStartCook,
}) => {
  const [tab, setTab] = useState<'all' | Exclude<IngredientCategory, 'base'>>('all');
  const base = import.meta.env.BASE_URL || '/';

  const wok = WOK_MAP[selectedWok];

  const filteredIngredients = useMemo(() => {
    if (tab === 'all') return OPTIONAL_INGREDIENTS;
    return OPTIONAL_INGREDIENTS.filter((i) => i.category === tab);
  }, [tab]);

  const targetDur = useMemo(
    () => computeTargetDuration(selectedWok, selectedIngredients),
    [selectedWok, selectedIngredients]
  );

  const idealTemp = useMemo(
    () => computeIdealTempRange(selectedWok, ['rice', 'egg', ...selectedIngredients]),
    [selectedWok, selectedIngredients]
  );

  const previewSynergies = useMemo(() => {
    const tags: Record<string, number> = {};
    for (const id of selectedIngredients) {
      const ing = INGREDIENT_MAP[id];
      if (!ing) continue;
      for (const t of ing.synergyTags) tags[t] = (tags[t] ?? 0) + 1;
    }
    const list: string[] = [];
    if ((tags['island'] ?? 0) >= 2) list.push('🌊 鸟白岛海鲜盛宴');
    if (selectedIngredients.includes('mushroom') && selectedIngredients.includes('broccoli')) {
      list.push('🥦 田园鲜蔬二重奏');
    }
    if ((tags['classic'] ?? 0) >= 3) list.push('🏮 经典扬州金炒');
    if ((tags['healthy'] ?? 0) >= 2 && (tags['meat'] ?? 0) >= 1) list.push('🥗 夏日营养均衡');
    if ((selectedWok === 'iron' || selectedWok === 'copper') && (tags['highheat'] ?? 0) >= 1) {
      list.push('🔥 猛火绝配');
    }
    if (selectedWok === 'castiron' && ((tags['meat'] ?? 0) >= 1 || (tags['seafood'] ?? 0) >= 1)) {
      list.push('🛡️ 厚底锁鲜');
    }
    if ((tags['honey-friendly'] ?? 0) >= 1) list.push('🍯 支持隐藏配方【蜜汁焦糖】');
    return list;
  }, [selectedWok, selectedIngredients]);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '18px 24px 110px',
        background:
          'radial-gradient(circle at 12% 10%, rgba(186, 230, 253, 0.55), transparent 42%), radial-gradient(circle at 90% 15%, rgba(254, 215, 170, 0.55), transparent 45%), linear-gradient(160deg, #f0f9ff 0%, #f5fae8 50%, #fff7e6 100%)',
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onBack}
              className="btn-ghost"
              style={{ padding: '8px 15px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}
            >
              <ArrowLeft size={16} /> 返回封面
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 900, color: '#2c241e' }}>
                🥘 备菜与厨具选择
              </h1>
              <div style={{ fontSize: 13, color: '#6b5b4e', fontWeight: 600 }}>
                挑选 1 口锅具与最多 {MAX_OPTIONAL_INGREDIENTS} 种配菜（全类别合计上限 {MAX_OPTIONAL_INGREDIENTS} 种），它们会摆在灶台旁供你自由下锅！
              </div>
            </div>
          </div>

          <button
            onClick={onRandomize}
            className="btn-sky"
            style={{ padding: '9px 18px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Shuffle size={15} /> 随机搭配一套
          </button>
        </div>

        {/* Section 1: Wok Selection */}
        <section className="summer-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Flame size={20} color="#ea580c" />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>第一步：选择锅具（4 选 1）</h2>
            <span style={{ fontSize: 12.5, color: '#786655', fontWeight: 600 }}>
              锅具会影响升温惯性、焦糊速率、锅气上限与翻炒 QTE 手感
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))',
              gap: 12,
            }}
          >
            {WOKS.map((w) => {
              const active = w.id === selectedWok;
              return (
                <button
                  key={w.id}
                  onClick={() => onSelectWok(w.id)}
                  style={{
                    textAlign: 'left',
                    padding: 13,
                    borderRadius: 15,
                    background: active
                      ? 'linear-gradient(155deg, #fff7ed 0%, #ffedd5 100%)'
                      : 'rgba(255,255,255,0.82)',
                    border: active ? `2.5px solid ${w.accentColor}` : '2px solid rgba(203, 180, 150, 0.35)',
                    boxShadow: active ? `0 8px 20px ${w.accentColor}33` : '0 2px 6px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    position: 'relative',
                  }}
                >
                  {active && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: w.accentColor,
                        color: '#fff',
                        borderRadius: 999,
                        padding: '2px 9px',
                        fontSize: 11.5,
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <Check size={12} /> 已选
                    </span>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <img
                      src={`${base}${w.image}`}
                      alt={w.name}
                      style={{
                        width: 68,
                        height: 68,
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.18))',
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 15.5, color: '#2c241e' }}>{w.name}</div>
                      <div style={{ fontSize: 12, color: '#786655', fontWeight: 600, marginTop: 2 }}>
                        {w.subtitle}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    {w.buffs.map((b, idx) => (
                      <div key={idx} style={{ color: '#15803d', fontWeight: 700, display: 'flex', gap: 4 }}>
                        <span>▲</span>
                        <span>{b}</span>
                      </div>
                    ))}
                    {w.debuffs.map((d, idx) => (
                      <div key={idx} style={{ color: '#b91c1c', fontWeight: 700, display: 'flex', gap: 4 }}>
                        <span>▼</span>
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 2: Ingredient Selection */}
        <section className="summer-card" style={{ padding: '16px 20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <UtensilsCrossed size={20} color="#0284c7" />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
                第二步：挑选配菜（全部类别合计最多选 {MAX_OPTIONAL_INGREDIENTS} 种）
              </h2>
              <span
                style={{
                  padding: '3px 11px',
                  borderRadius: 999,
                  background: selectedIngredients.length === MAX_OPTIONAL_INGREDIENTS ? '#ea580c' : '#0284c7',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 800,
                }}
              >
                已选 {selectedIngredients.length} / {MAX_OPTIONAL_INGREDIENTS}
              </span>
            </div>

            {/* Category filter pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(
                [
                  ['all', '全部 (20)'],
                  ['seafood', '🦐 海鲜 (6)'],
                  ['meat', '🥩 肉类 (6)'],
                  ['vegetable', '🥦 蔬菜 (8)'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 800,
                    background: tab === key ? '#0284c7' : 'rgba(255,255,255,0.85)',
                    color: tab === key ? '#fff' : '#4a3a2e',
                    border: tab === key ? '1.5px solid #0284c7' : '1.5px solid rgba(180,145,106,0.35)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Built-in Base Ingredients Notice */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              padding: '9px 14px',
              marginBottom: 14,
              borderRadius: 12,
              background: 'rgba(255, 247, 224, 0.88)',
              border: '1.5px dashed #f59e0b',
              fontSize: 13,
            }}
          >
            <strong style={{ color: '#b45309' }}>🍚 默认自带主料（不占 4 格上限）：</strong>
            {BASE_INGREDIENTS.map((b) => (
              <span
                key={b.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: '#fff',
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontWeight: 800,
                  border: '1px solid #fcd34d',
                }}
              >
                <IngredientIcon shape={b.iconShape} size={22} />
                {b.name}
              </span>
            ))}
            <span style={{ color: '#786655', fontSize: 12 }}>
              （进入灶台后可自由决定先炒蛋、先下米还是先煸肉菜）
            </span>
          </div>

          {/* Ingredients Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
              gap: 11,
            }}
          >
            {filteredIngredients.map((ing) => {
              const isSelected = selectedIngredients.includes(ing.id);
              const isFull = !isSelected && selectedIngredients.length >= MAX_OPTIONAL_INGREDIENTS;
              const stage = STAGE_LABELS[ing.preferredStage];

              return (
                <button
                  key={ing.id}
                  disabled={isFull}
                  onClick={() => onToggleIngredient(ing.id)}
                  style={{
                    textAlign: 'left',
                    padding: '11px 12px',
                    borderRadius: 14,
                    background: isSelected
                      ? 'linear-gradient(155deg, #f0f9ff 0%, #e0f2fe 100%)'
                      : 'rgba(255,255,255,0.88)',
                    border: isSelected ? '2.5px solid #0284c7' : '1.8px solid rgba(203, 180, 150, 0.35)',
                    boxShadow: isSelected ? '0 6px 16px rgba(2,132,199,0.2)' : '0 2px 5px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          background: '#fffaf0',
                          border: '1px solid rgba(217,155,86,0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <IngredientIcon shape={ing.iconShape} size={34} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 14.5, color: '#2c241e' }}>{ing.name}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              padding: '1px 6px',
                              borderRadius: 6,
                              background: stage.bg,
                              color: stage.fg,
                            }}
                          >
                            {stage.text}
                          </span>
                          <span style={{ fontSize: 10.5, color: '#786655', fontWeight: 700 }}>
                            {ing.idealTempMin}~{ing.idealTempMax}°C
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: isSelected ? '#0284c7' : '#f1f5f9',
                        color: isSelected ? '#fff' : '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isSelected ? <Check size={14} /> : <Plus size={14} />}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, lineHeight: 1.4 }}>
                    {ing.buffs.map((b, idx) => (
                      <div key={idx} style={{ color: '#15803d', fontWeight: 700 }}>
                        ▲ {b}
                      </div>
                    ))}
                    {ing.debuffs.map((d, idx) => (
                      <div key={idx} style={{ color: '#b91c1c', fontWeight: 700 }}>
                        ▼ {d}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Sticky Bottom Summary & Go Cook Bar */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          background: 'rgba(255, 251, 240, 0.96)',
          borderTop: '2px solid rgba(234, 88, 12, 0.35)',
          backdropFilter: 'blur(10px)',
          padding: '12px 24px',
          boxShadow: '0 -8px 24px rgba(44, 36, 30, 0.12)',
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5 }}>
              <span style={{ fontWeight: 900, color: '#ea580c' }}>锅具：{wok.name}</span>
              <span style={{ color: '#6b5b4e', fontWeight: 700 }}>
                推荐理想温区：<strong>{idealTemp.min}~{idealTemp.max}°C</strong>
              </span>
              <span style={{ color: '#6b5b4e', fontWeight: 700 }}>
                目标翻炒时长：<strong>{targetDur.min}~{targetDur.max} 秒</strong>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {selectedIngredients.length === 0 ? (
                <span style={{ fontSize: 12, color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={13} /> 当前未选配菜（可直接挑战纯粹蛋炒饭，或挑选最多 4 种配菜）
                </span>
              ) : (
                selectedIngredients.map((id) => {
                  const ing = INGREDIENT_MAP[id];
                  return (
                    <span
                      key={id}
                      onClick={() => onToggleIngredient(id)}
                      title="点击取消选择"
                      style={{
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 9px',
                        borderRadius: 999,
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {ing?.name} ×
                    </span>
                  );
                })
              )}
              {previewSynergies.map((syn) => (
                <span
                  key={syn}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: '#fef3c7',
                    color: '#b45309',
                    fontSize: 11.5,
                    fontWeight: 800,
                  }}
                >
                  <Sparkles size={11} /> {syn}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={onStartCook}
            className="btn-primary"
            style={{
              padding: '12px 32px',
              fontSize: 17.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <Flame size={20} /> 前往灶台开炒！
          </button>
        </div>
      </div>
    </div>
  );
};
