/**
 * Sidebar Component
 * Left navigation with role-based menu items
 */

import React from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useNavigation } from '../hooks/useNavigation';
import '../styles/layout.css';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { currentUser, currentPage, setCurrentPage, currentOrg } = useDashboard();
  const navigation = useNavigation(currentUser?.role || 'viewer');

  if (!currentUser) return null;

  const handleNavigate = (pageId: string, path: string) => {
    setCurrentPage(pageId);
    if (onClose) onClose();
    // In a real app, use router.push(path)
    window.location.pathname = path;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="sidebar__overlay"
          onClick={onClose}
          aria-hidden="true"
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
        {/* Header */}
        <div className="sidebar__header">
          <div className="sidebar__logo">
            <span className="sidebar__logo-icon">L</span>
            <span className="sidebar__logo-text">Ledgr</span>
          </div>
          <button
            className="sidebar__close"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Organization Switcher */}
        {currentOrg && (
          <div className="sidebar__org">
            <div className="sidebar__org-label">Organization</div>
            <button className="sidebar__org-button">
              <span className="sidebar__org-logo">
                {currentOrg.logo ? (
                  <img src={currentOrg.logo} alt={currentOrg.name} />
                ) : (
                  currentOrg.name.charAt(0)
                )}
              </span>
              <span className="sidebar__org-name">{currentOrg.name}</span>
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar__nav" role="navigation" aria-label="Main navigation">
          {navigation.map(item => (
            <button
              key={item.id}
              className={`sidebar__nav-item ${
                currentPage === item.id ? 'sidebar__nav-item--active' : ''
              }`}
              onClick={() => handleNavigate(item.id, item.path)}
              aria-current={currentPage === item.id ? 'page' : undefined}
            >
              <span className="sidebar__nav-icon">{item.icon}</span>
              <span className="sidebar__nav-label">{item.label}</span>
              {item.badge ? (
                <span className="sidebar__nav-badge">{item.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* User Profile */}
        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__user-avatar">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name} />
              ) : (
                currentUser.name.split(' ').map(n => n[0]).join('')
              )}
            </div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{currentUser.name}</div>
              <div className="sidebar__user-role">{currentUser.role}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
