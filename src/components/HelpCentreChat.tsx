/**
 * Help Centre Chat UI Component
 * Beautiful, fast, accessible chat widget
 * Mobile-optimized with dark mode support
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ChatSession, RAGRetrievalResult } from '../types/help-centre-types';

interface HelpCentreChatProps {
  userId: string;
  sessionId?: string;
  onEscalate?: (reason: string) => void;
  theme?: 'light' | 'dark';
}

interface UIState {
  messages: ChatMessage[];
  isLoading: boolean;
  showSuggestions: boolean;
  showSources: boolean;
  rating?: number;
  session?: ChatSession;
}

export const HelpCentreChat: React.FC<HelpCentreChatProps> = ({
  userId,
  sessionId,
  onEscalate,
  theme = 'light',
}) => {
  const [state, setState] = useState<UIState>({
    messages: [],
    isLoading: false,
    showSuggestions: true,
    showSources: false,
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      userId,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      showSuggestions: false,
    }));

    setInput('');

    try {
      // Call help centre API
      const response = await fetch('/api/help-centre/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId: sessionId || `session-${userId}-${Date.now()}`,
          message: input,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          userId,
          role: 'assistant',
          content: data.response.content,
          timestamp: new Date(),
          sourceDocuments: data.response.sources,
          metadata: {
            confidence: data.response.confidence,
            escalationSuggested: data.response.suggestEscalation,
          },
        };

        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage],
          isLoading: false,
        }));
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now() + 2}`,
        userId,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again or contact support.',
        timestamp: new Date(),
      };
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
        isLoading: false,
      }));
    }
  };

  const handleRate = (rating: number) => {
    setState((prev) => ({ ...prev, rating }));
    // Log rating to analytics
    console.log(`User rated response: ${rating}/5`);
  };

  const handleEscalate = () => {
    if (onEscalate) {
      onEscalate('User requested human support');
    }
  };

  const lastMessage = state.messages[state.messages.length - 1];
  const showEscalation = lastMessage?.role === 'assistant' && lastMessage?.metadata?.escalationSuggested;

  return (
    <div
      className={`help-centre-chat ${theme} ${
        theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'
      }`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: '600px',
        margin: '0 auto',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="help-centre-header"
        style={{
          background: 'linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)',
          color: 'white',
          padding: '20px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Ledgr Support</h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
          AI-powered help, always available
        </p>
      </div>

      {/* Messages Area */}
      <div
        className="help-centre-messages"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          backgroundColor: theme === 'dark' ? '#1f2937' : '#f9fafb',
        }}
      >
        {state.messages.length === 0 && state.showSuggestions && (
          <div
            className="welcome-message"
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: theme === 'dark' ? '#d1d5db' : '#6b7280',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>👋</div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Welcome to Ledgr Support!</h2>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px' }}>
              Ask me anything about your finances. I'm here to help.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                'How do I reconcile?',
                'QB sync failed',
                'Permission denied',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${
                      theme === 'dark' ? '#4b5563' : '#e5e7eb'
                    }`,
                    backgroundColor: theme === 'dark' ? '#374151' : '#f3f4f6',
                    color: theme === 'dark' ? 'white' : '#1f2937',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      theme === 'dark' ? '#4b5563' : '#e5e7eb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      theme === 'dark' ? '#374151' : '#f3f4f6';
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            {msg.role === 'user' ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    backgroundColor: '#FF6B35',
                    color: 'white',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    borderBottomRightRadius: '4px',
                    maxWidth: '80%',
                    wordWrap: 'break-word',
                    fontSize: '14px',
                    lineHeight: '1.4',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                <div
                  style={{
                    backgroundColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                    color: theme === 'dark' ? 'white' : '#1f2937',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    borderBottomLeftRadius: '4px',
                    maxWidth: '85%',
                    wordWrap: 'break-word',
                    fontSize: '14px',
                    lineHeight: '1.5',
                  }}
                >
                  {msg.content}
                </div>

                {/* Source Documents */}
                {msg.sourceDocuments && msg.sourceDocuments.length > 0 && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: theme === 'dark' ? '#9ca3af' : '#6b7280',
                      marginTop: '4px',
                    }}
                  >
                    <button
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          showSources: !prev.showSources,
                        })}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#FF6B35',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        padding: 0,
                      }}
                    >
                      📚 {state.showSources ? 'Hide' : 'Show'} sources ({msg.sourceDocuments.length})
                    </button>

                    {state.showSources && (
                      <div style={{ marginTop: '8px', paddingLeft: '0' }}>
                        {msg.sourceDocuments.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.link}
                            style={{
                              display: 'block',
                              color: '#FF6B35',
                              textDecoration: 'none',
                              fontSize: '11px',
                              marginBottom: '4px',
                              transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.opacity = '0.7')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.opacity = '1')
                            }
                          >
                            → {doc.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Rating */}
                {msg.role === 'assistant' && msg === lastMessage && !state.rating && (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '12px', color: theme === 'dark' ? '#9ca3af' : '#6b7280' }}>
                      Was this helpful?
                    </span>
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleRate(num)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '16px',
                          cursor: 'pointer',
                          padding: 0,
                          opacity: 0.6,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                      >
                        {num <= 3 ? '👎' : num === 4 ? '👍' : '🎉'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {state.isLoading && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div
              style={{
                backgroundColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                padding: '12px 16px',
                borderRadius: '12px',
                borderBottomLeftRadius: '4px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: '8px',
                      height: '8px',
                      backgroundColor: '#FF6B35',
                      borderRadius: '50%',
                      animation: `pulse 1.4s infinite`,
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {showEscalation && (
          <div
            style={{
              backgroundColor: theme === 'dark' ? '#7c3aed' : '#ede9fe',
              color: theme === 'dark' ? 'white' : '#6d28d9',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span>Need deeper help? Connect with a specialist.</span>
            <button
              onClick={handleEscalate}
              style={{
                background: 'white',
                color: theme === 'dark' ? '#7c3aed' : '#6d28d9',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Talk to Human
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSendMessage}
        style={{
          padding: '16px',
          borderTop: `1px solid ${
            theme === 'dark' ? '#374151' : '#e5e7eb'
          }`,
          backgroundColor: theme === 'dark' ? '#1f2937' : 'white',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything..."
          disabled={state.isLoading}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '8px',
            border: `1px solid ${
              theme === 'dark' ? '#4b5563' : '#d1d5db'
            }`,
            backgroundColor: theme === 'dark' ? '#374151' : '#f9fafb',
            color: theme === 'dark' ? 'white' : '#1f2937',
            fontSize: '14px',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#FF6B35';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = theme === 'dark' ? '#4b5563' : '#d1d5db';
          }}
        />
        <button
          type="submit"
          disabled={state.isLoading || !input.trim()}
          style={{
            padding: '12px 24px',
            backgroundColor: '#FF6B35',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: state.isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: state.isLoading || !input.trim() ? 0.5 : 1,
            transition: 'opacity 0.2s',
            fontSize: '14px',
          }}
          onMouseEnter={(e) => {
            if (!state.isLoading && input.trim()) {
              e.currentTarget.style.opacity = '0.9';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = state.isLoading || !input.trim() ? '0.5' : '1';
          }}
        >
          {state.isLoading ? '...' : 'Send'}
        </button>
      </form>

      <style>{`
        @keyframes pulse {
          0%, 60%, 100% {
            opacity: 0.3;
          }
          30% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default HelpCentreChat;
