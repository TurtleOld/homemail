import type { ConfigurationScope } from './configuration-scope';

export type AuthorizationMode = 'legacy-compatibility' | 'identity';

export interface AuthorizationSubject {
  mode: AuthorizationMode;
  memberId: string;
  activeMailboxId: string;
  assignedMailboxIds: ReadonlySet<string>;
}

export type AuthorizationAction =
  | 'mailbox.read'
  | 'mailbox.write'
  | 'mailbox.activate'
  | 'settings.read'
  | 'settings.write';

export interface AuthorizationRequest {
  action: AuthorizationAction;
  scope: ConfigurationScope;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason:
    | 'allowed'
    | 'member-scope-mismatch'
    | 'mailbox-unassigned'
    | 'scope-action-mismatch';
}

const allow = (): AuthorizationDecision => ({ allowed: true, reason: 'allowed' });
const deny = (reason: Exclude<AuthorizationDecision['reason'], 'allowed'>): AuthorizationDecision => ({
  allowed: false,
  reason,
});

/**
 * Central authorization policy. Resource ownership is derived from the authenticated
 * subject. A client-provided member identifier or mailbox identifier is only a
 * requested resource and never authorization evidence. HomeMail has no internal
 * role distinction (ADR 0008): every signed-in family member has equal standing.
 */
export function authorize(
  subject: AuthorizationSubject,
  request: AuthorizationRequest,
): AuthorizationDecision {
  if (request.scope.kind === 'member') {
    if (request.action !== 'settings.read' && request.action !== 'settings.write') {
      return deny('scope-action-mismatch');
    }
    return request.scope.memberId === subject.memberId
      ? allow()
      : deny('member-scope-mismatch');
  }

  if (
    request.action !== 'mailbox.read' &&
    request.action !== 'mailbox.write' &&
    request.action !== 'mailbox.activate' &&
    request.action !== 'settings.read' &&
    request.action !== 'settings.write'
  ) {
    return deny('scope-action-mismatch');
  }

  return subject.assignedMailboxIds.has(request.scope.mailboxId)
    ? allow()
    : deny('mailbox-unassigned');
}

export class AuthorizationDeniedError extends Error {
  readonly code = 'HOMEMAIL_FORBIDDEN';

  constructor(readonly decision: AuthorizationDecision) {
    super('The authenticated member is not authorized for this resource');
    this.name = 'AuthorizationDeniedError';
  }
}

export function requireAuthorization(
  subject: AuthorizationSubject,
  request: AuthorizationRequest,
): void {
  const decision = authorize(subject, request);
  if (!decision.allowed) {
    throw new AuthorizationDeniedError(decision);
  }
}
