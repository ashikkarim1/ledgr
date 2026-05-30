// OAuth 2.0 + JWT Token Generation and Validation
// Day 1-3 implementation: Client Credentials flow, RS256 signing, 15-minute expiry
// Used by all authenticated API endpoints and role-based access control

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================================
// Load Signing Keys from Environment/Secrets Manager
// ============================================================================

// In production: loaded from AWS Secrets Manager
// In development: loaded from local PEM files
const JWT_PRIVATE_KEY = process.env.JWT_SIGNING_KEY || 
  fs.readFileSync(path.join(__dirname, '../keys/jwt-private-key.pem'), 'utf8');

const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || 
  fs.readFileSync(path.join(__dirname, '../keys/jwt-public-key.pem'), 'utf8');

// ============================================================================
// Token Generation (OAuth 2.0 Client Credentials Flow)
// ============================================================================

/**
 * Generate JWT token for authenticated user/org
 * @param {string} orgId - Organization UUID
 * @param {string} userId - User UUID
 * @param {string[]} roles - Array of role strings (e.g., 'finance_controller', 'vat_specialist')
 * @param {string[]} entityIds - Array of entity IDs user can access
 * @param {number} expiresIn - Token expiry in seconds (default: 900 = 15 minutes)
 * @returns {string} Signed JWT token
 */
function generateToken(orgId, userId, roles = [], entityIds = [], expiresIn = 900) {
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    // Standard JWT claims
    iss: process.env.JWT_ISSUER || 'https://api.ledgr.finance',
    sub: `org:${orgId}:user:${userId}`, // Subject: org + user identifier
    aud: 'https://api.ledgr.finance', // Audience
    exp: now + expiresIn, // Expiration (15 min default)
    iat: now, // Issued at
    
    // Ledgr-specific claims
    org_id: orgId, // Organization context
    user_id: userId,
    entity_ids: entityIds, // Array of accessible entities (accounts, companies, etc.)
    roles: roles, // Array of role strings for RBAC
    
    // Security metadata
    token_type: 'access', // Distinguishes from refresh tokens
    jti: crypto.randomUUID(), // Unique token ID for revocation checking
  };

  return jwt.sign(payload, JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    keyid: process.env.JWT_KEY_ID || 'ledgr-signing-key-1'
  });
}

/**
 * Generate refresh token (30-day validity, stored in httpOnly cookie)
 * @param {string} orgId
 * @param {string} userId
 * @returns {string} Signed refresh token
 */
function generateRefreshToken(orgId, userId) {
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    iss: process.env.JWT_ISSUER || 'https://api.ledgr.finance',
    sub: `org:${orgId}:user:${userId}`,
    aud: 'https://api.ledgr.finance',
    exp: now + (30 * 24 * 60 * 60), // 30 days
    iat: now,
    
    org_id: orgId,
    user_id: userId,
    token_type: 'refresh',
    jti: crypto.randomUUID(),
  };

  return jwt.sign(payload, JWT_PRIVATE_KEY, {
    algorithm: 'RS256'
  });
}

// ============================================================================
// Token Validation Middleware
// ============================================================================

/**
 * Express middleware: Validate JWT token from Authorization header
 * @param {string} requiredRole - Optional role to check (e.g., 'finance_controller')
 * @returns {Function} Express middleware
 */
function verifyJWT(requiredRole = null) {
  return (req, res, next) => {
    const token = extractTokenFromHeader(req);
    
    if (!token) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization header missing or invalid format'
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
        audience: 'https://api.ledgr.finance'
      });

      // Check token type (must be 'access', not 'refresh')
      if (decoded.token_type !== 'access') {
        return res.status(401).json({
          error: 'invalid_token_type',
          message: 'Refresh token cannot be used for API access'
        });
      }

      // Check required role (if specified)
      if (requiredRole && !decoded.roles.includes(requiredRole)) {
        return res.status(403).json({
          error: 'insufficient_permissions',
          message: `Role '${requiredRole}' required`
        });
      }

      // Attach to request object
      req.user = {
        orgId: decoded.org_id,
        userId: decoded.user_id,
        roles: decoded.roles,
        entityIds: decoded.entity_ids,
        token: decoded,
        scope: decoded.scope || []
      };

      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'token_expired',
          message: 'Access token has expired',
          expiredAt: err.expiredAt
        });
      }

      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'invalid_token',
          message: 'Invalid or tampered token'
        });
      }

      return res.status(401).json({
        error: 'authentication_failed',
        message: err.message
      });
    }
  };
}

/**
 * Extract JWT from Authorization header
 * Format: "Bearer <token>"
 */
function extractTokenFromHeader(req) {
  const authHeader = req.headers.authorization || '';
  const parts = authHeader.split(' ');
  
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }

  return null;
}

// ============================================================================
// JWKS (JSON Web Key Set) Endpoint
// Serves public key for token verification
// ============================================================================

function getJWKS() {
  // Parse RSA public key and convert to JWK format
  const keyData = crypto.createPublicKey({ key: JWT_PUBLIC_KEY }).export({ format: 'jwk' });

  return {
    keys: [
      {
        kty: keyData.kty, // Key type (RSA)
        use: 'sig', // Use: signature
        kid: process.env.JWT_KEY_ID || 'ledgr-signing-key-1', // Key ID
        n: keyData.n, // Modulus
        e: keyData.e, // Exponent
        alg: 'RS256',
        ...keyData
      }
    ]
  };
}

// ============================================================================
// OAuth 2.0 Client Credentials Flow
// ============================================================================

/**
 * Authenticate client using client_id + client_secret
 * Returns access token (JWT) and refresh token
 */
async function authenticateClient(clientId, clientSecret, grantType = 'client_credentials') {
  // In production: validate credentials against database/Secrets Manager
  // This is a simplified example

  const validClient = process.env.OAUTH_CLIENT_ID === clientId &&
                      process.env.OAUTH_CLIENT_SECRET === clientSecret;

  if (!validClient) {
    throw new Error('Invalid client credentials');
  }

  if (grantType !== 'client_credentials') {
    throw new Error(`Grant type '${grantType}' not supported`);
  }

  // Generate tokens
  const orgId = process.env.DEFAULT_ORG_ID; // From environment
  const userId = 'service-account'; // Service account identifier
  const roles = ['api_consumer'];
  const entityIds = [];

  const accessToken = generateToken(orgId, userId, roles, entityIds, 900);
  const refreshToken = generateRefreshToken(orgId, userId);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 900,
    scope: 'read write delete'
  };
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Refresh access token using valid refresh token
 * @param {string} refreshToken - Previous refresh token
 * @returns {object} New access token
 */
function refreshAccessToken(refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_PUBLIC_KEY, {
      algorithms: ['RS256']
    });

    if (decoded.token_type !== 'refresh') {
      throw new Error('Not a refresh token');
    }

    // Generate new access token with same claims
    const accessToken = generateToken(
      decoded.org_id,
      decoded.user_id,
      decoded.roles,
      decoded.entity_ids,
      900 // 15 minutes
    );

    // Optionally generate new refresh token (token rotation)
    const newRefreshToken = generateRefreshToken(decoded.org_id, decoded.user_id);

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
      expires_in: 900
    };
  } catch (err) {
    throw new Error('Invalid refresh token: ' + err.message);
  }
}

// ============================================================================
// Token Revocation (Redis-backed)
// ============================================================================

const tokenRevocationCache = new Map(); // In production: use Redis

function revokeToken(tokenJTI, ttl = 30 * 24 * 60 * 60) {
  // Store revoked JTI in Redis with TTL = original token expiry
  tokenRevocationCache.set(tokenJTI, Date.now());
  // In production:
  // await redis.setex(`revoked_token:${tokenJTI}`, ttl, '1');
}

function isTokenRevoked(tokenJTI) {
  return tokenRevocationCache.has(tokenJTI);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyJWT,
  extractTokenFromHeader,
  getJWKS,
  authenticateClient,
  refreshAccessToken,
  revokeToken,
  isTokenRevoked,
  JWT_PUBLIC_KEY,
  JWT_PRIVATE_KEY
};
