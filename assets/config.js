/**
 * Ledgr Frontend Configuration
 * Dynamically determines API endpoint based on environment
 */

(function() {
  // Detect environment and set API endpoint
  const detectApiEndpoint = () => {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    // Development environment (localhost)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//localhost:3001`;
    }

    // Staging environment
    if (hostname === 'staging.ledgr.com' || hostname === 'staging-api.ledgr.com') {
      return 'https://api-staging.ledgr.com';
    }

    // Production environment
    if (hostname === 'ledgr.com' || hostname === 'app.ledgr.com') {
      return 'https://api.ledgr.com';
    }

    // Custom domain fallback (assume API is on same domain, port 3001)
    if (hostname.includes('ledgr') || hostname.includes('accounting')) {
      return `${protocol}//${hostname.split(':')[0]}:3001`;
    }

    // Default: assume API is on same domain
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${protocol}//${hostname}${port}`;
  };

  // Export configuration globally
  window.LedgrConfig = {
    apiEndpoint: detectApiEndpoint(),
    apiVersion: '/v1',
    
    // Get full API URL for a given path
    getApiUrl: function(path) {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return `${this.apiEndpoint}${this.apiVersion}${cleanPath}`;
    },

    // Authentication endpoints
    auth: {
      login: function() {
        return window.LedgrConfig.getApiUrl('/auth/login');
      },
      refresh: function() {
        return window.LedgrConfig.getApiUrl('/auth/refresh');
      },
      logout: function() {
        return window.LedgrConfig.getApiUrl('/auth/logout');
      },
    },

    // Storage keys
    storage: {
      accessToken: 'ledgr_access_token',
      refreshToken: 'ledgr_refresh_token',
      userId: 'ledgr_user_id',
      workspaceId: 'ledgr_workspace_id',
    },

    // Debugging
    debug: function() {
      console.log('Ledgr Configuration:');
      console.log('  API Endpoint:', this.apiEndpoint);
      console.log('  API Version:', this.apiVersion);
      console.log('  Environment:', hostname);
      console.log('  Login URL:', this.auth.login());
    }
  };

  // Log config on load in development
  if (window.location.hostname === 'localhost') {
    console.log('[Ledgr Config] Initialized:', window.LedgrConfig.apiEndpoint);
  }
})();
