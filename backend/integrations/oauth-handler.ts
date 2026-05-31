/**
 * OAuth Handler
 * Centralized OAuth 2.0 flow management for all integrations
 * Supports authorization code flow with PKCE, token refresh, and revocation
 */

import crypto from 'crypto';
import https from 'https';
import { URL } from 'url';
import {
  OAuthToken,
  OAuthFlowState,
  OAuthConfig,
} from './integration-types';
import { Logger } from './base';

// ============================================================================
// OAuth State Management
// ============================================================================

export class OAuthStateManager {
  private states = new Map<string, OAuthFlowState>();
  private logger = new Logger('OAuthStateManager');
  private stateExpiryMs = 10 * 60 * 1000; // 10 minutes

  generateState(integrationId: string): OAuthFlowState {
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    const flowState: OAuthFlowState = {
      state,
      codeVerifier,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.stateExpiryMs,
      integrationId,
    };

    this.states.set(state, flowState);
    this.logger.info('State generated', { integrationId, state });

    return flowState;
  }

  validateState(state: string, integrationId: string): OAuthFlowState | null {
    const flowState = this.states.get(state);

    if (!flowState) {
      this.logger.warn('Invalid state', { state, integrationId });
      return null;
    }

    if (Date.now() > flowState.expiresAt) {
      this.logger.warn('State expired', { state, integrationId });
      this.states.delete(state);
      return null;
    }

    if (flowState.integrationId !== integrationId) {
      this.logger.warn('State integration mismatch', {
        state,
        expected: flowState.integrationId,
        actual: integrationId,
      });
      return null;
    }

    // Remove used state
    this.states.delete(state);
    return flowState;
  }

  generateCodeChallenge(codeVerifier: string): string {
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  }

  cleanupExpiredStates(): void {
    let cleaned = 0;
    for (const [state, flowState] of this.states.entries()) {
      if (Date.now() > flowState.expiresAt) {
        this.states.delete(state);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} expired states`);
    }
  }
}

// ============================================================================
// HTTP Client for OAuth Requests
// ============================================================================

export class HttpClient {
  private logger = new Logger('HttpClient');

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    options?: {
      headers?: Record<string, string>;
      body?: string | Record<string, any>;
      timeout?: number;
    }
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : require('http');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Ledgr/1.0',
        ...options?.headers,
      };

      let body = '';
      if (options?.body) {
        body = typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body);
        headers['Content-Length'] = Buffer.byteLength(body).toString();
      }

      const req = client.request(
        urlObj,
        {
          method,
          headers,
          timeout: options?.timeout || 30000,
        },
        (res: any) => {
          let data = '';

          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });

          res.on('end', () => {
            try {
              if (res.statusCode >= 400) {
                const error: any = new Error(`HTTP ${res.statusCode}`);
                error.statusCode = res.statusCode;
                error.body = data;
                reject(error);
              } else {
                resolve(data ? JSON.parse(data) : {});
              }
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', (err: Error) => {
        this.logger.error('HTTP request failed', { url, error: err.message });
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout for ${url}`));
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  async get<T>(url: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', url, { headers });
  }

  async post<T>(
    url: string,
    body?: Record<string, any>,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>('POST', url, { body, headers });
  }
}

// ============================================================================
// OAuth 2.0 Handler
// ============================================================================

export class OAuthHandler {
  private config: OAuthConfig;
  private stateManager: OAuthStateManager;
  private httpClient: HttpClient;
  private logger: Logger;

  constructor(config: OAuthConfig) {
    this.config = config;
    this.stateManager = new OAuthStateManager();
    this.httpClient = new HttpClient();
    this.logger = new Logger('OAuthHandler');
  }

  /**
   * Generate authorization URL for user to visit
   */
  getAuthorizationUrl(integrationId: string): string {
    const flowState = this.stateManager.generateState(integrationId);
    const codeChallenge = this.stateManager.generateCodeChallenge(
      flowState.codeVerifier!
    );

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scope.join(' '),
      state: flowState.state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${this.config.authorizationUrl}?${params.toString()}`;
    this.logger.info('Authorization URL generated', { integrationId });

    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    integrationId: string
  ): Promise<OAuthToken> {
    // Validate state
    const flowState = this.stateManager.validateState(state, integrationId);
    if (!flowState) {
      throw new Error('Invalid or expired state');
    }

    try {
      const response = await this.httpClient.post<any>(this.config.tokenUrl, {
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code_verifier: flowState.codeVerifier,
      });

      const token: OAuthToken = {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresIn: response.expires_in,
        expiresAt: Date.now() + response.expires_in * 1000,
        tokenType: 'Bearer',
        scope: response.scope?.split(' ') || this.config.scope,
        rawResponse: response,
      };

      this.logger.info('Token obtained successfully', { integrationId });
      return token;
    } catch (error) {
      this.logger.error('Token exchange failed', {
        integrationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthToken> {
    try {
      const response = await this.httpClient.post<any>(this.config.tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });

      const token: OAuthToken = {
        accessToken: response.access_token,
        refreshToken: response.refresh_token || refreshToken,
        expiresIn: response.expires_in,
        expiresAt: Date.now() + response.expires_in * 1000,
        tokenType: 'Bearer',
        scope: response.scope?.split(' ') || this.config.scope,
        rawResponse: response,
      };

      this.logger.info('Token refreshed successfully');
      return token;
    } catch (error) {
      this.logger.error('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Revoke a token (access or refresh)
   */
  async revokeToken(token: string, tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token'): Promise<void> {
    try {
      // Many OAuth providers don't require response, just successful HTTP status
      await this.httpClient.post(
        `${this.config.tokenUrl.replace('/token', '')}/revoke`,
        {
          token,
          token_type_hint: tokenTypeHint,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }
      );

      this.logger.info('Token revoked successfully');
    } catch (error) {
      // Revocation failures often aren't critical
      this.logger.warn('Token revocation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Cleanup expired OAuth states (call periodically)
   */
  cleanupExpiredStates(): void {
    this.stateManager.cleanupExpiredStates();
  }

  /**
   * Validate token is still valid
   */
  isTokenExpired(token: OAuthToken, bufferMs: number = 5 * 60 * 1000): boolean {
    return Date.now() + bufferMs > token.expiresAt;
  }

  /**
   * Add Authorization header to request headers
   */
  getAuthorizationHeader(token: OAuthToken): Record<string, string> {
    return {
      'Authorization': `${token.tokenType} ${token.accessToken}`,
    };
  }
}

// ============================================================================
// OAuth Configuration Presets
// ============================================================================

export const OAUTH_CONFIGS: Record<string, OAuthConfig> = {
  quickbooks: {
    clientId: process.env.QB_CLIENT_ID!,
    clientSecret: process.env.QB_CLIENT_SECRET!,
    redirectUri: process.env.QB_REDIRECT_URI || 'https://api.ledgr.finance/integrations/quickbooks/callback',
    scope: ['com.intuit.quickbooks.accounting'],
    authorizationUrl: 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://quickbooks.api.intuit.com/oauth2/tokens/oauth',
  },

  xero: {
    clientId: process.env.XERO_CLIENT_ID!,
    clientSecret: process.env.XERO_CLIENT_SECRET!,
    redirectUri: process.env.XERO_REDIRECT_URI || 'https://api.ledgr.finance/integrations/xero/callback',
    scope: ['offline_access', 'openid', 'profile', 'email', 'accounting'],
    authorizationUrl: 'https://login.xero.com/identity/connect/authorize',
    tokenUrl: 'https://identity.xero.com/connect/token',
  },

  freshbooks: {
    clientId: process.env.FRESHBOOKS_CLIENT_ID!,
    clientSecret: process.env.FRESHBOOKS_CLIENT_SECRET!,
    redirectUri: process.env.FRESHBOOKS_REDIRECT_URI || 'https://api.ledgr.finance/integrations/freshbooks/callback',
    scope: ['admin:accounting:read', 'admin:accounting:write', 'admin:client:read'],
    authorizationUrl: 'https://my.freshbooks.com/service/auth/oauth/authorize',
    tokenUrl: 'https://api.freshbooks.com/oauth/token',
  },

  plaid: {
    clientId: process.env.PLAID_CLIENT_ID!,
    clientSecret: process.env.PLAID_SECRET!,
    redirectUri: process.env.PLAID_REDIRECT_URI || 'https://api.ledgr.finance/integrations/plaid/callback',
    scope: [],
    authorizationUrl: 'https://my.plaid.com/auth',
    tokenUrl: 'https://production.plaid.com/item/public_token/exchange',
  },
};

export function getOAuthConfig(integrationType: string): OAuthConfig {
  const config = OAUTH_CONFIGS[integrationType];
  if (!config) {
    throw new Error(`Unknown integration type: ${integrationType}`);
  }
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`OAuth credentials not configured for ${integrationType}`);
  }
  return config;
}

export default OAuthHandler;
