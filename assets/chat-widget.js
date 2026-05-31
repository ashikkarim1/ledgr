/**
 * ChatWidget - Main floating chat component
 * Provides complete chat interface with history, escalation, and dark mode
 * 
 * Usage:
 *   const widget = new ChatWidget({ apiBaseUrl: '/api/chat' });
 *   widget.mount('#app');
 */

class ChatWidget {
  constructor(config = {}) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl || '/api/chat',
      whatsappNumber: config.whatsappNumber || '+971501234567',
      enableDarkMode: config.enableDarkMode !== false,
      maxHistoryItems: config.maxHistoryItems || 50,
      position: config.position || 'bottom-right',
      primaryColor: config.primaryColor || '#FF5C00',
      accentColor: config.accentColor || '#f9f9f9',
    };

    this.state = {
      isOpen: false,
      isMinimized: false,
      isDarkMode: localStorage.getItem('chat-dark-mode') === 'true',
      currentSessionId: null,
      sessions: [],
      unreadCount: 0,
      isLoading: false,
    };

    this.container = null;
    this.chatHistory = [];
    this.messageQueue = [];

    this.init();
  }

  init() {
    this.loadSessions();
    this.setupKeyboardShortcuts();
    this.setupTouchListeners();
  }

  mount(selector) {
    const parent = selector ? document.querySelector(selector) : document.body;
    if (!parent) {
      console.error(`Chat widget mount point not found: ${selector}`);
      return;
    }

    this.container = parent;
    this.render();
    this.attachEventListeners();
  }

  render() {
    if (!this.container) return;

    const html = `
      <div class="ledgr-chat-widget ${this.state.isOpen ? 'open' : 'closed'} ${this.state.isDarkMode ? 'dark' : 'light'} ${this.config.position}">
        <!-- Floating Button -->
        <button class="chat-toggle-btn" id="chat-toggle" aria-label="Open chat" aria-expanded="${this.state.isOpen}">
          <svg class="chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="unread-badge ${this.state.unreadCount > 0 ? 'show' : ''}">
            ${this.state.unreadCount}
          </span>
        </button>

        <!-- Chat Container -->
        <div class="chat-container ${this.state.isMinimized ? 'minimized' : ''}">
          <!-- Header -->
          <div class="chat-header">
            <div class="chat-header-content">
              <h2 class="chat-title">Ledgr Assistant</h2>
              <p class="chat-subtitle">Your autonomous finance guide</p>
            </div>
            <div class="chat-controls">
              <button class="header-btn minimize-btn" id="minimize-btn" aria-label="Minimize chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <button class="header-btn dark-mode-btn" id="dark-mode-btn" aria-label="Toggle dark mode">
                <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              </button>
              <button class="header-btn close-btn" id="close-btn" aria-label="Close chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Main Content (Sidebar + Messages) -->
          <div class="chat-main">
            <!-- Sidebar - Chat History -->
            <aside class="chat-sidebar" id="chat-sidebar">
              <div class="sidebar-header">
                <h3>Conversation History</h3>
                <button class="new-chat-btn" id="new-chat-btn" aria-label="Start new conversation">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>New</span>
                </button>
              </div>

              <div class="sidebar-search">
                <input 
                  type="text" 
                  placeholder="Search conversations..." 
                  class="sidebar-search-input" 
                  id="sidebar-search"
                  aria-label="Search chat history"
                />
              </div>

              <div class="sessions-list" id="sessions-list">
                <!-- Sessions populated by JS -->
              </div>
            </aside>

            <!-- Messages Area -->
            <div class="chat-messages-wrapper">
              <div class="chat-messages" id="chat-messages" role="log" aria-live="polite">
                <!-- Messages populated by JS -->
              </div>

              <!-- Typing Indicator -->
              <div class="typing-indicator" id="typing-indicator" hidden>
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>

          <!-- Input Area -->
          <div class="chat-input-wrapper">
            <form class="chat-input-form" id="chat-form">
              <textarea 
                class="chat-input" 
                id="chat-input"
                placeholder="Ask me anything... (Cmd/Ctrl+K to focus)"
                aria-label="Chat message input"
                rows="1"
              ></textarea>
              <button type="submit" class="send-btn" aria-label="Send message">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.9429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16562563 C3.34915502,0.9085282 2.40734225,1.01376612 1.77946707,1.4850582 C0.994623095,2.10604706 0.837654326,3.0486314 1.15159189,3.99701575 L3.03521743,10.4380088 C3.03521743,10.5951061 3.19218622,10.7522035 3.50612381,10.7522035 L16.6915026,11.5376905 C16.6915026,11.5376905 17.1624089,11.5376905 17.1624089,12.0089827 C17.1624089,12.4744748 16.6915026,12.4744748 16.6915026,12.4744748 Z"/>
                </svg>
              </button>
            </form>

            <!-- Quick Suggested Prompts (shown when empty) -->
            <div class="suggested-prompts" id="suggested-prompts" hidden>
              <p class="prompts-label">Quick questions:</p>
              <div class="prompts-grid">
                <button class="prompt-btn" data-prompt="How do I set up VAT compliance?">
                  <span>VAT Setup</span>
                </button>
                <button class="prompt-btn" data-prompt="What are the key finance metrics?">
                  <span>Finance Metrics</span>
                </button>
                <button class="prompt-btn" data-prompt="How do I integrate with my accounting system?">
                  <span>Integration Help</span>
                </button>
                <button class="prompt-btn" data-prompt="Can I escalate to a human?">
                  <span>Talk to Human</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  attachEventListeners() {
    // Toggle button
    const toggleBtn = document.getElementById('chat-toggle');
    toggleBtn?.addEventListener('click', () => this.toggle());

    // Header buttons
    document.getElementById('close-btn')?.addEventListener('click', () => this.close());
    document.getElementById('minimize-btn')?.addEventListener('click', () => this.toggleMinimize());
    document.getElementById('dark-mode-btn')?.addEventListener('click', () => this.toggleDarkMode());

    // Chat form
    const form = document.getElementById('chat-form');
    form?.addEventListener('submit', (e) => this.handleSubmit(e));

    // Auto-expand textarea
    const textarea = document.getElementById('chat-input');
    textarea?.addEventListener('input', (e) => this.autoExpandTextarea(e.target));
    textarea?.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Sidebar
    document.getElementById('new-chat-btn')?.addEventListener('click', () => this.newChat());
    document.getElementById('sidebar-search')?.addEventListener('input', (e) => this.filterSessions(e.target.value));

    // Prompt buttons
    document.querySelectorAll('.prompt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        document.getElementById('chat-input').value = prompt;
        this.handleSubmit({ preventDefault: () => {} });
      });
    });

    // Auto-focus input when opened
    if (this.state.isOpen) {
      setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
    }
  }

  handleSubmit(e) {
    e.preventDefault();
    
    const input = document.getElementById('chat-input');
    const content = input.value.trim();

    if (!content) return;

    // Add user message
    this.addMessage({
      role: 'user',
      content,
    });

    input.value = '';
    input.style.height = 'auto';
    document.getElementById('suggested-prompts')?.setAttribute('hidden', '');

    // Simulate AI response with streaming
    this.fetchAIResponse(content);
  }

  async fetchAIResponse(userMessage) {
    // Show typing indicator
    const typingIndicator = document.getElementById('typing-indicator');
    typingIndicator?.removeAttribute('hidden');

    try {
      // Simulate API call (replace with real endpoint)
      const response = await fetch(this.config.apiBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          sessionId: this.state.currentSessionId,
        }),
      });

      if (!response.ok) throw new Error('Network error');

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let messageId = `msg-${Date.now()}`;

      // Add empty assistant message
      this.addMessage({
        role: 'assistant',
        content: '',
        id: messageId,
        isStreaming: true,
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullContent += chunk;

        // Update message with streamed content
        this.updateMessage(messageId, fullContent);
      }

      // Mark as complete
      this.completeMessage(messageId);

    } catch (error) {
      console.error('Chat error:', error);
      
      // Show error message
      this.addMessage({
        role: 'assistant',
        content: 'I encountered an error. Please try again or escalate to a human agent.',
      });
    } finally {
      typingIndicator?.setAttribute('hidden', '');
    }
  }

  addMessage(msg) {
    const message = {
      id: msg.id || `msg-${Date.now()}`,
      content: msg.content || '',
      role: msg.role,
      timestamp: msg.timestamp || Date.now(),
      isStreaming: msg.isStreaming || false,
      citations: msg.citations || [],
      rating: msg.rating || 0,
    };

    this.chatHistory.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }

  updateMessage(messageId, content) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      const contentEl = messageEl.querySelector('.message-content');
      if (contentEl) {
        contentEl.innerHTML = this.parseMessageContent(content);
      }
    }
  }

  completeMessage(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.classList.remove('streaming');
      messageEl.classList.add('complete');
    }

    const message = this.chatHistory.find(m => m.id === messageId);
    if (message) message.isStreaming = false;
  }

  renderMessage(message) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${message.role} ${message.isStreaming ? 'streaming' : ''}`;
    messageEl.setAttribute('data-message-id', message.id);
    messageEl.setAttribute('role', 'article');

    const avatar = message.role === 'assistant' 
      ? '<div class="message-avatar assistant"><span>🤖</span></div>'
      : '<div class="message-avatar user"><span>👤</span></div>';

    const citations = message.citations?.length > 0
      ? `<div class="message-citations">
          ${message.citations.map(c => 
            `<a href="${c.url}" target="_blank" rel="noopener noreferrer" class="citation-link">${c.text}</a>`
          ).join('')}
        </div>`
      : '';

    const actions = message.role === 'assistant'
      ? `<div class="message-actions">
          <button class="action-btn copy-btn" title="Copy message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          </button>
          <button class="action-btn share-btn" title="Share message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
            </svg>
          </button>
          <div class="rating-group">
            <button class="action-btn rating-btn helpful" title="Helpful" data-rating="1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
              </svg>
            </button>
            <button class="action-btn rating-btn not-helpful" title="Not helpful" data-rating="-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2h-2.67"></path>
              </svg>
            </button>
          </div>
          <button class="action-btn escalate-btn" title="Talk to human">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>
        </div>`
      : '';

    messageEl.innerHTML = `
      ${avatar}
      <div class="message-body">
        <div class="message-content">${this.parseMessageContent(message.content)}</div>
        ${citations}
        ${actions}
      </div>
    `;

    messagesContainer.appendChild(messageEl);

    // Attach action listeners
    if (message.role === 'assistant') {
      messageEl.querySelector('.copy-btn')?.addEventListener('click', () => this.copyMessage(message.content));
      messageEl.querySelector('.share-btn')?.addEventListener('click', () => this.shareMessage(message.content));
      messageEl.querySelector('.escalate-btn')?.addEventListener('click', () => this.openEscalation());
      messageEl.querySelectorAll('.rating-btn').forEach(btn => {
        btn.addEventListener('click', () => this.rateMessage(message.id, parseInt(btn.getAttribute('data-rating'))));
      });
    }
  }

  parseMessageContent(content) {
    // Basic markdown-like parsing
    let html = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    
    return html;
  }

  copyMessage(content) {
    const text = content.replace(/<[^>]*>/g, '');
    navigator.clipboard.writeText(text).then(() => {
      // Show toast notification
      this.showToast('Copied to clipboard!');
    });
  }

  shareMessage(content) {
    const shareData = {
      title: 'Ledgr Assistant Response',
      text: content.replace(/<[^>]*>/g, ''),
    };

    if (navigator.share) {
      navigator.share(shareData);
    } else {
      // Fallback: copy to clipboard
      this.copyMessage(content);
    }
  }

  rateMessage(messageId, rating) {
    const message = this.chatHistory.find(m => m.id === messageId);
    if (message) {
      message.rating = rating;
      const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
      const buttons = messageEl?.querySelectorAll('.rating-btn');
      buttons?.forEach(btn => btn.classList.remove('active'));
      if (rating === 1) {
        messageEl?.querySelector('.helpful')?.classList.add('active');
      } else if (rating === -1) {
        messageEl?.querySelector('.not-helpful')?.classList.add('active');
      }
      
      this.showToast('Thank you for your feedback!');
    }
  }

  openEscalation() {
    // This will be handled by EscalationModal class
    window.dispatchEvent(new CustomEvent('chat:escalate', {
      detail: {
        sessionId: this.state.currentSessionId,
        lastMessage: this.chatHistory[this.chatHistory.length - 1]?.content || '',
        context: this.chatHistory.slice(-5),
      }
    }));
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'chat-toast';
    toast.textContent = message;
    this.container?.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  scrollToBottom() {
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 0);
    }
  }

  autoExpandTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }

  handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('chat-form')?.dispatchEvent(new Event('submit'));
    }
  }

  toggle() {
    if (this.state.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.state.isOpen = true;
    this.state.unreadCount = 0;
    this.render();
    this.attachEventListeners();
    document.getElementById('chat-toggle')?.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
  }

  close() {
    this.state.isOpen = false;
    this.render();
    this.attachEventListeners();
    document.getElementById('chat-toggle')?.setAttribute('aria-expanded', 'false');
  }

  toggleMinimize() {
    this.state.isMinimized = !this.state.isMinimized;
    this.container?.querySelector('.chat-container')?.classList.toggle('minimized');
  }

  toggleDarkMode() {
    this.state.isDarkMode = !this.state.isDarkMode;
    localStorage.setItem('chat-dark-mode', this.state.isDarkMode);
    this.container?.querySelector('.ledgr-chat-widget')?.classList.toggle('dark');
    this.container?.querySelector('.ledgr-chat-widget')?.classList.toggle('light');
  }

  newChat() {
    const sessionId = `session-${Date.now()}`;
    this.state.currentSessionId = sessionId;
    this.chatHistory = [];
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').focus();
    document.getElementById('suggested-prompts')?.removeAttribute('hidden');
  }

  loadSessions() {
    const stored = localStorage.getItem('chat-sessions');
    this.state.sessions = stored ? JSON.parse(stored) : [];
  }

  saveSessions() {
    localStorage.setItem('chat-sessions', JSON.stringify(this.state.sessions));
  }

  filterSessions(query) {
    const sessionsList = document.getElementById('sessions-list');
    if (!sessionsList) return;

    const filtered = this.state.sessions.filter(s => 
      s.title.toLowerCase().includes(query.toLowerCase())
    );

    sessionsList.innerHTML = filtered.map(session => `
      <button class="session-item ${session.id === this.state.currentSessionId ? 'active' : ''}">
        <span class="session-title">${session.title}</span>
        <span class="session-date">${new Date(session.updatedAt).toLocaleDateString()}</span>
      </button>
    `).join('');
  }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
  window.ChatWidget = ChatWidget;
}
