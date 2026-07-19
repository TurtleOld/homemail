# ADR 0004: Recover family credentials with administrator-issued links

Status: Superseded by ADR 0009 (HomeMail never issues credential-recovery links; recovery remains a Stalwart Web Admin / operator responsibility)

Date: 2026-07-18

## Context

HomeMail uses Stalwart OIDC as its identity provider and does not store family-member passwords. A family member who forgets the Stalwart credential still needs a recovery path that works when the mailbox itself is inaccessible.

The instance has one trusted HomeMail administrator who already manages member and mailbox lifecycle. Giving that administrator the new password or an impersonation session would violate the HomeMail privacy boundary. A public forgot-password form would introduce account discovery, recovery-address ownership, and outbound delivery requirements that the family deployment does not currently need.

Changing a password is not equivalent to responding to an active compromise. Existing protocol connections or provider tokens may survive a password update unless they are explicitly revoked or the account is suspended.

## Decision

Password recovery for an active family member begins with an explicit administrator action and uses a short-lived, single-use HomeMail bearer link.

The administrator selects the family member and verified sign-in identity, confirms the action, and receives the raw recovery URL once. HomeMail stores only a keyed digest with the identity, issuer, expiry, issuing administrator, and redemption state. The token contains at least 256 bits of cryptographic entropy and expires after one hour by default.

Replacement invalidates all earlier unused recovery links for the same identity. Issuing or revoking a link does not change the current password or create a session.

The member opens the link and chooses a new password. HomeMail validates the token and password request, sends the password directly to Stalwart through `StalwartAdminAdapter`, and never persists it. Redemption uses the same durable claim-lease state machine and browser leakage protections defined for activation links.

After Stalwart confirms the password change, HomeMail invalidates every HomeMail session and deletes encrypted OAuth access and refresh tokens associated with the member. The member then authenticates through the normal Stalwart OIDC Authorization Code flow with PKCE.

The Stalwart 0.15 adapter also revokes provider-side OAuth grants and invalidates authentication caches when those capabilities are verified. If the connected server cannot provide either operation, HomeMail reports the limitation and does not imply that every provider session has been revoked.

Suspected credential compromise is a separate incident workflow. The administrator suspends the identity before issuing recovery so new authentication and mailbox operations are blocked while credentials are replaced. Password recovery alone does not promise immediate termination of established IMAP, SMTP, JMAP, or other protocol connections.

All recovery lifecycle events are recorded without raw tokens or passwords. The affected family member can see the recovery history after the next successful sign-in. The administrator cannot use recovery to create a HomeMail session or open the member's mailbox.

## Consequences

### Positive

- Recovery works even when the member cannot access the mailbox.
- The administrator never chooses or receives the replacement password.
- HomeMail remains free of stored passwords.
- Local sessions and OAuth tokens are invalidated consistently after recovery.
- Recovery and compromise response have distinct, truthful guarantees.

### Costs and risks

- The recovery URL is a bearer secret held temporarily by the administrator and anyone who intercepts its delivery channel.
- HomeMail must maintain another security-sensitive unauthenticated endpoint and audit lifecycle.
- Provider-wide token and connection revocation depends on verified Stalwart 0.15 capabilities.
- A malicious underlying server administrator retains powers outside the HomeMail product boundary; HomeMail can provide auditability but cannot remove host-level control.
- The family must have a trusted out-of-band way to request and deliver recovery.

## Rejected alternatives

### Administrator sets and communicates a replacement password

Rejected because the administrator would know a credential for the member's private mailbox.

### Public email-based forgot-password form

Rejected for the initial family product because it requires recovery-address verification and anti-abuse delivery infrastructure while the administrator already provides a trusted out-of-band channel.

### Treat password change as complete incident response

Rejected because existing protocol sessions or provider tokens may remain valid.

### Sign the member into HomeMail after recovery

Rejected because recovery-link possession must not replace authentication through Stalwart OIDC.
