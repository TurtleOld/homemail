# ADR 0008: Remove HomeMail roles and instance scope

Status: Accepted

Date: 2026-07-19

Supersedes: ADR 0005 (the `administrator`/`member` role distinction and the `instance` configuration scope only; the `member` and `mailbox` scopes it defines are unaffected and remain in force)

## Context

ADR 0005 introduced an `administrator`/`member` role distinction inside HomeMail, and an `instance` configuration scope reserved for the administrator role, alongside `member` and `mailbox` scopes. An explicit, non-first-login administrator bootstrap (`HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL`, matched against a verified OIDC identity per ADR 0001) was implemented on top of this model.

Before any HomeMail UI existed to act on the administrator role, it became clear the role provided no real capability yet: HomeMail cannot itself manage Stalwart (no `StalwartAdminMutationTransport` implementation exists), so an "administrator" role inside HomeMail granted no access to anything a `member` role did not already have. The role existed only as unused scaffolding.

Reflecting further on the target deployment — one small, trusted family sharing a single HomeMail instance, where the person who runs the server already holds the actual Stalwart administrator credentials for domain, mailbox, and server configuration — a second HomeMail-internal administrator role for the same small trusted group adds complexity without a corresponding safety or usability benefit. Server administration (domains, mailboxes, TLS, DKIM, OIDC signing, backup/restore, security policy) is performed directly against Stalwart by the person who already holds that access; it does not need a second, HomeMail-specific authorization layer for the same trusted group of people.

## Decision

HomeMail has no internal role distinction. Every family member who can sign in has equal standing inside HomeMail: the same access to their own mailboxes, the same member-scoped preferences, and the same personal contacts, with no `administrator` role granting broader capability inside the application.

The `instance` configuration scope defined in ADR 0005 is removed. HomeMail does not provide an instance-administration surface (Stalwart integration, family membership, mailbox assignments, backup, monitoring, security policy, system limits) in its own UI. That surface remains Stalwart Web Admin and the operator's own tooling, used directly by whoever holds Stalwart's own administrator credentials — a separate concern from anyone's HomeMail sign-in.

The `member` and `mailbox` configuration scopes from ADR 0005 are retained unchanged: member preferences still follow a person across their assigned mailboxes, and mailbox settings still belong to one mailbox, both authorized from the authenticated session exactly as ADR 0005 specified.

This removes:

- `HomeMailRole` and the `role` field on `HomeMailIdentity`.
- The `instance` variant of `ConfigurationScope` and the `instance.administer` authorization action.
- The explicit administrator bootstrap (`HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL`, `bootstrapAdministratorIdentity`, `bootstrapAdministratorIfConfigured`) and its wiring into the OAuth callback.

Family member provisioning (creating a member and their first mailbox) still requires direct Stalwart access and is performed by whoever holds Stalwart's own administrator credentials, using Stalwart Web Admin or Stalwart's own tooling — not a HomeMail-internal role. A future HomeMail-driven provisioning workflow, if built, must be re-evaluated against this decision rather than reintroducing a role silently.

## Consequences

### Positive

- Removes an authorization concept and a bootstrap mechanism that granted no actual capability, reducing surface area and code that must be tested and reasoned about.
- Matches the target deployment: a small trusted family where the person running the server already holds real Stalwart administrator access, so a duplicate HomeMail-only role added a second boundary around the same trust relationship.
- Simplifies `AuthorizationSubject`, `authorize()`, and every HomeMail identity record to a single, uniform shape.

### Costs and risks

- If HomeMail later needs to distinguish who may perform sensitive in-app actions (e.g. driving Stalwart provisioning from HomeMail's own UI, once that exists), that distinction must be reintroduced deliberately, with its own ADR — not assumed to still exist from this one.
- Any future HomeMail capability that would have depended on the `instance` scope (Stalwart integration, backup/restore, monitoring, security policy from inside HomeMail) requires a fresh design decision before it can be built at all.
- Deployments that already ran the reverted increment 1/2 code with `HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL` set and `HOMEMAIL_FEATURE_FAMILY_IDENTITY` enabled may have a bootstrapped administrator identity record on disk; it becomes an ordinary identity record with no special meaning once this ADR's code changes are deployed, and requires no migration since the removed `role` field is simply no longer read.

## Rejected alternatives

### Keep `administrator`/`member` but leave `instance` unimplemented

Rejected because the role would remain pure scaffolding with no code path that checks it, which is worse than not having the concept: an unused permission distinction invites someone to build against it later without revisiting whether it is still the right model.

### Keep the role only for a future Stalwart-provisioning-from-HomeMail feature

Rejected because that feature does not exist yet and its authorization needs are not yet designed. Reserving a role for a hypothetical future capability is exactly the kind of premature abstraction this project avoids; the decision can be made again, deliberately, when that feature is actually designed.
