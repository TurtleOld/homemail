import { describe, expect, it } from 'vitest';
import { getRedesignFeatureFlags, isRedesignFeatureEnabled } from '@/lib/feature-flags';

describe('redesign feature flags', () => {
  it('defaults every new path to disabled', () => {
    expect(getRedesignFeatureFlags({})).toEqual({
      identityFoundation: false,
      authorizationPolicy: false,
      oidcIdentityValidation: false,
      stalwartAdministration: false,
      productShell: false,
      listFirstMail: false,
    });
  });

  it('enables flags independently at runtime', () => {
    const environment = {
      HOMEMAIL_FEATURE_AUTHORIZATION_POLICY: 'true',
      HOMEMAIL_FEATURE_IDENTITY_FOUNDATION: 'false',
    };

    expect(isRedesignFeatureEnabled('authorizationPolicy', environment)).toBe(true);
    expect(isRedesignFeatureEnabled('identityFoundation', environment)).toBe(false);
    expect(isRedesignFeatureEnabled('oidcIdentityValidation', environment)).toBe(false);
    expect(isRedesignFeatureEnabled('productShell', environment)).toBe(false);
    expect(isRedesignFeatureEnabled('listFirstMail', environment)).toBe(false);
  });

  it('fails closed for malformed and truthy-looking values', () => {
    expect(getRedesignFeatureFlags({
      HOMEMAIL_FEATURE_IDENTITY_FOUNDATION: '1',
      HOMEMAIL_FEATURE_AUTHORIZATION_POLICY: 'yes',
      HOMEMAIL_FEATURE_OIDC_IDENTITY_VALIDATION: 'enabled',
      HOMEMAIL_FEATURE_STALWART_ADMINISTRATION: 'false',
      HOMEMAIL_FEATURE_PRODUCT_SHELL: 'on',
      HOMEMAIL_FEATURE_LIST_FIRST_MAIL: '1',
    })).toEqual({
      identityFoundation: false,
      authorizationPolicy: false,
      oidcIdentityValidation: false,
      stalwartAdministration: false,
      productShell: false,
      listFirstMail: false,
    });
  });
});
