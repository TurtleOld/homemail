import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invalidateCache: vi.fn(),
  loadTokens: vi.fn(),
  loadCredentials: vi.fn(),
  readStorage: vi.fn(),
  writeStorage: vi.fn(),
  getProvider: vi.fn(),
  getProviderForAccount: vi.fn(),
  subscribeToUpdates: vi.fn(),
  getFolders: vi.fn(),
  getAccount: vi.fn(),
  getMessage: vi.fn(),
  processNewMessage: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock('@/lib/oauth-token-store', () => ({
  OAuthTokenStore: class {
    invalidateCache = mocks.invalidateCache;
    loadTokens = mocks.loadTokens;
  },
}));
vi.mock('@/lib/storage', () => ({
  readStorage: mocks.readStorage,
  writeStorage: mocks.writeStorage,
  loadCredentials: mocks.loadCredentials,
}));
vi.mock('@/lib/get-provider', () => ({
  getMailProvider: mocks.getProvider,
  getMailProviderForAccount: mocks.getProviderForAccount,
}));
vi.mock('@/lib/process-new-message', () => ({ processNewMessage: mocks.processNewMessage }));
vi.mock('@/lib/ntfy', () => ({ sendPushNotification: mocks.sendPushNotification }));
vi.mock('@/lib/filter-job-queue', () => ({
  getPendingJobs: vi.fn().mockResolvedValue([]),
  markJobProcessing: vi.fn(),
  markJobCompleted: vi.fn(),
  markJobFailed: vi.fn(),
  cleanupOldJobs: vi.fn(),
}));
vi.mock('@/lib/apply-auto-sort-rules', () => ({
  checkMessageMatchesRule: vi.fn(),
  applyRuleActions: vi.fn(),
}));

import { startAutoSortDaemon } from '@/lib/auto-sort-daemon';

describe('auto-sort daemon account discovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.MAIL_PROVIDER = 'stalwart';
    process.env.STALWART_AUTH_MODE = 'basic';
    globalThis.__autoSortDaemonStarted = false;
    globalThis.__autoSortDaemonUnsubscribes = new Map();

    mocks.loadTokens.mockResolvedValue(new Map());
    mocks.loadCredentials.mockResolvedValue(
      new Map([['basic-account', { accountId: 'basic-account', email: 'user@example.test', password: 'secret' }]])
    );
    mocks.readStorage.mockResolvedValue({});
    mocks.writeStorage.mockResolvedValue(undefined);
    mocks.subscribeToUpdates.mockReturnValue(vi.fn());
    mocks.getFolders.mockResolvedValue([]);
    mocks.getAccount.mockResolvedValue({ email: 'user@example.test' });
    mocks.getProviderForAccount.mockReturnValue({
      subscribeToUpdates: mocks.subscribeToUpdates,
      getFolders: mocks.getFolders,
      getAccount: mocks.getAccount,
      getMessage: mocks.getMessage,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    globalThis.__autoSortDaemonStarted = false;
    globalThis.__autoSortDaemonUnsubscribes = undefined;
  });

  it('watches accounts loaded from stored credentials in basic mode', async () => {
    await startAutoSortDaemon();

    expect(mocks.loadCredentials).toHaveBeenCalled();
    expect(mocks.getProviderForAccount).toHaveBeenCalledWith('basic-account');
    expect(mocks.subscribeToUpdates).toHaveBeenCalledWith('basic-account', expect.any(Function));
  });
});
