export type HomeMailRole = 'administrator' | 'member';
export type HomeMailIdentityStatus = 'pending' | 'active' | 'suspended';
export type MailboxAssignmentStatus = 'active' | 'suspended';

export interface OidcIdentityReference {
  issuer: string;
  subject: string;
}

export interface HomeMailIdentity {
  id: string;
  oidc: OidcIdentityReference;
  displayName: string;
  role: HomeMailRole;
  status: HomeMailIdentityStatus;
}

export interface Mailbox {
  id: string;
  accountId: string;
  email: string;
  kind: 'private';
}

export interface MailboxAssignment {
  id: string;
  memberId: string;
  mailboxId: string;
  status: MailboxAssignmentStatus;
}

export function oidcIdentityKey(reference: OidcIdentityReference): string {
  const { issuer, subject } = reference;
  if (!issuer || !subject || issuer !== issuer.trim() || subject !== subject.trim()) {
    throw new Error('OIDC issuer and subject are required');
  }
  return `${issuer}\u0000${subject}`;
}
