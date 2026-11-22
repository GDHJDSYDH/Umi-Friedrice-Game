import React, { useState } from 'react';
import { Volume2, VolumeX, Trophy, Sparkles, BookOpen, Flame, X } from 'lucide-react';
import { SavedRecord } from '../types';
import { WOK_MAP } from '../data/woks';
import { INGREDIENT_MAP } from '../data/ingredients';

interface TitleScreenProps {
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
  records: SavedRecord[];
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStart,
  muted,
  onToggleMute,
  records,
}) => {
  const [showRecords, setShowRecords] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const base = import.meta.env.BASE_URL || '/';
  const bestScore = records.length > 0 ? Math.max(...records.map((r) => r.score)) : null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        background: '#f7f3e3',
      }}
    >
      {/* Full-bleed denoised cover illustration */}
      <img
        src={`${base}assets/images/cover.png`}
        alt="羽未的炒饭游戏封面"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center right',
        }}
      />

      {/* Soft sunlit left vignette for crystal-clear title contrast */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(95deg, rgba(255,252,240,0.88) 0%, rgba(255,250,234,0.68) 38%, rgba(255,250,234,0.12) 64%, rgba(255,250,234,0) 100%)',
        }}
      />

      {/* Top-right controls */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 24,
          zIndex: 10,
          display: 'flex',
          gap: 10,
        }}
      >
        <button
          onClick={onToggleMute}
          className="btn-ghost"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 15px',
            fontSize: 13.5,
          }}
          title="切换背景音乐与音效"
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          {muted ? '已静音' : 'BGM 开启'}
        </button>
      </div>

      {/* Main Left Hero Column */}
      <div
        className="anim-pop"
        style={{
          position: 'relative',
          zIndex: 5,
          maxWidth: 560,
          marginLeft: 'clamp(24px, 6vw, 92px)',
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Summer Pockets Fan badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 14px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 800,
              letterSpacing: 0.6,
              boxShadow: '0 4px 12px rgba(14,165,233,0.32)',
            }}
          >
            <Sparkles size={14} /> Summer Pockets 同人厨房小游戏
          </span>
          {bestScore !== null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 999,
                background: 'rgba(255, 243, 214, 0.95)',
                border: '1.5px solid #f59e0b',
                color: '#b45309',
                fontSize: 12.5,
                fontWeight: 800,
              }}
            >
              <Trophy size={13} /> 最高纪录 {bestScore.toFixed(1)} 分
            </span>
          )}
        </div>

        {/* Game Title */}
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(38px, 5vw, 58px)',
              lineHeight: 1.12,
              fontWeight: 900,
              background: 'linear-gradient(180deg, #ff7b1c 0%, #e11d74 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 3px 0 rgba(255,255,255,0.95)) drop-shadow(0 6px 14px rgba(234,88,12,0.22))',
              letterSpacing: 1.5,
            }}
          >
            羽未的炒饭游戏
          </h1>
          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 3,
              color: '#0369a1',
              textTransform: 'uppercase',
            }}
          >
            UMI&apos;S SUMMER FRIED RICE KITCHEN
          </div>
        </div>

        {/* Flavor subtitle */}
        <p
          style={{
            margin: 0,
            fontSize: 15.5,
            lineHeight: 1.7,
            color: '#4a3a2e',
            fontWeight: 600,
            background: 'rgba(255, 255, 255, 0.72)',
            padding: '13px 16px',
            borderRadius: 14,
            border: '1.5px solid rgba(245, 158, 11, 0.35)',
          }}
        >
          在鸟白岛阳光明媚的夏日厨房里，挑选趁手的锅具与 4 种精选配菜，掌控煤气灶火候、把握下料时序与精准 QTE 翻炒，为羽未献上一盘满分黄金炒饭吧！
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
          <button
            onClick={onStart}
            className="btn-primary anim-sparkle"
            style={{
              padding: '14px 36px',
              fontSize: 19,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Flame size={22} /> 开始炒饭！
          </button>

          <button
            onClick={() => setShowGuide(true)}
            className="btn-ghost"
            style={{
              padding: '13px 20px',
              fontSize: 15,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <BookOpen size={17} /> 玩法秘籍
          </button>

          <button
            onClick={() => setShowRecords(true)}
            className="btn-ghost"
            style={{
              padding: '13px 20px',
              fontSize: 15,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <Trophy size={17} /> 成绩单 ({records.length})
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#786655', fontWeight: 600 }}>
          * 非营利同人二次创作作品 · 原作《Summer Pockets》© KEY / VisualArt&apos;s
        </div>
      </div>

      {/* Guide Modal */}
      {showGuide && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(28, 22, 16, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowGuide(false)}
        >
          <div
            className="summer-card anim-pop"
            style={{ maxWidth: 620, width: '100%', padding: 26, maxHeight: '86vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 22, color: '#ea580c' }}>🍳 鸟白岛厨神秘籍</h2>
              <button className="btn-ghost" style={{ padding: 6 }} onClick={() => setShowGuide(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14, lineHeight: 1.65 }}>
              <div>
                <strong>1. 锅具与配菜 Buff / Debuff：</strong>
                4 款锅具各具热惯性、锅气上限与 QTE 判定加成；海鲜/肉/蔬菜合起来最多挑 4 种，隔夜冷米饭与鲜鸡蛋默认自带。
              </div>
              <div>
                <strong>2. 自由下料与金包银技巧：</strong>
                热锅放油 → 先下难熟肉菜（胡萝卜/香菇/西兰花/腊肠）→ 下鸡蛋趁半凝固速下冷米饭并打出 <span style={{ color: '#d97706', fontWeight: 800 }}>Excellent</span> 翻炒，即可触发 <strong>【黄金炒饭·金包银】</strong>！鲜虾/生菜/葱花记得后段或收尾下锅！
              </div>
              <div>
                <strong>3. 调味五味化学：</strong>
                高温（170~225°C）淋酱油触发 <strong>【焦香酱油反应】</strong>；热油撒香料触发 <strong>【热油爆香】</strong>；出锅前轻抖味精最鲜；配叉烧/腊肠/鳗鱼滴 1 次蜂蜜解锁 <strong>【蜜汁焦糖】</strong>（但乱加蜂蜜或配海鲜会触发黑暗料理警告！）。
              </div>
              <div>
                <strong>4. 翻炒 QTE 与 6 维满分 100 评分：</strong>
                点击木铲或按 <kbd style={{ padding: '2px 6px', background: '#eee', borderRadius: 4 }}>Space</kbd> 触发翻炒 QTE（<code>0~5</code> 快捷键调火）。最终按「火候锅气、熟度时序、翻炒技法、调味平衡、搭配色泽、出锅把控」六项平均计分（满分 100），出锅前记得关火利用余温哦！
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Records Modal */}
      {showRecords && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(28, 22, 16, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowRecords(false)}
        >
          <div
            className="summer-card anim-pop"
            style={{ maxWidth: 580, width: '100%', padding: 26, maxHeight: '82vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 21, color: '#0284c7' }}>🏆 羽未的试吃记录</h2>
              <button className="btn-ghost" style={{ padding: 6 }} onClick={() => setShowRecords(false)}>
                <X size={18} />
              </button>
            </div>
            {records.length === 0 ? (
              <p style={{ color: '#786655', textAlign: 'center', padding: '28px 0' }}>
                还没有炒饭记录呢，快去厨房大显身手吧！
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {records.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.85)',
                      border: '1.5px solid rgba(217,155,86,0.35)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 8px',
                            borderRadius: 6,
                            marginRight: 8,
                            background: r.rank === 'S+' ? '#f59e0b' : r.rank === 'S' ? '#ec4899' : r.rank === 'A' ? '#0ea5e9' : '#94a3b8',
                            color: '#fff',
                            fontSize: 12.5,
                          }}
                        >
                          {r.rank}
                        </span>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b5b4e', marginTop: 3 }}>
                        {WOK_MAP[r.wokId]?.name} ·{' '}
                        {r.ingredients.length > 0
                          ? r.ingredients.map((id) => INGREDIENT_MAP[id]?.name).join(' / ')
                          : '纯粹黄金蛋炒饭'}{' '}
                        · {r.date}
                      </div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#ea580c' }}>{r.score.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
