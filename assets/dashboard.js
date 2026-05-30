/* ============================================================
   Ledgr Agent Dashboard
   - Populate agent status cards
   - Display activity feed with real-time updates
   - Show metrics and pending actions
   - Support demo mode with sample data
   ============================================================ */

const DashboardModule = (() => {
  // Demo data generators
  const demoData = {
    agents: [
      {
        id: 'reconciliation',
        name: 'Reconciliation Agent',
        icon: '🔍',
        status: 'processing',
        statusLabel: 'Processing',
        metric: 142,
        metricLabel: 'transactions',
        progress: 87,
        detail: 'Matched 124 of 142 transactions. 18 flagged for review.'
      },
      {
        id: 'categorization',
        name: 'Categorization Agent',
        icon: '📁',
        status: 'active',
        statusLabel: 'Active',
        metric: 89,
        metricLabel: 'reviewed',
        progress: 95,
        detail: 'Classified 89 expenses. 4 marked for policy review.'
      },
      {
        id: 'close',
        name: 'Close Agent',
        icon: '📋',
        status: 'ready',
        statusLabel: 'Ready',
        metric: 'Q2',
        metricLabel: 'Close Ready',
        progress: 100,
        detail: 'All consolidation complete. 3 items await your approval.'
      }
    ],

    activities: [
      {
        type: 'success',
        icon: '✓',
        title: 'Completed: Reconciled March transactions',
        desc: '98.2% match rate. 3 discrepancies logged and flagged.',
        time: 'Just now'
      },
      {
        type: 'warning',
        icon: '!',
        title: 'Alert: 3 unusual expenses need review',
        desc: 'Transactions >AED 50K flagged for policy alignment check.',
        time: '2 mins ago'
      },
      {
        type: 'waiting',
        icon: '⏳',
        title: 'Waiting: User approval on tax classification',
        desc: 'Categorization pending decision on 2 contractor invoices.',
        time: '15 mins ago'
      },
      {
        type: 'success',
        icon: '✓',
        title: 'Completed: Bank statement import',
        desc: 'ADIB statement (2,145 transactions) processed and loaded.',
        time: '1 hour ago'
      },
      {
        type: 'warning',
        icon: '!',
        title: 'Alert: Missing vendor master data',
        desc: '8 new suppliers detected. Requesting details for compliance.',
        time: '2 hours ago'
      }
    ],

    metrics: [
      { label: 'Data Quality Score', value: '94%', badge: 'Excellent' },
      { label: 'Processing Speed', value: '12.4K', subLabel: 'tx/day', badge: '↑ 23%' },
      { label: 'Cost Savings vs Human', value: '$8.4K', subLabel: '/month', badge: 'Est.' },
      { label: 'Accuracy Rate', value: '99.2%', badge: 'Verified' }
    ],

    actions: [
      { label: 'Run Monthly Close', badge: null, icon: '📋' },
      { label: 'Review Flagged Items', badge: '7', icon: '⚠️' },
      { label: 'View Agent Reports', badge: null, icon: '📊' },
      { label: 'Approve Recommendations', badge: '3', icon: '✓' }
    ],

    pendingActions: [
      {
        title: 'Approve categorization of 3 travel expenses',
        age: '1 day old',
        priority: 'review'
      },
      {
        title: 'Review unusual $50K transfer',
        age: '4 hours old',
        priority: 'urgent'
      },
      {
        title: 'Confirm vendor master data for 8 new suppliers',
        age: '2 hours old',
        priority: 'review'
      },
      {
        title: 'Validate tax classification on contractor invoices',
        age: '45 mins old',
        priority: 'review'
      },
      {
        title: 'Q2 close documents prepared and ready',
        age: '30 mins old',
        priority: 'done'
      }
    ]
  };

  // Initialize dashboard
  function init() {
    // Check if we're in demo mode or authenticated
    const isDemo = localStorage.getItem('demo_mode') === 'true';
    if (isDemo) {
      document.getElementById('demo-badge')?.removeAttribute('style');
    }

    populateAgentCards();
    populateActivityFeed();
    populateMetrics();
    populateActions();
    populatePendingActions();
  }

  // Populate agent status cards
  function populateAgentCards() {
    const container = document.getElementById('agent-cards');
    if (!container) return;

    container.innerHTML = demoData.agents.map(agent => `
      <div class="agent-card" data-agent="${agent.id}">
        <div class="agent-card__header">
          <h3 class="agent-card__title">${agent.name}</h3>
          <div class="agent-card__status">
            <span class="agent-card__status-dot ${agent.status}"></span>
            ${agent.statusLabel}
          </div>
        </div>
        <div class="agent-card__metric">${agent.metric}</div>
        <p class="agent-card__detail">${agent.metricLabel}</p>
        ${agent.progress !== undefined ? `
          <div class="agent-card__progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${agent.progress}%"></div>
            </div>
            <div class="progress-label">
              <span>Progress</span>
              <span>${agent.progress}%</span>
            </div>
          </div>
        ` : ''}
        <p class="agent-card__detail">${agent.detail}</p>
      </div>
    `).join('');
  }

  // Populate activity feed
  function populateActivityFeed() {
    const container = document.getElementById('activity-feed');
    if (!container) return;

    container.innerHTML = demoData.activities.map(activity => `
      <div class="activity-item">
        <div class="activity-icon ${activity.type}">
          ${activity.icon}
        </div>
        <div class="activity-content">
          <h4 class="activity-title">${activity.title}</h4>
          <p class="activity-desc">${activity.desc}</p>
        </div>
        <div class="activity-time">${activity.time}</div>
      </div>
    `).join('');
  }

  // Populate metrics grid
  function populateMetrics() {
    const container = document.getElementById('metrics-grid');
    if (!container) return;

    container.innerHTML = demoData.metrics.map(metric => `
      <div class="metric-card">
        <p class="metric-label">${metric.label}</p>
        <p class="metric-value">${metric.value}</p>
        ${metric.subLabel ? `<p style="font-size: 12px; color: var(--ink-3); margin: 4px 0 0 0;">${metric.subLabel}</p>` : ''}
        ${metric.badge ? `<div class="metric-badge">${metric.badge}</div>` : ''}
      </div>
    `).join('');
  }

  // Populate quick action buttons
  function populateActions() {
    const container = document.getElementById('actions-grid');
    if (!container) return;

    container.innerHTML = demoData.actions.map(action => `
      <button class="action-button">
        <p class="action-button__label">${action.label}</p>
        ${action.badge ? `<div class="action-button__badge">${action.badge}</div>` : ''}
      </button>
    `).join('');
  }

  // Populate pending actions list
  function populatePendingActions() {
    const container = document.getElementById('pending-list');
    if (!container) return;

    container.innerHTML = demoData.pendingActions.map(action => `
      <div class="pending-item">
        <div class="pending-content">
          <h4 class="pending-title">${action.title}</h4>
          <p class="pending-age">${action.age}</p>
        </div>
        <div class="pending-priority ${action.priority}">
          ${action.priority === 'urgent' ? '⚠️ Urgent' : 
            action.priority === 'review' ? '👀 Review' : 
            '✓ Done'}
        </div>
      </div>
    `).join('');
  }

  // Simulate real-time activity update (for demo)
  function simulateActivityUpdate() {
    if (localStorage.getItem('demo_mode') !== 'true') return;

    const newActivities = [
      {
        type: 'success',
        icon: '✓',
        title: 'Completed: VAT filing validation',
        desc: 'Q2 2026 VAT return validated. Ready for FTA submission.',
        time: 'Just now'
      },
      {
        type: 'warning',
        icon: '!',
        title: 'Alert: Payment due on 3 invoices',
        desc: 'Reminders sent for invoices due in 7 days.',
        time: '5 mins ago'
      }
    ];

    // Add new activity to feed if in demo mode
    const feed = document.getElementById('activity-feed');
    if (feed && Math.random() > 0.7) {
      const activity = newActivities[Math.floor(Math.random() * newActivities.length)];
      const item = document.createElement('div');
      item.className = 'activity-item';
      item.innerHTML = `
        <div class="activity-icon ${activity.type}">${activity.icon}</div>
        <div class="activity-content">
          <h4 class="activity-title">${activity.title}</h4>
          <p class="activity-desc">${activity.desc}</p>
        </div>
        <div class="activity-time">${activity.time}</div>
      `;
      feed.insertBefore(item, feed.firstChild);

      // Remove oldest activity if list gets too long
      const items = feed.querySelectorAll('.activity-item');
      if (items.length > 5) {
        items[items.length - 1].remove();
      }
    }
  }

  // Public API
  return {
    init,
    simulateActivityUpdate
  };
})();

// Initialize on page load
document.addEventListener('DOMContentLoaded', DashboardModule.init);

// Simulate activity updates every 10 seconds in demo mode
setInterval(() => {
  DashboardModule.simulateActivityUpdate();
}, 10000);
