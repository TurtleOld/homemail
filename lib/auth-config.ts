export type AuthMode = 'basic' | 'bearer' | 'oauth';

/**
 * Centralized auth configuration.
 *
 * This file exists to keep UI/handlers consistent and to avoid accidental
 * password-login attempts when OAuth mode is enabled.
 */
export function getAuthMode(): AuthMode {
  return (process.env.STALWART_AUTH_MODE as AuthMode) || 'basic';
}

/**
 * Feature flag: allow password login UI.
 *
 * Default: enabled for backwards compatibility.
 * In oauth mode: default disabled (can be enabled explicitly).
 */
export function isPasswordLoginEnabled(): boolean {
  const explicit = process.env.FEATURE_PASSWORD_LOGIN;
  if (explicit !== undefined) {
    return explicit.toLowerCase() === 'true';
  }

  return getAuthMode() !== 'oauth';
}
