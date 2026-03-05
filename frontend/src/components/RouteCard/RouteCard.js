import React from 'react';
import './RouteCard.css';

const DIFFICULTY_META = {
  easy:     { label: 'Easy',     color: '#2ecc71', icon: '🟢' },
  moderate: { label: 'Moderate', color: '#3498db', icon: '🔵' },
  hard:     { label: 'Hard',     color: '#f39c12', icon: '🟠' },
  expert:   { label: 'Expert',   color: '#e74c3c', icon: '🔴' },
};

function formatDistance(meters) {
  if (!meters && meters !== 0) return '—';
  const km = meters / 1000;
  return km >= 1 ? `${km.toFixed(1)} km` : `${meters} m`;
}

function formatElevation(meters) {
  if (!meters && meters !== 0) return '—';
  return `${Math.round(meters).toLocaleString()} m`;
}

function RouteCard({ trail, onSelect }) {
  const difficulty = (trail.difficulty || 'moderate').toLowerCase();
  const meta = DIFFICULTY_META[difficulty] || DIFFICULTY_META.moderate;

  return (
    <div className="route-card card">
      <div className="route-card-header">
        <span className={`badge badge-${difficulty}`}>{meta.label}</span>
        {trail.matchScore !== undefined && (
          <span className="route-match-score">
            {Math.round(trail.matchScore)}% match
          </span>
        )}
      </div>

      <h3 className="route-name">{trail.name}</h3>

      {trail.region && (
        <p className="route-region">📍 {trail.region}</p>
      )}

      <div className="route-stats">
        <div className="route-stat">
          <span className="route-stat-icon">📏</span>
          <span className="route-stat-value">{formatDistance(trail.distance || trail.distanceKm * 1000)}</span>
          <span className="route-stat-label">Distance</span>
        </div>
        <div className="route-stat">
          <span className="route-stat-icon">⛰️</span>
          <span className="route-stat-value">{formatElevation(trail.elevation || trail.elevationGain)}</span>
          <span className="route-stat-label">Elevation</span>
        </div>
        {trail.estimatedTime && (
          <div className="route-stat">
            <span className="route-stat-icon">⏱️</span>
            <span className="route-stat-value">{trail.estimatedTime}</span>
            <span className="route-stat-label">Est. Time</span>
          </div>
        )}
      </div>

      {trail.description && (
        <p className="route-description">{trail.description}</p>
      )}

      <div className="route-card-footer">
        {trail.tags && trail.tags.length > 0 && (
          <div className="route-tags">
            {trail.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="route-tag">{tag}</span>
            ))}
          </div>
        )}
        {onSelect && (
          <button className="btn btn-outline btn-sm" onClick={() => onSelect(trail)}>
            View Details
          </button>
        )}
      </div>
    </div>
  );
}

export default RouteCard;
