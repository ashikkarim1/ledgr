/**
 * EscalationModal - Escalate chat to human agent
 * Handles user input for escalation, ticket creation, and WhatsApp integration
 * 
 * Usage:
 *   const modal = new EscalationModal({ whatsappNumber: '+971501234567' });
 *   modal.mount('#app');
 */

class EscalationModal {
  constructor(config = {}) {
    this.config = {
      whatsappNumber: config.whatsappNumber || '+971501234567',
      ticketApiUrl: config.ticketApiUrl || '/api/escalate',
      estimatedWaitTime: config.estimatedWaitTime || '15 minutes',
    };

    this.state = {
      isOpen: false,
      isSubmitting: false,
      sessionId: null,
      lastMessage: '',
      context: [],
    };

    this.container = null;
    this.form = {
      summary: '',
      contactTime: 'asap',
      priority: 'standard',
    };

    this.init();
  }

  init() {
    this.setupEventListeners();
  }

  mount(selector) {
    const parent = selector ? document.querySelector(selector) : document.body;
    if (!parent) {
      console.error(`Escalation modal mount point not found: ${selector}`);
      return;
    }

    this.container = parent;
    this.render();
    this.attachEventListeners();

    // Listen for escalation events from chat widget
    window.addEventListener('chat:escalate', (e) => {
      this.state = {
        ...this.state,
        ...e.detail,
      };
      this.open();
    });
  }

  render() {
    if (!this.container) return;

    const html = `
      <div class="escalation-modal-overlay" id="escalation-overlay" hidden>
        <div class="escalation-modal" role="dialog" aria-labelledby="escalation-title" aria-modal="true">
          <!-- Close Button -->
          <button class="modal-close-btn" id="escalation-close" aria-label="Close escalation dialog">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <!-- Modal Content -->
          <div class="modal-content">
            <div class="modal-header">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                  <path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2"/>
                </svg>
              </div>
              <h2 id="escalation-title">Connect with a Human Agent</h2>
              <p class="modal-subtitle">We'll respond in under ${this.config.estimatedWaitTime}</p>
            </div>

            <!-- Escalation Form -->
            <form class="escalation-form" id="escalation-form">
              <!-- Issue Summary -->
              <div class="form-group">
                <label for="issue-summary">Brief summary of your issue</label>
                <textarea 
                  id="issue-summary"
                  name="summary"
                  class="form-input textarea"
                  placeholder="What do you need help with?"
                  rows="3"
                  required
                ></textarea>
                <p class="form-hint">This helps our team prepare for the conversation</p>
              </div>

              <!-- Contact Time -->
              <div class="form-group">
                <label for="contact-time">When would you like us to contact you?</label>
                <select 
                  id="contact-time"
                  name="contactTime"
                  class="form-input select"
                  required
                >
                  <option value="asap">As soon as possible</option>
                  <option value="next-hour">Within the next hour</option>
                  <option value="today">Later today</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="scheduled">At a specific time</option>
                </select>
              </div>

              <!-- Scheduled Time (shown if needed) -->
              <div class="form-group" id="scheduled-time-group" hidden>
                <label for="scheduled-time">Preferred time</label>
                <input 
                  type="datetime-local"
                  id="scheduled-time"
                  name="scheduledTime"
                  class="form-input"
                />
              </div>

              <!-- Priority -->
              <div class="form-group">
                <label>Priority level</label>
                <div class="priority-options">
                  <label class="radio-option">
                    <input 
                      type="radio" 
                      name="priority" 
                      value="standard" 
                      checked
                      required
                    />
                    <span class="radio-label">
                      <span class="priority-name">Standard</span>
                      <span class="priority-desc">General inquiry</span>
                    </span>
                  </label>
                  <label class="radio-option">
                    <input 
                      type="radio" 
                      name="priority" 
                      value="urgent"
                      required
                    />
                    <span class="radio-label">
                      <span class="priority-name">Urgent</span>
                      <span class="priority-desc">Time-sensitive issue</span>
                    </span>
                  </label>
                </div>
              </div>

              <!-- Contact Method -->
              <div class="form-group">
                <label>How would you like to be contacted?</label>
                <div class="contact-methods">
                  <button type="button" class="contact-method-btn active" data-method="whatsapp">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-4.967 1.523 9.89 9.89 0 00-3.18 3.186A9.9 9.9 0 008.682 20.95c1.515.293 3.08.065 4.533-.589a9.86 9.86 0 003.516-2.651l.012-.008a9.9 9.9 0 001.71-3.257 9.908 9.908 0 00.604-4.162 9.879 9.879 0 00-1.522-4.968A9.855 9.855 0 0012.051 6.979z"/>
                    </svg>
                    WhatsApp
                  </button>
                  <button type="button" class="contact-method-btn" data-method="email">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                      <path d="m10 9 5 3.5-5 3.5"></path>
                    </svg>
                    Email
                  </button>
                  <button type="button" class="contact-method-btn" data-method="phone">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                    Phone
                  </button>
                </div>
                <input type="hidden" id="contact-method" name="contactMethod" value="whatsapp" />
              </div>

              <!-- Contact Info Hint -->
              <div class="contact-info-hint">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10"/>
                  <text x="12" y="16" text-anchor="middle" fill="white" font-size="14" font-weight="bold">i</text>
                </svg>
                <span id="contact-hint">We'll use your WhatsApp number from your account</span>
              </div>

              <!-- Form Actions -->
              <div class="form-actions">
                <button type="button" class="btn-secondary" id="escalation-cancel">
                  Cancel
                </button>
                <button type="submit" class="btn-primary" id="escalation-submit">
                  <span class="btn-text">Connect with Agent</span>
                  <span class="btn-loader" hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                    </svg>
                  </span>
                </button>
              </div>
            </form>
          </div>

          <!-- Success State -->
          <div class="modal-success" id="escalation-success" hidden>
            <div class="success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3>Ticket Created Successfully</h3>
            <p id="ticket-number">Ticket #<span></span></p>
            <p class="success-message">Our team will contact you shortly via WhatsApp</p>
            
            <div class="next-steps">
              <h4>What's next?</h4>
              <ul>
                <li>Look for a message from our agent</li>
                <li>Expected response time: <strong>${this.config.estimatedWaitTime}</strong></li>
                <li>Keep this ticket number for reference</li>
              </ul>
            </div>

            <button type="button" class="btn-primary" id="success-done">
              Done
            </button>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  attachEventListeners() {
    const overlay = document.getElementById('escalation-overlay');
    const closeBtn = document.getElementById('escalation-close');
    const form = document.getElementById('escalation-form');
    const cancelBtn = document.getElementById('escalation-cancel');
    const submitBtn = document.getElementById('escalation-submit');
    const doneBtn = document.getElementById('success-done');
    const contactTimeSelect = document.getElementById('contact-time');
    const scheduledTimeGroup = document.getElementById('scheduled-time-group');

    // Close modal
    closeBtn?.addEventListener('click', () => this.close());
    cancelBtn?.addEventListener('click', () => this.close());
    doneBtn?.addEventListener('click', () => this.close());

    // Overlay click to close
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // Show/hide scheduled time field
    contactTimeSelect?.addEventListener('change', (e) => {
      if (e.target.value === 'scheduled') {
        scheduledTimeGroup?.removeAttribute('hidden');
      } else {
        scheduledTimeGroup?.setAttribute('hidden', '');
      }
    });

    // Contact method selection
    document.querySelectorAll('.contact-method-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.contact-method-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('contact-method').value = btn.getAttribute('data-method');
        this.updateContactHint(btn.getAttribute('data-method'));
      });
    });

    // Form submission
    form?.addEventListener('submit', (e) => this.handleSubmit(e));

    // Keyboard escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state.isOpen) {
        this.close();
      }
    });

    // Pre-fill summary if available
    const summaryField = document.getElementById('issue-summary');
    if (summaryField && this.state.lastMessage) {
      summaryField.value = this.state.lastMessage.substring(0, 200);
    }
  }

  updateContactHint(method) {
    const hint = document.getElementById('contact-hint');
    const messages = {
      whatsapp: 'We\'ll use your WhatsApp number from your account',
      email: 'We\'ll use your registered email address',
      phone: 'We\'ll use your registered phone number',
    };
    if (hint) hint.textContent = messages[method] || messages.whatsapp;
  }

  async handleSubmit(e) {
    e.preventDefault();

    this.state.isSubmitting = true;
    const submitBtn = document.getElementById('escalation-submit');
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnLoader = submitBtn?.querySelector('.btn-loader');

    if (btnText) btnText.hidden = true;
    if (btnLoader) btnLoader.hidden = false;

    try {
      // Collect form data
      const formData = new FormData(document.getElementById('escalation-form'));
      const escalationData = {
        summary: formData.get('summary'),
        contactTime: formData.get('contactTime'),
        scheduledTime: formData.get('scheduledTime') || null,
        priority: formData.get('priority'),
        contactMethod: formData.get('contactMethod'),
        sessionId: this.state.sessionId,
        context: this.state.context,
      };

      // Create ticket
      const response = await fetch(this.config.ticketApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(escalationData),
      });

      if (!response.ok) throw new Error('Failed to create ticket');

      const result = await response.json();
      const ticketNumber = result.ticketId || `LEDGR-${Date.now()}`;

      // Show success state
      this.showSuccess(ticketNumber);

    } catch (error) {
      console.error('Escalation error:', error);
      alert('Failed to create support ticket. Please try again or contact us directly.');
    } finally {
      this.state.isSubmitting = false;
      if (btnText) btnText.hidden = false;
      if (btnLoader) btnLoader.hidden = true;
    }
  }

  showSuccess(ticketNumber) {
    const form = document.getElementById('escalation-form');
    const success = document.getElementById('escalation-success');
    
    if (form) form.hidden = true;
    if (success) success.removeAttribute('hidden');

    // Update ticket number
    const ticketSpan = success?.querySelector('#ticket-number span');
    if (ticketSpan) ticketSpan.textContent = ticketNumber;

    // Open WhatsApp if selected
    const method = document.getElementById('contact-method')?.value;
    if (method === 'whatsapp') {
      const message = encodeURIComponent(
        `Hi! I've created a support ticket (${ticketNumber}) regarding: ${this.form.summary.substring(0, 100)}`
      );
      const whatsappUrl = `https://wa.me/${this.config.whatsappNumber.replace(/\D/g, '')}?text=${message}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  }

  open() {
    this.state.isOpen = true;
    const overlay = document.getElementById('escalation-overlay');
    if (overlay) overlay.removeAttribute('hidden');
    
    // Focus form
    setTimeout(() => {
      document.getElementById('issue-summary')?.focus();
    }, 100);
  }

  close() {
    this.state.isOpen = false;
    const overlay = document.getElementById('escalation-overlay');
    if (overlay) overlay.setAttribute('hidden', '');

    // Reset form
    const form = document.getElementById('escalation-form');
    const success = document.getElementById('escalation-success');
    if (form) form.hidden = false;
    if (success) success.setAttribute('hidden', '');
  }

  setupEventListeners() {
    // Placeholder for additional setup
  }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
  window.EscalationModal = EscalationModal;
}
