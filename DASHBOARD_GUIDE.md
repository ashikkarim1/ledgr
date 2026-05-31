# Ledgr Dashboard Component Guide

## Overview

The Ledgr Dashboard is a comprehensive React-based interface for autonomous finance platform management. Built with TypeScript, React Context API, and custom hooks, it provides role-based access to financial operations, agent management, team collaboration, and system integrations.

**Key Features:**
- 5 user roles with role-specific navigation and permissions
- Real-time financial metrics and performance tracking
- AI agent management and monitoring
- Team member management
- Integration hub for accounting software
- Billing and subscription management
- Comprehensive audit logging
- Dark mode support
- Mobile-responsive design
- Global search with Cmd+K shortcut
- WCAG 2.1 AA accessibility compliance

## Project Structure

```
src/
├── types/
│   └── index.ts                 # TypeScript interfaces and types
├── context/
│   └── DashboardContext.tsx      # Global state management
├── hooks/
│   ├── useNavigation.ts          # Role-based navigation
│   └── useSearch.ts              # Global search functionality
├── components/
│   ├── Layout.tsx                # Main layout wrapper
│   ├── Sidebar.tsx               # Navigation sidebar
│   ├── TopBar.tsx                # Top navigation bar
│   ├── MetricCard.tsx            # KPI metric card
│   ├── AgentCard.tsx             # Agent status card
│   └── UserTable.tsx             # Reusable user table
├── pages/
│   ├── Dashboard.tsx             # Main overview dashboard
│   ├── FinancialDashboard.tsx    # Financial metrics & transactions
│   ├── Agents.tsx                # Agent management
│   ├── TeamMembers.tsx           # Team management
│   ├── Integrations.tsx          # Integration hub
│   ├── Billing.tsx               # Billing & subscriptions
│   └── AuditLog.tsx              # System audit log
└── styles/
    ├── layout.css                # Sidebar and TopBar styles
    ├── components.css            # Reusable component styles
    └── pages.css                 # Page-specific styles
```

## Type System

### Core Types (`src/types/index.ts`)

#### User Roles
```typescript
type UserRole = 'client-admin' | 'accountant' | 'cfo' | 'agent-manager' | 'viewer'
```

#### User Interface
```typescript
interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
  organization: string
}
```

#### Agent Interface
```typescript
interface Agent {
  id: string
  name: string
  role: string
  status: 'active' | 'standby' | 'offline'
  currentTask?: string
  accuracy: number
  completedItems: number
  confidence: number
}
```

#### Financial Metric Interface
```typescript
interface FinancialMetric {
  id: string
  label: string
  value: number
  unit?: string
  trend?: { direction: 'up' | 'down' | 'neutral'; percentage: number }
  status: 'healthy' | 'warning' | 'critical'
}
```

See `src/types/index.ts` for complete interface definitions including Organization, Transaction, Integration, AuditLogEntry, and more.

## Context & State Management

### DashboardContext (`src/context/DashboardContext.tsx`)

Global state management for dashboard state, user, and theme.

**State Structure:**
```typescript
{
  currentUser: User | null
  currentOrg: Organization | null
  isDarkMode: boolean
  isSidebarOpen: boolean
  currentPage: string
}
```

**Usage:**
```typescript
import { useDashboard } from '@/context/DashboardContext'

function MyComponent() {
  const { currentUser, isDarkMode, toggleDarkMode } = useDashboard()
  // ...
}
```

**Key Methods:**
- `setCurrentUser(user)` - Set authenticated user
- `setCurrentOrg(org)` - Switch organization context
- `toggleDarkMode()` - Toggle dark/light theme
- `toggleSidebar()` - Open/close sidebar
- `setCurrentPage(page)` - Update active page

## Custom Hooks

### useNavigation (`src/hooks/useNavigation.ts`)

Provides role-based navigation items for the current user.

**Usage:**
```typescript
import { useNavigation } from '@/hooks/useNavigation'

function SidebarNav() {
  const { getNavigationItems } = useNavigation()
  const items = getNavigationItems(userRole)
  // items: NavigationItem[]
}
```

**Navigation Structure by Role:**

| Role | Menu Items |
|------|-----------|
| client-admin | Dashboard, Financial Dashboard, Team Members, Agents, Integrations, Billing, Audit Log, Settings |
| accountant | Dashboard, Financial Dashboard, Transactions, Reconciliation, Reporting, Settings |
| cfo | Dashboard, Financial Dashboard, Transactions, Reconciliation, Reporting, Settings |
| agent-manager | Dashboard, Agents, Task Queue, Performance, Settings |
| viewer | Dashboard, Financial Dashboard |

### useSearch (`src/hooks/useSearch.ts`)

Global search functionality with Cmd+K keyboard shortcut.

**Features:**
- Keyboard shortcut support (Cmd+K / Ctrl+K)
- Arrow key navigation through results
- Type-based result filtering
- Result selection with Enter key

**Usage:**
```typescript
import { useSearch } from '@/hooks/useSearch'

function SearchBox() {
  const { isOpen, query, results, handleSearch, handleSelect } = useSearch()
  
  return (
    <input
      value={query}
      onChange={(e) => handleSearch(e.target.value)}
      onKeyDown={(e) => handleKeyDown(e)}
    />
  )
}
```

**Result Types:**
- `page` - Dashboard pages
- `transaction` - Financial transactions
- `agent` - AI agents
- `document` - Help documentation

## Layout Components

### Layout (`src/components/Layout.tsx`)

Main wrapper component combining sidebar, top bar, and content area.

**Props:**
```typescript
interface LayoutProps {
  children: React.ReactNode
  showSidebar?: boolean  // default: true
}
```

**Features:**
- Responsive sidebar (fixed on desktop, floating on mobile)
- Sticky top bar
- Scrollable content area
- Auto-collapse sidebar on screens < 1024px
- Resize event listener for responsive behavior

**Usage:**
```typescript
<Layout showSidebar={true}>
  <Dashboard />
</Layout>
```

### Sidebar (`src/components/Sidebar.tsx`)

Left navigation sidebar with role-based menu items.

**Features:**
- Logo and branding
- Organization switcher dropdown
- Role-based navigation items
- User profile section with avatar
- Active state highlighting
- Mobile close button

**Key Elements:**
- Header: Logo, close button (mobile)
- Nav switcher: Current organization with dropdown
- Navigation: Role-specific menu items
- User profile: Avatar, name, role

**CSS Classes:**
- `.sidebar` - Main container
- `.sidebar__header` - Logo and close button
- `.sidebar__nav` - Navigation menu
- `.sidebar__nav-item` - Individual menu item
- `.sidebar__nav-item--active` - Active state
- `.sidebar__user` - User profile section

### TopBar (`src/components/TopBar.tsx`)

Sticky header with search, notifications, help, and theme toggle.

**Features:**
- Global search with Cmd+K hint
- Notification center with badge
- Help dropdown menu
- Dark mode toggle
- Settings link
- Mobile-responsive menu button

**Right Side Components:**
- Menu button (mobile only)
- Search input with results dropdown
- Notifications dropdown
- Help dropdown (Centre, Documentation, Support, Shortcuts)
- Theme toggle (☀️/🌙)
- Settings link

**CSS Classes:**
- `.topbar` - Main header
- `.topbar__left` - Left section
- `.topbar__right` - Right section
- `.topbar__search` - Search input
- `.topbar__dropdown` - Dropdown menus

## Reusable Components

### MetricCard (`src/components/MetricCard.tsx`)

KPI card component for displaying financial metrics.

**Props:**
```typescript
interface MetricCardProps {
  metric: FinancialMetric
  onClick?: () => void
  className?: string
}
```

**Displays:**
- Label (uppercase)
- Value with unit
- Trend indicator (up/down/neutral with %)
- Status badge (healthy/warning/critical)

**Hover Effects:**
- Border color changes to accent
- Box shadow added
- Slight upward transform

**Example:**
```typescript
<MetricCard
  metric={{
    id: 'cash',
    label: 'Cash Available',
    value: 245000,
    unit: 'AED',
    trend: { direction: 'up', percentage: 12 },
    status: 'healthy'
  }}
/>
```

### AgentCard (`src/components/AgentCard.tsx`)

AI agent status and performance card.

**Props:**
```typescript
interface AgentCardProps {
  agent: Agent
  onClick?: () => void
  className?: string
}
```

**Displays:**
- Agent name and role
- Status badge (Active/Standby/Offline) with pulse dot
- Current task
- Three stats: Accuracy %, Completed items, Confidence %
- Confidence progress bar

**Status Styles:**
- Active: Green with animated pulse
- Standby: Orange
- Offline: Gray

**Example:**
```typescript
<AgentCard
  agent={{
    id: 'agent-1',
    name: 'Finance Bot',
    role: 'Reconciliation',
    status: 'active',
    currentTask: 'Processing invoices',
    accuracy: 99.2,
    completedItems: 1250,
    confidence: 97.5
  }}
/>
```

### UserTable (`src/components/UserTable.tsx`)

Reusable table component for displaying user lists.

**Props:**
```typescript
interface UserTableProps {
  users: User[]
  onSelectUser?: (user: User) => void
  columns?: Array<'name' | 'email' | 'role' | 'status'>
}
```

**Features:**
- Grid-based layout for responsiveness
- Hover state highlighting
- Avatar display with initials fallback
- Role badge styling
- Status indicators
- Optional row selection

## Page Components

### Dashboard (`src/pages/Dashboard.tsx`)

Main overview page with metrics, agents, and activity feed.

**Sections:**
1. **Metrics Grid** - 4 KPI cards (Cash Available, Receivables, Payables, Days to Close)
2. **Agents Grid** - Active AI agents with status
3. **Activity Feed** - Recent system actions
4. **CTA Card** - Links to Agents and Financial Dashboard

**Responsive:** Auto-fit grid layout (minmax 260px)

### FinancialDashboard (`src/pages/FinancialDashboard.tsx`)

Detailed financial overview with transactions and performance.

**Sections:**
1. **Financial Metrics** - Revenue YTD, Expenses, Net Margin, Close Completion
2. **Close Status** - Transaction processing, reconciliation, tax, statements
3. **Recent Transactions** - Table with Date, Vendor, Category, Amount, Status
4. **Performance Cards** - Errors caught, items flagged, violations prevented, time saved

**Table Columns:** Date | Vendor | Category | Amount | Status

### Agents (`src/pages/Agents.tsx`)

Agent management and configuration page.

**Sections:**
1. **Active Agents** - Currently running agents
2. **Standby Agents** - Idle agents
3. **Agent Configuration** (on selection):
   - Confidence Threshold slider
   - Auto-escalation Amount input
   - Permission checkboxes (transactions, reconciliation, approvals)
4. **Team Statistics** - Accuracy, Completed items, Active tasks, Confidence

**Actions:**
- Deploy New Agent button
- Agent selection for configuration

### TeamMembers (`src/pages/TeamMembers.tsx`)

Team member management with invitations and role assignment.

**Sections:**
1. **Team Members List** - User table with name, email, role, status
2. **Add Team Member** - Invite form with email and role selection
3. **Pending Invitations** - Table showing sent invitations

### Integrations (`src/pages/Integrations.tsx`)

Integration hub for connecting accounting software and banking.

**Sections:**
1. **Connected Integrations** - List of active integrations with status
2. **Available Integrations** - QuickBooks, Xero, Banks, Payment gateways
3. **Integration Details** - Status, last sync, sync history
4. **Settings** - Sync frequency, permissions, data mapping

### Billing (`src/pages/Billing.tsx`)

Billing and subscription management.

**Sections:**
1. **Current Subscription** - Plan name, price, billing cycle
2. **Usage** - Feature usage vs. plan limits
3. **Billing History** - Invoice list with download links
4. **Payment Methods** - Saved cards with add/remove
5. **Upgrade/Downgrade** - Plan comparison and switching

### AuditLog (`src/pages/AuditLog.tsx`)

System audit and activity logging.

**Sections:**
1. **Audit Log Table** - Timestamp, User, Action, Resource, Status
2. **Filters** - By user, action type, date range, resource
3. **Export** - CSV/PDF export of audit logs
4. **Search** - Full-text search within logs

## Styling System

### Design Tokens

**Colors (CSS Custom Properties):**
```css
--accent: #FF5C00          /* Ledgr orange */
--surface: #FFFFFF         /* Primary background */
--paper: #F9F9F9          /* Secondary background */
--line: #E8E8E8           /* Borders */
--ink-1: #1A1A1A          /* Text primary */
--ink-2: #4A4A4A          /* Text secondary */
--ink-3: #7A7A7A          /* Text tertiary */
--success: #10B981        /* Success/positive */
--warning: #F59E0B        /* Warning/caution */
--critical: #EF4444       /* Error/critical */
```

**Dark Mode Variants:**
Dark mode automatically adjusts these colors when `isDarkMode` is true.

### Responsive Breakpoints

- **Mobile:** < 768px
- **Tablet:** 768px - 1023px
- **Desktop:** ≥ 1024px

**Key Behavior Changes:**
- Sidebar: Fixed → Floating overlay on mobile
- Search: Inline → Expands on focus
- Grids: Multi-column → Single column on mobile
- Tables: Grid layout → Scrollable on mobile

## Design Principles

### 1. Role-Based Access
All navigation, features, and permissions are determined by user role. Only accessible items appear in navigation.

### 2. Real-Time Updates
Dashboard metrics update in real-time. Agent status changes immediately reflect in UI.

### 3. Progressive Enhancement
Sidebar collapses on mobile but navigation remains accessible. Search works with keyboard shortcuts for power users.

### 4. Accessibility
- Semantic HTML structure
- ARIA labels for interactive elements
- Keyboard navigation throughout
- Color contrast meets WCAG AA standards
- Focus indicators visible on all interactive elements

### 5. Mobile-First Design
Responsive design starts with mobile and scales up. Navigation adapts, grids collapse, forms optimize for touch.

## Common Patterns

### Adding a New Page

1. Create `src/pages/NewPage.tsx`:
```typescript
import { useDashboard } from '@/context/DashboardContext'

export default function NewPage() {
  const { currentUser } = useDashboard()
  
  return (
    <div className="page page--new-page">
      <h1>New Page</h1>
      {/* Content */}
    </div>
  )
}
```

2. Add to navigation in `src/hooks/useNavigation.ts`:
```typescript
id: 'new-page',
label: 'New Page',
path: '/new-page',
icon: '📄',
roles: ['client-admin']
```

3. Update routing in main App component

### Adding a New Component

1. Create component in `src/components/`:
```typescript
interface NewComponentProps {
  data: any
  onClick?: () => void
  className?: string
}

export default function NewComponent({ data, onClick, className }: NewComponentProps) {
  return <div className={`new-component ${className || ''}`}>
    {/* Component markup */}
  </div>
}
```

2. Add styles to `src/styles/components.css`

3. Export from components index if needed

### Using Dark Mode

```typescript
import { useDashboard } from '@/context/DashboardContext'

function MyComponent() {
  const { isDarkMode, toggleDarkMode } = useDashboard()
  
  return (
    <button onClick={toggleDarkMode}>
      {isDarkMode ? '☀️' : '🌙'}
    </button>
  )
}
```

## Performance Optimization

### Code Splitting
Pages are separated into individual components for lazy loading.

### Responsive Images
Use `srcset` for agent avatars and organization logos.

### CSS Optimization
- Custom properties for theming
- CSS Grid for flexible layouts
- Minimal media queries with mobile-first approach

### Mock Data
Search and transactions use mock data for development. Replace with API calls for production.

## Getting Started

1. **Install dependencies:**
```bash
npm install react react-dom typescript
```

2. **Set up your main App component:**
```typescript
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import { DashboardProvider } from '@/context/DashboardContext'

function App() {
  return (
    <DashboardProvider>
      <Layout>
        <Dashboard />
      </Layout>
    </DashboardProvider>
  )
}
```

3. **Import styles:**
```typescript
import '@/styles/layout.css'
import '@/styles/components.css'
import '@/styles/pages.css'
```

4. **Customize design tokens:**
Edit CSS custom properties in your root CSS file.

## Troubleshooting

**Sidebar not showing on mobile:** Check that `showSidebar` prop is true and window width is monitored.

**Dark mode not working:** Ensure `isDarkMode` state is properly synced with CSS class on root element.

**Search not working:** Verify keyboard event listeners are attached and modal is positioned with `z-index: 1001`.

**Layout shifts on sidebar toggle:** Add `transition: margin-left` to content area.

## Future Enhancements

- Real-time WebSocket updates for metrics and agent status
- Advanced filtering and sorting in tables
- Export functionality (CSV, PDF)
- Email notifications and alerts
- Multi-language support (i18n)
- Accessibility audit and WCAG compliance verification
- Performance monitoring and analytics
- Customizable dashboard layouts
- Bulk actions in tables
