import React, { useMemo } from 'react';
import './ScoreGauge.css';

function getScoreColor(score) {
  if (score >= 70) return '#2ecc71';
  if (score >= 40) return '#f39c12';
  return '#e74c3c';
}

function getScoreLabel(score) {
  if (score >= 85) return 'Peak';
  if (score >= 70) return 'Ready';
  if (score >= 55) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 25) return 'Low';
  return 'Rest';
}

function ScoreGauge({ score = 0, size = 220 }) {
  const color      = getScoreColor(score);
  const label      = getScoreLabel(score);
  const radius     = 80;
  const cx         = size / 2;
  const cy         = size / 2;
  const strokeW    = 12;
  const circumference = 2 * Math.PI * radius;

  // We render 75% of the circle (270°) as the arc range
  const arcRatio   = 0.75;
  const arcLen     = circumference * arcRatio;
  const offset     = circumference * arcRatio * (1 - score / 100);
  const startAngle = 135; // degrees — bottom-left

  const trackColor = 'rgba(255,255,255,0.07)';

  // Tick marks
  const ticks = useMemo(() => {
    const result = [];
    for (let i = 0; i <= 10; i++) {
      const angleDeg = startAngle + (270 * i) / 10;
      const angleRad = (angleDeg * Math.PI) / 180;
      const inner = radius - 18;
      const outer = radius - 10;
      result.push({
        x1: cx + inner * Math.cos(angleRad),
        y1: cy + inner * Math.sin(angleRad),
        x2: cx + outer * Math.cos(angleRad),
        y2: cy + outer * Math.sin(angleRad),
        major: i % 5 === 0,
      });
    }
    return result;
  }, [cx, cy, radius]);

  return (
    <div className="score-gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeW}
          strokeDasharray={`${arcLen} ${circumference - arcLen}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${startAngle} ${cx} ${cy})`}
        />

        {/* Progress arc */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeDasharray={`${arcLen - offset} ${circumference - (arcLen - offset)}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${startAngle} ${cx} ${cy})`}
          filter="url(#glow)"
          style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s ease' }}
        />

        {/* Tick marks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.major ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'}
            strokeWidth={t.major ? 2 : 1}
          />
        ))}

        {/* Score number */}
        <text
          x={cx} y={cy - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize="42"
          fontWeight="800"
          style={{ fontFamily: 'inherit' }}
        >
          {score}
        </text>

        {/* Label */}
        <text
          x={cx} y={cy + 28}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.55)"
          fontSize="13"
          fontWeight="600"
          letterSpacing="2"
          style={{ fontFamily: 'inherit', textTransform: 'uppercase' }}
        >
          {label}
        </text>

        {/* Min / Max labels */}
        <text x={cx - radius + 4} y={cy + radius - 6} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10">0</text>
        <text x={cx + radius - 4} y={cy + radius - 6} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10">100</text>
      </svg>

      <div className="score-gauge-label" style={{ color }}>
        Readiness Score
      </div>
    </div>
  );
}

export default ScoreGauge;
