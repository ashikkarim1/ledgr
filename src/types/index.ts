/**
 * Ledgr Dashboard Types
 * Core TypeScript interfaces for the dashboard system
 */

export type UserRole = 
  | 'client-admin' 
  | 'accountant' 
  | 'cfo' 
  | 'agent-manager' 
  | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  organization: string;
}

export interface Organization {
  id: string;
  name: string;
  logo?: string;
  plan: 'starter' | 'pro' | 'enterprise';
  users: User[];
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'standby' | 'offline';
  currentTask?: string;
  confidence: number;
  accuracy: number;
  completedItems: number;
}

export interface FinancialMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  status?: 'healthy' | 'warning' | 'critical';
}

export interface Transaction {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  category: string;
  status: 'posted' | 'pending' | 'failed';
}

export interface Integration {
  id: string;
  name: string;
  status: 'connected' | 'syncing' | 'failed' | 'disconnected';
  lastSync?: string;
  itemCount?: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  details?: string;
  status: 'success' | 'failure';
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed';
  assignee?: string;
  dueDate?: string;
}

export interface ActivityItem {
  id: string;
  agent: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  roles: UserRole[];
  badge?: number;
}
