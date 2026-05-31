import React, { useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'

interface Integration {
  id: string
  name: string
  type: 'accounting' | 'banking' | 'payment' | 'other'
  status: 'connected' | 'available' | 'error'
  icon: string
  description: string
  isConnected?: boolean
  lastSync?: string
  syncStatus?: 'synced' | 'syncing' | 'error'
}

const AVAILABLE_INTEGRATIONS: Integration[] = [
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    type: 'accounting',
    status: 'connected',
    icon: '📊',
    description: 'Cloud accounting software by Intuit',
    isConnected: true,
    lastSync: '2025-05-31 14:23',
    syncStatus: 'synced'
  },
  {
    id: 'xero',
    name: 'Xero',
    type: 'accounting',
    status: 'available',
    icon: '💼',
    description: 'Accounting software for small businesses'
  },
  {
    id: 'wave',
    name: 'Wave',
    type: 'accounting',
    status: 'available',
    icon: '🌊',
    description: 'Free accounting software for small business'
  },
  {
    id: 'stripe',
    name: 'Stripe',
    type: 'payment',
    status: 'connected',
    icon: '💳',
    description: 'Payment processing platform',
    isConnected: true,
    lastSync: '2025-05-31 14:45',
    syncStatus: 'synced'
  },
  {
    id: 'adib',
    name: 'ADIB Banking',
    type: 'banking',
    status: 'available',
    icon: '🏦',
    description: 'Abu Dhabi Islamic Bank connection'
  },
  {
    id: 'fab',
    name: 'FAB Banking',
    type: 'banking',
    status: 'available',
    icon: '🏛️',
    description: 'First Abu Dhabi Bank connection'
  },
  {
    id: 'paypal',
    name: 'PayPal',
    type: 'payment',
    status: 'available',
    icon: '🅿️',
    description: 'Online payment and money transfer'
  },
  {
    id: 'zapier',
    name: 'Zapier',
    type: 'other',
    status: 'available',
    icon: '⚡',
    description: 'Automation and workflow integration'
  }
]

export default function Integrations() {
  const { currentUser } = useDashboard()
  const [connectedIntegrations, setConnectedIntegrations] = useState(
    AVAILABLE_INTEGRATIONS.filter(i => i.isConnected)
  )
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [showSyncSettings, setShowSyncSettings] = useState(false)
  const [syncFrequency, setSyncFrequency] = useState('hourly')

  const availableIntegrations = AVAILABLE_INTEGRATIONS.filter(i => !i.isConnected)

  const handleConnectIntegration = (integration: Integration) => {
    if (!connectedIntegrations.find(c => c.id === integration.id)) {
      const connectedIntegration = {
        ...integration,
        isConnected: true,
        lastSync: new Date().toISOString().substring(0, 16).replace('T', ' '),
        syncStatus: 'synced' as const
      }
      setConnectedIntegrations([...connectedIntegrations, connectedIntegration])
    }
  }

  const handleDisconnectIntegration = (id: string) => {
    setConnectedIntegrations(connectedIntegrations.filter(c => c.id !== id))
    setSelectedIntegration(null)
  }

  return (
    <div className="page page--integrations">
      <div className="page__header">
        <h1>Integrations</h1>
        <p className="page__subtitle">Connect your accounting, banking, and payment tools</p>
      </div>

      <section className="section">
        <h2 className="section__title">Connected Integrations ({connectedIntegrations.length})</h2>
        <div className="integrations-grid">
          {connectedIntegrations.length > 0 ? (
            connectedIntegrations.map((integration) => (
              <div
                key={integration.id}
                className="integration-card integration-card--connected"
                onClick={() => setSelectedIntegration(integration)}
              >
                <div className="integration-card__header">
                  <span className="integration-icon">{integration.icon}</span>
                  <span className="status-badge status-badge--connected">
                    ✓ Connected
                  </span>
                </div>
                <h3>{integration.name}</h3>
                <p>{integration.description}</p>
                {integration.lastSync && (
                  <p className="sync-info">
                    Last sync: {integration.lastSync}
                  </p>
                )}
                {integration.syncStatus && (
                  <p className={`sync-status sync-status--${integration.syncStatus}`}>
                    {integration.syncStatus === 'synced' && '✓ All synced'}
                    {integration.syncStatus === 'syncing' && '⟳ Syncing...'}
                    {integration.syncStatus === 'error' && '⚠ Sync error'}
                  </p>
                )}
                {currentUser?.role === 'client-admin' && (
                  <button
                    className="button button--secondary button--small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDisconnectIntegration(integration.id)
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="empty-state">No integrations connected yet</p>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Available Integrations ({availableIntegrations.length})</h2>
        <div className="integrations-grid">
          {availableIntegrations.map((integration) => (
            <div
              key={integration.id}
              className="integration-card"
              onClick={() => setSelectedIntegration(integration)}
            >
              <div className="integration-card__header">
                <span className="integration-icon">{integration.icon}</span>
                <span className="status-badge">Available</span>
              </div>
              <h3>{integration.name}</h3>
              <p>{integration.description}</p>
              {currentUser?.role === 'client-admin' && (
                <button
                  className="button button--primary button--small"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleConnectIntegration(integration)
                  }}
                >
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {selectedIntegration && (
        <section className="section">
          <div className="section__header">
            <h2 className="section__title">
              {selectedIntegration.icon} {selectedIntegration.name} Settings
            </h2>
            <button
              className="button button--icon"
              onClick={() => setSelectedIntegration(null)}
              title="Close"
            >
              ✕
            </button>
          </div>

          {selectedIntegration.isConnected && (
            <div className="settings-panel">
              <div className="setting-group">
                <h4>Connection Status</h4>
                <p>
                  <span className="status-badge status-badge--connected">✓ Connected</span>
                </p>
                <p className="text-secondary">
                  Last synced: {selectedIntegration.lastSync}
                </p>
              </div>

              <div className="setting-group">
                <h4>Sync Settings</h4>
                <label>
                  <input type="checkbox" defaultChecked /> Auto-sync enabled
                </label>
                <div className="form-group">
                  <label htmlFor="sync-freq">Sync Frequency</label>
                  <select
                    id="sync-freq"
                    value={syncFrequency}
                    onChange={(e) => setSyncFrequency(e.target.value)}
                  >
                    <option value="realtime">Real-time</option>
                    <option value="hourly">Every hour</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>

              <div className="setting-group">
                <h4>Data Mapping</h4>
                <p className="text-secondary">
                  Ledgr automatically maps {selectedIntegration.name} data to your chart of accounts.
                </p>
                <button className="button button--secondary button--small">
                  View Mappings
                </button>
              </div>

              <div className="setting-group">
                <h4>Sync History</h4>
                <div className="history-list">
                  <div className="history-item">
                    <span className="timestamp">Today 14:23</span>
                    <span className="event">Synced 45 transactions</span>
                    <span className="status-badge status-badge--connected">✓</span>
                  </div>
                  <div className="history-item">
                    <span className="timestamp">Yesterday 13:15</span>
                    <span className="event">Synced 32 transactions</span>
                    <span className="status-badge status-badge--connected">✓</span>
                  </div>
                  <div className="history-item">
                    <span className="timestamp">2 days ago 14:00</span>
                    <span className="event">Synced 28 transactions</span>
                    <span className="status-badge status-badge--connected">✓</span>
                  </div>
                </div>
              </div>

              <div className="setting-group">
                <h4>Permissions</h4>
                <label>
                  <input type="checkbox" defaultChecked /> Read transactions
                </label>
                <label>
                  <input type="checkbox" defaultChecked /> Read accounts
                </label>
                <label>
                  <input type="checkbox" /> Write transactions
                </label>
              </div>

              {currentUser?.role === 'client-admin' && (
                <div className="setting-group">
                  <button className="button button--secondary">Test Connection</button>
                  <button
                    className="button button--critical"
                    onClick={() => handleDisconnectIntegration(selectedIntegration.id)}
                  >
                    Disconnect Integration
                  </button>
                </div>
              )}
            </div>
          )}

          {!selectedIntegration.isConnected && (
            <div className="settings-panel">
              <h4>Connect {selectedIntegration.name}</h4>
              <p className="text-secondary">
                Securely connect your {selectedIntegration.name} account to Ledgr.
                We'll sync your transactions and accounts automatically.
              </p>
              <div className="oauth-flow">
                <p>Click below to authorize Ledgr to access your account:</p>
                {currentUser?.role === 'client-admin' && (
                  <button
                    className="button button--primary"
                    onClick={() => handleConnectIntegration(selectedIntegration)}
                  >
                    Authorize {selectedIntegration.name}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
