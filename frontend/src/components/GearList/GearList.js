import React, { useState } from 'react';
import './GearList.css';

const CATEGORY_ICONS = {
  footwear:    '👟',
  clothing:    '👕',
  navigation:  '🗺️',
  safety:      '⛑️',
  hydration:   '💧',
  nutrition:   '🥜',
  shelter:     '⛺',
  tools:       '🔧',
  electronics: '📱',
  layers:      '🧥',
  default:     '🎒',
};

function GearSection({ category, items }) {
  const [expanded, setExpanded] = useState(true);
  const icon = CATEGORY_ICONS[category.toLowerCase()] || CATEGORY_ICONS.default;

  return (
    <div className="gear-section">
      <button className="gear-section-header" onClick={() => setExpanded((v) => !v)}>
        <span className="gear-section-icon">{icon}</span>
        <span className="gear-section-title">{category}</span>
        <span className="gear-section-count">{items.length} items</span>
        <span className={`gear-chevron ${expanded ? 'open' : ''}`}>▾</span>
      </button>

      {expanded && (
        <ul className="gear-items">
          {items.map((item, idx) => (
            <li key={idx} className="gear-item">
              <div className="gear-item-main">
                <span className="gear-item-name">{item.name || item}</span>
                {item.essential && <span className="gear-essential">Essential</span>}
                {item.recommended && <span className="gear-recommended">Recommended</span>}
              </div>
              {item.description && (
                <p className="gear-item-desc">{item.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GearList({ gear }) {
  if (!gear || Object.keys(gear).length === 0) {
    return (
      <div className="gear-empty">
        <span className="gear-empty-icon">🎒</span>
        <p>No gear recommendations available.</p>
        <p>Select a difficulty level to see suggested gear.</p>
      </div>
    );
  }

  // gear may be { categories: [...] } or a flat object keyed by category
  const sections = gear.categories
    ? gear.categories
    : Object.entries(gear)
        .filter(([, v]) => Array.isArray(v) && v.length > 0)
        .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), items: v }));

  if (sections.length === 0) {
    return (
      <div className="gear-empty">
        <span className="gear-empty-icon">🎒</span>
        <p>No gear data to display.</p>
      </div>
    );
  }

  return (
    <div className="gear-list">
      {sections.map((section, idx) => (
        <GearSection
          key={idx}
          category={section.name || section.category || `Category ${idx + 1}`}
          items={section.items || []}
        />
      ))}
    </div>
  );
}

export default GearList;
