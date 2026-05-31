import React, { useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'

interface AuditLogEntry {
  id: string
  timestamp: string
  user: string
  action: string
  resourceType: string
  resourceId: string
  resourceName: string
  status: 'success' | 'warning' | 'error'
  details?: string
  ipAddress?: string
}

const AUDIT_LOG_ENTRIES: AuditLogEntry[] = [
  {
    id: 'log-001',
    timestamp: '2025-05-31 14:45:23',
    user: 'Ahmed Al-Mansouri',
    action: 'Updated',
    resourceType: 'Agent',
    resourceId: 'agent-1',
    resourceName: 'Finance Bot',
    status: 'success',
    details: 'Confidence threshold changed from 95% to 97%',
    ipAddress: '192.168.1.100'
  },
  {
    id: 'log-002',
    timestamp: '2025-05-31 14:23:15',
    user: 'Fatima Al-Kaabi',
    action: 'Created',
    resourceType: 'Transaction',
    resourceId: 'txn-4521',
    resourceName: 'Invoice INV-2025-0521',
    status: 'success',
    details: 'Manual invoice entry for Vendor XYZ',
    ipAddress: '192.168.1.105'
  },
  {
    id: 'log-003',
    timestamp: '2025-05-31 13:56:42',
    user: 'Mohammed Al-Falahi',
    action: 'Reviewed',
    resourceType: 'Transaction',
    resourceId: 'txn-4520',
    resourceName: 'Receipt RCP-2025-0520',
    status: 'success',
    details: 'Approved for posting',
    ipAddress: '192.168.1.110'
  },
  {
    id: 'log-004',
    timestamp: '2025-05-31 13:42:10',
    user: 'System',
    action: 'Synced',
    resourceType: 'Integration',
    resourceId: 'qb-sync-001',
    resourceName: 'QuickBooks - Daily Sync',
    status: 'success',
    details: '45 transactions synchronized',
    ipAddress: 'system'
  },
  {
    id: 'log-005',
    timestamp: '2025-05-31 13:15:33',
    user: 'Layla Al-Sheri',
    action: 'Deployed',
    resourceType: 'Agent',
    resourceId: 'agent-3',
    resourceName: 'Reconciliation Agent v2.1',
    status: 'success',
    details: 'New agent deployed to production',
    ipAddress: '192.168.1.115'
  },
  {
    id: 'log-006',
    timestamp: '2025-05-31 12:45:22',
    user: 'Ahmed Al-Mansouri',
    action: 'Deleted',
    resourceType: 'Document',
    resourceId: 'doc-102',
    resourceName: 'Old Reconciliation Report',
    status: 'success',
    details: 'Archive document deleted',
    ipAddress: '192.168.1.100'
  },
  {
    id: 'log-007',
    timestamp: '2025-05-31 12:30:15',
    user: 'System',
    action: 'Alert',
    resourceType: 'Alert',
    resourceId: 'alert-0531-001',
    resourceName: 'Unusual Transaction Detected',
    status: 'warning',
    details: 'Transaction amount exceeds threshold by 150%',
    ipAddress: 'system'
  },
  {
    id: 'log-008',
    timestamp: '2025-05-31 11:20:45',
    user: 'Fatima Al-Kaabi',
    action: 'Failed',
    resourceType: 'Report',
    resourceId: 'rpt-052501',
    resourceName: 'Monthly Close Report',
    status: 'error',
    details: 'Report generation failed: Missing reconciliation data',
    ipAddress: '192.168.1.105'
  },
  {
    id: 'log-009',
    timestamp: '2025-05-31 10:15:30',
    user: 'Mohammed Al-Falahi',
    action: 'Exported',
    resourceType: 'Dataset',
    resourceId: 'export-052501',
    resourceName: 'Q1 2025 Financial Data',
    status: 'success',
    details: 'Exported to CSV (12.5 MB)',
    ipAddress: '192.168.1.110'
  },
  {
    id: 'log-010',
    timestamp: '2025-05-31 09:45:22',
    user: 'Ahmed Al-Mansouri',
    action: 'Updated',
    resourceType: 'Settings',
    resourceId: 'settings-org',
    resourceName: 'Organization Settings',
    status: 'success',
    details: 'Enabled 2FA requirement for all users',
    ipAddress: '192.168.1.100'
  }
]

export default function AuditLog() {
  const { currentUser } = useDashboard()
  const [logs, setLogs] = useState(AUDIT_LOG_ENTRIES)
  const [filters, setFilters] = useState({
    user: '',
    action: '',
    resourceType: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('timestamp-desc')

  // Get unique values for filter dropdowns
  const uniqueUsers = Array.from(new Set(logs.map(l => l.user)))
  const uniqueActions = Array.from(new Set(logs.map(l => l.action)))
  const uniqueResourceTypes = Array.from(new Set(logs.map(l => l.resourceType)))

  const filteredLogs = logs.filter(log => {
    const matchesUser = !filters.user || log.user === filters.user
    const matchesAction = !filters.action || log.action === filters.action
    const matchesResourceType = !filters.resourceType || log.resourceType === filters.resourceType
    const matchesStatus = !filters.status || log.status === filters.status
    const matchesSearch = !searchQuery || (
      log.resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase())
    )
    return matchesUser && matchesAction && matchesResourceType && matchesStatus && matchesSearch
  })

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    if (sortBy === 'timestamp-desc') {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    } else if (sortBy === 'timestamp-asc') {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    } else if (sortBy === 'user-asc') {
      return a.user.localeCompare(b.user)
    }
    return 0
  })

  const handleFilterChange = (field: string, value: string) => {
    setFilters({ ...filters, [field]: value })
  }

  const handleResetFilters = () => {
    setFilters({
      user: '',
      action: '',
      resourceType: '',
      status: '',
      dateFrom: '',
      dateTo: ''
    })
    setSearchQuery('')
  }

  const handleExport = () => {
    // CSV export
    const headers = ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource Name', 'Status']
    const rows = sortedLogs.map(log => [
      log.timestamp,
      log.user,
      log.action,
      log.resourceType,
      log.resourceName,
      log.status
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div className="page page--audit-log">
      <div className="page__header">
        <h1>Audit Log</h1>
        <p className="page__subtitle">System activity and change history</p>
        <button className="button button--secondary" onClick={handleExport}>
          📥 Export CSV
        </button>
      </div>

      {/* Filters */}
      <section className="section">
        <h3 className="section__title">Filters</h3>
        <div className="filters-panel">
          <div className="filter-group">
            <input
              type="text"
              placeholder="Search by user, action, or resource..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filters-row">
            <div className="filter-group">
              <label htmlFor="filter-user">User</label>
              <select
                id="filter-user"
                value={filters.user}
                onChange={(e) => handleFilterChange('user', e.target.value)}
              >
                <option value="">All Users</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="filter-action">Action</label>
              <select
                id="filter-action"
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
              >
                <option value="">All Actions</option>
                {uniqueActions.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="filter-resource">Resource Type</label>
              <select
                id="filter-resource"
                value={filters.resourceType}
                onChange={(e) => handleFilterChange('resourceType', e.target.value)}
              >
                <option value="">All Types</option>
                {uniqueResourceTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="filter-status">Status</label>
              <select
                id="filter-status"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="">All Status</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="sort-by">Sort By</label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="timestamp-desc">Newest First</option>
                <option value="timestamp-asc">Oldest First</option>
                <option value="user-asc">User (A-Z)</option>
              </select>
            </div>

            <button className="button button--secondary" onClick={handleResetFilters}>
              Clear Filters
            </button>
          </div>
        </div>
      </section>

      {/* Audit Log Table */}
      <section className="section">
        <h3 className="section__title">Log Entries ({sortedLogs.length})</h3>
        <div className="audit-log-table">
          <div className="table-header">
            <div className="table-cell table-cell--timestamp">Timestamp</div>
            <div className="table-cell table-cell--user">User</div>
            <div className="table-cell table-cell--action">Action</div>
            <div className="table-cell table-cell--resource">Resource</div>
            <div className="table-cell table-cell--status">Status</div>
            <div className="table-cell table-cell--details">Details</div>
          </div>

          {sortedLogs.length > 0 ? (
            sortedLogs.map((log) => (
              <div key={log.id} className={`table-row table-row--${log.status}`}>
                <div className="table-cell table-cell--timestamp">
                  <span className="timestamp">{log.timestamp}</span>
                </div>
                <div className="table-cell table-cell--user">
                  <span className="user-name">{log.user}</span>
                  {log.ipAddress && log.ipAddress !== 'system' && (
                    <span className="ip-address">{log.ipAddress}</span>
                  )}
                </div>
                <div className="table-cell table-cell--action">
                  <span className="action-badge">{log.action}</span>
                </div>
                <div className="table-cell table-cell--resource">
                  <span className="resource-type">{log.resourceType}</span>
                  <span className="resource-name">{log.resourceName}</span>
                </div>
                <div className="table-cell table-cell--status">
                  <span className={`status-badge status-badge--${log.status}`}>
                    {log.status}
                  </span>
                </div>
                <div className="table-cell table-cell--details">
                  {log.details && (
                    <span className="detail-text">{log.details}</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="table-empty">
              <p>No audit log entries found matching the selected filters.</p>
            </div>
          )}
        </div>
      </section>

      {/* Legend */}
      <section className="section">
        <h3 className="section__title">Status Legend</h3>
        <div className="legend-grid">
          <div className="legend-item">
            <span className="status-badge status-badge--success">success</span>
            <p>Action completed successfully</p>
          </div>
          <div className="legend-item">
            <span className="status-badge status-badge--warning">warning</span>
            <p>Action completed with warnings or attention needed</p>
          </div>
          <div className="legend-item">
            <span className="status-badge status-badge--error">error</span>
            <p>Action failed or encountered an error</p>
          </div>
        </div>
      </section>
    </div>
  )
}
