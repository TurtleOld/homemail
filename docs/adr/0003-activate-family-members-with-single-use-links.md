# ADR 0003: Activate family members with single-use links

Status: Accepted

Date: 2026-07-18

## Context

The HomeMail administrator provisions a family member and the member's first private mailbox through one workflow. The new Stalwart principal needs an initial credential before the member can authenticate through Stalwart OIDC.

Letting the administrator choose or view the member's password weakens the family privacy boundary. Sending a reusable temporary password also creates a credential that may remain valid if the member does not change it. Stalwart 0.15 does not provide a HomeMail-specific invitation flow that satisfies the desired product experience.

HomeMail and Stalwart do not share a transaction. Activation must therefore tolerate a password-update failure without allowing concurrent redemption, token replay, duplicate mailboxes, or a permanently unusable member record.

## Decision

HomeMail activates a pending family member with a short-lived, single-use bearer link.

During provisioning, HomeMail generates a high-entropy random bootstrap password, sends it to Stalwart through `StalwartAdminAdapter`, and immediately discards it. The password is never displayed, logged, or stored by HomeMail.

HomeMail separately generates an activation token with at least 256 bits of cryptographic entropy. It stores only a keyed digest and metadata identifying the member, mailbox, provisioning operation, expiry, and redemption state. The raw URL is displayed once to the administrator, who delivers it through a trusted family channel.

The default lifetime is 24 hours. An administrator can revoke an unused link or generate a replacement. Replacement invalidates all earlier links for the same activation.

The activation page accepts a new password and sends it directly to the Stalwart 0.15 administration adapter over the protected server connection. HomeMail does not persist the password. Stalwart password policy errors are returned as field validation without exposing server internals.

Redemption uses a durable state machine:

1. `pending`: the valid unexpired digest may be claimed.
2. `redeeming`: one request owns a short claim lease while changing the Stalwart password.
3. `completed`: Stalwart confirmed the password change, the member is Active, and the token can never be used again.
4. `revoked`: the administrator revoked or replaced the link.
5. `expired`: the link passed its expiry without completion.

A transient failure before Stalwart confirms the change releases or expires the claim lease and permits a safe retry with the same activation. Concurrent requests cannot own the claim simultaneously. The implementation must reconcile an ambiguous provider response before permitting another password change.

Successful activation does not create a HomeMail session. The browser is redirected into the normal Stalwart OIDC Authorization Code flow with PKCE so authentication and activation remain separate security events.

The activation response uses `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, loads no third-party resources, emits generic invalid-token errors, and is rate-limited. Raw tokens and passwords are excluded from logs, analytics, audit payloads, URLs copied into internal navigation, and support exports.

## Consequences

### Positive

- The administrator does not choose or receive the family member's password.
- HomeMail stores neither the bootstrap password nor the chosen password.
- Expiry, revocation, replacement, and replay behavior are explicit.
- The member still authenticates through Stalwart OIDC after activation.
- Transient cross-service failures have a defined recovery path.

### Costs and risks

- The activation URL is a bearer secret. An administrator or attacker who obtains it before the member redeems it can choose the initial password.
- HomeMail adds a security-sensitive unauthenticated endpoint and durable activation state.
- Ambiguous Stalwart responses require reconciliation before retrying a password change.
- The implementation needs careful log redaction, rate limiting, concurrency tests, and browser leakage protections.
- Password recovery for active members remains unsolved by this onboarding mechanism.

## Rejected alternatives

### Administrator chooses the initial password

Rejected because the administrator would know a credential for another family member's private mailbox.

### Display a generated temporary password

Rejected because a reusable credential could be copied, retained, or used through another mail protocol before the member changes it.

### Store the chosen password in HomeMail

Rejected because Stalwart is the credential authority and HomeMail must not create a second password store.

### Create a HomeMail session immediately after activation

Rejected because possession of an activation link proves only onboarding authority. The member must still authenticate through Stalwart OIDC.
