export type ConfigurationScope =
  | { kind: 'member'; memberId: string }
  | { kind: 'mailbox'; mailboxId: string };

export type ConfigurationScopeKind = ConfigurationScope['kind'];

export function memberScope(memberId: string): ConfigurationScope {
  return { kind: 'member', memberId };
}

export function mailboxScope(mailboxId: string): ConfigurationScope {
  return { kind: 'mailbox', mailboxId };
}
