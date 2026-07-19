# ADR 0006: Use a list-first route-backed mail workspace

Status: Accepted

Date: 2026-07-18

## Context

The current desktop mail workspace shows navigation, message list, and reader simultaneously. This leaves too little width for scanning message metadata and too little width for HTML email, while all three regions compete for attention. The selected message also lacks a durable route, which weakens refresh, direct links, new-tab use, and browser Back behavior.

HomeMail needs a compact desktop experience that keeps mail navigation available without preserving the permanent reading pane.

## Decision

Mail uses list-first navigation. The desktop sidebar remains visible, and the remaining width contains either the full-width message list or the dedicated reader.

The reader route is `/{locale}/mail/messages/{messageId}`, where `messageId` is the existing URL-encoded Stalwart JMAP `Email.id`. HomeMail does not add a client UUID or mapping table.

Folder, search, quick-filter, and presentation state live in validated URL search parameters. Scroll position and temporary selection state use browser history state or session storage. Browser Back returns to the prior list context.

Conversation view is the default and flat message view remains an explicit preference. Desktop keeps the Mail sidebar, tablet uses an overlay drawer, and mobile uses separate folder, list, and reader screens.

## Consequences

### Positive

- Message rows gain stable scanning columns and useful subject width.
- The reader can render large email content without a narrow third pane.
- Refresh, deep links, new tabs, Back, and Forward have predictable behavior.
- Mobile and desktop share the same navigation model.

### Costs and risks

- Opening a message replaces the list, adding one navigation step when comparing several messages.
- Scroll restoration and URL-state validation require explicit tests.
- The monolithic current mail layout must be decomposed into route-aware shells.
- Selection and bulk-action state must not leak across route changes.

## Rejected alternatives

### Keep the permanent three-pane desktop layout

Rejected because it preserves the width and hierarchy problems identified in the current design.

### Open the reader only in a modal or drawer

Rejected because a message needs a durable URL and enough space for long conversations and HTML content.

### Hide the desktop sidebar while reading

Rejected because folder context and mailbox navigation should remain stable on desktop.
