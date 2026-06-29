'use client';

import { Tier } from '@/lib/zcs';

interface ScoreGaugeProps {
  /** ZCS score (300–850). */
  score: number;
  tier: Tier;
  /** Pixel size of the gauge. Defaults to 200. */
  size?: number;
}

const TIER_COLOR: Record<Tier, string> = {
  Excellent: '#16a34a',  // green-600
  'Very Good': '#22c55e',// green-500
  Good: '#84cc16',       // lime-500
  Fair: '#eab308',       // yellow-500
  Poor: '#ef4444',       // red-500
};

/** Visual gauge — semicircle dial with tick marks at every band boundary. */
export function ScoreGauge({ score, tier, size = 200 }: ScoreGaugeProps) {
  const min = 300;
  const max = 850;
  const radius = size * 0.45;
  const stroke = size * 0.08;
  const cx = size / 2;
  const cy = size * 0.55;

  // Arc goes from 180° (left) to 0° (right) for the upper semicircle.
  const startAngle = Math.PI;
  const endAngle = 0;
  const angleRange = startAngle - endAngle;
  const scoreRatio = Math.max(0, Math.min(1, (score - min) / (max - min)));
  const scoreAngle = startAngle - angleRange * scoreRatio;

  // Path for the full track (background).
  const trackPath = describeArc(cx, cy, radius, startAngle, endAngle);
  const valuePath = describeArc(cx, cy, radius, startAngle, scoreAngle);

  const color = TIER_COLOR[tier];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        {/* Track */}
        <path
          d={trackPath}
          stroke="var(--border)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
        />
        {/* Value */}
        <path
          d={valuePath}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
        />
        {/* Center label */}
        <text
          x={cx}
          y={cy - size * 0.04}
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: size * 0.22, fontWeight: 700, letterSpacing: -1 }}
        >
          {score}
        </text>
        <text
          x={cx}
          y={cy + size * 0.07}
          textAnchor="middle"
          fill={color}
          style={{ fontSize: size * 0.08, fontWeight: 600 }}
        >
          {tier}
        </text>
      </svg>
      <div className="mt-1 flex w-full justify-between text-[10px] text-muted" style={{ maxWidth: size }}>
        <span>300</span><span>850</span>
      </div>
    </div>
  );
}

/** SVG arc-path helper — starts at angle1 ends at angle2 (radians). */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  angle1: number,
  angle2: number,
): string {
  const x1 = cx + r * Math.cos(angle1);
  const y1 = cy - r * Math.sin(angle1);
  const x2 = cx + r * Math.cos(angle2);
  const y2 = cy - r * Math.sin(angle2);
  const largeArc = Math.abs(angle1 - angle2) > Math.PI ? 1 : 0;
  const sweep = angle1 > angle2 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
}
