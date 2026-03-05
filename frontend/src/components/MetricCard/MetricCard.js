import React from 'react';
import './MetricCard.css';

function MetricCard({ label, value, unit, icon, trend, description, highlight }) {
  const trendClass =
    trend === 'up'   ? 'trend-up'   :
    trend === 'down' ? 'trend-down' : '';

  const trendIcon =
    trend === 'up'   ? '↑' :
    trend === 'down' ? '↓' : '';

  return (
    <div className={`metric-card card ${highlight ? 'metric-card--highlight' : ''}`}>
      <div className="metric-card-header">
        <span className="metric-icon">{icon}</span>
        {trend && (
          <span className={`metric-trend ${trendClass}`}>
            {trendIcon} {trend === 'up' ? 'Up' : 'Down'}
          </span>
        )}
      </div>
      <div className="metric-value">
        {value !== null && value !== undefined ? (
          <>
            <span className="metric-number">{value}</span>
            {unit && <span className="metric-unit">{unit}</span>}
          </>
        ) : (
          <span className="metric-number metric-na">—</span>
        )}
      </div>
      <div className="metric-label">{label}</div>
      {description && <div className="metric-desc">{description}</div>}
    </div>
  );
}

export default MetricCard;
