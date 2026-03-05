import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import ScoreGauge from '../../components/ScoreGauge/ScoreGauge';
import MetricCard from '../../components/MetricCard/MetricCard';
import { calculateScore } from '../../api/client';
import './Dashboard.css';

const ACTIVITY_TYPE_ICONS = {
  Run: '🏃', Ride: '🚴', Hike: '🥾', Walk: '🚶',
  Swim: '🏊', Yoga: '🧘', Workout: '💪', default: '⚡',
};

function formatDistance(meters) {
  if (!meters && meters !== 0) return '—';
  return (meters / 1000).toFixed(1) + ' km';
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function Dashboard() {
  const { score, fitnessSummary, loading, useMock, refresh } = useApp();
  const [recalculating, setRecalculating] = useState(false);

  const metrics = score?.metrics || {};
  const activities = fitnessSummary?.strava?.activities || [];

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await calculateScore(metrics);
      await refresh();
    } catch {
      // no-op in mock mode
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  const scoreValue = score?.score ?? 0;

  const metricCards = [
    {
      label: 'VO₂ Max',
      value: metrics.vo2Max ? metrics.vo2Max.toFixed(1) : null,
      unit: 'mL/kg/min',
      icon: '❤️',
      description: 'Aerobic capacity estimate',
      highlight: true,
    },
    {
      label: 'HRV',
      value: metrics.hrv ?? null,
      unit: 'ms',
      icon: '💓',
      description: 'Heart Rate Variability',
    },
    {
      label: 'Weekly Miles',
      value: metrics.weeklyDistanceKm ? (metrics.weeklyDistanceKm * 0.621).toFixed(1) : null,
      unit: 'mi',
      icon: '📍',
      description: 'Distance this week',
    },
    {
      label: 'Training Load',
      value: metrics.trainingLoad ?? null,
      unit: '',
      icon: '🔥',
      description: 'Cumulative training stress',
    },
    {
      label: 'Sleep Quality',
      value: metrics.sleepQualityScore ?? null,
      unit: '/100',
      icon: '😴',
      description: 'Last night's sleep score',
    },
    {
      label: 'Resting HR',
      value: metrics.restingHeartRate ?? null,
      unit: 'bpm',
      icon: '🫀',
      description: 'Resting heart rate',
    },
    {
      label: 'Recovery',
      value: metrics.recoveryScore ?? null,
      unit: '/100',
      icon: '⚡',
      description: 'Recovery readiness',
    },
    {
      label: 'Elevation',
      value: metrics.weeklyElevation ? Math.round(metrics.weeklyElevation).toLocaleString() : null,
      unit: 'm',
      icon: '⛰️',
      description: 'Weekly elevation gain',
    },
  ];

  return (
    <div className="page-container dashboard">
      {useMock && (
        <div className="mock-banner-dash">
          📊 Showing demo data — connect a fitness tracker for live scores.{' '}
          <Link to="/connect">Connect now →</Link>
        </div>
      )}

      {/* Score + summary row */}
      <div className="dashboard-top">
        <div className="score-panel card">
          <ScoreGauge score={scoreValue} size={220} />
          <div className="score-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleRecalculate}
              disabled={recalculating}
            >
              {recalculating ? 'Recalculating…' : '↻ Recalculate'}
            </button>
            <Link to="/score" className="btn btn-ghost btn-sm">
              View Details
            </Link>
          </div>
          {score?.calculatedAt && (
            <div className="score-updated">
              Updated {formatDate(score.calculatedAt)}
            </div>
          )}
        </div>

        <div className="summary-panel">
          <div className="section-header">
            <h2 className="section-title">Key Metrics</h2>
            <Link to="/score" className="view-all">Full breakdown →</Link>
          </div>
          <div className="metrics-grid">
            {metricCards.map((m) => (
              <MetricCard key={m.label} {...m} />
            ))}
          </div>
        </div>
      </div>

      {/* Recent activities */}
      <div className="activities-section">
        <div className="section-header">
          <h2 className="section-title">Recent Activities</h2>
          <span className="activity-count">{activities.length} activities</span>
        </div>
        {activities.length === 0 ? (
          <div className="activities-empty card">
            <span>🏃</span>
            <p>No recent activities found. Make sure your tracker is connected.</p>
            <Link to="/connect" className="btn btn-secondary btn-sm">Connect Tracker</Link>
          </div>
        ) : (
          <div className="activities-list">
            {activities.map((act) => {
              const typeIcon = ACTIVITY_TYPE_ICONS[act.type] || ACTIVITY_TYPE_ICONS.default;
              return (
                <div key={act.id} className="activity-row card">
                  <div className="activity-icon-wrap">
                    <span className="activity-type-icon">{typeIcon}</span>
                  </div>
                  <div className="activity-info">
                    <div className="activity-name">{act.name}</div>
                    <div className="activity-type">{act.type} · {formatDate(act.start_date)}</div>
                  </div>
                  <div className="activity-stats">
                    <span>{formatDistance(act.distance)}</span>
                    <span className="activity-sep">·</span>
                    <span>{formatDuration(act.elapsed_time)}</span>
                    {act.total_elevation_gain > 0 && (
                      <>
                        <span className="activity-sep">·</span>
                        <span>↑{Math.round(act.total_elevation_gain)}m</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="quick-links">
        <Link to="/routes" className="quick-link-card card">
          <span>🗺️</span>
          <div>
            <div className="ql-title">Find Routes</div>
            <div className="ql-sub">Trails matched to your score</div>
          </div>
          <span className="ql-arrow">→</span>
        </Link>
        <Link to="/gear" className="quick-link-card card">
          <span>🎒</span>
          <div>
            <div className="ql-title">Gear Recommendations</div>
            <div className="ql-sub">What to pack for your next adventure</div>
          </div>
          <span className="ql-arrow">→</span>
        </Link>
      </div>
    </div>
  );
}

export default Dashboard;
