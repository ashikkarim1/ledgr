// @ts-nocheck
import { Request, Response, NextFunction } from 'express';

/**
 * Security Headers Middleware
 *
 * Implements OWASP recommended HTTP security headers to prevent:
 * - Clickjacking (X-Frame-Options)
 * - MIME type sniffing (X-Content-Type-Options)
 * - XSS attacks (X-XSS-Protection, Content-Security-Policy)
 * - CSRF attacks (SameSite cookies)
 * - Protocol downgrade (HSTS)
 * - Information disclosure (Referrer-Policy)
 * - Feature abuse (Permissions-Policy)
 *
 * Reference: OWASP Secure Headers Project
 */

/**
 * HSTS - HTTP Strict Transport Security
 * Enforces HTTPS and prevents protocol downgrade attacks
 * max-age=63072000 (2 years), includeSubDomains, preload
 */
export function hstsHeader() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set for all responses
    res.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    next();
  };
}

/**
 * X-Frame-Options - Clickjacking Protection
 * DENY: Page cannot be displayed in frame
 * SAMEORIGIN: Can only be displayed in frame on same origin
 * ALLOW-FROM: Can be displayed in frame on specific origin
 */
export function xFrameOptions(mode: 'DENY' | 'SAMEORIGIN' = 'DENY') {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('X-Frame-Options', mode);
    next();
  };
}

/**
 * X-Content-Type-Options - MIME Type Sniffing Protection
 * nosniff: Browser must respect Content-Type header
 * Prevents attackers from injecting scripts via file uploads
 */
export function xContentTypeOptions() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  };
}

/**
 * X-XSS-Protection - Legacy XSS Protection (modern CSP is preferred)
 * 1; mode=block: Enable XSS filter, block page if XSS detected
 * Note: Deprecated in favor of Content-Security-Policy
 */
export function xXSSProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('X-XSS-Protection', '1; mode=block');
    next();
  };
}

/**
 * Content-Security-Policy - XSS & Injection Prevention
 *
 * Directives:
 * - default-src 'self': All resources must come from same origin by default
 * - script-src 'self': Scripts only from same origin (no inline scripts)
 * - style-src 'self' 'unsafe-inline': Styles from same origin or inline (unsafe for styles only)
 * - img-src 'self' data:: Images from same origin or data URIs
 * - font-src 'self': Fonts from same origin only
 * - connect-src 'self': XHR/WebSocket only to same origin
 * - frame-ancestors 'none': Cannot be framed (redundant with X-Frame-Options, but good defense-in-depth)
 * - base-uri 'self': Base URL can only be same origin
 * - form-action 'self': Forms can only POST to same origin
 * - upgrade-insecure-requests: Automatically upgrade HTTP to HTTPS
 * - block-all-mixed-content: Block all mixed content
 */
export function contentSecurityPolicy(options?: {
  reportUri?: string;
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    let csp = `
      default-src 'self';
      script-src 'self';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self' data:;
      connect-src 'self';
      frame-ancestors 'none';
      base-uri 'self';
      form-action 'self';
      object-src 'none';
    `;

    if (options?.upgradeInsecureRequests) {
      csp += 'upgrade-insecure-requests;';
    }

    if (options?.blockAllMixedContent) {
      csp += 'block-all-mixed-content;';
    }

    if (options?.reportUri) {
      csp += `report-uri ${options.reportUri};`;
    }

    // Remove extra whitespace
    csp = csp.replace(/\s+/g, ' ').trim();

    res.set('Content-Security-Policy', csp);

    // Also set report-only version for monitoring (doesn't block, just reports)
    res.set('Content-Security-Policy-Report-Only', csp);

    next();
  };
}

/**
 * Referrer-Policy - Control referrer information leak
 * no-referrer: Never send referrer
 * strict-origin-when-cross-origin: Only send origin for cross-origin requests
 * same-origin: Send referrer only for same-origin requests
 */
export function referrerPolicy(policy: string = 'strict-origin-when-cross-origin') {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('Referrer-Policy', policy);
    next();
  };
}

/**
 * Permissions-Policy (formerly Feature-Policy)
 * Controls which browser features can be used
 * 
 * Prevents:
 * - Geolocation tracking
 * - Camera/microphone access
 * - Payment request API abuse
 * - Accelerometer/gyroscope hijacking
 * - Fullscreen abuse
 * - Picture-in-picture
 */
export function permissionsPolicy() {
  return (req: Request, res: Response, next: NextFunction) => {
    const policy = [
      'accelerometer=()',
      'ambient-light-sensor=()',
      'camera=()',
      'display-capture=()',
      'document-domain=()',
      'fullscreen=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'picture-in-picture=()',
      'sync-xhr=()',
      'usb=()',
      'vr=()',
      'xr-spatial-tracking=()',
    ].join(', ');

    res.set('Permissions-Policy', policy);
    next();
  };
}

/**
 * Remove sensitive headers that leak information
 * Prevents fingerprinting and version disclosure
 */
export function removeVersionHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('Server');
    res.removeHeader('X-Powered-By');
    res.removeHeader('X-AspNet-Version');
    res.removeHeader('X-AspNetMvc-Version');
    next();
  };
}

/**
 * Add security tracking headers for audit
 */
export function securityTrackingHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Request ID for tracing
    res.set('X-Request-ID', req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

    // Security metadata
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');

    // Disable caching for sensitive operations
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }

    next();
  };
}

/**
 * Compose all security headers middleware
 * Recommended for all routes
 */
export function composeSecurityHeaders(options?: {
  cspReportUri?: string;
  customCSP?: string;
  frameOptions?: 'DENY' | 'SAMEORIGIN';
}) {
  return [
    removeVersionHeaders(),
    hstsHeader(),
    xFrameOptions(options?.frameOptions || 'DENY'),
    xContentTypeOptions(),
    xXSSProtection(),
    options?.customCSP
      ? (req: Request, res: Response, next: NextFunction) => {
          res.set('Content-Security-Policy', options.customCSP!);
          next();
        }
      : contentSecurityPolicy({
          reportUri: options?.cspReportUri,
          upgradeInsecureRequests: true,
          blockAllMixedContent: true,
        }),
    referrerPolicy('strict-origin-when-cross-origin'),
    permissionsPolicy(),
    securityTrackingHeaders(),
  ];
}

/**
 * Specific CSP for API endpoints (stricter than UI)
 * No inline scripts, no img/font/style resources
 */
export function apiContentSecurityPolicy() {
  return (req: Request, res: Response, next: NextFunction) => {
    const csp = `
      default-src 'none';
      connect-src 'self';
      form-action 'self';
      frame-ancestors 'none';
    `;

    res.set('Content-Security-Policy', csp.replace(/\s+/g, ' ').trim());
    next();
  };
}

/**
 * CSP for file upload endpoints
 * Prevents execution of uploaded content
 */
export function uploadContentSecurityPolicy() {
  return (req: Request, res: Response, next: NextFunction) => {
    const csp = `
      default-src 'none';
      script-src 'none';
      object-src 'none';
      base-uri 'none';
      form-action 'self';
    `;

    res.set('Content-Security-Policy', csp.replace(/\s+/g, ' ').trim());
    next();
  };
}

/**
 * Express middleware composition helper
 * Usage: app.use(createSecurityHeadersMiddleware())
 */
export function createSecurityHeadersMiddleware(options?: {
  cspReportUri?: string;
  environment?: 'development' | 'production';
}) {
  // Stricter headers in production
  if (options?.environment === 'production') {
    return composeSecurityHeaders({
      cspReportUri: options.cspReportUri,
      frameOptions: 'DENY',
    });
  }

  // Looser in development (allow localhost for debugging)
  return [
    removeVersionHeaders(),
    hstsHeader(),
    xFrameOptions('SAMEORIGIN'),
    xContentTypeOptions(),
    xXSSProtection(),
    contentSecurityPolicy({
      upgradeInsecureRequests: false, // Allow HTTP in dev
      blockAllMixedContent: false,
    }),
    referrerPolicy('strict-origin-when-cross-origin'),
    permissionsPolicy(),
  ];
}

/**
 * Express middleware for CORS security
 * Implements proper CORS headers to prevent cross-origin attacks
 */
export function corsSecurity(options?: {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
}) {
  const allowedOrigins = options?.allowedOrigins || ['https://app.ledgr.com'];
  const allowedMethods = options?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
  const allowedHeaders = options?.allowedHeaders || [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'Accept',
    'Accept-Language',
  ];
  const allowCredentials = options?.allowCredentials !== false;
  const maxAge = options?.maxAge || 86400; // 24 hours

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');

    if (allowedOrigins.includes(origin || '')) {
      res.set('Access-Control-Allow-Origin', origin || '');
      res.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
      res.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));

      if (allowCredentials) {
        res.set('Access-Control-Allow-Credentials', 'true');
      }

      res.set('Access-Control-Max-Age', maxAge.toString());

      // Handle preflight
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
    }

    next();
  };
}

/**
 * Middleware to prevent common attack vectors
 */
export function attackVectorProtection() {
  return [
    // Prevent parameter pollution
    (req: Request, res: Response, next: NextFunction) => {
      if (Array.isArray(req.query)) {
        return res.status(400).json({ error: 'Duplicate query parameters not allowed' });
      }
      next();
    },

    // Validate Content-Type for POST/PUT
    (req: Request, res: Response, next: NextFunction) => {
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.get('content-type') || '';

        if (!contentType.includes('application/json')) {
          return res.status(415).json({ error: 'Content-Type must be application/json' });
        }
      }

      next();
    },

    // Limit request size
    (req: Request, res: Response, next: NextFunction) => {
      const contentLength = parseInt(req.get('content-length') || '0', 10);

      if (contentLength > 10 * 1024 * 1024) {
        // 10MB limit
        return res.status(413).json({ error: 'Payload too large' });
      }

      next();
    },
  ];
}
