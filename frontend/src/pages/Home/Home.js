import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import './Home.css';

const FEATURES = [
  {
    icon: '🎯',
    title: 'Readiness Score',
    desc: 'A single 0–100 score calculated from your VO2 Max, HRV, training load, and sleep quality.',
  },
  {
    icon: '🗺️',
    title: 'Route Matching',
    desc: 'Discover trails matched to your current fitness level — never over- or under-challenge yourself.',
  },
  {
    icon: '🎒',
    title: 'Gear Recommendations',
    desc: 'Get curated gear suggestions based on route difficulty, weather, and your activity type.',
  },
  {
    icon: '📊',
    title: 'Multi-Platform Sync',
    desc: 'Connect Strava, Garmin, or COROS to pull in real fitness data automatically.',
  },
];

const STATS = [
  { value: '50+', label: 'Trail Routes' },
  { value: '3',   label: 'Fitness Platforms' },
  { value: '12',  label: 'Score Metrics' },
  { value: '100', label: 'Readiness Points' },
];

function Home() {
  const { connected } = useApp();
  const anyConnected = connected.strava || connected.garmin || connected.coros;

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-blob blob-1" />
          <div className="hero-blob blob-2" />
        </div>
        <div className="page-container hero-content">
          <div className="hero-eyebrow">Your Fitness Intelligence Platform</div>
          <h1 className="hero-title">
            Know Your <span className="hero-accent">Readiness</span>
            <br />Before You Hit the Trail
          </h1>
          <p className="hero-subtitle">
            FitReady IQ syncs with Strava, Garmin, and COROS to calculate a
            real-time fitness readiness score — then matches you to trails and
            gear you're actually ready for.
          </p>
          <div className="hero-actions">
            {anyConnected ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg">
                View Dashboard
              </Link>
            ) : (
              <Link to="/connect" className="btn btn-primary btn-lg">
                Connect Your Tracker
              </Link>
            )}
            <Link to="/routes" className="btn btn-ghost btn-lg">
              Explore Routes
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="stats-bar">
        <div className="page-container stats-grid">
          {STATS.map((s) => (
            <div key={s.label} className="stat-item">
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <div className="page-container">
          <div className="section-label">What We Do</div>
          <h2 className="section-heading">Smart Fitness Intelligence</h2>
          <p className="section-subheading">
            Everything you need to train smart, explore confidently, and stay safe
            on every adventure.
          </p>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card card">
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-section">
        <div className="page-container">
          <div className="section-label">How It Works</div>
          <h2 className="section-heading">Three Simple Steps</h2>
          <div className="steps-grid">
            <div className="step">
              <div className="step-num">1</div>
              <h3>Connect Your Device</h3>
              <p>Link Strava, Garmin, or COROS with a single OAuth click.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-num">2</div>
              <h3>Get Your Score</h3>
              <p>We analyse your recent workouts, HRV, sleep, and training load.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-num">3</div>
              <h3>Hit the Trail</h3>
              <p>See matched routes and gear recommendations tuned to your score.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="page-container cta-inner">
          <h2 className="cta-title">Ready to Train Smarter?</h2>
          <p className="cta-sub">
            Connect your fitness tracker and get your personalised readiness score
            in under 60 seconds.
          </p>
          <Link to="/connect" className="btn btn-primary btn-lg">
            Get Started — It's Free
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Home;
