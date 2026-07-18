export type ConfigurationScope =
  | { kind: 'member'; memberId: string }
  | { kind: 'mailbox'; mailboxId: string }
  | { kind: 'instance' };

export type ConfigurationScopeKind = ConfigurationScope['kind'];

export function memberScope(memberId: string): ConfigurationScope {
  return { kind: 'member', memberId };
}

export function mailboxScope(mailboxId: string): ConfigurationScope {
  return { kind: 'mailbox', mailboxId };
}

export const instanceScope: ConfigurationScope = Object.freeze({ kind: 'instance' });
