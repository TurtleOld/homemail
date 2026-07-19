import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('family identity store', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homemail-family-identity-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('creates the first administrator identity and finds it back by oidc reference', async () => {
    const { bootstrapAdministratorIdentity, findIdentityByOidc, findAdministratorIdentity } =
      await import('@/lib/family-identity-store');

    const reference = { issuer: 'https://auth.pavlovteam.ru', subject: 'e' };
    const created = await bootstrapAdministratorIdentity(reference, 'Alexander Pavlov');

    expect(created.role).toBe('administrator');
    expect(created.status).toBe('active');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const foundByOidc = await findIdentityByOidc(reference);
    expect(foundByOidc).toEqual(created);

    const administrator = await findAdministratorIdentity();
    expect(administrator).toEqual(created);
  });

  it('rejects a second administrator bootstrap once one exists', async () => {
    const { bootstrapAdministratorIdentity, DuplicateAdministratorError } =
      await import('@/lib/family-identity-store');

    await bootstrapAdministratorIdentity({ issuer: 'https://auth.pavlovteam.ru', subject: 'e' }, 'First Admin');

    await expect(
      bootstrapAdministratorIdentity({ issuer: 'https://auth.pavlovteam.ru', subject: 'f' }, 'Second Admin'),
    ).rejects.toBeInstanceOf(DuplicateAdministratorError);
  });

  it('rejects bootstrapping an (issuer, subject) pair already registered to a non-administrator identity', async () => {
    const { bootstrapAdministratorIdentity, DuplicateOidcIdentityError } =
      await import('@/lib/family-identity-store');
    const { writeStorage } = await import('@/lib/storage');

    // A member identity for this (issuer, subject) pair already exists, but no
    // administrator does yet — this seeds that exact state directly, since
    // bootstrapAdministratorIdentity itself only ever creates administrators.
    const reference = { issuer: 'https://auth.pavlovteam.ru', subject: 'e' };
    await writeStorage('homeIdentities', {
      version: 1,
      identities: [
        { id: 'existing-member', oidc: reference, displayName: 'Existing Member', role: 'member', status: 'active' },
      ],
    });

    await expect(bootstrapAdministratorIdentity(reference, 'Alexander Pavlov')).rejects.toBeInstanceOf(
      DuplicateOidcIdentityError,
    );
  });

  it('lists mailbox assignments scoped to one member only', async () => {
    const { listMailboxAssignmentsForMember } = await import('@/lib/family-identity-store');
    const { writeStorage } = await import('@/lib/storage');

    await writeStorage('mailboxAssignments', {
      version: 1,
      assignments: [
        { id: 'a1', memberId: 'member-1', mailboxId: 'mailbox-1', status: 'active' },
        { id: 'a2', memberId: 'member-2', mailboxId: 'mailbox-2', status: 'active' },
        { id: 'a3', memberId: 'member-1', mailboxId: 'mailbox-3', status: 'suspended' },
      ],
    });

    const assignments = await listMailboxAssignmentsForMember('member-1');
    expect(assignments.map((a) => a.id)).toEqual(['a1', 'a3']);
  });

  it('persists identities across a fresh module import (real file, not just an in-memory cache)', async () => {
    const first = await import('@/lib/family-identity-store');
    await first.bootstrapAdministratorIdentity({ issuer: 'https://auth.pavlovteam.ru', subject: 'e' }, 'Alexander Pavlov');

    vi.resetModules();
    const second = await import('@/lib/family-identity-store');
    const identities = await second.listHomeMailIdentities();
    expect(identities).toHaveLength(1);
    expect(identities[0].displayName).toBe('Alexander Pavlov');
  });
});
