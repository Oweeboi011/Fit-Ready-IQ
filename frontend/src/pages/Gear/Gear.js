import React, { useState, useEffect } from 'react';
import GearList from '../../components/GearList/GearList';
import { getGear } from '../../api/client';
import './Gear.css';

const DIFFICULTIES = [
  { key: 'easy',     label: 'Easy',     icon: '🟢', desc: 'Day hike, flat terrain' },
  { key: 'moderate', label: 'Moderate', icon: '🔵', desc: 'Half-day hike, some elevation' },
  { key: 'hard',     label: 'Hard',     icon: '🟠', desc: 'Full-day hike, significant elevation' },
  { key: 'expert',   label: 'Expert',   icon: '🔴', desc: 'Multi-day / alpine expedition' },
];

const MOCK_GEAR = {
  easy: {
    categories: [
      {
        name: 'Footwear',
        items: [
          { name: 'Trail running shoes or light hiking boots', essential: true },
          { name: 'Moisture-wicking hiking socks', recommended: true },
        ],
      },
      {
        name: 'Clothing',
        items: [
          { name: 'Moisture-wicking t-shirt or base layer', essential: true },
          { name: 'Light windbreaker', recommended: true },
          { name: 'Sun hat', recommended: true },
        ],
      },
      {
        name: 'Hydration',
        items: [
          { name: '1–1.5L water bottle or hydration bladder', essential: true },
          { name: 'Electrolyte tablets', recommended: true },
        ],
      },
      {
        name: 'Navigation',
        items: [
          { name: 'Trail map (downloaded offline)', essential: true },
          { name: 'Smartphone with GPS app', recommended: true },
        ],
      },
    ],
  },
  moderate: {
    categories: [
      {
        name: 'Footwear',
        items: [
          { name: 'Mid-cut hiking boots (ankle support)', essential: true },
          { name: 'Gaiters (for muddy trails)', recommended: true },
          { name: 'Merino wool hiking socks', essential: true },
        ],
      },
      {
        name: 'Clothing',
        items: [
          { name: 'Moisture-wicking base layer', essential: true },
          { name: 'Insulating mid-layer (fleece)', recommended: true },
          { name: 'Waterproof shell jacket', essential: true },
          { name: 'Convertible hiking pants', recommended: true },
        ],
      },
      {
        name: 'Hydration & Nutrition',
        items: [
          { name: '2L hydration system', essential: true },
          { name: 'High-energy snacks (trail mix, bars)', essential: true },
          { name: 'Lunch / sandwich', recommended: true },
        ],
      },
      {
        name: 'Safety',
        items: [
          { name: 'First aid kit', essential: true },
          { name: 'Emergency whistle', essential: true },
          { name: 'Headlamp + spare batteries', recommended: true },
        ],
      },
      {
        name: 'Navigation',
        items: [
          { name: 'Topographic map', essential: true },
          { name: 'Compass', recommended: true },
          { name: 'GPS device or app (offline maps)', essential: true },
        ],
      },
    ],
  },
  hard: {
    categories: [
      {
        name: 'Footwear',
        items: [
          { name: 'Stiff-soled hiking boots (crampon-compatible)', essential: true },
          { name: 'Microspikes (season-dependent)', recommended: true },
          { name: 'Trekking poles', recommended: true },
        ],
      },
      {
        name: 'Layers',
        items: [
          { name: 'Thermal base layer (top & bottom)', essential: true },
          { name: 'Insulated mid-layer (down or synthetic)', essential: true },
          { name: 'Hard-shell waterproof jacket + pants', essential: true },
        ],
      },
      {
        name: 'Hydration & Nutrition',
        items: [
          { name: '3L hydration system + water filter', essential: true },
          { name: 'High-calorie trail food (6000+ kJ)', essential: true },
          { name: 'Emergency rations (extra day of food)', essential: true },
        ],
      },
      {
        name: 'Safety',
        items: [
          { name: 'Extended first aid kit', essential: true },
          { name: 'Personal Locator Beacon (PLB)', essential: true },
          { name: 'Emergency bivvy / space blanket', essential: true },
          { name: 'Satellite communicator', recommended: true },
        ],
      },
      {
        name: 'Navigation',
        items: [
          { name: 'Waterproof topographic map', essential: true },
          { name: 'Baseplate compass', essential: true },
          { name: 'GPS device with alpine maps', recommended: true },
        ],
      },
    ],
  },
  expert: {
    categories: [
      {
        name: 'Footwear',
        items: [
          { name: 'Double-boot mountaineering boots', essential: true },
          { name: '12-point crampons', essential: true },
          { name: 'Ice axe', essential: true },
          { name: 'Trekking poles with snow baskets', recommended: true },
        ],
      },
      {
        name: 'Shelter',
        items: [
          { name: '4-season tent or bivy system', essential: true },
          { name: 'Sub-zero sleeping bag (−15°C rating)', essential: true },
          { name: 'Sleeping pad (R-value 4+)', essential: true },
        ],
      },
      {
        name: 'Layers',
        items: [
          { name: 'Expedition-weight base layers', essential: true },
          { name: 'Heavyweight insulated jacket (850+ fill)', essential: true },
          { name: 'Gore-Tex hardshell (jacket + bib)', essential: true },
          { name: 'Waterproof insulated gloves + liners', essential: true },
          { name: 'Balaclava + goggles', essential: true },
        ],
      },
      {
        name: 'Safety & Communication',
        items: [
          { name: 'Personal Locator Beacon (PLB)', essential: true },
          { name: 'Satellite phone or Garmin inReach', essential: true },
          { name: 'Avalanche transceiver + probe + shovel', essential: true },
          { name: 'Wilderness first-aid kit', essential: true },
          { name: 'Rope (30m+ for rescue scenarios)', recommended: true },
        ],
      },
      {
        name: 'Navigation',
        items: [
          { name: '1:25,000 waterproof topo map', essential: true },
          { name: 'Lensatic compass', essential: true },
          { name: 'Dedicated GPS unit + spare batteries', essential: true },
          { name: 'Altimeter watch', recommended: true },
        ],
      },
    ],
  },
};

function Gear() {
  const [difficulty, setDifficulty] = useState('moderate');
  const [gear, setGear]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [options, setOptions]       = useState({ adverseWeather: false, snow: false, overnight: false });

  useEffect(() => {
    const fetchGear = async () => {
      setLoading(true);
      setGear(null);
      try {
        const params = { difficulty, ...options };
        const res = await getGear(params);
        const data = res.data;
        setGear(data && Object.keys(data).length ? data : MOCK_GEAR[difficulty]);
      } catch {
        setGear(MOCK_GEAR[difficulty] || MOCK_GEAR.moderate);
      } finally {
        setLoading(false);
      }
    };
    fetchGear();
  }, [difficulty, options]);

  const toggleOption = (key) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="page-container gear-page">
      <h1 className="page-title">Gear Recommendations</h1>
      <p className="page-subtitle">
        Curated gear lists based on route difficulty and conditions.
      </p>

      <div className="gear-controls card">
        <div className="gear-diff-group">
          <label className="gear-group-label">Route Difficulty</label>
          <div className="gear-diff-buttons">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                className={`diff-btn ${difficulty === d.key ? 'active' : ''}`}
                onClick={() => setDifficulty(d.key)}
              >
                <span>{d.icon}</span>
                <div>
                  <div className="diff-label">{d.label}</div>
                  <div className="diff-desc">{d.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="gear-option-group">
          <label className="gear-group-label">Conditions</label>
          <div className="gear-options">
            {[
              { key: 'adverseWeather', label: '🌧️ Adverse Weather' },
              { key: 'snow',           label: '❄️ Snow / Ice' },
              { key: 'overnight',      label: '⛺ Overnight Stay' },
            ].map((opt) => (
              <label key={opt.key} className="gear-option-toggle">
                <input
                  type="checkbox"
                  checked={options[opt.key]}
                  onChange={() => toggleOption(opt.key)}
                />
                <span className="toggle-track" />
                <span className="toggle-label">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="gear-results">
        <div className="section-header">
          <h2 className="section-title">
            Recommended Gear
            <span className={`badge badge-${difficulty} gear-badge`}>
              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="loading-spinner">
            <div className="spinner" />
            <span>Loading gear list…</span>
          </div>
        ) : (
          <GearList gear={gear} />
        )}
      </div>
    </div>
  );
}

export default Gear;
