/* ============================================================================
   FEEDBACK INTELLIGENCE ANALYZER - AI-Powered Insights
   ============================================================================ */

const FeedbackAnalyzer = (() => {
  // API endpoint for Claude analysis (you'll replace with your actual endpoint)
  const API_CONFIG = {
    endpoint: 'https://api.anthropic.com/v1/messages', // Replace with your backend proxy
    model: 'claude-3-5-sonnet-20241022',
    timeout: 10000
  };

  // Topic taxonomy
  const TOPICS = [
    'pricing',
    'compliance',
    'ease-of-use',
    'performance',
    'features',
    'support',
    'ui-ux',
    'documentation',
    'onboarding',
    'multi-currency',
    'vat-automation',
    'reporting',
    'integrations',
    'security',
    'scalability'
  ];

  // Analyze feedback for sentiment and topics
  async function analyzeFeedback(feedbackText) {
    try {
      const response = await claudeAPI.analyzeSentimentAndTopics(feedbackText);
      
      return {
        sentiment: response.sentiment, // positive | negative | neutral | feature_request
        topics: response.topics, // Array of detected topics
        score: response.confidence_score, // 0-1 confidence
        summary: response.summary // Brief AI summary
      };
    } catch (error) {
      console.error('Feedback analysis failed:', error);
      // Fallback: simple client-side analysis
      return fallbackAnalyze(feedbackText);
    }
  }

  // Fallback sentiment analysis (client-side, no API)
  function fallbackAnalyze(text) {
    const lowerText = text.toLowerCase();
    
    // Sentiment detection
    const positiveWords = ['love', 'great', 'amazing', 'excellent', 'perfect', 'awesome', 'helpful', 'easy', 'clear', 'fast', 'smooth', 'intuitive', 'impressed'];
    const negativeWords = ['hate', 'terrible', 'awful', 'broken', 'confusing', 'slow', 'difficult', 'unclear', 'frustrating', 'annoying', 'bug', 'issue', 'problem', 'crash'];
    const featureWords = ['need', 'want', 'feature', 'add', 'support', 'implement', 'would be nice', 'request', 'missing', 'should have'];
    
    const positiveCount = positiveWords.filter(w => lowerText.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lowerText.includes(w)).length;
    const featureCount = featureWords.filter(w => lowerText.includes(w)).length;

    let sentiment = 'neutral';
    if (featureCount > 0 && negativeCount === 0 && positiveCount === 0) {
      sentiment = 'feature_request';
    } else if (positiveCount > negativeCount) {
      sentiment = 'positive';
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
    }

    // Topic detection
    const detectedTopics = [];
    const topicKeywords = {
      'pricing': ['price', 'cost', 'expensive', 'cheap', 'aed', 'fee', 'payment'],
      'compliance': ['vat', 'tax', 'regulatory', 'audit', 'legal', 'compliance', 'dfsa', 'fta'],
      'ease-of-use': ['easy', 'simple', 'intuitive', 'confusing', 'difficult', 'straightforward', 'complex'],
      'performance': ['fast', 'slow', 'speed', 'lag', 'crash', 'loading', 'responsive'],
      'features': ['feature', 'function', 'capability', 'support', 'missing'],
      'multi-currency': ['currency', 'fx', 'international', 'export', 'import', 'gbp', 'usd', 'eur'],
      'vat-automation': ['vat', 'automat', 'tracking', 'invoice', 'transaction', 'line item'],
      'reporting': ['report', 'dashboard', 'analytics', 'export', 'data', 'visualiz'],
      'ui-ux': ['design', 'layout', 'button', 'interface', 'dark mode', 'theme', 'navigation'],
      'support': ['help', 'support', 'documentation', 'tutorial', 'guide', 'faq', 'contact']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(kw => lowerText.includes(kw))) {
        detectedTopics.push(topic);
      }
    }

    return {
      sentiment: sentiment,
      topics: detectedTopics.slice(0, 3), // Max 3 topics
      score: 0.65, // Fallback confidence
      summary: `User expressed ${sentiment} sentiment about Ledgr.`
    };
  }

  // Generate context-aware questions based on feedback
  async function generateContextualQuestions(pageContext, userBehavior) {
    try {
      const response = await claudeAPI.generateQuestions({
        page: pageContext,
        timeSpent: userBehavior.timeOnPage,
        scrollDepth: userBehavior.scrollDepth,
        interactions: userBehavior.interactions
      });

      return response.questions; // Array of question objects
    } catch (error) {
      console.error('Question generation failed:', error);
      return getDefaultQuestions(pageContext);
    }
  }

  // Get default questions (fallback)
  function getDefaultQuestions(pageContext) {
    const defaultQuestions = {
      'pricing.html': [
        { id: 'pricing-clarity', type: 'rating', label: 'How clear is our pricing?' },
        { id: 'pricing-value', type: 'dropdown', label: 'What would improve pricing?' }
      ],
      'demo.html': [
        { id: 'demo-clarity', type: 'rating', label: 'How clear was the demo?' },
        { id: 'demo-features', type: 'checkboxes', label: 'Which features interested you?' }
      ],
      '/': [
        { id: 'interest', type: 'dropdown', label: 'What interests you most?' }
      ]
    };

    return defaultQuestions[pageContext] || [
      { id: 'overall-interest', type: 'rating', label: 'How interested are you?' }
    ];
  }

  // Rank feature requests by impact and frequency
  function rankFeatureRequests(allFeedback) {
    const featureRequests = {};

    allFeedback.forEach(feedback => {
      if (feedback.analysis && feedback.analysis.sentiment === 'feature_request') {
        feedback.analysis.topics.forEach(topic => {
          if (!featureRequests[topic]) {
            featureRequests[topic] = {
              topic: topic,
              count: 0,
              avgRating: 0,
              ratings: [],
              lastMentioned: null
            };
          }
          featureRequests[topic].count++;
          featureRequests[topic].ratings.push(feedback.data['overall-satisfaction'] || 3);
          featureRequests[topic].avgRating = 
            featureRequests[topic].ratings.reduce((a, b) => a + b, 0) / featureRequests[topic].ratings.length;
          featureRequests[topic].lastMentioned = feedback.timestamp;
        });
      }
    });

    // Calculate impact score: (frequency × avg_rating) / days_since_mention
    const scored = Object.values(featureRequests).map(req => {
      const daysSince = (new Date() - new Date(req.lastMentioned)) / (1000 * 60 * 60 * 24) || 1;
      req.impactScore = (req.count * req.avgRating) / Math.max(daysSince, 1);
      return req;
    });

    return scored.sort((a, b) => b.impactScore - a.impactScore);
  }

  // Analyze sentiment distribution
  function analyzeSentimentDistribution(allFeedback) {
    const distribution = {
      positive: 0,
      negative: 0,
      neutral: 0,
      feature_request: 0
    };

    allFeedback.forEach(feedback => {
      if (feedback.analysis && feedback.analysis.sentiment) {
        distribution[feedback.analysis.sentiment]++;
      }
    });

    const total = Object.values(distribution).reduce((a, b) => a + b, 1);
    
    return {
      positive: Math.round((distribution.positive / total) * 100),
      negative: Math.round((distribution.negative / total) * 100),
      neutral: Math.round((distribution.neutral / total) * 100),
      feature_request: Math.round((distribution.feature_request / total) * 100)
    };
  }

  // Extract key themes from feedback
  function extractThemes(allFeedback, limit = 5) {
    const themes = {};

    allFeedback.forEach(feedback => {
      if (feedback.analysis && feedback.analysis.topics) {
        feedback.analysis.topics.forEach(topic => {
          themes[topic] = (themes[topic] || 0) + 1;
        });
      }
    });

    return Object.entries(themes)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // Create topic heatmap (pages × topics)
  function createTopicHeatmap(allFeedback) {
    const pages = {};

    allFeedback.forEach(feedback => {
      const page = feedback.page || 'unknown';
      if (!pages[page]) {
        pages[page] = {};
      }

      if (feedback.analysis && feedback.analysis.topics) {
        feedback.analysis.topics.forEach(topic => {
          pages[page][topic] = (pages[page][topic] || 0) + 1;
        });
      }
    });

    return pages;
  }

  // Calculate metrics
  function calculateMetrics(allFeedback) {
    if (allFeedback.length === 0) {
      return {
        totalFeedback: 0,
        avgSatisfaction: 0,
        sentimentScore: 0,
        topFeatures: [],
        trendingTopics: []
      };
    }

    const ratings = allFeedback
      .map(fb => fb.data['overall-satisfaction'])
      .filter(r => r !== undefined);
    
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const sentiments = analyzeSentimentDistribution(allFeedback);
    const sentimentScore = (sentiments.positive - sentiments.negative) / 100;

    return {
      totalFeedback: allFeedback.length,
      avgSatisfaction: avgRating.toFixed(1),
      sentimentScore: sentimentScore.toFixed(2),
      topFeatures: rankFeatureRequests(allFeedback).slice(0, 5),
      trendingTopics: extractThemes(allFeedback, 5),
      sentimentDistribution: sentiments
    };
  }

  // Mock Claude API (replace with real API calls)
  const claudeAPI = {
    analyzeSentimentAndTopics: async (text) => {
      // In production, this calls your backend which proxies to Claude API
      return new Promise((resolve) => {
        // Simulate API delay
        setTimeout(() => {
          const analyzed = fallbackAnalyze(text);
          resolve(analyzed);
        }, 100);
      });
    },

    generateQuestions: async (context) => {
      // In production, this generates smart contextual questions
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ questions: getDefaultQuestions(context.page) });
        }, 100);
      });
    }
  };

  // ===== PHASE 5: ADVANCED FEATURES =====

  // Cohort Segmentation: Classify users by role and scale
  function classifyUserCohort(feedback) {
    const text = (feedback.data.notes || '').toLowerCase();
    const email = (feedback.data.email || '').toLowerCase();

    // Role detection
    let role = 'other';
    const accountantKeywords = ['accountant', 'cpa', 'bookkeep', 'reconcil', 'tax', 'audit'];
    const founderKeywords = ['founder', 'ceo', 'startup', 'entrepreneur', 'build', 'launch', 'grow'];
    
    if (accountantKeywords.some(kw => text.includes(kw) || email.includes(kw))) {
      role = 'accountant';
    } else if (founderKeywords.some(kw => text.includes(kw) || email.includes(kw))) {
      role = 'founder';
    }

    // Scale detection
    let scale = 'sme';
    const enterpriseKeywords = ['enterprise', 'large', 'team', 'staff', 'department', 'multi-office', 'org'];
    const smeKeywords = ['small', 'startup', 'solo', 'freelance', 'owner'];
    
    if (enterpriseKeywords.some(kw => text.includes(kw) || email.includes(kw))) {
      scale = 'enterprise';
    } else if (smeKeywords.some(kw => text.includes(kw) || email.includes(kw))) {
      scale = 'sme';
    }

    // Geography detection
    let region = 'international';
    const uaeKeywords = ['uae', 'dubai', 'abu dhabi', 'sharjah', 'aed', 'dhs', '.ae', '@ae'];
    if (uaeKeywords.some(kw => text.includes(kw) || email.includes(kw))) {
      region = 'uae';
    }

    return {
      role: role, // accountant | founder | other
      scale: scale, // sme | enterprise
      region: region // uae | international
    };
  }

  // Segment all feedback by cohorts
  function segmentByCohorts(allFeedback) {
    const cohorts = {
      'accountant_sme_uae': { feedback: [], count: 0 },
      'accountant_sme_intl': { feedback: [], count: 0 },
      'accountant_enterprise_uae': { feedback: [], count: 0 },
      'accountant_enterprise_intl': { feedback: [], count: 0 },
      'founder_sme_uae': { feedback: [], count: 0 },
      'founder_sme_intl': { feedback: [], count: 0 },
      'founder_enterprise_uae': { feedback: [], count: 0 },
      'founder_enterprise_intl': { feedback: [], count: 0 },
      'other': { feedback: [], count: 0 }
    };

    allFeedback.forEach(fb => {
      const cohort = classifyUserCohort(fb);
      const key = `${cohort.role}_${cohort.scale}_${cohort.region}`;
      const cohortKey = cohorts[key] ? key : 'other';
      
      cohorts[cohortKey].feedback.push(fb);
      cohorts[cohortKey].count++;
    });

    return cohorts;
  }

  // Sentiment trend analysis: Track sentiment over time
  function analyzeSentimentTrends(allFeedback, intervalDays = 7) {
    const trends = {};
    const now = new Date();

    allFeedback.forEach(fb => {
      const fbDate = new Date(fb.timestamp);
      const daysAgo = Math.floor((now - fbDate) / (1000 * 60 * 60 * 24));
      const bucket = Math.floor(daysAgo / intervalDays) * intervalDays;
      const bucketLabel = `${bucket}-${bucket + intervalDays}d`;

      if (!trends[bucketLabel]) {
        trends[bucketLabel] = { positive: 0, negative: 0, neutral: 0, total: 0 };
      }

      if (fb.analysis && fb.analysis.sentiment) {
        const sent = fb.analysis.sentiment === 'feature_request' ? 'neutral' : fb.analysis.sentiment;
        trends[bucketLabel][sent]++;
        trends[bucketLabel].total++;
      }
    });

    // Convert to percentages
    const percentTrends = {};
    Object.entries(trends).forEach(([period, counts]) => {
      percentTrends[period] = {
        positive: counts.total > 0 ? Math.round((counts.positive / counts.total) * 100) : 0,
        negative: counts.total > 0 ? Math.round((counts.negative / counts.total) * 100) : 0,
        neutral: counts.total > 0 ? Math.round((counts.neutral / counts.total) * 100) : 0
      };
    });

    return percentTrends;
  }

  // Correlation analysis: Which features are mentioned together
  function analyzeFeatureCorrelations(allFeedback) {
    const correlations = {};
    const topTopics = extractThemes(allFeedback, 10).map(t => t.topic);

    allFeedback.forEach(fb => {
      if (fb.analysis && fb.analysis.topics && fb.analysis.topics.length > 1) {
        const topics = fb.analysis.topics.filter(t => topTopics.includes(t));
        
        for (let i = 0; i < topics.length; i++) {
          for (let j = i + 1; j < topics.length; j++) {
            const pair = [topics[i], topics[j]].sort().join(' + ');
            correlations[pair] = (correlations[pair] || 0) + 1;
          }
        }
      }
    });

    return Object.entries(correlations)
      .map(([pair, count]) => ({ pair, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // Cohort insights: Compare feature preferences across cohorts
  function analyzeCohortInsights(allFeedback) {
    const cohorts = segmentByCohorts(allFeedback);
    const insights = {};

    Object.entries(cohorts).forEach(([cohortName, { feedback }]) => {
      if (feedback.length === 0) return;

      const topFeatures = rankFeatureRequests(feedback).slice(0, 3);
      const avgRating = feedback
        .map(fb => fb.data['overall-satisfaction'])
        .filter(r => r !== undefined)
        .reduce((a, b) => a + b, 0) / feedback.length;

      insights[cohortName] = {
        count: feedback.length,
        avgRating: avgRating.toFixed(1),
        topFeatures: topFeatures.map(f => f.topic),
        sentiment: analyzeSentimentDistribution(feedback)
      };
    });

    // Calculate relative preferences
    const topGlobalFeatures = rankFeatureRequests(allFeedback).slice(0, 5).map(f => f.topic);
    const preferences = {};

    topGlobalFeatures.forEach(feature => {
      preferences[feature] = {};
      
      Object.entries(insights).forEach(([cohort, data]) => {
        const mentionCount = data.topFeatures.filter(f => f === feature).length || 0;
        const cohortMentionRate = mentionCount / Math.max(data.count, 1);
        const globalMentionRate = allFeedback.filter(fb => 
          fb.analysis && fb.analysis.topics && fb.analysis.topics.includes(feature)
        ).length / Math.max(allFeedback.length, 1);

        const multiplier = globalMentionRate > 0 ? (cohortMentionRate / globalMentionRate).toFixed(1) : 0;
        preferences[feature][cohort] = multiplier;
      });
    });

    return {
      cohortMetrics: insights,
      featurePreferences: preferences
    };
  }

  // Email digest generation: Weekly summary for admins
  function generateEmailDigest(allFeedback, daysBack = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const recentFeedback = allFeedback.filter(fb => new Date(fb.timestamp) > cutoff);
    
    if (recentFeedback.length === 0) {
      return {
        subject: `Ledgr Feedback Summary - Last ${daysBack} Days`,
        html: '<p>No feedback collected in this period.</p>'
      };
    }

    const topFeatures = rankFeatureRequests(recentFeedback).slice(0, 5);
    const distribution = analyzeSentimentDistribution(recentFeedback);
    const avgRating = recentFeedback
      .map(fb => fb.data['overall-satisfaction'])
      .filter(r => r !== undefined)
      .reduce((a, b) => a + b, 0) / Math.max(recentFeedback.length, 1);

    const html = `
      <h2>📊 Ledgr Feedback Digest - Last ${daysBack} Days</h2>
      
      <h3>📈 Quick Stats</h3>
      <ul>
        <li><strong>${recentFeedback.length}</strong> feedback submissions</li>
        <li><strong>${avgRating.toFixed(1)}</strong>/5.0 average satisfaction</li>
        <li><strong>${distribution.positive}%</strong> positive sentiment</li>
        <li><strong>${distribution.negative}%</strong> negative sentiment</li>
      </ul>

      <h3>⭐ Top 5 Feature Requests</h3>
      <ol>
        ${topFeatures.map((f, i) => `
          <li><strong>${f.topic}</strong> - requested <strong>${f.count}</strong> times (impact score: ${f.impactScore.toFixed(2)})</li>
        `).join('')}
      </ol>

      <h3>💬 Recent Highlights</h3>
      ${recentFeedback.slice(0, 3).map(fb => `
        <blockquote>
          <p>"${fb.data.notes || '(no message)'}"</p>
          <small>— ${fb.data.email || 'Anonymous'} (${fb.data['overall-satisfaction'] || 0}⭐)</small>
        </blockquote>
      `).join('')}

      <hr>
      <p><small>Dashboard: <a href="https://yourdomain.com/admin/feedback-intelligence.html">View Full Dashboard</a></small></p>
    `;

    return {
      subject: `Ledgr Feedback Digest - ${new Date().toLocaleDateString()}`,
      html: html,
      timestamp: new Date().toISOString()
    };
  }

  // Webhook integration: Send feedback to external services
  function sendToWebhook(webhook, feedback, eventType = 'feedback_submitted') {
    if (!webhook || !webhook.url) return Promise.resolve();

    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: feedback,
      metadata: {
        source: 'ledgr-feedback-intelligence',
        version: '1.0'
      }
    };

    // Log webhook call (in production, use actual fetch)
    console.log(`📤 Webhook: ${webhook.url}`, payload);

    // Simulate webhook delivery
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          webhookUrl: webhook.url,
          eventType: eventType,
          timestamp: new Date().toISOString()
        });
      }, 100);
    });
  }

  // Register webhooks for feedback events
  function registerWebhook(url, events = ['feedback_submitted', 'feedback_analyzed']) {
    const webhooks = JSON.parse(localStorage.getItem('ledgr_webhooks') || '[]');
    
    const webhook = {
      id: 'wh_' + Date.now(),
      url: url,
      events: events,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      deliveryCount: 0
    };

    webhooks.push(webhook);
    localStorage.setItem('ledgr_webhooks', JSON.stringify(webhooks));

    return webhook;
  }

  // Get all registered webhooks
  function getWebhooks() {
    return JSON.parse(localStorage.getItem('ledgr_webhooks') || '[]');
  }

  // Delete webhook
  function deleteWebhook(webhookId) {
    const webhooks = JSON.parse(localStorage.getItem('ledgr_webhooks') || '[]');
    const filtered = webhooks.filter(w => w.id !== webhookId);
    localStorage.setItem('ledgr_webhooks', JSON.stringify(filtered));
  }

  // ===== END PHASE 5 =====

  // Public API
  return {
    analyzeFeedback,
    generateContextualQuestions,
    rankFeatureRequests,
    analyzeSentimentDistribution,
    extractThemes,
    createTopicHeatmap,
    calculateMetrics,
    // Phase 5 additions
    classifyUserCohort,
    segmentByCohorts,
    analyzeSentimentTrends,
    analyzeFeatureCorrelations,
    analyzeCohortInsights,
    generateEmailDigest,
    sendToWebhook,
    registerWebhook,
    getWebhooks,
    deleteWebhook,
    TOPICS
  };
})();
