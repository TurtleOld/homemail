export const REDESIGN_FEATURE_FLAG_NAMES = [
  'identityFoundation',
  'authorizationPolicy',
  'oidcIdentityValidation',
  'stalwartAdministration',
  'productShell',
  'listFirstMail',
] as const;

export type RedesignFeatureFlagName = (typeof REDESIGN_FEATURE_FLAG_NAMES)[number];

export type RedesignFeatureFlags = Readonly<Record<RedesignFeatureFlagName, boolean>>;

const ENV_BY_FLAG: Record<RedesignFeatureFlagName, string> = {
  identityFoundation: 'HOMEMAIL_FEATURE_IDENTITY_FOUNDATION',
  authorizationPolicy: 'HOMEMAIL_FEATURE_AUTHORIZATION_POLICY',
  oidcIdentityValidation: 'HOMEMAIL_FEATURE_OIDC_IDENTITY_VALIDATION',
  stalwartAdministration: 'HOMEMAIL_FEATURE_STALWART_ADMINISTRATION',
  productShell: 'HOMEMAIL_FEATURE_PRODUCT_SHELL',
  listFirstMail: 'HOMEMAIL_FEATURE_LIST_FIRST_MAIL',
};

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

/**
 * Runtime-only redesign flags. An absent, empty, malformed, or unexpected value
 * is disabled. Reading flags never writes application state.
 */
export function getRedesignFeatureFlags(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RedesignFeatureFlags {
  return Object.freeze({
    identityFoundation: enabled(environment[ENV_BY_FLAG.identityFoundation]),
    authorizationPolicy: enabled(environment[ENV_BY_FLAG.authorizationPolicy]),
    oidcIdentityValidation: enabled(environment[ENV_BY_FLAG.oidcIdentityValidation]),
    stalwartAdministration: enabled(environment[ENV_BY_FLAG.stalwartAdministration]),
    productShell: enabled(environment[ENV_BY_FLAG.productShell]),
    listFirstMail: enabled(environment[ENV_BY_FLAG.listFirstMail]),
  });
}

export function isRedesignFeatureEnabled(
  flag: RedesignFeatureFlagName,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return getRedesignFeatureFlags(environment)[flag];
}
