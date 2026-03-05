import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import RouteCard from '../../components/RouteCard/RouteCard';
import { getRoutes, matchRoutes } from '../../api/client';
import './Routes.css';

const DIFFICULTIES = ['All', 'Easy', 'Moderate', 'Hard', 'Expert'];

const MOCK_TRAILS = [
  {
    id: 1, name: 'Sunset Ridge Trail', difficulty: 'easy', distance: 8200,
    elevationGain: 240, estimatedTime: '2h 30m', region: 'Blue Mountains',
    description: 'A gentle loop with sweeping valley views. Perfect for beginners or active recovery days.',
    tags: ['Loop', 'Views', 'Dog-friendly'],
  },
  {
    id: 2, name: 'Eagle Peak Summit', difficulty: 'hard', distance: 18500,
    elevationGain: 1420, estimatedTime: '6–8h', region: 'Alpine National Park',
    description: 'A challenging ascent to a 2,100m summit with technical scrambling near the top.',
    tags: ['Summit', 'Scramble', 'Exposed'],
  },
  {
    id: 3, name: 'Forest River Circuit', difficulty: 'moderate', distance: 12400,
    elevationGain: 520, estimatedTime: '3h 45m', region: 'Dandenong Ranges',
    description: 'Lush fern gully trail with two creek crossings. Great training ground for intermediate hikers.',
    tags: ['Circuit', 'Waterfall', 'Shaded'],
  },
  {
    id: 4, name: 'Coastal Cliffs Walk', difficulty: 'easy', distance: 5800,
    elevationGain: 115, estimatedTime: '1h 30m', region: 'Mornington Peninsula',
    description: 'A breezy clifftop walk with stunning ocean views. Ideal for fitness walks or active recovery.',
    tags: ['Coastal', 'Out & Back', 'Accessible'],
  },
  {
    id: 5, name: 'Granite Tor Circuit', difficulty: 'expert', distance: 24000,
    elevationGain: 2200, estimatedTime: '8–10h', region: 'Mount Buffalo',
    description: 'An epic full-day traverse over exposed granite tors. Requires excellent navigation skills.',
    tags: ['Epic', 'Navigation', 'Alpine'],
  },
  {
    id: 6, name: 'Waterfall Gully Run', difficulty: 'moderate', distance: 9600,
    elevationGain: 680, estimatedTime: '2h 45m', region: 'Adelaide Hills',
    description: 'A popular trail run route with five waterfalls and a summit lookout.',
    tags: ['Run-friendly', 'Waterfall', 'Lookout'],
  },
];

function Routes() {
  const { score, useMock } = useApp();
  const [difficulty, setDifficulty] = useState('All');
  const [trails, setTrails]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [matching, setMatching]     = useState(false);
  const [matched, setMatched]       = useState(false);
  const [error, setError]           = useState('');

  const loadRoutes = useCallback(async (diff) => {
    setLoading(true);
    setMatched(false);
    setError('');
    try {
      const params = diff && diff !== 'All' ? { difficulty: diff.toLowerCase() } : {};
      const res = await getRoutes(params);
      const list = res.data?.trails || res.data || [];
      setTrails(list.length ? list : MOCK_TRAILS);
    } catch {
      const filtered = diff === 'All'
        ? MOCK_TRAILS
        : MOCK_TRAILS.filter((t) => t.difficulty === diff.toLowerCase());
      setTrails(filtered);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes(difficulty);
  }, [difficulty, loadRoutes]);

  const handleMatch = async () => {
    const fitnessScore = score?.score ?? 70;
    setMatching(true);
    setError('');
    try {
      const res = await matchRoutes(fitnessScore);
      const list = res.data?.matches || [];
      setTrails(list.length ? list : MOCK_TRAILS);
      setMatched(true);
      setDifficulty('All');
    } catch {
      // Mock matching: filter by score tier
      const tier =
        fitnessScore >= 80 ? ['hard', 'expert'] :
        fitnessScore >= 60 ? ['moderate', 'hard'] :
        fitnessScore >= 40 ? ['easy', 'moderate'] :
        ['easy'];

      const filtered = MOCK_TRAILS.filter((t) => tier.includes(t.difficulty))
        .map((t) => ({ ...t, matchScore: fitnessScore - 5 + Math.random() * 10 }));
      setTrails(filtered);
      setMatched(true);
      setDifficulty('All');
    } finally {
      setMatching(false);
    }
  };

  const displayedTrails =
    difficulty === 'All'
      ? trails
      : trails.filter((t) => (t.difficulty || '').toLowerCase() === difficulty.toLowerCase());

  return (
    <div className="page-container routes-page">
      <h1 className="page-title">Trail Routes</h1>
      <p className="page-subtitle">
        Discover trails matched to your fitness level, or browse by difficulty.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="routes-toolbar">
        <div className="difficulty-filters">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={`filter-btn ${difficulty === d ? 'active' : ''}`}
              onClick={() => setDifficulty(d)}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary match-btn"
          onClick={handleMatch}
          disabled={matching}
        >
          {matching ? (
            <><span className="spinner-sm" /> Matching…</>
          ) : (
            '🎯 Match to My Fitness'
          )}
        </button>
      </div>

      {matched && (
        <div className="match-banner">
          ✅ Showing routes matched to your readiness score of{' '}
          <strong>{score?.score ?? 70}</strong>.
          <button className="match-clear" onClick={() => loadRoutes('All')}>
            Clear ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Loading routes…</span>
        </div>
      ) : displayedTrails.length === 0 ? (
        <div className="routes-empty card">
          <span>🗺️</span>
          <p>No routes found for this filter. Try a different difficulty.</p>
        </div>
      ) : (
        <div className="routes-grid">
          {displayedTrails.map((trail) => (
            <RouteCard key={trail.id || trail.name} trail={trail} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Routes;
