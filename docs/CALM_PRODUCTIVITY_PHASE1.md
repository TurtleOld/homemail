# Calm Productivity - Phase 1

## Goal

Prepare the production mail UI for a safe redesign rollout without replacing the full interface at once.

## Scope of phase 1

- Lock down discovery inputs and release constraints.
- Add a production-safe design flag.
- Introduce calm productivity surface tokens for the light theme.
- Keep dark theme behavior unchanged.

## What is already implemented

- `NEXT_PUBLIC_MAIL_DESIGN` controls the design variant.
- `legacy` remains the default production value.
- Root document now exposes `data-mail-design` for CSS targeting.
- Calm productivity tokens are available in `app/globals.css`.

## Required inputs from product/owner

1. Primary accent color for the production brand.
2. Rollout strategy: internal only, cohort rollout, or all users behind manual switch.
3. Browser support floor for the redesign release.
4. Success metrics for phase 2-3, at minimum:
   - time to open first message
   - message list interaction rate
   - reply/archive/delete action rate
   - error rate after rollout
5. Whether light theme should become the default for all new accounts.

## Approved defaults

- Accent color: `#9141ac`.
- Rollout: feature-flagged internal release first.
- Browser floor: latest Chrome, Edge, Safari, Firefox.
- Default theme for new accounts: `light`.

## Next implementation milestone

1. Apply the new surface classes to `Sidebar`, `MessageList`, and `MessageViewer`.
2. Reduce dark-panel dominance in the three-column layout.
3. Rework selected, unread, and hover states to match the new token set.
4. Add screenshot-based QA for legacy vs calm productivity.
