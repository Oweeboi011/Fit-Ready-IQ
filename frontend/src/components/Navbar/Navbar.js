import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import './Navbar.css';

function Navbar() {
  const { user, logout, connected } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const anyConnected = connected.strava || connected.garmin || connected.coros;

  const handleLogout = () => {
    logout();
    navigate('/');
    setMenuOpen(false);
  };

  const close = () => setMenuOpen(false);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand" onClick={close}>
          <span className="brand-icon">⚡</span>
          <span className="brand-name">FitReady<span className="brand-iq"> IQ</span></span>
        </Link>

        <button
          className={`navbar-toggle ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <span /><span /><span />
        </button>

        <div className={`navbar-links ${menuOpen ? 'open' : ''}`}>
          <NavLink to="/"          end onClick={close}>Home</NavLink>
          <NavLink to="/connect"       onClick={close}>Connect</NavLink>
          {anyConnected && (
            <>
              <NavLink to="/dashboard"   onClick={close}>Dashboard</NavLink>
              <NavLink to="/routes"      onClick={close}>Routes</NavLink>
              <NavLink to="/gear"        onClick={close}>Gear</NavLink>
              <NavLink to="/score"       onClick={close}>Score</NavLink>
            </>
          )}
        </div>

        <div className="navbar-actions">
          {user ? (
            <div className="navbar-user">
              <span className="user-name">{user.name || user.email}</span>
              <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <Link to="/connect" className="btn btn-primary btn-sm" onClick={close}>
              Get Started
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
