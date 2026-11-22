import React from 'react';
import { DimensionBreakdown } from '../types';

interface RadarChartProps {
  dimensions: DimensionBreakdown[];
  size?: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({ dimensions, size = 250 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.30;
  const count = dimensions.length;

  const getPoint = (index: number, ratio: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * radius * ratio,
      y: cy + Math.sin(angle) * radius * ratio,
    };
  };

  const rings = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = dimensions.map((d, i) => getPoint(i, Math.max(0.05, d.score / 100)));
  const dataPolygon = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff9f38" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* Grid rings */}
      {rings.map((r) => {
        const pts = dimensions
          .map((_, i) => {
            const p = getPoint(i, r);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          })
          .join(' ');
        return (
          <polygon
            key={r}
            points={pts}
            fill={r === 1 ? 'rgba(255, 248, 232, 0.65)' : 'none'}
            stroke="rgba(180, 140, 96, 0.35)"
            strokeWidth={r === 1 ? 1.6 : 1}
          />
        );
      })}

      {/* Axis spokes */}
      {dimensions.map((_, i) => {
        const outer = getPoint(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={outer.x}
            y2={outer.y}
            stroke="rgba(180, 140, 96, 0.32)"
            strokeWidth={1}
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPolygon}
        fill="url(#radarFill)"
        stroke="#ea580c"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />

      {/* Vertices */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4.2} fill="#fff" stroke="#ea580c" strokeWidth={2.2} />
      ))}

      {/* Labels */}
      {dimensions.map((d, i) => {
        const lp = getPoint(i, 1.38);
        return (
          <g key={d.key}>
            <text
              x={lp.x}
              y={lp.y - 4}
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="800"
              fill="#3d2f24"
            >
              {d.label}
            </text>
            <text
              x={lp.x}
              y={lp.y + 11}
              textAnchor="middle"
              fontSize="11"
              fontWeight="900"
              fill={d.score >= 85 ? '#d97706' : d.score >= 65 ? '#0284c7' : '#dc2626'}
            >
              {d.score.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
