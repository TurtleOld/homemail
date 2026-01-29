/**
 * Centralized auth configuration.
 *
 * OAuth-only mode - all authentication is handled via OAuth.
 */
export function getAuthMode(): 'oauth' {
  return 'oauth';
}

/**
 * Password login is disabled - OAuth only.
 */
export function isPasswordLoginEnabled(): boolean {
  return false;
}
