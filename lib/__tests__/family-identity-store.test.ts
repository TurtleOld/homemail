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

  it('creates an identity and finds it back by oidc reference', async () => {
    const { createIdentity, findIdentityByOidc } = await import('@/lib/family-identity-store');

    const reference = { issuer: 'https://auth.pavlovteam.ru', subject: 'e' };
    const created = await createIdentity(reference, 'Alexander Pavlov');

    expect(created.status).toBe('active');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const foundByOidc = await findIdentityByOidc(reference);
    expect(foundByOidc).toEqual(created);
  });

  it('rejects creating a second identity for the same (issuer, subject) pair', async () => {
    const { createIdentity, DuplicateOidcIdentityError } = await import('@/lib/family-identity-store');

    const reference = { issuer: 'https://auth.pavlovteam.ru', subject: 'e' };
    await createIdentity(reference, 'First Sign-in');

    await expect(createIdentity(reference, 'Second Sign-in')).rejects.toBeInstanceOf(
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
    await first.createIdentity({ issuer: 'https://auth.pavlovteam.ru', subject: 'e' }, 'Alexander Pavlov');

    vi.resetModules();
    const second = await import('@/lib/family-identity-store');
    const identities = await second.listHomeMailIdentities();
    expect(identities).toHaveLength(1);
    expect(identities[0].displayName).toBe('Alexander Pavlov');
  });
});
