/**
 * useNavigation Hook
 * Provides role-based navigation items
 */

import { useMemo } from 'react';
import { UserRole, NavigationItem } from '../types';

const NAVIGATION_MAP: Record<UserRole, NavigationItem[]> = {
  'client-admin': [
    { id: 'dashboard', label: 'Dashboard', path: '/', icon: '📊', roles: ['client-admin'] },
    { id: 'financial', label: 'Financial Dashboard', path: '/financial', icon: '💰', roles: ['client-admin'] },
    { id: 'team', label: 'Team Members', path: '/team', icon: '👥', roles: ['client-admin'] },
    { id: 'agents', label: 'Agents', path: '/agents', icon: '🤖', roles: ['client-admin'] },
    { id: 'integrations', label: 'Integrations', path: '/integrations', icon: '🔗', roles: ['client-admin'] },
    { id: 'billing', label: 'Billing', path: '/billing', icon: '💳', roles: ['client-admin'] },
    { id: 'audit', label: 'Audit Log', path: '/audit', icon: '📋', roles: ['client-admin'] },
    { id: 'settings', label: 'Settings', path: '/settings', icon: '⚙️', roles: ['client-admin'] },
  ],
  'accountant': [
    { id: 'dashboard', label: 'Dashboard', path: '/', icon: '📊', roles: ['accountant'] },
    { id: 'financial', label: 'Financial Dashboard', path: '/financial', icon: '💰', roles: ['accountant'] },
    { id: 'transactions', label: 'Transactions', path: '/transactions', icon: '📝', roles: ['accountant'] },
    { id: 'reconciliation', label: 'Reconciliation', path: '/reconciliation', icon: '✓', roles: ['accountant'] },
    { id: 'reporting', label: 'Reporting', path: '/reporting', icon: '📈', roles: ['accountant'] },
    { id: 'settings', label: 'Settings', path: '/settings', icon: '⚙️', roles: ['accountant'] },
  ],
  'cfo': [
    { id: 'dashboard', label: 'Dashboard', path: '/', icon: '📊', roles: ['cfo'] },
    { id: 'financial', label: 'Financial Dashboard', path: '/financial', icon: '💰', roles: ['cfo'] },
    { id: 'transactions', label: 'Transactions', path: '/transactions', icon: '📝', roles: ['cfo'] },
    { id: 'reconciliation', label: 'Reconciliation', path: '/reconciliation', icon: '✓', roles: ['cfo'] },
    { id: 'reporting', label: 'Reporting', path: '/reporting', icon: '📈', roles: ['cfo'] },
    { id: 'settings', label: 'Settings', path: '/settings', icon: '⚙️', roles: ['cfo'] },
  ],
  'agent-manager': [
    { id: 'dashboard', label: 'Dashboard', path: '/', icon: '📊', roles: ['agent-manager'] },
    { id: 'agents', label: 'Agents', path: '/agents', icon: '🤖', roles: ['agent-manager'] },
    { id: 'queue', label: 'Task Queue', path: '/queue', icon: '📋', roles: ['agent-manager'] },
    { id: 'performance', label: 'Performance', path: '/performance', icon: '📈', roles: ['agent-manager'] },
    { id: 'settings', label: 'Settings', path: '/settings', icon: '⚙️', roles: ['agent-manager'] },
  ],
  'viewer': [
    { id: 'dashboard', label: 'Dashboard', path: '/', icon: '📊', roles: ['viewer'] },
    { id: 'financial', label: 'Financial Dashboard', path: '/financial', icon: '💰', roles: ['viewer'] },
  ],
};

export const useNavigation = (userRole: UserRole): NavigationItem[] => {
  return useMemo(() => {
    return NAVIGATION_MAP[userRole] || NAVIGATION_MAP['viewer'];
  }, [userRole]);
};

export const getAllNavigationItems = (): NavigationItem[] => {
  const all: NavigationItem[] = [];
  const seen = new Set<string>();
  
  Object.values(NAVIGATION_MAP).forEach(items => {
    items.forEach(item => {
      if (!seen.has(item.id)) {
        all.push(item);
        seen.add(item.id);
      }
    });
  });
  
  return all;
};
