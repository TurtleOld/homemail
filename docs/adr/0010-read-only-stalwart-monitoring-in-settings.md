# ADR 0010: Read-only Stalwart monitoring in Settings

Status: Accepted

Date: 2026-07-19

## Context

ADR 0009 confirmed HomeMail never creates, updates, or deletes any Stalwart resource, but leaves room for read-only visibility into server health and mail flow. Since HomeMail has no internal roles (ADR 0008), any such visibility is either shown to every family member identically or not built at all — there is no smaller audience to scope it to.

Stalwart 0.15.3's real REST Management API was queried directly (per ADR 0009) and confirmed to expose `GET /api/queue/messages` and `GET /api/queue/reports`, both returning `{"data": {"items": [...], "total": N, ...}}`. Attempting to also confirm the exact shape of non-empty `items` entries (individual queued message and report details) was not possible safely in the available dev environment: it has no outbound internet access, so a delivery attempt to a nonexistent external domain failed immediately as a permanent failure rather than producing a retried, queued entry, and internal delivery between two throwaway test accounts completed too fast to observe an in-flight queue entry. Only the top-level `total` count and the empty-vs-non-empty `items` array were confirmed by direct observation; the per-item field shapes (message recipients, retry state, report type/domain/range) were not.

## Decision

Unlike every other redesign capability in this project, this feature ships without a feature flag. It is read-only, cannot mutate any Stalwart or HomeMail state, and the worst failure mode is an incorrect or missing count on a Settings page — not a data-safety or rollback concern the flag discipline exists to guard against. The user explicitly chose a direct, always-on implementation over the project's usual gated-rollout pattern for this specific, narrow case. Every signed-in family member sees an identical, read-only "System status" view inside Settings — no role or scope restricts who can see it, consistent with ADR 0008.

The first increment shows only what was directly confirmed against a real Stalwart 0.15.3 instance:

- Outbound mail queue: the `total` count from `GET /api/queue/messages`, and whether it is zero or non-zero.
- Report backlog: the `total` count from `GET /api/queue/reports`, and whether it is zero or non-zero.
- Server reachability: whether HomeMail's call to Stalwart succeeded at all (already-available JMAP/OIDC discovery signals may also inform this without a new call).

Per-item detail (which messages are stuck, their recipients and retry counts, which reports are pending and for which domain) is deliberately deferred to a later increment, once its exact JSON shape can be confirmed against real data — either in production (with explicit operator involvement, since it is live mail-flow data) or a disposable stack with genuine outbound network access. Building typed UI against an unconfirmed shape risks either runtime errors on fields that do not exist as assumed, or silently swallowing real per-item data if the assumed shape is wrong in a way that still parses.

HomeMail authenticates these calls with a dedicated `STALWART_ADMIN_API_KEY` (reserved since ADR 0009), sent as `Authorization: Bearer <key>`. Per ADR 0009, this key must never be granted `/api/settings/*` access; only the queue/report read endpoints. Response parsing checks for Stalwart's `error` field in the response body regardless of HTTP status, since Stalwart 0.15.3 was confirmed (during ADR 0009's investigation) to return HTTP 200 with an `{"error": ...}` body for some not-found conditions rather than a non-2xx status.

## Consequences

### Positive

- Ships a real, verified capability (queue/report counts) without guessing at unconfirmed API shapes, avoiding the exact mistake ADR 0009 caught early (building against documentation that turned out to describe a different Stalwart version).
- Consistent with ADR 0008: no new role or permission concept is introduced to gate this view.
- Narrow API key scope (queue/report reads only) limits the blast radius of `STALWART_ADMIN_API_KEY` if it is ever leaked or misused.

### Costs and risks

- The first increment is coarse (counts and a boolean signal only) and will not tell a family member which specific message is stuck or which report is pending. This is an accepted, explicit limitation, not an oversight.
- A later increment that adds per-item detail must independently verify the real JSON shape before writing types or UI against it — the field names reported by AI-assisted code lookups during this investigation were not trustworthy on their own (they matched a different Stalwart version once already) and must not be used as the sole basis for that future work.

## Rejected alternatives

### Build full per-item detail now, based on the code-lookup field names

Rejected because those field names came from a source (an AI-assisted fetch of what was presented as the relevant source file) that already proved unreliable once in this same investigation — a fetch for API documentation returned 0.16-shaped JMAP management objects that do not exist on the running 0.15.3 server. Shipping typed UI against unverified per-item fields risks silent data-shape mismatches in a monitoring feature, which is exactly where silent mismatches are least likely to be noticed.

### Scope the monitoring view to a subset of family members

Rejected because HomeMail has no role concept (ADR 0008) and mail-flow health is not mailbox-specific data that would justify inventing one just for this feature.
