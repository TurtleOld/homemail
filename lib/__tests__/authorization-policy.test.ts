import { describe, expect, it } from 'vitest';
import { authorize, requireAuthorization, AuthorizationDeniedError } from '@/lib/authorization-policy';
import { instanceScope, mailboxScope, memberScope } from '@/lib/configuration-scope';
import {
  legacyAuthorizationSubject,
  legacySettingsAccountId,
  readLegacyAuthorizationSubject,
} from '@/lib/legacy-identity-adapter';

describe('authorization policy', () => {
  const member = {
    mode: 'identity' as const,
    memberId: 'member-1',
    role: 'member' as const,
    activeMailboxId: 'mailbox-1',
    assignedMailboxIds: new Set(['mailbox-1', 'mailbox-2']),
  };

  it('allows assigned mailbox access and rejects an unassigned client-supplied mailbox', () => {
    expect(authorize(member, {
      action: 'mailbox.read',
      scope: mailboxScope('mailbox-2'),
    }).allowed).toBe(true);

    expect(authorize(member, {
      action: 'mailbox.write',
      scope: mailboxScope('mailbox-controlled-by-request'),
    })).toEqual({ allowed: false, reason: 'mailbox-unassigned' });
  });

  it('derives member ownership from the subject rather than the request', () => {
    expect(authorize(member, {
      action: 'settings.write',
      scope: memberScope('member-1'),
    }).allowed).toBe(true);

    expect(authorize(member, {
      action: 'settings.read',
      scope: memberScope('member-2'),
    })).toEqual({ allowed: false, reason: 'member-scope-mismatch' });
  });

  it('requires the administrator role for instance scope', () => {
    expect(authorize(member, {
      action: 'instance.administer',
      scope: instanceScope,
    })).toEqual({ allowed: false, reason: 'administrator-required' });

    expect(authorize({ ...member, role: 'administrator' }, {
      action: 'instance.administer',
      scope: instanceScope,
    }).allowed).toBe(true);
  });

  it('throws a generic forbidden error without revealing the resource', () => {
    expect(() => requireAuthorization(member, {
      action: 'mailbox.read',
      scope: mailboxScope('private-mailbox'),
    })).toThrow(AuthorizationDeniedError);
  });

  it('keeps legacy sessions readable without creating identity records', () => {
    const subject = legacyAuthorizationSubject(
      { accountId: 'primary-account', email: 'person@example.test' },
      [{
        id: 'secondary-account',
        email: 'secondary@example.test',
        addedAt: 1,
      }],
    );

    expect(subject).toMatchObject({
      mode: 'legacy-compatibility',
      memberId: 'legacy:person@example.test',
      activeMailboxId: 'primary-account',
      role: 'member',
    });
    expect([...subject.assignedMailboxIds]).toEqual(expect.arrayContaining([
      'primary-account',
      'secondary-account',
    ]));
  });

  it('derives legacy account and settings lookups only from the authenticated session', async () => {
    const session = { accountId: 'primary-account', email: 'person@example.test' };
    const requestedUserId = 'client-supplied-owner';
    const seenLookupKeys: string[] = [];

    const subject = await readLegacyAuthorizationSubject(session, async (userId) => {
      seenLookupKeys.push(userId);
      return [{ id: 'secondary-account', email: 'secondary@example.test', addedAt: 1 }];
    });

    expect(requestedUserId).not.toBe(subject.memberId);
    expect(seenLookupKeys).toEqual(['person@example.test']);
    expect(legacySettingsAccountId(session)).toBe('primary-account');
  });
});
