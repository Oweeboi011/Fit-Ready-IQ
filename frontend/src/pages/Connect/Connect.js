import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { getStravaAuthUrl, getGarminAuthUrl, getCorosAuthUrl } from '../../api/client';
import './Connect.css';

const SERVICES = [
  {
    key: 'strava',
    name: 'Strava',
    tagline: 'Running, cycling & triathlon data',
    icon: '🏃',
    color: '#FC4C02',
    gradient: 'linear-gradient(135deg, #FC4C02 0%, #e03e00 100%)',
    description:
      'Connect Strava to import your recent runs, hikes, and rides. FitReady IQ uses your activity history to calculate training load and weekly mileage.',
    metrics: ['Activity history', 'Weekly mileage', 'Elevation gain', 'Training load'],
  },
  {
    key: 'garmin',
    name: 'Garmin',
    tagline: 'Heart rate, HRV & health metrics',
    icon: '⌚',
    color: '#007CC3',
    gradient: 'linear-gradient(135deg, #007CC3 0%, #005f99 100%)',
    description:
      'Garmin provides your deep health metrics like HRV, resting heart rate, and sleep score — the most powerful inputs to your readiness calculation.',
    metrics: ['HRV (Heart Rate Variability)', 'Resting heart rate', 'Sleep score', 'Stress level'],
  },
  {
    key: 'coros',
    name: 'COROS',
    tagline: 'VO2 Max & wearable performance data',
    icon: '🎯',
    color: '#2ecc71',
    gradient: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)',
    description:
      'COROS wearables track your VO2 Max and recovery metrics with precision. Pair this data to refine your readiness score further.',
    metrics: ['VO2 Max estimate', 'Recovery score', 'Altitude adaptation', 'Fitness trend'],
  },
];

function ServiceCard({ service, isConnected, onConnect, loading }) {
  return (
    <div className={`service-card card ${isConnected ? 'service-card--connected' : ''}`}>
      <div className="service-card-header">
        <div className="service-brand" style={{ background: service.gradient }}>
          <span className="service-icon">{service.icon}</span>
          <div>
            <div className="service-name">{service.name}</div>
            <div className="service-tagline">{service.tagline}</div>
          </div>
        </div>
        {isConnected ? (
          <span className="service-status connected">✓ Connected</span>
        ) : (
          <span className="service-status pending">Not connected</span>
        )}
      </div>

      <p className="service-description">{service.description}</p>

      <div className="service-metrics">
        <div className="service-metrics-label">Data imported:</div>
        <ul>
          {service.metrics.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>

      <button
        className={`btn service-btn ${isConnected ? 'btn-ghost' : 'btn-secondary'}`}
        onClick={() => onConnect(service.key)}
        disabled={loading === service.key}
        style={
          !isConnected
            ? { background: service.color, borderColor: service.color, color: '#fff' }
            : {}
        }
      >
        {loading === service.key ? (
          <span className="btn-loading"><span className="spinner-sm" /> Redirecting…</span>
        ) : isConnected ? (
          '✓ Reconnect ' + service.name
        ) : (
          'Connect ' + service.name
        )}
      </button>
    </div>
  );
}

function Connect() {
  const { connected, markConnected, useMock } = useApp();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const getAuthUrl = { strava: getStravaAuthUrl, garmin: getGarminAuthUrl, coros: getCorosAuthUrl };

  const handleConnect = async (service) => {
    setError('');
    setLoading(service);
    try {
      const res = await getAuthUrl[service]();
      const url = res.data?.url;
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No OAuth URL returned');
      }
    } catch (err) {
      if (useMock) {
        // In mock mode simulate a successful connection
        markConnected(service);
        setError('');
        setTimeout(() => navigate('/dashboard'), 800);
      } else {
        setError(`Could not connect to ${service}. Please try again.`);
      }
    } finally {
      setLoading(null);
    }
  };

  const anyConnected = connected.strava || connected.garmin || connected.coros;

  return (
    <div className="page-container connect-page">
      <div className="connect-header">
        <h1 className="page-title">Connect Your Tracker</h1>
        <p className="page-subtitle">
          Link at least one fitness platform to start tracking your readiness score.
        </p>
        {useMock && (
          <div className="mock-banner">
            🔌 Demo mode — backend not detected. Connecting will simulate a successful link.
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="services-grid">
        {SERVICES.map((service) => (
          <ServiceCard
            key={service.key}
            service={service}
            isConnected={connected[service.key]}
            onConnect={handleConnect}
            loading={loading}
          />
        ))}
      </div>

      {anyConnected && (
        <div className="connect-footer">
          <p>You're connected! Head to your dashboard to see your readiness score.</p>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            Go to Dashboard →
          </button>
        </div>
      )}

      <div className="privacy-note">
        🔒 We only request read-only access to your fitness data. We never post or modify your
        activities, and you can revoke access at any time.
      </div>
    </div>
  );
}

export default Connect;
