import React, { useEffect, useState } from 'react';
import { Award, RotateCcw, SlidersHorizontal, Home, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { ResultRank, ScoreReport, WokId } from '../types';
import { WOK_MAP } from '../data/woks';
import { INGREDIENT_MAP } from '../data/ingredients';
import { RadarChart } from './RadarChart';

interface ResultScreenProps {
  report: ScoreReport;
  wokId: WokId;
  selectedIngredientIds: string[];
  onRetrySame: () => void;
  onChangePrep: () => void;
  onReturnTitle: () => void;
}

const RANK_ASSETS: Record<ResultRank, { img: string; color: string; bg: string; label: string }> = {
  'S+': {
    img: 'assets/images/umi_splus.png',
    color: '#d97706',
    bg: 'linear-gradient(135deg, #fef08a 0%, #f59e0b 100%)',
    label: '传说神级',
  },
  S: {
    img: 'assets/images/umi_s.png',
    color: '#db2777',
    bg: 'linear-gradient(135deg, #fbcfe8 0%, #ec4899 100%)',
    label: '绝赞美味',
  },
  A: {
    img: 'assets/images/umi_a.png',
    color: '#0284c7',
    bg: 'linear-gradient(135deg, #bae6fd 0%, #0ea5e9 100%)',
    label: '家常好味',
  },
  B: {
    img: 'assets/images/umi_b.png',
    color: '#64748b',
    bg: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)',
    label: '勉强过关',
  },
  C: {
    img: 'assets/images/umi_c.png',
    color: '#7e22ce',
    bg: 'linear-gradient(135deg, #e9d5ff 0%, #9333ea 100%)',
    label: '黑暗料理',
  },
};

export const ResultScreen: React.FC<ResultScreenProps> = ({
  report,
  wokId,
  selectedIngredientIds,
  onRetrySame,
  onChangePrep,
  onReturnTitle,
}) => {
  const base = import.meta.env.BASE_URL || '/';
  const meta = RANK_ASSETS[report.rank];
  const [displayScore, setDisplayScore] = useState(0);
  const [expandedDim, setExpandedDim] = useState<string | null>(report.dimensions[0]?.key ?? null);

  // Smooth count-up animation for total score
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(report.totalScore * eased * 10) / 10);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [report.totalScore]);

  const flavorBars: Array<{ label: string; value: number; ideal: number; color: string }> = [
    { label: '咸度', value: report.flavors.saltiness, ideal: report.idealFlavors.saltiness, color: '#38bdf8' },
    { label: '鲜味', value: report.flavors.umami, ideal: report.idealFlavors.umami, color: '#22c55e' },
    { label: '香气', value: report.flavors.aroma, ideal: report.idealFlavors.aroma, color: '#f59e0b' },
    { label: '油润', value: report.flavors.oiliness, ideal: report.idealFlavors.oiliness, color: '#fb923c' },
    { label: '甜度', value: report.flavors.sweetness, ideal: report.idealFlavors.sweetness, color: '#f472b6' },
  ];

  return (
    <div
      style={{
        minHeight: '100dvh',
        padding: '16px clamp(12px, 3vw, 24px) calc(28px + env(safe-area-inset-bottom))',
        background:
          'radial-gradient(circle at 20% 15%, rgba(254, 240, 138, 0.52), transparent 44%), radial-gradient(circle at 85% 20%, rgba(186, 230, 253, 0.58), transparent 44%), linear-gradient(155deg, #fffdf5 0%, #eef9f1 52%, #e0f2fe 100%)',
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: CHIBI UMI TASTING STAGE + GALGAME DIALOGUE */}
        <div
          className="summer-card anim-pop"
          style={{
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            background:
              'linear-gradient(180deg, rgba(255,253,245,0.95) 0%, rgba(255,244,222,0.92) 100%)',
          }}
        >
          {/* Rank & Score Header */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#786655' }}>羽未品尝评价</div>
              <h1 style={{ margin: '2px 0 0', fontSize: 23, fontWeight: 900, color: '#2c241e' }}>
                {report.title}
              </h1>
            </div>
            <div
              style={{
                padding: '6px 18px',
                borderRadius: 16,
                background: meta.bg,
                color: '#fff',
                textAlign: 'center',
                boxShadow: '0 6px 18px rgba(0,0,0,0.16)',
                border: '2px solid #fff',
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{report.rank}</div>
              <div style={{ fontSize: 11, fontWeight: 800, marginTop: 2 }}>{meta.label}</div>
            </div>
          </div>

          {/* Chibi Umi Transparent Character Sprite */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 360,
              aspectRatio: '1 / 1',
              borderRadius: 24,
              background:
                'radial-gradient(circle at 50% 45%, rgba(255,255,255,0.95) 0%, rgba(254, 243, 199, 0.55) 68%, rgba(186, 230, 253, 0.35) 100%)',
              border: '2px dashed rgba(245, 158, 11, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src={`${base}${meta.img}`}
              alt={`羽未品尝反应 ${report.rank}`}
              className="anim-float"
              style={{
                width: '94%',
                height: '94%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 12px 18px rgba(92, 62, 32, 0.18))',
              }}
            />
          </div>

          {/* Galgame Dialogue Box */}
          <div
            style={{
              width: '100%',
              position: 'relative',
              padding: '16px 18px 14px',
              borderRadius: 16,
              background: 'rgba(255, 255, 255, 0.95)',
              border: '2.5px solid #f472b6',
              boxShadow: '0 6px 18px rgba(236, 72, 153, 0.12)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -13,
                left: 16,
                padding: '2px 14px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #ec4899, #f472b6)',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 900,
              }}
            >
              加藤羽未
            </span>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, fontWeight: 700, color: '#3b2c22' }}>
              {report.umiQuote}
            </p>
          </div>

          {/* Total Average Score Banner */}
          <div
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              border: '2px solid #fdba74',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#9a3412' }}>
                最终综合平均分（六大维度均分 · 上限 100）
              </div>
              <div style={{ fontSize: 12.5, color: '#786655', fontWeight: 600, marginTop: 2 }}>
                {WOK_MAP[wokId]?.name} ·{' '}
                {selectedIngredientIds.length > 0
                  ? selectedIngredientIds.map((id) => INGREDIENT_MAP[id]?.name).join(' / ')
                  : '纯粹蛋炒饭'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 44, fontWeight: 900, color: '#ea580c', lineHeight: 1 }}>
                {displayScore.toFixed(1)}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#9a3412' }}>/ 100</span>
            </div>
          </div>

          {/* Badges & Synergies */}
          {(report.badges.length > 0 || report.synergies.length > 0) && (
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {report.badges.map((b) => (
                <span
                  key={b}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: '#fef3c7',
                    border: '1.5px solid #f59e0b',
                    color: '#b45309',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <Award size={13} /> {b}
                </span>
              ))}
              {report.synergies.map((s) => (
                <span
                  key={s}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: '#e0f2fe',
                    border: '1.5px solid #38bdf8',
                    color: '#0369a1',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <Sparkles size={13} /> {s}
                </span>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
            <button
              onClick={onRetrySame}
              className="btn-primary"
              style={{ flex: 1, padding: '12px 16px', fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <RotateCcw size={17} /> 再炒一盘
            </button>
            <button
              onClick={onChangePrep}
              className="btn-sky"
              style={{ flex: 1, padding: '12px 16px', fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <SlidersHorizontal size={17} /> 换锅换菜
            </button>
            <button
              onClick={onReturnTitle}
              className="btn-ghost"
              style={{ padding: '12px 16px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Home size={16} /> 封面
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: 6-DIMENSION RADAR + FIVE-FLAVOR + DETAILED DIAGNOSTICS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Radar + Key Cooking Stats */}
          <div
            className="summer-card anim-pop"
            style={{
              padding: 18,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-around',
              gap: 16,
            }}
          >
            <RadarChart dimensions={report.dimensions} size={255} />

            <div style={{ minWidth: 210, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0369a1' }}>📊 烹饪数据总览</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5 }}>
                <div style={{ padding: '7px 10px', borderRadius: 10, background: '#fff' }}>
                  <div style={{ color: '#786655', fontWeight: 700 }}>总用时</div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{report.stats.elapsedSec} 秒</div>
                </div>
                <div style={{ padding: '7px 10px', borderRadius: 10, background: '#fff' }}>
                  <div style={{ color: '#786655', fontWeight: 700 }}>最高连击</div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: '#ea580c' }}>{report.stats.maxCombo} Combo</div>
                </div>
                <div style={{ padding: '7px 10px', borderRadius: 10, background: '#fff' }}>
                  <div style={{ color: '#786655', fontWeight: 700 }}>最终锅气</div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: '#d97706' }}>{report.stats.wokHei}%</div>
                </div>
                <div style={{ padding: '7px 10px', borderRadius: 10, background: '#fff' }}>
                  <div style={{ color: '#786655', fontWeight: 700 }}>焦糊程度</div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: report.stats.burnLevel > 20 ? '#dc2626' : '#16a34a' }}>
                    {report.stats.burnLevel}%
                  </div>
                </div>
              </div>

              {/* QTE tally */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11.5, fontWeight: 800 }}>
                <span style={{ padding: '3px 8px', borderRadius: 8, background: '#fef3c7', color: '#b45309' }}>
                  Excellent ×{report.stats.qteCounts.Excellent}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 8, background: '#dcfce7', color: '#15803d' }}>
                  Great ×{report.stats.qteCounts.Great}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 8, background: '#e0f2fe', color: '#0369a1' }}>
                  Good ×{report.stats.qteCounts.Good}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}>
                  Bad ×{report.stats.qteCounts.Bad}
                </span>
              </div>

              {/* Five-flavor balance */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#6b5b4e' }}>五味平衡（竖线为理想风味点）</div>
                {flavorBars.map((f) => (
                  <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    <span style={{ width: 32, fontWeight: 800 }}>{f.label}</span>
                    <div
                      style={{
                        flex: 1,
                        height: 9,
                        borderRadius: 99,
                        background: '#e2e8f0',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (f.value / 110) * 100)}%`,
                          height: '100%',
                          background: f.color,
                          borderRadius: 99,
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          left: `${Math.min(98, (f.ideal / 110) * 100)}%`,
                          top: 0,
                          bottom: 0,
                          width: 2.5,
                          background: '#1e293b',
                        }}
                        title={`理想值约 ${f.ideal}`}
                      />
                    </div>
                    <span style={{ width: 28, textAlign: 'right', fontWeight: 800, color: '#475569' }}>
                      {Math.round(f.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6-Dimension Detailed Breakdown */}
          <div className="summer-card anim-pop" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16.5, fontWeight: 900, color: '#ea580c' }}>
              📝 六维详细点评报告（点击展开各项明细）
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.dimensions.map((d) => {
                const open = expandedDim === d.key;
                const scoreColor = d.score >= 85 ? '#16a34a' : d.score >= 65 ? '#0284c7' : '#dc2626';
                return (
                  <div
                    key={d.key}
                    style={{
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.9)',
                      border: '1.5px solid rgba(217, 155, 86, 0.32)',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => setExpandedDim(open ? null : d.key)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: 'transparent',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 900, fontSize: 14.5, color: '#2c241e' }}>{d.label}</span>
                        <div style={{ width: 110, height: 8, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{ width: `${d.score}%`, height: '100%', background: scoreColor }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 900, fontSize: 16, color: scoreColor }}>{d.score.toFixed(1)}</span>
                        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>

                    {open && (
                      <div
                        style={{
                          padding: '0 14px 12px',
                          borderTop: '1px dashed rgba(217, 155, 86, 0.3)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          fontSize: 12.5,
                          paddingTop: 8,
                        }}
                      >
                        {d.highlights.map((h, i) => (
                          <div key={`h-${i}`} style={{ color: '#15803d', fontWeight: 700 }}>
                            ＋ {h}
                          </div>
                        ))}
                        {d.penalties.map((p, i) => (
                          <div key={`p-${i}`} style={{ color: '#b91c1c', fontWeight: 700 }}>
                            － {p}
                          </div>
                        ))}
                        {d.highlights.length === 0 && d.penalties.length === 0 && (
                          <div style={{ color: '#64748b' }}>表现中规中矩，发挥稳定。</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
