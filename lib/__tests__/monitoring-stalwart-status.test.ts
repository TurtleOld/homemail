import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStalwartSystemStatus: vi.fn(),
}));

vi.mock('@/lib/stalwart-monitoring', () => ({
  getStalwartSystemStatus: mocks.getStalwartSystemStatus,
}));

describe('getHealthStatus Stalwart integration', () => {
  const originalMailProvider = process.env.MAIL_PROVIDER;

  beforeEach(() => {
    vi.resetModules();
    mocks.getStalwartSystemStatus.mockReset();
  });

  afterEach(() => {
    process.env.MAIL_PROVIDER = originalMailProvider;
  });

  it('includes the stalwart field when MAIL_PROVIDER is stalwart', async () => {
    process.env.MAIL_PROVIDER = 'stalwart';
    mocks.getStalwartSystemStatus.mockResolvedValue({
      reachable: true,
      queue: { total: 2, hasEntries: true },
      reports: { total: 0, hasEntries: false },
    });

    const { getHealthStatus } = await import('@/lib/monitoring');
    const health = await getHealthStatus(false);

    expect(mocks.getStalwartSystemStatus).toHaveBeenCalledTimes(1);
    expect(health.stalwart).toEqual({
      reachable: true,
      queue: { total: 2, hasEntries: true },
      reports: { total: 0, hasEntries: false },
    });
  });

  it('omits the stalwart field entirely for a non-Stalwart provider', async () => {
    process.env.MAIL_PROVIDER = 'imap';

    const { getHealthStatus } = await import('@/lib/monitoring');
    const health = await getHealthStatus(false);

    expect(mocks.getStalwartSystemStatus).not.toHaveBeenCalled();
    expect(health.stalwart).toBeUndefined();
  });
});
