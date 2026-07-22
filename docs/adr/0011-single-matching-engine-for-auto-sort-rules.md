# ADR 0011: Single matching engine for auto-sort rules, with visible preview and background-job status

Status: Accepted

Date: 2026-07-22

## Context

An auto-sort rule created through the Settings UI (condition `body:*@klinikabudzdorov.ru`, action move to folder, "Apply to existing messages" checked) did not move any of the sender's existing mail. Investigating this one rule surfaced a wider structural problem with how auto-sort rules are matched against messages:

- **Four independent implementations of rule matching existed**, each with its own semantics: `lib/filters.ts` (`matchFilterGroup`/`applyRulesToMessages`), `lib/apply-auto-sort-rules.ts` (`checkMessageMatchesRule`/`checkMessageMatchesCondition`), `lib/auto-sort-to-sieve.ts` (translates a rule into a Sieve script pushed to Stalwart), and `scripts/auto-sort-worker.ts` (a standalone systemd/Docker-sidecar script duplicating the daemon's apply-job logic almost line for line). `lib/filters.ts` turned out to be dead code — not imported by any component, route, or test. `scripts/auto-sort-worker.ts` was likewise dead: `instrumentation.ts` already starts the in-process daemon (`lib/auto-sort-daemon.ts`) automatically on every server boot, and neither `docker-compose*.yml` nor CI referenced the `auto-sort:worker` npm script that ran the standalone version — it was leftover from before the in-process daemon existed. So only `lib/apply-auto-sort-rules.ts` and `lib/auto-sort-to-sieve.ts` were ever actually reachable in the deployed system, but the sheer number of divergent copies was itself a latent source of "works here, not there" bugs and a maintenance trap (a fix applied to one copy silently would not apply to the others).
- Sieve does not support the `body` field (or `date`, `tags`, `folder`, `status`, `messageId`, `attachment`, `filename`) — `auto-sort-to-sieve.ts` silently skips any condition using them, falling back to the JS daemon (`lib/auto-sort-daemon.ts`) for both new and existing mail. For the reported rule, this fallback was the only path that could have applied it, but that same daemon path's `body` condition matches against the message's actual body/snippet text, not the sender's address — the query itself named the wrong field (`body:*@...` instead of `from:*@...`), so no engine could have matched the intended sender.
- The rule editor (`components/auto-sort-rule-editor.tsx`) offers no preview of which messages a condition matches, before or after saving. A mistyped field only becomes visible after the fact, and even then only by noticing the rule silently had no effect.
- Applying a rule to existing messages already runs as a background job (`lib/filter-job-queue.ts` + `auto-sort-daemon.ts`'s `processFilterJob`), but the job's status (pending/processing/completed/failed, processed/total counts) is never exposed to the client — there is no GET endpoint for it and the rule editor never queries one.

## Decision

`lib/filters.ts` and `scripts/auto-sort-worker.ts` (with its `auto-sort:worker` npm script) are deleted outright as dead code — neither is adapted or preserved for future use. `lib/apply-auto-sort-rules.ts` becomes the single source of truth for whether a message matches a rule, used both for the real-time daemon path and for the new preview capability described below. `lib/auto-sort-to-sieve.ts` remains a best-effort accelerator: only for the subset of fields it can express in Sieve, so purely-supported rules are still enforced server-side without waiting on the JS daemon. Every field, supported by Sieve or not, is still authoritatively checked by the single JS matcher — Sieve never becomes an independent source of truth.

The rule editor gains a "Check matches" button (not automatic re-evaluation on every keystroke) that runs the same folder scan the daemon would run for `applyToExisting` — every folder except `trash`, `sent`, `drafts`, and the rule's own move-to destination — so the number shown is the real number the daemon would act on, not an approximated fast-path count. Because this scan carries the same intentional inter-page/inter-folder delays the daemon uses to avoid tripping Stalwart rate limits, it runs as a background job rather than blocking the editor, and the user can keep editing the condition while it runs.

This preview reuses the existing `FilterJob` model in `lib/filter-job-queue.ts` rather than introducing a parallel job system, but that queue currently identifies a job strictly by `ruleId` and loads the rule's conditions from the persisted `data/filter-rules.json` — a not-yet-saved draft has neither. `FilterJob` is extended with an inline-conditions mode: a preview job can carry the draft's `FilterGroup` directly instead of a `ruleId`, so "Check matches" never has the side effect of persisting the draft. A preview job never calls `applyRuleActions` — it only counts matches. Its result is a count only (`matchedCount` alongside the existing `progress.processed`/`progress.total`), not a list of matched message IDs or per-message previews (subject/sender) — deliberately coarser than a full match list, to keep the job's stored state small or "message X of Y compared to the applied job."

Separately, job status becomes visible in Settings: a new GET endpoint exposes a job's status by `ruleId` (for the real apply-to-existing job) or by job ID (for a preview job), and the rule list surfaces it inline — e.g. "Processed 128 of 128, moved 6" or "Error: ...". Today a failed job is silent; the user has no way to discover a rule's background application failed short of reading server logs.

## Consequences

### Positive

- One matching engine means a rule's behavior no longer depends on which code path happens to process a given message — the bug class that made this specific rule's failure hard to diagnose is closed.
- The preview surfaces field-selection mistakes (like `body:` where `from:` was meant) before the user commits to "Apply to existing messages" and waits for a background job to silently do nothing.
- Reusing `FilterJob` avoids a second, parallel job-tracking system; the inline-conditions extension is additive and does not change the shape or meaning of an apply job.
- Background job failures (Stalwart errors, rate limits) are now discoverable in the UI instead of only in server logs.

### Costs and risks

- The preview button, by design, is exactly as slow as a real apply-to-existing run (same folder scan, same rate-limit-avoiding delays) — for large mailboxes this can take tens of seconds or more before a count appears. This was an explicit trade-off: correctness of the displayed count over a fast approximate one.
- `lib/auto-sort-to-sieve.ts`'s per-field support is now the only thing that decides whether a rule is enforced server-side (via Sieve) versus depending entirely on the JS daemon being up and polling; this was already true before this ADR and is not changed by it, but is now the single explicit acceleration path with no ambiguity about a competing engine.

## Rejected alternatives

### Preserve or adapt `lib/filters.ts` as part of the unified engine

Rejected because it was confirmed dead code with no callers anywhere in the codebase (components, routes, or tests) — there was no existing behavior to preserve, and adapting it would have meant reconciling a third semantics for no functional gain.

### Auto-save the draft rule before running "Check matches"

Rejected because it silently changes what the button does — a user pressing "Check" would be surprised to find they had also saved (and, if `applyToExisting` was checked, already queued a real apply job) before seeing whether the condition even made sense.

### Cap the preview to a fast subset (e.g. Inbox only, last N messages)

Rejected in favor of matching the daemon's full folder scan exactly. The user preferred an accurate count that matches what "Apply to existing" will actually do over a faster but approximate one, given that the whole premise of this change is restoring trust that what the editor shows reflects what the rule will really do.

### Store matched message IDs or per-message details (subject/sender) in the preview result

Rejected in favor of a count only, to keep the job's stored result small and the feature scope narrow; a future increment can add per-message preview detail if a count alone proves insufficient in practice.
