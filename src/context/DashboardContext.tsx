/**
 * Dashboard Context Provider
 * Manages global state for user, organization, navigation, and theme
 */

import React, { 
  createContext, 
  useContext, 
  useState, 
  useCallback,
  ReactNode 
} from 'react';
import { User, Organization, UserRole } from '../types';

interface DashboardContextType {
  currentUser: User | null;
  currentOrg: Organization | null;
  setCurrentUser: (user: User | null) => void;
  setCurrentOrg: (org: Organization | null) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export interface DashboardProviderProps {
  children: ReactNode;
}

export const DashboardProvider: React.FC<DashboardProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => {
      const newValue = !prev;
      localStorage.setItem('ledgr-dark-mode', String(newValue));
      document.documentElement.classList.toggle('dark', newValue);
      return newValue;
    });
  }, []);

  const value: DashboardContextType = {
    currentUser,
    currentOrg,
    setCurrentUser,
    setCurrentOrg,
    isDarkMode,
    toggleDarkMode,
    isSidebarOpen,
    setSidebarOpen: setIsSidebarOpen,
    currentPage,
    setCurrentPage,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return context;
};
