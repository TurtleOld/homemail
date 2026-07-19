/**
 * OAuth 2.1 PKCE (Proof Key for Code Exchange) implementation
 * RFC 7636: https://datatracker.ietf.org/doc/html/rfc7636
 */

import crypto from 'node:crypto';

/**
 * Generate a cryptographically random code verifier
 * Must be 43-128 characters, base64url-encoded
 */
export function generateCodeVerifier(): string {
  // Generate 32 random bytes (will be 43 chars in base64url)
  const randomBytes = crypto.randomBytes(32);
  return base64UrlEncode(randomBytes);
}

/**
 * Generate code challenge from verifier using SHA256
 * code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Base64URL encoding (without padding)
 * RFC 4648 Section 5: https://datatracker.ietf.org/doc/html/rfc4648#section-5
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate random state parameter for CSRF protection
 */
export function generateState(): string {
  // 16 bytes = 128 bits of entropy
  const randomBytes = crypto.randomBytes(16);
  return base64UrlEncode(randomBytes);
}

/**
 * Build authorization URL with PKCE parameters
 */
export interface AuthorizationParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
}

export function buildAuthorizationUrl(params: AuthorizationParams): string {
  const url = new URL(params.authorizationEndpoint);
  
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  
  return url.toString();
}
