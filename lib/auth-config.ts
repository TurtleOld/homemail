export type AuthMode = 'basic' | 'oauth';

function normalizeAuthMode(rawMode: string | undefined): AuthMode {
  return rawMode?.trim().toLowerCase() === 'basic' ? 'basic' : 'oauth';
}

export function getAuthMode(): AuthMode {
  return normalizeAuthMode(process.env.STALWART_AUTH_MODE);
}

export function isPasswordLoginEnabled(): boolean {
  return getAuthMode() === 'basic';
}
