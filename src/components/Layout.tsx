/**
 * Layout Component
 * Main dashboard layout wrapper with sidebar, topbar, and content area
 */

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import '../styles/layout.css';

interface LayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  showSidebar = true,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLargeScreen, setIsLargeScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  // Handle responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      const large = window.innerWidth >= 1024;
      setIsLargeScreen(large);
      if (!large) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on small screens by default
  useEffect(() => {
    if (!isLargeScreen) {
      setIsSidebarOpen(false);
    }
  }, [isLargeScreen]);

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      {showSidebar && (
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className={`dashboard-layout__main ${!showSidebar ? 'dashboard-layout__main--no-sidebar' : ''}`}>
        {/* Top Bar */}
        <TopBar onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />

        {/* Content Area */}
        <main className="dashboard-layout__content" role="main">
          {children}
        </main>
      </div>
    </div>
  );
};
