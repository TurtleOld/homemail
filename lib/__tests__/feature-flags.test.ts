import { describe, expect, it } from 'vitest';
import { getRedesignFeatureFlags, isRedesignFeatureEnabled } from '@/lib/feature-flags';

describe('redesign feature flags', () => {
  it('defaults every new path to disabled', () => {
    expect(getRedesignFeatureFlags({})).toEqual({
      productShell: false,
      listFirstMail: false,
      protectedMessageContent: false,
      remoteImageFetching: false,
    });
  });

  it('enables flags independently at runtime', () => {
    const environment = {
      HOMEMAIL_FEATURE_PRODUCT_SHELL: 'true',
      HOMEMAIL_FEATURE_LIST_FIRST_MAIL: 'false',
    };

    expect(isRedesignFeatureEnabled('productShell', environment)).toBe(true);
    expect(isRedesignFeatureEnabled('listFirstMail', environment)).toBe(false);
    expect(isRedesignFeatureEnabled('protectedMessageContent', environment)).toBe(false);
    expect(isRedesignFeatureEnabled('remoteImageFetching', environment)).toBe(false);
  });

  it('fails closed for malformed and truthy-looking values', () => {
    expect(getRedesignFeatureFlags({
      HOMEMAIL_FEATURE_PRODUCT_SHELL: 'on',
      HOMEMAIL_FEATURE_LIST_FIRST_MAIL: '1',
      HOMEMAIL_FEATURE_PROTECTED_MESSAGE_CONTENT: 'yes',
      HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING: 'on',
    })).toEqual({
      productShell: false,
      listFirstMail: false,
      protectedMessageContent: false,
      remoteImageFetching: false,
    });
  });
});
