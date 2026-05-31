/**
 * TopBar Component
 * Top navigation with search, notifications, help, and settings
 */

import React, { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useSearch } from '../hooks/useSearch';
import '../styles/layout.css';

interface TopBarProps {
  onMenuClick?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuClick }) => {
  const { isDarkMode, toggleDarkMode } = useDashboard();
  const { isOpen: isSearchOpen, setIsOpen: setIsSearchOpen, query, setQuery, results } = useSearch();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const unreadNotifications = 3;

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          {/* Left */}
          <div className="topbar__left">
            <button
              className="topbar__menu-btn"
              onClick={onMenuClick}
              aria-label="Toggle navigation menu"
            >
              ☰
            </button>

            {/* Search */}
            <div className="topbar__search">
              <input
                type="text"
                className="topbar__search-input"
                placeholder="Search... (Cmd+K)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsSearchOpen(true)}
                aria-label="Search dashboard"
              />
              <span className="topbar__search-icon">🔍</span>

              {/* Search Results Dropdown */}
              {isSearchOpen && query && (
                <div className="topbar__search-results">
                  {results.length > 0 ? (
                    results.map((result, index) => (
                      <button
                        key={result.id}
                        className={`topbar__search-result ${
                          index === 0 ? 'topbar__search-result--selected' : ''
                        }`}
                        onClick={() => {
                          window.location.href = result.path;
                          setIsSearchOpen(false);
                          setQuery('');
                        }}
                      >
                        <span className="topbar__search-result-type">{result.type}</span>
                        <span className="topbar__search-result-title">{result.title}</span>
                      </button>
                    ))
                  ) : (
                    <div className="topbar__search-empty">No results found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="topbar__right">
            {/* Notifications */}
            <div className="topbar__menu">
              <button
                className="topbar__icon-btn"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notifications"
                aria-expanded={showNotifications}
              >
                🔔
                {unreadNotifications > 0 && (
                  <span className="topbar__badge">{unreadNotifications}</span>
                )}
              </button>

              {showNotifications && (
                <div className="topbar__dropdown">
                  <div className="topbar__dropdown-header">Notifications</div>
                  <div className="topbar__dropdown-item">
                    <span className="topbar__notification-dot"></span>
                    Reconciliation completed
                  </div>
                  <div className="topbar__dropdown-item">
                    <span className="topbar__notification-dot"></span>
                    2 invoices need approval
                  </div>
                  <div className="topbar__dropdown-item">
                    <span className="topbar__notification-dot"></span>
                    Integration synced successfully
                  </div>
                </div>
              )}
            </div>

            {/* Help */}
            <div className="topbar__menu">
              <button
                className="topbar__icon-btn"
                onClick={() => setShowHelp(!showHelp)}
                aria-label="Help and support"
                aria-expanded={showHelp}
              >
                ?
              </button>

              {showHelp && (
                <div className="topbar__dropdown topbar__dropdown--right">
                  <a href="#" className="topbar__dropdown-item">
                    Help Centre
                  </a>
                  <a href="#" className="topbar__dropdown-item">
                    Documentation
                  </a>
                  <a href="#" className="topbar__dropdown-item">
                    Contact Support
                  </a>
                  <div className="topbar__dropdown-divider"></div>
                  <a href="#" className="topbar__dropdown-item">
                    Keyboard Shortcuts
                  </a>
                </div>
              )}
            </div>

            {/* Dark Mode Toggle */}
            <button
              className="topbar__icon-btn"
              onClick={toggleDarkMode}
              aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>

            {/* Settings */}
            <a href="/settings" className="topbar__icon-btn" aria-label="Settings">
              ⚙️
            </a>
          </div>
        </div>
      </header>

      {/* Close search on outside click */}
      {isSearchOpen && (
        <div
          className="topbar__search-overlay"
          onClick={() => setIsSearchOpen(false)}
        ></div>
      )}
    </>
  );
};
