import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import ScoreGauge from '../../components/ScoreGauge/ScoreGauge';
import './ScoreDetails.css';

function getScoreColor(score) {
  if (score >= 70) return '#2ecc71';
  if (score >= 40) return '#f39c12';
  return '#e74c3c';
}

function getTierInfo(score) {
  if (score >= 85) return {
    tier: 'Peak Condition',
    advice: 'You\'re in outstanding shape. This is the ideal window to tackle challenging routes and push your limits safely.',
    trailSuggestion: 'Expert and Hard trails — go for it!',
    trailLink: '/routes',
    icon: '🏔️',
  };
  if (score >= 70) return {
    tier: 'Ready to Go',
    advice: 'Your body is well-recovered and your fitness is strong. A great time for challenging hikes or long-distance runs.',
    trailSuggestion: 'Moderate to Hard trails recommended.',
    trailLink: '/routes',
    icon: '✅',
  };
  if (score >= 55) return {
    tier: 'Good Shape',
    advice: 'You\'re in decent shape with room for improvement. Stick to moderate routes and keep your current training rhythm.',
    trailSuggestion: 'Moderate trails are ideal right now.',
    trailLink: '/routes',
    icon: '👍',
  };
  if (score >= 40) return {
    tier: 'Building Fitness',
    advice: 'Your body is working hard but isn\'t fully recovered. Easy trails and lower-intensity sessions will help you build back up.',
    trailSuggestion: 'Easy trails to maintain without overloading.',
    trailLink: '/routes',
    icon: '📈',
  };
  if (score >= 25) return {
    tier: 'Needs Recovery',
    advice: 'Signs of fatigue or insufficient recovery detected. Focus on sleep, nutrition, and gentle movement before pushing hard again.',
    trailSuggestion: 'Light walks only — prioritise recovery.',
    trailLink: '/routes',
    icon: '😴',
  };
  return {
    tier: 'Rest Day',
    advice: 'Your readiness score indicates your body needs rest. Skip intense activity today and focus on sleep, hydration, and nutrition.',
    trailSuggestion: 'No strenuous activity recommended today.',
    trailLink: '/routes',
    icon: '🛌',
  };
}

const METRIC_DETAILS = [
  {
    key: 'vo2Max',
    label: 'VO₂ Max',
    unit: 'mL/kg/min',
    icon: '❤️',
    weight: 20,
    description: 'Maximal oxygen uptake — the gold standard for aerobic fitness. Higher is better.',
    interpret: (v) => v >= 55 ? 'Excellent' : v >= 45 ? 'Good' : v >= 35 ? 'Average' : 'Below Average',
  },
  {
    key: 'hrv',
    label: 'HRV',
    unit: 'ms',
    icon: '💓',
    weight: 20,
    description: 'Heart Rate Variability — high HRV signals good recovery and autonomic health.',
    interpret: (v) => v >= 70 ? 'Excellent' : v >= 50 ? 'Good' : v >= 30 ? 'Fair' : 'Low',
  },
  {
    key: 'sleepQualityScore',
    label: 'Sleep Quality',
    unit: '/100',
    icon: '😴',
    weight: 15,
    description: 'Sleep score based on duration, stages, and disruption frequency.',
    interpret: (v) => v >= 80 ? 'Excellent' : v >= 65 ? 'Good' : v >= 50 ? 'Fair' : 'Poor',
  },
  {
    key: 'recoveryScore',
    label: 'Recovery',
    unit: '/100',
    icon: '⚡',
    weight: 15,
    description: 'How well your body has recovered from recent training stress.',
    interpret: (v) => v >= 80 ? 'Fully Recovered' : v >= 60 ? 'Well Recovered' : v >= 40 ? 'Partially Recovered' : 'Under-recovered',
  },
  {
    key: 'trainingLoad',
    label: 'Training Load',
    unit: 'pts',
    icon: '🔥',
    weight: 15,
    description: 'Cumulative training stress from recent workouts. Moderate load is ideal.',
    interpret: (v) => v <= 40 ? 'Very Low' : v <= 65 ? 'Optimal' : v <= 85 ? 'High' : 'Very High',
  },
  {
    key: 'weeklyDistanceKm',
    label: 'Weekly Distance',
    unit: 'km',
    icon: '📍',
    weight: 10,
    description: 'Total distance covered in the last 7 days across all activities.',
    interpret: (v) => v >= 60 ? 'High Volume' : v >= 30 ? 'Good Volume' : v >= 15 ? 'Moderate' : 'Low Volume',
  },
  {
    key: 'restingHeartRate',
    label: 'Resting HR',
    unit: 'bpm',
    icon: '🫀',
    weight: 5,
    description: 'Lower resting heart rate typically indicates better cardiovascular fitness.',
    interpret: (v) => v <= 50 ? 'Athletic' : v <= 60 ? 'Good' : v <= 70 ? 'Average' : 'Elevated',
  },
];

function MetricDetailRow({ metricDef, value }) {
  if (value === null || value === undefined) return null;
  const color = getScoreColor(75); // neutral indicator
  const rating = metricDef.interpret(value);
  const ratingColor =
    ['Excellent', 'Athletic', 'Good', 'Fully Recovered', 'Optimal', 'Well Recovered', 'High Volume', 'Good Volume'].includes(rating)
      ? '#2ecc71'
      : ['Fair', 'Average', 'Partially Recovered', 'Moderate', 'Moderate Volume'].includes(rating)
      ? '#f39c12'
      : '#e74c3c';

  return (
    <div className="metric-detail-row card">
      <div className="mdr-left">
        <span className="mdr-icon">{metricDef.icon}</span>
        <div>
          <div className="mdr-label">{metricDef.label}</div>
          <div className="mdr-desc">{metricDef.description}</div>
        </div>
      </div>
      <div className="mdr-right">
        <div className="mdr-value">
          {typeof value === 'number' ? value.toFixed(value % 1 !== 0 ? 1 : 0) : value}
          <span className="mdr-unit"> {metricDef.unit}</span>
        </div>
        <div className="mdr-rating" style={{ color: ratingColor, borderColor: ratingColor + '40', background: ratingColor + '18' }}>
          {rating}
        </div>
        <div className="mdr-weight">{metricDef.weight}% weight</div>
      </div>
    </div>
  );
}

function ScoreDetails() {
  const { score, loading, useMock } = useApp();

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
        <span>Loading score details…</span>
      </div>
    );
  }

  const scoreValue = score?.score ?? 0;
  const metrics    = score?.metrics ?? {};
  const tierInfo   = getTierInfo(scoreValue);
  const scoreColor = getScoreColor(scoreValue);

  const scoreBands = [
    { range: '0–24',  label: 'Rest Day',        color: '#e74c3c' },
    { range: '25–39', label: 'Needs Recovery',   color: '#e74c3c' },
    { range: '40–54', label: 'Building Fitness', color: '#f39c12' },
    { range: '55–69', label: 'Good Shape',       color: '#f39c12' },
    { range: '70–84', label: 'Ready to Go',      color: '#2ecc71' },
    { range: '85–100',label: 'Peak Condition',   color: '#2ecc71' },
  ];

  return (
    <div className="page-container score-details-page">
      <h1 className="page-title">Score Breakdown</h1>
      <p className="page-subtitle">
        Understand how your readiness score is calculated and what it means for
        your next adventure.
      </p>

      {useMock && (
        <div className="mock-banner-score">
          📊 Demo data shown. Connect a fitness tracker to see your real score.{' '}
          <Link to="/connect">Connect →</Link>
        </div>
      )}

      {/* Score overview */}
      <div className="score-overview card">
        <div className="score-overview-gauge">
          <ScoreGauge score={scoreValue} size={200} />
        </div>
        <div className="score-overview-info">
          <div className="score-tier-icon">{tierInfo.icon}</div>
          <h2 className="score-tier-label" style={{ color: scoreColor }}>{tierInfo.tier}</h2>
          <p className="score-tier-advice">{tierInfo.advice}</p>
          <div className="score-trail-suggestion">
            <span className="suggestion-icon">🗺️</span>
            <span>{tierInfo.trailSuggestion}</span>
            <Link to={tierInfo.trailLink} className="btn btn-primary btn-sm">Find Routes</Link>
          </div>
        </div>
      </div>

      {/* Score bands reference */}
      <div className="score-bands card">
        <div className="section-title" style={{ marginBottom: '1rem' }}>Score Reference</div>
        <div className="bands-grid">
          {scoreBands.map((band) => (
            <div
              key={band.range}
              className={`band-item ${band.label === tierInfo.tier ? 'band-active' : ''}`}
              style={band.label === tierInfo.tier
                ? { borderColor: band.color, background: band.color + '18' }
                : {}}
            >
              <div className="band-range" style={{ color: band.color }}>{band.range}</div>
              <div className="band-label">{band.label}</div>
              {band.label === tierInfo.tier && (
                <div className="band-you">← You</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Metric breakdown */}
      <div className="score-metrics-section">
        <div className="section-header">
          <h2 className="section-title">Metric Breakdown</h2>
          <span className="section-subtitle-small">Higher weight = more influence on score</span>
        </div>
        <div className="metrics-detail-list">
          {METRIC_DETAILS.map((def) => (
            <MetricDetailRow
              key={def.key}
              metricDef={def}
              value={metrics[def.key]}
            />
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="score-tips card">
        <h3 className="tips-title">💡 How to Improve Your Score</h3>
        <ul className="tips-list">
          <li><strong>HRV & Sleep:</strong> Consistent 7–9 hours of quality sleep is the single biggest driver of readiness improvement.</li>
          <li><strong>Training Load:</strong> Avoid sudden spikes — the 10% rule (increasing volume by no more than 10% per week) minimises overtraining risk.</li>
          <li><strong>VO₂ Max:</strong> Incorporate 1–2 zone-4 interval sessions per week to boost aerobic capacity over 8–12 weeks.</li>
          <li><strong>Resting HR:</strong> Lower your resting heart rate through consistent aerobic base training over 6–12 months.</li>
          <li><strong>Recovery:</strong> Active recovery days, foam rolling, and cold exposure all accelerate physiological recovery.</li>
        </ul>
      </div>
    </div>
  );
}

export default ScoreDetails;
