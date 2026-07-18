import { describe, expect, it } from 'vitest';
import { instanceScope, mailboxScope, memberScope } from '@/lib/configuration-scope';
import { oidcIdentityKey } from '@/lib/home-identity';

describe('identity and configuration domain boundaries', () => {
  it('keys identities by the exact verified issuer and stable subject pair', () => {
    expect(oidcIdentityKey({ issuer: 'https://identity.example', subject: 'member-1' }))
      .not.toBe(oidcIdentityKey({ issuer: 'https://identity.example', subject: 'member-2' }));
    expect(oidcIdentityKey({ issuer: 'https://identity-a.example', subject: 'member-1' }))
      .not.toBe(oidcIdentityKey({ issuer: 'https://identity-b.example', subject: 'member-1' }));
    expect(() => oidcIdentityKey({ issuer: 'https://identity.example ', subject: 'member-1' }))
      .toThrow();
  });

  it('keeps member, mailbox, and instance configuration scopes explicit', () => {
    expect(memberScope('member-1')).toEqual({ kind: 'member', memberId: 'member-1' });
    expect(mailboxScope('mailbox-1')).toEqual({ kind: 'mailbox', mailboxId: 'mailbox-1' });
    expect(instanceScope).toEqual({ kind: 'instance' });
  });
});
