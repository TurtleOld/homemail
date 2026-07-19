import { describe, expect, it } from 'vitest';
import { getRedesignFeatureFlags, isRedesignFeatureEnabled } from '@/lib/feature-flags';

describe('redesign feature flags', () => {
  it('defaults every new path to disabled', () => {
    expect(getRedesignFeatureFlags({})).toEqual({
      protectedMessageContent: false,
      remoteImageFetching: false,
    });
  });

  it('enables flags independently at runtime', () => {
    const environment = {
      HOMEMAIL_FEATURE_PROTECTED_MESSAGE_CONTENT: 'true',
      HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING: 'false',
    };

    expect(isRedesignFeatureEnabled('protectedMessageContent', environment)).toBe(true);
    expect(isRedesignFeatureEnabled('remoteImageFetching', environment)).toBe(false);
  });

  it('fails closed for malformed and truthy-looking values', () => {
    expect(getRedesignFeatureFlags({
      HOMEMAIL_FEATURE_PROTECTED_MESSAGE_CONTENT: 'yes',
      HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING: 'on',
    })).toEqual({
      protectedMessageContent: false,
      remoteImageFetching: false,
    });
  });
});
