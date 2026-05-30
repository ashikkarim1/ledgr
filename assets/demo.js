/* ============================================================
   Ledgr Demo Page
   - Populate demo dashboard with sample agent data
   - Handle FAQ accordion interactions
   - Showcase agent stories and customer success
   ============================================================ */

const DemoModule = (() => {
  // Demo content
  const demoContent = {
    agentCards: [
      {
        name: 'Reconciliation Agent',
        status: 'Processing',
        metric: 4287,
        detail: 'Matched bank to ledger. Found AED 12K discrepancy in April imports.'
      },
      {
        name: 'Categorization Agent',
        status: 'Active',
        metric: 1200,
        detail: 'Classified 1,200 expenses. 99.8% accuracy. 2 items flagged for policy review.'
      },
      {
        name: 'Close Agent',
        status: 'Ready',
        metric: 'Q1',
        detail: 'Prepared close documents. Waiting approval on 3 final items.'
      }
    ],

    stories: [
      {
        icon: '🔍',
        name: 'Reconciliation Agent',
        story: 'Matched 4,287 transactions and found a AED 12K discrepancy in bank import formatting. Completed in 3 hours vs 3 days for manual reconciliation.'
      },
      {
        icon: '📁',
        name: 'Categorization Agent',
        story: 'Classified 1,200 expenses across 24 categories with 99.8% accuracy. Flagged 2 entertainment expenses for policy review.'
      },
      {
        icon: '📋',
        name: 'Close Agent',
        story: 'Prepared Q1 close documents and consolidated 3 cost centers. Identified 3 items awaiting your final review and approval.'
      }
    ],

    successStories: [
      {
        company: 'Acme Finance LLC',
        metric: '5 days → 6 hours',
        desc: 'Reduced monthly close time from 5 days to 6 hours. Finance team now handles strategy instead of data entry.'
      },
      {
        company: 'Tech Startup UAE',
        metric: '$180K/year',
        desc: 'Eliminated need for 2 junior accountants. Now uses Ledgr + 1 senior accountant for oversight and compliance.'
      },
      {
        company: 'Real Estate Firm',
        metric: 'Daily insights',
        desc: 'Shifted from monthly P&L to real-time daily dashboards. Better decision-making on rental vs. capital spend.'
      }
    ],

    faqs: [
      {
        q: 'How do agents learn my business?',
        a: 'Each agent analyzes your first 2-4 weeks of data to learn your typical transactions, expense patterns, and business rules. They build internal models of your VAT treatment, contractor relationships, and cost center structure. This "ramp-up" period is crucial for accuracy.'
      },
      {
        q: 'What if I disagree with an agent\'s decision?',
        a: 'You have full visibility into agent reasoning. Click any categorization or reconciliation decision to see the agent\'s logic. You can override it directly, and the agent learns from corrections. Disagreements improve agent accuracy over time.'
      },
      {
        q: 'Can I use this with my existing accounting software?',
        a: 'Yes. Ledgr integrates with bank APIs, ERP systems, and can ingest CSV exports from QuickBooks, Xero, or SAP. We handle the data pipeline; agents work on your normalized data regardless of source.'
      },
      {
        q: 'How do I trust the agents with my books?',
        a: 'Agents never post directly to your general ledger. They produce recommendations that your finance team approves before posting. A licensed accountant supervises all agent decisions. Full audit trail is maintained.'
      },
      {
        q: 'What happens if there\'s an error?',
        a: 'Agents flag uncertainty when they\'re not confident. Questionable decisions are automatically escalated to your approval queue. If an error escapes to posting, it\'s flagged within 24 hours by our compliance checkers.'
      },
      {
        q: 'Is this FTA e-invoicing compliant?',
        a: 'Yes. Our agents validate against FTA requirements from day one. All categorizations and tax treatments are compliant with UAE regulations as of Q3 2026. We update continuously as FTA rules evolve.'
      }
    ]
  };

  // Initialize demo page
  function init() {
    populateDemoAgentCards();
    populateStories();
    populateSuccessStories();
    populateFAQ();
    attachEventListeners();
  }

  // Populate demo agent cards
  function populateDemoAgentCards() {
    const container = document.getElementById('demo-agents-grid');
    if (!container) return;

    container.innerHTML = demoContent.agentCards.map(card => `
      <div class="demo-agent-card">
        <h4>${card.name} <span class="demo-agent-status">${card.status}</span></h4>
        <div class="demo-agent-stat">${card.metric}</div>
        <p class="demo-agent-detail">${card.detail}</p>
      </div>
    `).join('');
  }

  // Populate agent stories
  function populateStories() {
    const container = document.getElementById('stories-grid');
    if (!container) return;

    container.innerHTML = demoContent.stories.map(story => `
      <div class="story-card">
        <div class="story-icon">${story.icon}</div>
        <h3>${story.name}</h3>
        <p>${story.story}</p>
      </div>
    `).join('');
  }

  // Populate success stories
  function populateSuccessStories() {
    const container = document.getElementById('success-grid');
    if (!container) return;

    container.innerHTML = demoContent.successStories.map(story => `
      <div class="success-card">
        <p class="success-company">${story.company}</p>
        <p class="success-metric">${story.metric}</p>
        <p class="success-desc">${story.desc}</p>
      </div>
    `).join('');
  }

  // Populate FAQ
  function populateFAQ() {
    const container = document.getElementById('faq-list');
    if (!container) return;

    container.innerHTML = demoContent.faqs.map((faq, index) => `
      <div class="faq-item" data-faq="${index}">
        <button class="faq-toggle">
          <span>${faq.q}</span>
          <span class="faq-arrow">↓</span>
        </button>
        <div class="faq-content">
          <p>${faq.a}</p>
        </div>
      </div>
    `).join('');
  }

  // Attach event listeners
  function attachEventListeners() {
    // FAQ accordion
    document.querySelectorAll('.faq-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        const item = e.target.closest('.faq-item');
        item.classList.toggle('open');
      });
    });

    // Demo agent cards click
    document.querySelectorAll('.demo-agent-card').forEach(card => {
      card.addEventListener('click', () => {
        card.style.borderColor = 'var(--accent)';
        setTimeout(() => {
          card.style.borderColor = '';
        }, 300);
      });
    });
  }

  // Public API
  return {
    init
  };
})();

// Initialize on page load
document.addEventListener('DOMContentLoaded', DemoModule.init);
