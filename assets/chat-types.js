/**
 * @typedef {Object} ChatMessage
 * @property {string} id - Unique message identifier
 * @property {string} content - Message text content
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {number} timestamp - Unix timestamp
 * @property {boolean} [isStreaming] - Whether message is still streaming
 * @property {Array<{text: string, url: string}>} [citations] - Help article citations
 * @property {number} [rating] - -1 (not helpful), 0 (unrated), 1 (helpful)
 */

/**
 * @typedef {Object} ChatSession
 * @property {string} id - Session identifier
 * @property {string} title - Display title
 * @property {number} createdAt - Unix timestamp
 * @property {number} updatedAt - Unix timestamp
 * @property {Array<ChatMessage>} messages - Conversation history
 * @property {number} unreadCount - Unread messages
 */

/**
 * @typedef {Object} EscalationPayload
 * @property {string} issueSummary - Brief problem description
 * @property {string} contactTime - Preferred contact time
 * @property {string} priority - 'urgent' | 'standard'
 * @property {string} sessionId - Associated chat session
 * @property {Array<ChatMessage>} context - Recent messages
 */

/**
 * @typedef {Object} ChatWidgetConfig
 * @property {string} [apiBaseUrl] - AI service endpoint
 * @property {string} [whatsappNumber] - Escalation WhatsApp number
 * @property {boolean} [enableDarkMode] - Dark mode toggle
 * @property {number} [maxHistoryItems] - Max saved sessions
 * @property {string} [position] - 'bottom-right' | 'bottom-left'
 * @property {string} [primaryColor] - Brand primary color
 * @property {string} [accentColor] - Accent color
 */

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChatMessage, ChatSession, EscalationPayload, ChatWidgetConfig };
}
