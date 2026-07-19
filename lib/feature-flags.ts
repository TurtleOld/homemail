export const REDESIGN_FEATURE_FLAG_NAMES = [
  'listFirstMail',
  'protectedMessageContent',
  'remoteImageFetching',
] as const;

export type RedesignFeatureFlagName = (typeof REDESIGN_FEATURE_FLAG_NAMES)[number];

export type RedesignFeatureFlags = Readonly<Record<RedesignFeatureFlagName, boolean>>;

const ENV_BY_FLAG: Record<RedesignFeatureFlagName, string> = {
  listFirstMail: 'HOMEMAIL_FEATURE_LIST_FIRST_MAIL',
  protectedMessageContent: 'HOMEMAIL_FEATURE_PROTECTED_MESSAGE_CONTENT',
  remoteImageFetching: 'HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING',
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
    listFirstMail: enabled(environment[ENV_BY_FLAG.listFirstMail]),
    protectedMessageContent: enabled(environment[ENV_BY_FLAG.protectedMessageContent]),
    remoteImageFetching: enabled(environment[ENV_BY_FLAG.remoteImageFetching]),
  });
}

export function isRedesignFeatureEnabled(
  flag: RedesignFeatureFlagName,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return getRedesignFeatureFlags(environment)[flag];
}
