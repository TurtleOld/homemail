import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('administrator bootstrap', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-admin-bootstrap-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  const identity = {
    issuer: 'https://auth.pavlovteam.ru',
    subject: 'e',
    email: 'alexander.pavlov@pavlovteam.ru',
  };

  it('does nothing when HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL is not configured', async () => {
    const { bootstrapAdministratorIfConfigured } = await import('@/lib/admin-bootstrap');
    const outcome = await bootstrapAdministratorIfConfigured(identity, {});
    expect(outcome).toEqual({ kind: 'not-configured' });

    const { listHomeMailIdentities } = await import('@/lib/family-identity-store');
    expect(await listHomeMailIdentities()).toHaveLength(0);
  });

  it('does nothing when the verified email does not match the configured address', async () => {
    const { bootstrapAdministratorIfConfigured } = await import('@/lib/admin-bootstrap');
    const outcome = await bootstrapAdministratorIfConfigured(identity, {
      HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL: 'someone-else@pavlovteam.ru',
    });
    expect(outcome).toEqual({ kind: 'email-mismatch' });

    const { listHomeMailIdentities } = await import('@/lib/family-identity-store');
    expect(await listHomeMailIdentities()).toHaveLength(0);
  });

  it('bootstraps the administrator on the first matching verified sign-in', async () => {
    const { bootstrapAdministratorIfConfigured } = await import('@/lib/admin-bootstrap');
    const environment = { HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL: 'alexander.pavlov@pavlovteam.ru' };

    const outcome = await bootstrapAdministratorIfConfigured(identity, environment);
    expect(outcome.kind).toBe('bootstrapped');
    if (outcome.kind !== 'bootstrapped') throw new Error('expected bootstrapped outcome');
    expect(outcome.identity.role).toBe('administrator');
    expect(outcome.identity.oidc).toEqual({ issuer: identity.issuer, subject: identity.subject });

    const { listHomeMailIdentities } = await import('@/lib/family-identity-store');
    expect(await listHomeMailIdentities()).toHaveLength(1);
  });

  it('matches the configured email case-insensitively', async () => {
    const { bootstrapAdministratorIfConfigured } = await import('@/lib/admin-bootstrap');
    const environment = { HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL: 'ALEXANDER.PAVLOV@PAVLOVTEAM.RU' };

    const outcome = await bootstrapAdministratorIfConfigured(identity, environment);
    expect(outcome.kind).toBe('bootstrapped');
  });

  it('does not create a second administrator on a later matching sign-in', async () => {
    const { bootstrapAdministratorIfConfigured } = await import('@/lib/admin-bootstrap');
    const environment = { HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL: 'alexander.pavlov@pavlovteam.ru' };

    const first = await bootstrapAdministratorIfConfigured(identity, environment);
    expect(first.kind).toBe('bootstrapped');

    const second = await bootstrapAdministratorIfConfigured(identity, environment);
    expect(second).toEqual({ kind: 'already-bootstrapped' });

    const { listHomeMailIdentities } = await import('@/lib/family-identity-store');
    expect(await listHomeMailIdentities()).toHaveLength(1);
  });

  it('does not bootstrap a second administrator for a different verified identity at the same configured email', async () => {
    const { bootstrapAdministratorIfConfigured } = await import('@/lib/admin-bootstrap');
    const environment = { HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL: 'alexander.pavlov@pavlovteam.ru' };

    await bootstrapAdministratorIfConfigured(identity, environment);

    const secondDeviceIdentity = { ...identity, subject: 'different-subject-value' };
    const outcome = await bootstrapAdministratorIfConfigured(secondDeviceIdentity, environment);
    expect(outcome).toEqual({ kind: 'already-bootstrapped' });

    const { listHomeMailIdentities } = await import('@/lib/family-identity-store');
    expect(await listHomeMailIdentities()).toHaveLength(1);
  });
});
