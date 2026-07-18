import { describe, expect, it, vi } from 'vitest';
import {
  detectStalwart015Capabilities,
  Stalwart015AdminAdapter,
  StalwartAdminCapabilityError,
  StalwartAdministrationDisabledError,
  type StalwartAdminMutationTransport,
} from '@/lib/stalwart-admin-adapter';

function transport(): StalwartAdminMutationTransport {
  return {
    createPrincipal: vi.fn(async () => ({ principalId: 'principal-1' })),
    updatePrincipal: vi.fn(async () => undefined),
    suspendPrincipal: vi.fn(async () => undefined),
    deletePrincipal: vi.fn(async () => undefined),
    createMailbox: vi.fn(async () => ({ mailboxId: 'mailbox-1' })),
    updateCredential: vi.fn(async () => undefined),
    revokeOauthGrants: vi.fn(async () => undefined),
    readConfiguration: vi.fn(async () => ({})),
  };
}

describe('Stalwart 0.15 administration boundary', () => {
  it('fails closed for unknown and unsupported versions', () => {
    expect(detectStalwart015Capabilities({ managementApi: 'rest-v0.15' })).toMatchObject({
      supported: false,
      reason: 'unknown-version',
    });
    expect(detectStalwart015Capabilities({
      serverVersion: '0.16.1',
      managementApi: 'rest-v0.15',
    })).toMatchObject({
      supported: false,
      protocol: 'unsupported',
      reason: 'unsupported-version',
    });
  });

  it('keeps every mutation disabled by default', async () => {
    const delegate = transport();
    const adapter = new Stalwart015AdminAdapter(
      async () => ({
        serverVersion: '0.15.5',
        managementApi: 'rest-v0.15',
        operations: { 'principal.create': true },
      }),
      delegate,
    );

    await expect(adapter.createPrincipal({
      operationId: 'operation-1',
      name: 'Member',
      email: 'member@example.test',
    })).rejects.toBeInstanceOf(StalwartAdministrationDisabledError);
    expect(delegate.createPrincipal).not.toHaveBeenCalled();
  });

  it('requires operation-specific capability evidence before mutation', async () => {
    const delegate = transport();
    const adapter = new Stalwart015AdminAdapter(
      async () => ({
        serverVersion: '0.15.5',
        managementApi: 'rest-v0.15',
        operations: { 'principal.create': false },
      }),
      delegate,
      () => true,
    );

    await expect(adapter.createPrincipal({
      operationId: 'operation-1',
      name: 'Member',
      email: 'member@example.test',
    })).rejects.toBeInstanceOf(StalwartAdminCapabilityError);
    expect(delegate.createPrincipal).not.toHaveBeenCalled();
  });

  it('delegates only after version, protocol, flag, and operation checks pass', async () => {
    const delegate = transport();
    const adapter = new Stalwart015AdminAdapter(
      async () => ({
        serverVersion: '0.15.5',
        managementApi: 'rest-v0.15',
        operations: { 'principal.create': true },
      }),
      delegate,
      () => true,
    );

    await expect(adapter.createPrincipal({
      operationId: 'operation-1',
      name: 'Member',
      email: 'member@example.test',
    })).resolves.toEqual({ principalId: 'principal-1' });
    expect(delegate.createPrincipal).toHaveBeenCalledOnce();
  });
});
