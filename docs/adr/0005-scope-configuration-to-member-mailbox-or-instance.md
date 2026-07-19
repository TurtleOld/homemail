# ADR 0005: Scope configuration to member, mailbox, or instance

Status: Partially superseded by ADR 0008 (the `administrator`/`member` role distinction and the `instance` scope are removed; the `member` and `mailbox` scopes below remain in force)

Date: 2026-07-18

## Context

The current HomeMail session and much of its stored data are keyed by mail account. The family model separates a person from assigned mailboxes, and one family member may use several private mailboxes. Keeping every setting keyed to the active mailbox would duplicate personal preferences and contacts. Moving every setting to the member would incorrectly share sender behavior, mail automation, and cryptographic material between mailboxes.

HomeMail also contains server administration capabilities that ordinary family members must not control. The redesign needs an explicit ownership model for persistence, routes, authorization, migration, and UI labels.

## Decision

Every HomeMail setting has exactly one primary scope.

Member preferences belong to the authenticated family member and follow that person across all assigned mailboxes. They include theme, language, density, accessibility, keyboard shortcuts, general notification preferences, and the personal address book.

Mailbox settings belong to one mailbox or sender identity. They include display name, signatures, aliases, reply-to behavior, forwarding, auto-reply, filters, Sieve, folders, labels, subscriptions, auto-archive, and PGP material.

Instance settings affect the entire deployment and require the HomeMail administrator role. They include Stalwart integration, family members, mailbox assignments, backup and restore, monitoring, security policy, image-proxy policy, and system limits.

Notifications use a member-level master preference with per-mailbox overrides. A per-mailbox override may narrow a member preference but may not enable a delivery channel disabled at member scope.

The server derives member ownership from the authenticated session. It validates requested mailbox assignments and administrator role for the other scopes. Client-supplied owner identifiers are never authorization evidence.

Settings routes and UI identify their scope explicitly. Switching the active mailbox changes mailbox-scoped settings only.

Legacy account-keyed data is classified before migration. Mailbox settings retain their account association. Member preferences are copied to the member record, with conflicts surfaced and source values retained for rollback. Instance settings are migrated once through an administrator-controlled operation.

## Consequences

### Positive

- Personal experience remains consistent across a member's mailboxes.
- Sender behavior, automation, and cryptographic data remain isolated per mailbox.
- Administrator-only controls have a clear authorization boundary.
- Settings screens can explain which changes affect the person, mailbox, or installation.
- Data migration and API tests have explicit ownership rules.

### Costs and risks

- Existing settings storage and APIs must be classified and migrated rather than mechanically re-keyed.
- Screens containing several scopes need clear transitions or separate routes.
- Conflicting legacy personal preferences require a review or deterministic default with rollback data.
- Notification resolution combines two scopes and needs a documented precedence rule.
- Future settings must declare their scope during design and code review.

## Rejected alternatives

### Keep every setting scoped to the active mailbox

Rejected because personal preferences and contacts would be duplicated and could diverge for the same person.

### Move every setting to the family member

Rejected because signatures, forwarding, filters, PGP material, and other mailbox behavior must not leak between mailboxes.

### Infer scope from the current page

Rejected because implicit ownership is unsafe for APIs, background jobs, migrations, and deep-linked settings routes.
