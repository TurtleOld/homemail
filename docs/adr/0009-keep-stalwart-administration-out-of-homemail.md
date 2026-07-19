# ADR 0009: Keep Stalwart administration out of HomeMail

Status: Accepted

Date: 2026-07-19

Supersedes: ADR 0003 (activate family members with single-use links) and ADR 0004 (recover family credentials with admin-issued links), both in full. Does not affect ADR 0001's identity model or ADR 0002's `StalwartAdminAdapter` boundary concept, though the latter's scope is narrowed by this decision (see Consequences).

## Context

ADR 0008 removed HomeMail's internal `administrator`/`member` role distinction after observing it granted no real capability: HomeMail could not yet act on Stalwart at all, so the role was pure scaffolding. That raised the next question directly: should HomeMail ever drive Stalwart account provisioning from its own UI, and if so, with what authority?

A brief investigation of Stalwart 0.15's actual REST Management API (queried directly against a running 0.15.3 instance, since the public documentation mixes 0.15 and 0.16 API shapes and cannot be trusted alone) confirmed that account and domain lifecycle — create, update, delete — for both domains and mailboxes goes through a single `/api/principal` endpoint, alongside a broad, security-sensitive `/api/settings/*` surface that exposes raw configuration including password hashes and private DKIM keys. Provisioning is technically possible through a scoped API key.

Reconsidering the target deployment — one small, trusted family, one server operator who already holds full Stalwart administrator access — the user decided that mailbox and family-member lifecycle, domains, DKIM, and security-sensitive server configuration should remain a direct Stalwart Web Admin responsibility, permanently, not a HomeMail capability. HomeMail's role is limited to what a family member or the operator would want to see and use day-to-day: mail, contacts, personal settings, and read-only visibility into server health and mail flow.

ADR 0003 and ADR 0004 were built entirely around a different scenario: an administrator provisioning members through HomeMail's own UI, issuing single-use activation and recovery bearer links so the member never has HomeMail-stored credentials. With provisioning permanently out of scope, that scenario does not exist, and neither does the credential-issuance problem those ADRs solved.

## Decision

HomeMail never creates, updates, or deletes Stalwart principals, domains, mailboxes, DKIM keys, TLS settings, or any other server-administration resource. All such operations remain the server operator's direct responsibility through Stalwart Web Admin (or Stalwart's own tooling), using Stalwart's own administrator credentials — never a credential HomeMail holds or brokers.

HomeMail may read operational data from Stalwart for display purposes only: mail queue status, delivery/report backlog, and other server health or usage signals exposed by read-only Stalwart API calls. This uses a dedicated, narrowly scoped Stalwart API-key credential (`STALWART_ADMIN_API_KEY`, already reserved in `.env.production.example`) restricted to read-only operations — it must never be granted `/api/settings/*` access, since that surface returns raw configuration including credential hashes and private key material regardless of the caller's intent.

Family member activation and password recovery are not HomeMail capabilities. Both remain entirely Stalwart's and the operator's responsibility, exactly as they are today, with no HomeMail-issued bearer link, no HomeMail-generated bootstrap password, and no HomeMail credential-recovery workflow.

## Consequences

### Positive

- Removes an entire class of security-sensitive, unauthenticated-endpoint surface (activation and recovery bearer links) that ADR 0003/0004 required careful token, claim-lease, and leakage-protection design for — none of it needs to be built, tested, or maintained.
- Matches the actual trust model: the operator who can reach Stalwart Web Admin already has full server control: adding a parallel HomeMail-mediated path for the same operations would only add risk (a second privileged surface, a second credential to protect) without adding capability.
- HomeMail's `StalwartAdminAdapter` boundary (ADR 0002) narrows to a small, low-risk read-only contract, which is easier to implement correctly and to reason about than a full mutation transport.

### Costs and risks

- An operator who wants to manage the family entirely from HomeMail cannot; they must use Stalwart Web Admin for anything beyond viewing status. This is an accepted product-scope limitation, not an oversight.
- `StalwartAdminOperation`'s currently-declared mutation operations (`principal.create/update/suspend/delete`, `mailbox.create`, `credential.update`, `oauth.revoke`) have no consumer under this decision. They are not deleted in this ADR — a future decision may still need a narrow, deliberately-scoped mutation capability for some other reason — but no code should be built against them without a fresh ADR revisiting whether this decision still holds.
- Read-only Stalwart integration still requires careful scoping of the API key and careful selection of which endpoints HomeMail calls, since even ostensibly "read-only" surfaces in Stalwart 0.15 (`/api/settings/*`) can return credential material.

## Rejected alternatives

### Keep ADR 0003/0004 for a hypothetical future HomeMail-driven provisioning feature

Rejected because provisioning is not a future feature under active consideration — it is explicitly out of scope by this decision. Keeping unused, complex security-sensitive designs "just in case" is the same premature-scaffolding mistake ADR 0008 already identified and corrected once.

### Grant the read-only monitoring API key broad `/api/settings/*` access for convenience

Rejected because that endpoint returns unredacted secrets (password hashes, private DKIM keys) confirmed by direct inspection of a running 0.15.3 instance; no monitoring use case justifies that exposure.
