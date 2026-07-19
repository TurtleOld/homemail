# ADR 0001: Use Stalwart OIDC for family identity

Status: Accepted

Date: 2026-07-17

## Context

HomeMail is a self-hosted family mail application. One administrator provisions private mailboxes for family members. A family member may have several private mailboxes, but each private mailbox belongs to exactly one member.

The current application derives its session from a JMAP mail account and stores only `accountId` and email. The OAuth callback also uses the account email as the key for account-switching data. This conflates the person signing in with the mailbox being accessed and cannot safely express administrator roles or mailbox assignments.

Creating a separate HomeMail password store would duplicate credential management and give family members two sign-in systems. Continuing to treat email or JMAP `accountId` as the person identifier would make address changes and multiple-mailbox membership unsafe.

## Decision

Stalwart OIDC is the only identity provider for HomeMail. HomeMail does not store passwords for family members.

Stalwart 0.15 is sufficient for this decision because it can act as an OIDC provider and exposes ID tokens, discovery metadata, UserInfo, and JWKS. Upgrading the mail server to 0.16 is not a prerequisite for the identity migration.

HomeMail identifies a family member by the validated pair of OIDC issuer and stable subject claim. Email addresses and JMAP account identifiers are attributes and resources, not user identifiers.

The existing OAuth Authorization Code flow with PKCE is extended to request the `openid` scope and validate the returned identity token. Validation includes signature, issuer, audience, expiry, and nonce. OAuth access and refresh tokens remain encrypted on the HomeMail server and are used for JMAP access.

The HomeMail session contains a durable member identifier, role, authorized mailbox assignments, and active mailbox identifier. Server-side authorization verifies the member role and mailbox assignment on every protected request. Authentication alone does not grant access to a mailbox.

Stalwart remains responsible for credentials, password recovery, credential policy, and suspension. HomeMail is responsible for its family-member profile, administrator role, mailbox assignments, product permissions, and application audit events.

## Migration

Migration uses an additive compatibility period:

1. Back up persistent HomeMail data and retain the previous deployable application version.
2. Configure the existing administrator explicitly. Never make the first person who signs in the administrator.
3. Create family-member records and mailbox assignments from the current account configuration without deleting or renaming existing data.
4. Continue reading legacy sessions and mailbox-keyed storage while new OIDC identities are linked and validated.
5. Require at most one new sign-in with the existing Stalwart credentials to establish the verified OIDC identity.
6. Switch authorization to member roles and mailbox assignments only after the administrator mapping and expected assignments pass validation.
7. Keep rollback compatible with the previous application and data model. Perform destructive cleanup only in a later release after a separate backup.

Messages, folders, JMAP identifiers, Stalwart credentials, encrypted OAuth tokens, and per-mailbox HomeMail data are not migrated to another service.

## Consequences

### Positive

- Family members keep one set of credentials.
- A person can be represented independently from any mailbox or email address.
- Administrator permissions and private mailbox assignments can be enforced consistently.
- Changing an address does not change the HomeMail identity.
- The migration can be rolled back without restoring mail data.

### Costs and risks

- The callback, session schema, storage model, authorization middleware, and protected API routes require coordinated changes.
- Existing sessions may require one new sign-in at cutover.
- Incorrect administrator bootstrap or assignment migration could deny access, so cutover is blocked until validation succeeds.
- A mailbox assignment does not by itself create provider-level JMAP access. HomeMail must also maintain valid provider authorization for the selected mailbox.
- OIDC discovery and token validation become availability and security dependencies of sign-in.
- OIDC behavior must be verified against Stalwart 0.15 in integration tests rather than inferred from the current-version documentation.

## Rejected alternatives

### Keep email or JMAP account ID as the person identifier

Rejected because it conflates people and mailboxes, breaks the multiple-mailbox family model, and makes address changes unsafe.

### Add local HomeMail passwords

Rejected because it duplicates Stalwart credential management and creates a second recovery and security boundary.

### Promote the first successful login to administrator

Rejected because deployment order or an exposed login page could grant control of the HomeMail instance to the wrong person.
