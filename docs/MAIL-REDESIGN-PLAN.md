# HomeMail product redesign plan

Status: UI blueprint accepted; ready for visual mockups and implementation sequencing

This document is the durable implementation plan for the complete HomeMail redesign. Domain terminology belongs in `CONTEXT.md`. Accepted hard-to-reverse architectural decisions are recorded in `docs/adr`.

Copyable prompts for starting each phase in a separate chat are maintained in [MAIL-REDESIGN-PHASE-PROMPTS.md](MAIL-REDESIGN-PHASE-PROMPTS.md).

## Design read

HomeMail is a self-hosted family mail client with secondary organization, data, security, and server-management capabilities. One HomeMail administrator operates the instance and provisions mailboxes for family members. The redesign uses a calm, compact, keyboard-friendly product language. It borrows Gmail's list-first mail navigation model without copying Gmail's visual identity or unsupported classification features.

- Redesign mode: full product overhaul with preserved capabilities and contracts
- Design variance: 4
- Motion intensity: 3
- Visual density: 8
- Existing stack retained: Next.js, Tailwind CSS 3, Radix primitives, Geist, Lucide
- Required mail-server baseline: Stalwart 0.15
- Default theme: system preference
- Supported themes: light, dark, system

## Goals

1. Make scanning the inbox the primary desktop experience.
2. Give the message reader enough width to preserve email content.
3. Make browser navigation, refresh, deep links, and new-tab behavior predictable.
4. Make conversation view the default without hiding individual-message actions.
5. Remove visual competition between navigation, list state, technical metadata, and message content.
6. Preserve current mail capabilities, provider contracts, security controls, keyboard access, and localization.

## Visual direction

HomeMail should feel like a quiet personal tool built for daily use, not an enterprise dashboard and not a Gmail imitation. Gmail contributes the list-first information architecture; HomeMail keeps its own compact proportions, restrained color, family context, and self-hosted system transparency.

- Application typography uses Geist Sans with tabular numerals where message counts, dates, quotas, and metrics need stable alignment.
- Email HTML remains isolated from application typography. Plain-text email uses the application reading stack with a system sans-serif fallback.
- Persistent workspace surfaces are flat. Hierarchy comes from spacing, tone, typography, and selective dividers rather than stacked cards and shadows.
- The accent color marks action, focus, selection, and current location. It does not fill large navigation or content regions by default.
- Pills are reserved for compact statuses, counts, filters, and authentication results. Ordinary buttons, rows, headings, and containers are not pill-shaped.
- Icons use the existing Lucide family at a consistent 16 or 18 px visual size with text labels for unfamiliar or destructive actions.
- Motion is functional and short: approximately 120 to 180 ms for menus, overlays, composer movement, and row state. Route transitions do not animate the whole workspace.
- Empty states use concise text and one relevant action. They do not use decorative illustration by default.

### Desktop workspace geometry

- At 1280 px and wider, the expanded Mail sidebar targets 232 px. It may collapse to a 64 px icon rail by explicit user action.
- From 1024 through 1279 px, the desktop sidebar remains visible at approximately 208 px and lower-priority row columns collapse before sender, subject, or date.
- The shared top bar targets 60 px. Search occupies available central width with a practical maximum near 720 px instead of spanning the viewport.
- Mail toolbars target 44 px and message rows default to 46 px. Density preferences adjust rows without changing control targets below accessible minimums.
- List and reader canvases use the full remaining width. Long content is constrained internally where reading measure requires it, not by wrapping the entire reader in a narrow card.
- Settings and Contacts use their own secondary navigation around 224 px. Standard forms use a readable content column around 720 px; tables, audit logs, and monitoring may use the full available width.
- Floating compose targets 560 to 640 px wide, respects viewport gutters, and never covers the sidebar or critical global feedback.

### Desktop Mail shell

- The Mail sidebar spans the full viewport height. HomeMail branding and the collapse control occupy its top row; the content header begins beside the sidebar rather than spanning above it.
- The content header targets 60 px and remains visible in both list and reader routes.
- The header contains one-line route context on the left, a flexible mail search field with a practical maximum near 720 px, and only contextually necessary controls on the right.
- Remove the current second header line that explains that search covers all mail. Search scope and advanced filters live inside the search control.
- In a list route, header context is the current folder, quick view, or search result label. In a reader route, it becomes a compact Back control plus source-folder context; the message subject belongs to the reader below.
- The account menu (mailbox switcher, Settings, Stalwart management, sign out) lives once, as a single icon on the right side of the header. It is not duplicated in the sidebar; the sidebar footer no longer hosts an account card, so folder navigation can use the full sidebar height.
- The expanded sidebar orders content as HomeMail, Compose, quick views, folders, then secondary workspace links; there is no account footer.
- Contacts and Settings are visually separated from mail folders and open their dedicated workspaces.
- Explicit collapse turns the sidebar into a 64 px icon rail with accessible names and tooltips. Collapse preference persists per family member.

### Tablet and mobile geometry

- Below 1024 px, primary workspace navigation becomes an overlay drawer while list or content uses the full canvas.
- Below 768 px, Mail uses separate folder, list, reader, and composer screens with native browser history behavior.
- Mobile headers target 52 to 56 px with Back, title, and at most two direct actions. Remaining actions move into More.
- Mobile message rows use two lines and preserve sender, unread state, subject, and time before secondary indicators.
- Settings navigation becomes a route list. A settings form opens as its own screen rather than placing a narrow form beside a compressed navigation rail.
- Dialogs that contain multi-field forms become full-screen sheets on narrow mobile. Confirmation dialogs remain compact when the decision is short.

### Surface patterns by workspace

- Mail uses dense rows and toolbars, not cards.
- The reader uses a neutral document canvas. Conversation-message boundaries use spacing and thin separators; collapsed messages use compact summary rows.
- Contacts use a searchable list with route-backed detail and editing. Contact groups are navigation or filters, not a grid of promotional cards.
- Settings use section headings, field groups, descriptions, and sticky save controls. Cards appear only when a contained object has its own lifecycle, such as a signature, API credential, or mailbox assignment.
- Family administration uses a member list with status, assigned mailbox count, last successful sign-in, and explicit lifecycle actions. Member detail separates identity, mailboxes, security events, and recovery actions.
- Monitoring and audit surfaces use tables, charts only when trends matter, precise timestamps, and monospace identifiers only where copying or diagnosis requires them.
- Authentication and activation use a single focused form column with no application sidebar. Security context and expiry are visible without competing marketing content.

### Settings workspace structure

- Settings uses a full-height secondary navigation around 224 px with an explicit return to Mail.
- Navigation groups are Personal, Mail, and Administration. Administration renders only for the HomeMail administrator.
- Personal routes cover Appearance and language, Notifications, and Accessibility and shortcuts.
- Mail routes cover Senders and signatures, Automation, Organization, Templates and subscriptions, and Security and PGP.
- Administration routes cover Family, Mailboxes and domains, Server and Stalwart, Backup and restore, and Monitoring and audit.
- Standard settings forms target a content width near 720 px. Tables, audit logs, monitoring, and migration reports use the full content canvas.
- Every route shows its scope directly below the page title: current family member, selected mailbox address, or entire installation.
- Mailbox-scoped routes provide an assigned-mailbox selector beside the scope. Switching is blocked by unsaved changes until the member saves, discards, or cancels.
- Immediate preferences do not show a Save bar. Dirty explicit-save forms show a sticky bottom bar aligned to the form content.
- Avoid nested tab sets and generic setting-card grids. Use page sections and route navigation; reserve cards for objects with their own lifecycle.

### Contacts workspace structure

- Contacts uses its own workspace with a return to Mail and secondary navigation for All contacts, contact groups, import, and export.
- The primary desktop view is a full-width searchable row list with a default row height near 52 px.
- Contact rows prioritize avatar, display name, primary email, phone, and groups with responsive column removal.
- Opening, creating, or editing a contact uses a dedicated route that replaces the list while keeping Contacts navigation visible on desktop.
- The workspace does not add a permanent third detail pane or a decorative contact-card grid.
- On mobile, group navigation, contact list, detail, and edit are separate browser-history screens.

### Family administration structure

- Family is the first route in the administrator group rather than a subsection of generic server settings.
- The member index is a dense list or table showing name, lifecycle status, assigned mailbox count, last successful sign-in, and pending activation state.
- Member detail is route-backed and separates Identity, Mailboxes, Security events, and Access recovery into clear page sections or local route navigation.
- Suspend, credential recovery, and deletion are visually and spatially separated from ordinary profile editing.
- Family provisioning uses a full-page route with Member, Mailbox, Activation, and Review steps. It is not placed in a small dialog.
- A partial provisioning failure opens a durable recovery state with completed steps, failed step, Retry, and explicit safe Cleanup where supported.
- Audit surfaces show exact timestamp, actor, action, target, and result. Charts are used only for meaningful trends, not as decoration.

## Product scope

The redesign covers the whole HomeMail application:

- authentication and login
- mail workspace
- message list and reader
- composer, reply, and forward flows
- contacts
- signatures, templates, aliases, forwarding, and auto-reply
- folders, labels, filters, subscriptions, and auto-archive
- import, backup, and restore
- interface, language, notifications, accessibility, and keyboard settings
- PGP/GPG
- Sieve scripts
- monitoring and statistics
- Stalwart connection and protected administration surface
- shared loading, empty, error, offline, and permission states

## Non-goals

- Gmail-style automatic categories such as Primary, Promotions, Social, and Updates
- Migration to Material, Fluent, Carbon, or another design system
- Replacement of Stalwart or JMAP identifiers
- Direct browser loading of external email images
- Decorative motion, glassmorphism, gradients, or multiple accent colors
- Silent changes to form contracts, analytics identifiers, provider contracts, or protected administration behavior

## Accepted product decisions

### Whole-product redesign

- Every HomeMail surface moves to the same semantic token, typography, shape, interaction, and accessibility system.
- Existing capabilities remain available unless a removal is explicitly accepted in this plan.
- Existing route slugs, form contracts, provider calls, and security boundaries remain stable unless a separate decision changes them.
- Mail remains the primary daily workspace.
- Organization, data, security, and system capabilities remain secondary to everyday mail work.
- The current 2,200-line settings page is split into route-backed sections and smaller domain-focused components.

### Family deployment model

- HomeMail is a personal self-hosted application for a family.
- One HomeMail administrator operates the instance and provisions mailboxes for family members.
- A family member uses the mailboxes assigned to that member for everyday mail work.
- The redesign must add an explicit identity, role, and mailbox-assignment model because the current session contains only an account identifier and email address.
- UI visibility is not considered an authorization boundary. Every protected API operation must enforce the same role and mailbox scope on the server.

### Identity and sign-in

- Stalwart OIDC is the only identity provider for HomeMail.
- Family members continue to use their existing Stalwart credentials. HomeMail does not store a second password.
- A HomeMail identity is keyed by the verified OIDC issuer and stable `sub` claim, never by an email address or JMAP `accountId`.
- The existing Authorization Code flow with PKCE is extended to request and validate OIDC identity claims. JMAP access tokens remain server-side.
- ID tokens must be validated for signature, issuer, audience, expiry, and nonce before an identity is accepted.
- A HomeMail session identifies the family member, role, authorized mailbox assignments, and active mailbox. A mailbox remains a separate resource.
- Authentication does not grant mailbox access by itself. Every active mailbox must also have an explicit HomeMail assignment and valid provider authorization.
- Password changes, password recovery, credential policy, and account suspension remain Stalwart responsibilities.
- The accepted architecture is recorded in [ADR 0001](adr/0001-stalwart-oidc-family-identity.md).

### Stalwart version compatibility

- Stalwart 0.15 is the required compatibility baseline for the redesign.
- Upgrading the mail server to 0.16 is not required for HomeMail OIDC sign-in or the family identity model. Stalwart 0.15 already provides ID tokens, discovery metadata, UserInfo, and JWKS endpoints.
- The HomeMail redesign and the Stalwart 0.16 server migration are separate projects with independent release and rollback plans.
- HomeMail server code accesses principal, mailbox, and configuration administration through a `StalwartAdminAdapter` boundary.
- The initial adapter targets the Stalwart 0.15 REST Management API.
- A future Stalwart 0.16 or later adapter targets management objects over JMAP without changing HomeMail family-domain services or UI contracts.
- Product components and route handlers must not call either version-specific management API directly.
- HomeMail detects the supported Stalwart management capability during setup and fails closed for administrative mutations when the server version is unknown or unsupported.
- Development and production Compose definitions must pin Stalwart to an exact compatible tag or immutable image digest. The current `latest` tag is a release blocker because it could cross the incompatible 0.15 to 0.16 boundary unexpectedly.
- The accepted compatibility architecture is recorded in [ADR 0002](adr/0002-support-stalwart-015-through-an-administration-adapter.md).

### Future Stalwart 0.16 migration

- Treat a 0.15 to 0.16 move as an infrastructure and data migration, never as a routine image pull.
- Follow the official Stalwart migration guide for the selected deployment type and rehearse against a restored copy before production cutover.
- Account for the replacement of TOML configuration with `config.json` and stored JMAP management objects, removal of the REST Management API, full-email account names, changed container mount points, and settings that require manual recreation.
- Take and verify a complete rollback backup before any 0.16 binary or container starts against existing data.
- Validate users, domains, aliases, mail ownership, OAuth clients, DKIM, TLS, routing, spam configuration, quotas, JMAP, SMTP, IMAP, Sieve, and HomeMail integration before completing cutover.
- A future migration may use Stalwart's migration proxy for account-by-account routing, but that choice requires a separate operational plan.

### Identity migration

- The migration is additive first. Existing mail, folders, JMAP identifiers, encrypted OAuth tokens, per-mailbox settings, and credentials are not moved or renamed.
- The current administrator is selected explicitly during deployment migration. HomeMail must never promote the first person who signs in.
- Before cutover, create family-member records and mailbox assignments from the current account configuration while the old session model remains readable.
- Existing storage keys stay keyed by mailbox during the compatibility period so message-related preferences and automation continue to resolve.
- Cutover may require one new sign-in with the same Stalwart credentials to establish the verified OIDC identity.
- Authorization switches to the family-member and mailbox-assignment model only after the administrator mapping and all expected mailbox assignments pass validation.
- Keep the previous application version, configuration, and a backup of persistent HomeMail data available for rollback. The identity migration performs no destructive cleanup.
- Remove the compatibility reader and obsolete identity fields only in a later release after successful operation and a separate backup.

### Family privacy boundary

- A family member signs in with a distinct HomeMail identity and sees only assigned mailboxes.
- The HomeMail administrator provisions, assigns, suspends, restores, and observes the technical status of family mailboxes.
- HomeMail does not let the administrator read message subjects, message bodies, contacts, or drafts from another family member's private mailbox.
- HomeMail does not provide hidden impersonation.
- The administrator's own mailboxes use ordinary mailbox assignments.
- Any future emergency-access mechanism requires a separate decision, explicit activation, a recorded reason, visible notification, and an audit trail.
- Technical capabilities of the underlying mail server do not silently become product-level permission in HomeMail.

### Private mailbox ownership

- A private mailbox is assigned to exactly one family member.
- A family member may have multiple private mailboxes.
- The mailbox switcher lists only mailboxes assigned to the current family member.
- Assigning one private mailbox to multiple members is rejected rather than treated as implicit sharing.
- Shared mailboxes are a separate future domain type with explicit Read, Send, and Manage permissions.

### Family provisioning

- The HomeMail administrator creates a family member and that member's first private mailbox through one guided HomeMail workflow.
- The administrator does not need to open the Stalwart WebUI for the normal provisioning path.
- The workflow collects member details, mailbox address and domain, and mailbox limits supported by Stalwart 0.15 before showing a final review step.
- HomeMail creates the Stalwart principal and mailbox through `StalwartAdminAdapter`, then creates the HomeMail identity and mailbox assignment.
- The workflow is atomic from the administrator's perspective but is implemented as a durable, idempotent operation because HomeMail and Stalwart do not share a database transaction.
- Every provisioning operation has a unique operation ID, persisted step status, safe retry behavior, and an administrator-visible result.
- A partial failure never reports success and never silently leaves an accessible unassigned mailbox. HomeMail presents a recovery state with retry or explicit cleanup where cleanup is safe.
- Retrying the operation must discover resources already created by the same operation instead of creating duplicate principals, addresses, or assignments.
- The completed result links to the new member and mailbox records and records an administrator audit event without storing the initial secret in logs.
- Adding another private mailbox to an existing family member is a shorter version of the same workflow and does not create another HomeMail identity.

### Activation and first sign-in

- A newly provisioned family member receives access through a short-lived, single-use HomeMail activation link. The administrator does not choose or receive the member's password.
- During provisioning, HomeMail gives Stalwart a high-entropy random bootstrap password that is never displayed and is discarded immediately after the Stalwart operation completes.
- HomeMail generates an independent token with at least 256 bits of cryptographic entropy and stores only a keyed digest with its member, mailbox, operation, expiry, and redemption state.
- The raw activation URL is shown once to the administrator for delivery through a trusted family channel. It never appears in application logs, analytics, referrers, support exports, or audit payloads.
- The activation page explains that the URL is a bearer secret: anyone holding it before redemption can choose the initial password.
- Activation links expire after 24 hours by default. The administrator may revoke an unused link or issue a replacement; replacement invalidates every earlier link for that activation.
- The activation endpoint uses generic error responses, strict rate limiting, constant-time digest comparison, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and no third-party resources.
- The member chooses a password under the Stalwart 0.15 password policy. HomeMail forwards it directly over the protected server connection through `StalwartAdminAdapter`, never persists it, and clears request-local buffers where practical.
- Redemption uses a durable state machine with a short claim lease so concurrent requests cannot set different passwords and a transient Stalwart failure can be retried safely without issuing a second mailbox.
- The link becomes permanently unusable only after Stalwart confirms the password change. Successful activation records a redacted security audit event and transitions the member from Pending to Active.
- After activation, HomeMail redirects to the normal Stalwart OIDC Authorization Code with PKCE sign-in. Activation does not create a HomeMail session by itself.
- Password recovery for an already active member is outside activation and uses the separate administrator-issued recovery flow below.
- The accepted activation architecture is recorded in [ADR 0003](adr/0003-activate-family-members-with-single-use-links.md).

### Password recovery

- An active family member who forgets the Stalwart password asks the HomeMail administrator for recovery through a trusted family channel.
- The administrator explicitly selects the member, reviews the affected sign-in identity, confirms the operation, and receives one short-lived recovery URL. HomeMail does not expose a public account-discovery or email-based recovery form.
- A recovery token has at least 256 bits of cryptographic entropy, is stored only as a keyed digest, and uses the same audited redemption state machine and browser leakage protections as activation.
- Recovery links expire after one hour by default. Issuing a replacement invalidates every earlier unused recovery link for that identity.
- Issuing a link does not change the password or terminate access. The member remains able to use the existing credential until the link is redeemed or the administrator separately suspends the identity.
- On redemption, the member chooses a new password under Stalwart policy. HomeMail sends it directly through `StalwartAdminAdapter`, never persists it, and does not create a session.
- After Stalwart confirms the password change, HomeMail revokes all HomeMail sessions and encrypted OAuth access and refresh tokens associated with the member and requires a new OIDC sign-in.
- Where Stalwart 0.15 exposes a supported operation, the adapter also revokes provider-side OAuth grants and invalidates authentication caches. HomeMail must not claim provider-wide revocation if capability verification fails.
- Existing protocol connections may remain established until Stalwart closes them. Suspected compromise uses a separate administrator action that suspends the identity first, then performs credential recovery.
- Recovery request, issuance, replacement, revocation, successful redemption, failure, and session invalidation create redacted security audit events visible to the administrator and to the member after the next sign-in.
- The administrator sees the bearer recovery link but never sees the chosen password. The UI states that possession of an unredeemed link permits changing the credential.
- Recovery does not permit the administrator to open the member's mailbox, create an impersonation session, or bypass the subsequent OIDC sign-in.
- The accepted recovery architecture is recorded in [ADR 0004](adr/0004-recover-family-credentials-with-admin-issued-links.md).

### Primary product navigation

- The Mail sidebar remains mail-specific: Compose, quick views, folders, and account access.
- Settings opens as a separate route-backed workspace with grouped navigation.
- Contacts becomes a dedicated route-backed workspace and is not mixed with mail folders.
- Monitoring, Statistics, Sieve, and Stalwart stay in a visually separated System group inside Settings.
- Settings and Contacts provide an explicit return to Mail.
- Each workspace owns its responsive navigation behavior on tablet and mobile.

### Personal contacts

- Contacts and contact groups belong to the HomeMail family member, not to an individual mailbox.
- The same personal address book is available when composing from any mailbox assigned to that member.
- Another family member, including the HomeMail administrator, cannot browse, search, export, or autocomplete from this address book through HomeMail.
- Sender-specific data such as display name, signature, reply-to behavior, aliases, and default From identity remains scoped to the mailbox or sender identity rather than the address book.
- Contact search, recent recipients, groups, import, export, and compose autocomplete enforce the authenticated member scope on the server.
- Existing mailbox-keyed contact data is copied into the owning member's address book during migration. Migration preserves source records and reports conflicts; it does not silently discard or merge non-identical contacts.
- When several existing mailboxes become assignments of the same member, exact duplicate contacts may be collapsed only through a deterministic, tested rule with a migration report and rollback data.

### Settings save behavior

- Simple reversible preferences apply immediately: theme, density, and message-list presentation.
- Multi-field behavior and data forms require explicit Save: auto-reply, forwarding, signatures, notifications, filters, and similar sections.
- Dirty explicit-save forms show a sticky Save and Cancel bar.
- Leaving a dirty route requires confirmation.
- Destructive operations use separate, explicit confirmation.
- Successful immediate updates use quiet inline status instead of repeated toast notifications.
- Validation and save errors stay beside the affected field whenever possible.

### Configuration ownership

- Every setting declares exactly one primary scope: family member, mailbox, or HomeMail instance.
- Member preferences follow the signed-in family member across all assigned mailboxes: theme, language, density, accessibility, keyboard shortcuts, general notification preferences, and the personal address book.
- Mailbox settings remain attached to one mailbox or sender identity: display name, signatures, aliases, reply-to behavior, forwarding, auto-reply, filters, Sieve, folders, labels, subscriptions, auto-archive, and PGP material.
- Instance settings are restricted to the HomeMail administrator: Stalwart integration, family members, mailbox assignments, backup and restore, monitoring, security policy, image-proxy policy, and system limits.
- Notifications use a member-level master preference plus explicit per-mailbox overrides. A mailbox override cannot enable a channel disabled at member scope.
- Settings routes and API payloads identify their scope explicitly. The server derives the member scope from the authenticated session and validates mailbox or instance scope rather than trusting a client-supplied owner identifier.
- The settings UI always communicates the current scope, especially when the member has several assigned mailboxes.
- Switching mailboxes changes only mailbox-scoped sections and does not reset member preferences or the personal address book.
- Current account-keyed settings are classified before migration. Mailbox settings keep their mailbox association; member preferences are copied to the member record with conflicts reported; instance settings are migrated once under administrator control.
- Migration never resolves conflicting member preferences silently. It presents a deterministic default, preserves the source values for rollback, and records the selected result.
- The accepted scope model is recorded in [ADR 0005](adr/0005-scope-configuration-to-member-mailbox-or-instance.md).

### List-first navigation

- The default mail screen is a full-width message list inside the area remaining beside the desktop sidebar.
- Selecting a conversation replaces the list with a dedicated message reader.
- The old simultaneous navigation + list + reader desktop layout is retired.
- The desktop sidebar remains visible while reading.
- Tablet navigation opens as an overlay.
- Mobile uses a strict screen sequence: folders, list, reader.

### Route-backed reader

- The reader has its own route: `/{locale}/mail/messages/{messageId}`.
- `messageId` is the existing opaque Stalwart JMAP `Email.id`, URL-encoded when necessary.
- HomeMail does not create a second client-side UUID or a mapping table.
- The reader can be refreshed, opened in a new tab, and addressed directly.
- Browser Back returns to the exact previous list context.

### URL-backed list state

- The list URL is the source of truth for folder, search query, quick filter, and presentation mode.
- Example: `/mail?folder=inbox&filter=unread&q=certificate`.
- Scroll position is not encoded in the URL. It is restored from browser history state or session storage.
- Local React state is reserved for temporary interaction state such as open menus and current selection.

### Folders and quick views

- A mail folder represents server-backed storage.
- A quick view represents a condition applied to messages.
- Inbox, Sent, and Drafts are folders, not quick views.
- The `incoming`, `sent`, and `drafts` duplicates are removed from quick-filter surfaces.
- Initial quick views: Unread, Starred, With attachments.
- The active folder and active quick view are presented as separate pieces of context.

### Conversation view

- Conversation view is the default presentation.
- Messages are grouped by the provider-backed `threadId`.
- Flat message list remains an explicit user preference.
- The list row shows participants, latest subject, snippet, message count, unread state, and last activity.
- The reader preserves each individual message in the conversation.

### Conversation actions

- Reader-level actions apply to messages in the selected conversation that belong to the current folder.
- A conversation containing Inbox and Sent messages does not move or delete the Sent messages when opened from Inbox.
- Individual-message actions live in the local menu for that message.
- Destructive confirmation states show the number of affected messages.

### Message list layout

- Desktop uses a single-row scanning layout.
- Default desktop row height is 46 px.
- Stable columns are selection, star, participants, subject and snippet, indicators, and date or hover actions.
- Selection and star controls remain present at low visual emphasis instead of appearing only on hover, so text columns never shift.
- The participants column targets approximately 220 px on wide desktop and shows a message count beside the names when the conversation contains more than one message.
- Subject and snippet share one flexible line. Subject uses stronger content color; snippet follows with muted color and yields space first.
- Attachment, importance, and similar indicators occupy a compact fixed region and never interrupt the participants column.
- The trailing region targets approximately 88 px. It shows time or date at rest and swaps to Archive, Delete, Mark read or unread, and More on pointer hover or keyboard focus without changing row width.
- Unread state uses semibold participants, subject, and date plus a very light surface change. It does not use a persistent colored left stripe.
- Unread state uses text weight and restrained semantic emphasis instead of a bright full-row fill.
- Selected state uses an accent-tinted surface. Keyboard focus adds a visible inset focus ring and remains distinct from selection.
- A conversation row opens the dedicated reader and never expands messages inside the list.
- The primary row target behaves as a real route link so `Ctrl` or `Cmd` click and browser link actions can open the reader in a new tab without custom double-click behavior.
- When selection is non-empty, the normal list toolbar is replaced by a selection toolbar of identical height so content does not jump.
- Around 1024 px, labels and snippet are removed before participants, subject, or date. Participant width may contract within a documented minimum.
- Mobile uses a two-line row.
- Mobile preserves sender or participants, unread state, subject, and time before labels and secondary indicators.
- Compact and spacious density preferences remain available.

### Message reader

- The shared 60 px content header remains visible on desktop reader routes and retains mail search.
- A sticky 44 px reader toolbar sits below it with conversation actions. The subject is not placed inside this toolbar.
- The subject appears in the scrollable reader content at approximately 22 px, with conversation message count and labels as secondary context.
- Labels remain beside the subject when space permits and wrap below it without forcing the subject into a narrow column.
- Plain-text mail uses HomeMail typography and a reading measure of approximately 72-78 characters.
- HTML mail renders in an isolated iframe with minimal interference in the sender's layout.
- The existing white rounded card, large shadow, 920 px shell constraint, and double padding are removed.
- HTML mail is not automatically recolored in dark mode.
- The reader uses a neutral canvas and small responsive gutters.
- HTML mail receives the available reader width. The sender's own layout may center a narrower newsletter, but HomeMail does not impose an outer paper card.
- Reader and conversation use one vertical scroll container. An HTML iframe grows to its content height and never introduces a nested vertical scrollbar.
- Horizontal overflow is contained inside the affected message content and never expands the application viewport.
- The latest message is expanded.
- Unread messages are expanded.
- Older read messages are collapsed to approximately 56 px summaries with sender, snippet, date, and attachment presence.
- Each message can be expanded inline and has its own action menu.
- An expanded message header contains avatar, sender name and address, compact recipient summary, exact timestamp, star, and local More menu.
- Full To, Cc, Reply-To, and technical headers open through recipient or details disclosure rather than occupying the default header.
- Attachments appear after the body of the message they belong to, not as one conversation-level block before content.
- Conversation boundaries use spacing and thin dividers rather than separate rounded cards.
- The final conversation actions sit after the last message and open the inline reply composer in place.

### Reader action hierarchy

- Persistent top actions: Back, Archive, Delete, Mark unread, More.
- Star belongs with message metadata instead of the primary toolbar.
- Reply is the primary action after the conversation content.
- Reply all appears only when multiple recipients make it relevant.
- Forward is secondary.
- DKIM, SPF, DMARC, translation, export, print, PGP, importance, and technical details move into progressive disclosure unless an actual warning requires attention.
- Successful DKIM, SPF, and DMARC checks do not render as persistent green badges. A real authentication or sender warning appears above the affected message body with a path to details.
- On mobile, direct toolbar actions reduce to Back, Archive, and More; remaining actions stay available in the menu.

### Composer

- New message opens as a floating desktop composer anchored to the lower right.
- The list remains usable behind the floating composer.
- The default floating composer targets approximately 600 px wide and at most 70-75 percent of viewport height.
- Its compact header contains title, quiet draft-save status, Minimize, Expand, and Close.
- From remains visible because a family member may have several assigned mailboxes or sender aliases. Changing From updates available signatures, PGP behavior, aliases, and other sender-specific settings.
- Recipients use accessible removable chips with inline invalid-address and duplicate-address feedback. Cc and Bcc remain collapsed until requested.
- Subject uses a separate borderless row and does not compete visually with the editor.
- The editor owns remaining flexible height and keeps Send controls visible without scrolling the whole dialog to the bottom.
- Remove the persistent dashed attachment drop zone. Dragging a file over the composer reveals a full-composer drop overlay.
- Attachments render as compact rows with filename, size, upload progress, failure state, retry, and removal.
- Rich-text formatting is hidden by default and opens from a formatting control directly above the footer.
- The signature is selected automatically from the active From identity. Manual signature selection lives in the footer rather than occupying a permanent form row.
- Send is the only filled primary action. A neighboring disclosure opens scheduled-send choices instead of using an advanced-options checkbox.
- Attachment, formatting, template, signature, PGP, and More controls remain secondary in the footer.
- Send and draft-save failures remain visible inside the composer with retry guidance instead of relying only on transient toast messages.
- Autosave uses quiet Saving, Saved, and Save failed states. A non-empty composer closes into a saved draft; explicit Trash discards it.
- Draft minimize and restore behavior remains supported.
- A minimized draft becomes a compact bottom panel and survives folder and reader navigation.
- Expanded desktop mode opens a larger composer over the content canvas while keeping the Mail sidebar visible.
- Reply and forward open inline below the reader conversation.
- Inline reply reuses the same editor and footer. From and recipients start as one compact expandable row, and quoted conversation content stays behind a disclosure.
- New message, reply, and forward use full-screen presentation on mobile.
- Send is the only visually primary composer action.
- Advanced options remain collapsed until requested.
- `Ctrl` or `Cmd` plus Enter sends only when the member explicitly enables that shortcut preference.

### External and inline images

- The target behavior is to show email images automatically.
- The browser must never request external image URLs directly.
- External URLs are rewritten to a signed internal HomeMail image-proxy resource.
- `cid:` images are resolved to authenticated internal attachment resources.
- The current remote-image banner and manual button are removed only after the protected image path is complete.
- Any proxy validation or fetch failure fails closed and renders a quiet placeholder.
- There is no fallback to a direct external image request.

### Image proxy security gate

Automatic external images cannot ship until all of these controls exist and pass tests:

- authenticated access and signed resource tokens
- HTTP and HTTPS allowlist
- complete IPv4 and IPv6 range validation
- rejection of loopback, private, link-local, multicast, reserved, and metadata addresses
- fail-closed DNS resolution
- DNS rebinding protection by connecting to the validated address
- validation of every redirect hop
- redirect count limit
- strict timeout and response byte limit
- accepted image MIME allowlist plus content sniffing
- no forwarded cookies, authorization, client IP, or referrer
- safe cache keying and cache headers
- concurrency and rate limits
- structured security logging without leaking full sensitive URLs
- tests for private networks, redirects, rebinding, MIME spoofing, oversized responses, timeouts, and cache poisoning

The existing `lib/url-validator.ts` is not sufficient unchanged because it is IPv4-focused, fails open on DNS errors, and does not pin DNS or validate redirect chains.

### Color and themes

- HomeMail uses one interactive accent color.
- The default accent is a restrained cool blue.
- Users may customize one primary color only.
- Separate custom secondary and accent colors are removed.
- Focus, selected, unread, and related interaction tokens are derived from the primary color.
- Success, warning, destructive, and starred colors remain semantic and are not derived from the primary color.
- Unsafe custom colors are rejected when they cannot meet required contrast.
- Light, dark, and system themes remain available and must preserve the same hierarchy.

### Visual token baseline

The initial token values are implementation baselines. Derived interaction colors must be generated and contrast-tested rather than chosen independently in components.

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | `#F6F7F9` | `#11141A` |
| Surface | `#FFFFFF` | `#171B23` |
| Subtle surface | `#F0F2F5` | `#1D222C` |
| Hover | `#E9EDF2` | `#242A35` |
| Border | `#DDE2E8` | `#2B3240` |
| Primary text | `#1D2430` | `#EEF1F5` |
| Muted text | `#667085` | `#9AA4B2` |
| Primary | `#405CCB` | `#8EA5FF` |
| Text on primary | `#FFFFFF` | `#11141A` |

- Verified baseline contrast ratios include light primary text on surface at 15.59:1, light muted text on surface at 4.97:1, white on light primary at 5.82:1, dark primary text on surface at 15.23:1, dark muted text on surface at 6.84:1, and dark text on dark-theme primary at 7.88:1.
- Large canvases remain neutral. Primary is reserved for direct action, focus, current navigation, and selection feedback.
- Success, warning, destructive, and starred use fixed semantic token families independent of the member-selected primary color.
- A customized primary is accepted only when its text and interaction pairs meet the required contrast in both themes.

### Typography scale

- Application body and dense controls use Geist Sans at `14px/20px`.
- Secondary labels and metadata use `12px/16px` while preserving accessible contrast.
- Workspace titles use `24px/30px` at weight 600.
- Section headings use `16px/22px` at weight 600.
- Reader subject uses `22px/28px` at weight 600.
- Message rows use 14 px text; unread state changes weight rather than increasing size.
- Counts, dates, sizes, and aligned metrics use tabular numerals.
- Geist Mono is limited to copyable identifiers, diagnostic values, code, and logs.

### Spacing and shape tokens

- Spacing uses a 4 px base with the primary set `4, 8, 12, 16, 20, 24, 32, 48`.
- Desktop content gutters use 20 to 24 px; mobile gutters use 16 px.
- Data rows are square. Inputs and ordinary buttons use 8 px radius; menus and popovers use 10 px; dialogs and composer use 12 px.
- Full pill radius is reserved for tags, statuses, recipient chips, and compact counts.
- Persistent surfaces have no decorative shadow. Shadow is reserved for menus, dialogs, overlays, and floating composer.

### Interaction and motion states

- Hover changes surface color without scaling the row or control.
- Pressed uses a stronger surface tone and does not use `scale()`.
- Focus uses a visible 2 px ring with appropriate inset or offset. Focus and selected remain distinguishable.
- Disabled controls remain legible and cannot rely on opacity alone to communicate why an action is unavailable.
- Functional transitions target 120 to 180 ms. Route content does not animate as one large panel.
- `prefers-reduced-motion` removes position and size transitions while preserving immediate state feedback.

### Loading, feedback, and failure states

- Initial list and reader loading use skeletons that match final geometry. Spinners are limited to short local actions.
- Background refresh keeps existing data visible and adds a quiet stale or updating indicator.
- Offline state uses one bar below the content header and does not disable actions that can be safely queued or preserved as drafts.
- Field and form failures remain beside the affected control. Toasts are supplemental and never the only error record.
- Route failures replace the content canvas while preserving workspace navigation and a recovery path.
- Empty states use concise explanation and at most one primary action without decorative illustration by default.
- Forbidden states do not reveal whether an unassigned private mailbox or member resource exists.
- Partial operations show completed step, failed step, Retry, and safe rollback or cleanup when supported.

### Dark email content

- HomeMail recolors only its own application surfaces and plain-text rendering.
- Sender-authored HTML retains its own colors. A white newsletter may remain white within the dark reader canvas.
- The application does not wrap HTML content in an additional white card, shadow, or forced rounded shell.

## Existing foundations to preserve

- Geist Sans and Geist Mono
- semantic CSS surface and content tokens
- focus-visible treatment
- reduced-motion support
- keyboard shortcuts
- virtualized message list
- density settings
- conversation grouping capability
- draft minimize and restore capability
- HTML sanitization and iframe isolation
- session-bound mail API access
- server-backed folders and JMAP provider contracts

## Foundations to revise

- Derive all interaction surfaces from a single primary color.
- Use one documented radius system: square data rows, 8 px controls, 12 px dialogs and floating composer.
- Remove decorative shadows from persistent workspace surfaces.
- Use separators only where they clarify structure.
- Standardize desktop control heights and icon stroke treatment.
- Remove hardcoded light-only classes from quick filters and menus.
- Make loading, empty, error, offline, and stale-data states match their final layouts.

## Delivery phases and dependencies

### Delivery model

- The production server is the only authoritative environment. Its state includes both Stalwart mail, configuration, and storage and HomeMail persistent application data under `/app/data`.
- GitHub and GHCR deliver source code, reviewed deployment definitions, and immutable application images. They never contain or migrate production mail, application data, credentials, or secrets.
- Merging code, publishing an image, deploying an image, running a data migration, and enabling a feature are separate operator-controlled actions.
- Local development does not depend on a copy of production state. The default test loop uses unit tests, contract fixtures, component tests, and browser tests with generated data.
- A complete local HomeMail, Stalwart, and reverse-proxy stack with disposable volumes and generated test users is an optional integration environment. It is required only for changes that cross real OIDC, JMAP, SMTP, Sieve, Stalwart administration, backup, or restore boundaries.
- The local integration environment must not use production domains, endpoints, credentials, tokens, volumes, or exported family data. Destroying it must have no production effect.
- Application startup, health checks, and normal container deployment must never perform irreversible migrations or administrative mutations.
- Persisted-data changes use an expand, verify, enable, and later contract sequence. New code must remain compatible with the previous stored format until the rollback window closes.
- Feature flags default to disabled in production. A new path is first enabled for an administrator or synthetic test mailbox, then for a limited family cohort, and only then for everyone.
- Production images are promoted by immutable tag or digest. Production must not depend on a mutable `latest` reference.

### Test tiers

1. **Default local and CI tier:** static checks, unit tests, storage compatibility tests, API contract fixtures, accessibility checks, visual regression, and Playwright flows with generated data.
2. **Targeted disposable integration tier:** the complete local stack with isolated volumes and test users. Run it when a change depends on behavior that mocks cannot prove.
3. **Production preflight tier:** read-only inventory, configuration validation, backup evidence, and dry-run reports on the real server. This tier does not modify mail or application data.
4. **Controlled production tier:** deploy inert compatible code, run smoke checks with synthetic resources, explicitly enable a narrow feature flag, observe, and expand gradually.

### Phase 0: Establish the production safety boundary

- Follow the operator-safe evidence procedure in [MAIL-REDESIGN-PHASE0-RUNBOOK.md](MAIL-REDESIGN-PHASE0-RUNBOOK.md).
- Inventory the real production host before changing it: exact HomeMail and Stalwart images, Stalwart patch version, active mounts, storage backend, configuration, OAuth clients, HomeMail `/app/data`, reverse proxy, and deployment commands.
- Derive production facts from the server, not from a developer machine or the repository defaults.
- Pin both HomeMail and Stalwart production images to reviewed immutable references before any pull or recreation.
- Create separate, verified backups of Stalwart state and HomeMail `/app/data`. Prove restore into an isolated destination without replacing the live volumes.
- Record the last-known-good image references, configuration, volume mapping, rollback commands, responsible operator, and maximum acceptable outage.
- Establish behavioral, accessibility, and visual baselines for current HomeMail workflows using fixtures and read-only production observation.
- Treat mount corrections, OIDC issuer changes, storage moves, and Stalwart upgrades as separate reviewed operations. Do not hide them inside the redesign deployment.

**Exit gate:** the production inventory matches reality, immutable image references are in place, both state stores have restorable backups, and rollback has been rehearsed without touching live data.

**Completion note (2026-07-18):** Phase 0 is complete. The owner explicitly accepted mutable production image references as a residual operational risk. Exact last-known-good digests are recorded for rollback; production inventory, separate backups, off-host verification, isolated restore, smoke checks, and rollback procedures passed.

### Phase 1: Make new code safe to deploy while inert

- Add feature flags that are disabled by default and can be enabled independently from a GitHub release.
- Introduce HomeMail identity, authorization, configuration-scope, and Stalwart administration boundaries in compatibility mode without changing the visible product or requiring new state.
- Keep existing sessions, mailbox access, and stored settings valid. New readers accept the legacy format; new writes remain optional until a later explicit migration.
- Do not create principals, alter Stalwart configuration, backfill records, or delete legacy fields during build or application startup.
- Cover authorization, legacy storage reads, flag defaults, and rollback compatibility with the default local and CI tier.
- Use the disposable full stack only for the OIDC, JMAP, and administration adapter contracts that cannot be established with fixtures.
- Deploy the inert build first and run read-only smoke checks. Keep the previous HomeMail image and rollback commands ready for use if required; a routine rollback rehearsal is not required because this phase performs no data migration.

**Exit gate:** the new image can run in production with all redesign and identity flags disabled and produces no state transformation. The previous image and rollback procedure remain available as an emergency path without requiring a data restore.

### Phase 2: Establish the product shell and visual tokens

- Consolidate color, typography, radius, spacing, control height, focus, overlay, and responsive-navigation tokens.
- Build route-aware shells for Mail, Contacts, Settings, System, and authentication without changing mail operations or persisted formats.
- Add shared loading, empty, offline, unauthorized, forbidden, and error patterns.
- Validate the shell through component, accessibility, localization, visual, and browser tests with fixtures. A complete local mail server is not required for this phase.
- Deploy the shell behind a disabled flag, then enable it for the administrator before wider use.

**Exit gate:** disabling the shell flag immediately restores the current interface without changing server data.

### Phase 3: Deliver the list-first mail workspace

- Move list state into the URL, add the reader route, and preserve browser history and scroll restoration.
- Replace the three-pane workspace with the full-width conversation list and dedicated reader.
- Align sidebar, reader actions, conversation behavior, reply flow, and floating composer while continuing to use existing mail provider contracts.
- Prove navigation, rendering, selection, and accessibility with fixtures. Use the disposable full stack with generated mailboxes only for real JMAP mutations, sending, drafts, and folder actions.
- Enable the workspace first for a synthetic or administrator mailbox and retain the old workspace as the immediate flag-based fallback.

**Exit gate:** list and reader flows pass regression tests, real mail mutations pass against disposable users, and the old workspace remains usable without data conversion.

### Phase 4: Deliver protected message content

- Resolve inline `cid:` resources and implement the hardened external image proxy as an isolated, rate-limited service boundary inside HomeMail.
- Keep automatic external images disabled until every proxy security gate and failure-path test passes.
- Test network policy with controlled malicious HTTP fixtures. A complete mail stack is needed only for end-to-end `cid:` and message-rendering cases.
- Keep proxy cache data disposable and separate from authoritative HomeMail and Stalwart state.
- Enable automatic images only for synthetic messages first. Never fall back to a direct browser request when the proxy rejects a resource.
- Remove the legacy image banner only after the protected path is verified in production; keep a release flag that can disable remote fetching without redeploying.

**Exit gate:** the browser cannot contact sender-controlled image hosts directly, proxy failures are closed and observable, and disabling the feature does not affect message access.

### Phase 5: Deliver family identity and personal workspaces

- Add versioned, additive HomeMail records for identities, roles, mailbox assignments, preferences, contacts, activation, recovery, and audit history under the existing server-side persistence boundary.
- Provide an explicit operator-run migration command with `plan`, `dry-run`, `apply`, verification, idempotent retry, and machine-readable conflict reporting. It must never run automatically after a GitHub deployment.
- Keep legacy sessions, account switching, contacts, and settings readable throughout the migration and rollback window.
- Require the disposable full stack for this phase because principal provisioning, OIDC login, activation, recovery, suspension, and mailbox assignment cross HomeMail and Stalwart state. Use generated family members and mailboxes only.
- Deploy compatible code with identity features disabled. On production, take a fresh backup, review the dry-run report, run the migration explicitly, verify counts and assignments, then enable only the administrator cohort.
- Expand access to family members gradually while monitoring authentication, forbidden responses, mailbox isolation, activation, recovery, and audit events.
- Do not delete legacy records or revoke still-valid legacy access as part of the first migration release.

**Exit gate:** every production identity is linked and authorized explicitly, existing family access is preserved or has a documented recovery path, and both application rollback and data rollback have been rehearsed.

### Phase 6: Align organization and system capabilities

- Rebuild filters, templates, subscriptions, import, backup, PGP, Sieve, monitoring, statistics, and protected Stalwart entry points.
- Complete the Settings localization audit while decomposing the legacy settings page: move every user-visible string into the locale catalogs, keep English and Russian key trees identical, and cover every settings route in both locales without mixed-language fallback text.
- Apply the same scope labels, save model, permission states, and responsive patterns.
- Use fixtures for presentation and permission states. Require the disposable full stack for any path that mutates Stalwart, performs import or restore, changes Sieve, or exercises backup recovery.
- Run production checks against synthetic resources where mutations are required. Real family mail remains read-only unless an operator explicitly authorizes a narrowly scoped test.
- Release each high-impact system capability behind its own flag so a failure does not require disabling the redesigned mail workspace.

**Exit gate:** administrative mutations are scoped, audited, recoverable, and independently disableable; backup and restore behavior is proven without using live family data as a test fixture; every Settings route passes English and Russian localization checks without unintended mixed-language text.

### Phase 7: Cut over, observe, and clean up later

- Treat final enablement as a controlled production operation, not as a consequence of merging to GitHub.
- Take a fresh backup, re-run migration dry-run and compatibility checks, confirm the rollback image and commands, then expand feature flags by cohort.
- Observe authentication, mailbox access, background jobs, image proxy behavior, storage errors, and audit events for a defined rollback window.
- Roll back application behavior by disabling flags first and by restoring the previous immutable image second. Restore data only when compatibility cannot preserve service and the operator has confirmed the recovery plan.
- Keep legacy session and storage compatibility through the complete observation window.
- Remove compatibility code and legacy data only in a separate cleanup release with a fresh backup, explicit approval, its own dry run, and no unrelated redesign changes.

**Exit gate:** the redesigned product is stable for the agreed observation period, rollback is no longer required for normal incidents, and cleanup has been approved as a separate change.

## Proposed implementation sequence

### Establish regression coverage

- Capture current mail behaviors with integration and Playwright tests.
- Add fixtures for long subjects, multiple recipients, unread conversations, mixed Inbox and Sent conversations, HTML newsletters, plain text, `cid:` images, and broken external images.
- Record keyboard, focus, mobile back, draft, bulk action, and list-position behavior.

### Rebuild routing and state ownership

- Split the current monolithic mail layout into route-aware workspace shells.
- Add the message reader route.
- Move folder, search, quick filter, and presentation state to validated search params.
- Preserve scroll and selection context in browser history or session storage.
- Add direct-load, refresh, Back, Forward, and new-tab tests.

### Rebuild the full-width conversation list

- Replace the current two-line desktop item with stable scanning columns.
- Make conversation grouping the default.
- Remove folder-shaped quick filters.
- Add responsive column priority and truncation rules.
- Preserve virtualization, selection, drag and drop, keyboard navigation, loading, empty, and error states.

### Rebuild the reader

- Render route-loaded conversations.
- Implement expanded and collapsed message states.
- Separate conversation actions from message actions.
- Recompose the sticky top toolbar and metadata hierarchy.
- Remove the nested-card email shell.
- Preserve attachment, translation, PGP, print, export, labels, delivery tracking, and composer integrations through secondary disclosure.

### Build protected image delivery

- Resolve `cid:` references against message attachments.
- Build a dedicated hardened server fetcher rather than reusing the existing URL validator unchanged.
- Add the signed internal image endpoint, cache policy, limits, logging, and test suite.
- Rewrite sanitized external image sources to internal resources.
- Remove the old opt-in banner only after the security gate passes.
- Keep image blocking with a clean placeholder as the release fallback if the gate is not met.

### Align composer and sidebar

- Preserve the floating new-message workflow.
- Move replies and forwards into the reader flow.
- Reorder sidebar content around folders and true quick views.
- Keep desktop sidebar persistence and tablet/mobile overlay behavior.
- Persist user collapse preference where applicable.

### Consolidate the visual system

- Apply the single-primary color model.
- Normalize radii, control heights, typography, dividers, and state contrast.
- Test both themes and custom primary colors.
- Remove competing gradients, oversized shadows, excessive pills, and nested cards.

### Rebuild application navigation

- Create a consistent product shell for moving between mail and secondary areas.
- Keep daily mail actions more prominent than settings and server administration.
- Preserve account switching, logout, theme preference, and protected Stalwart access.
- Provide route-aware active states, breadcrumbs or back paths, and responsive navigation.

### Rebuild settings information architecture

- Replace the single state-driven settings page with route-backed sections.
- Preserve the existing groups: Mail, Organization, Interface, Contacts and data, Security, System.
- Give every settings section a stable URL and direct-load behavior.
- Keep labels above controls, help close to the affected field, and errors inline.
- Standardize dirty state, Save, Cancel, optimistic updates, destructive confirmation, loading, and permission states.
- Decompose settings forms without changing API payloads or field semantics silently.

### Rebuild contacts and organization tools

- Redesign contacts, groups, folders, labels, filters, subscriptions, and templates as first-class product surfaces.
- Make the Contacts workspace member-scoped and reusable across every mailbox assigned to that member while keeping mailbox-specific sender data separate.
- Use list-detail or route-backed editing where it improves scanning and deep links.
- Preserve import, export, drag and drop, validation, and existing domain operations.
- Avoid generic card grids for dense management data.

### Rebuild data, security, and system surfaces

- Redesign import, backup, restore, PGP, Sieve, monitoring, statistics, and Stalwart entry points using the same foundations.
- Keep system capabilities visually and navigationally separate from everyday mail settings.
- Preserve warnings, audit information, permission boundaries, and destructive confirmations.
- Treat the proxied Stalwart administration UI as a protected external surface, not as a normal HomeMail form.

### Redesign authentication and cross-product states

- Align login with the product typography, color, form, and accessibility system.
- Preserve authentication redirects and CSRF protections while extending the OAuth Authorization Code with PKCE flow to OIDC.
- Keep the visible sign-in action and existing Stalwart credentials unchanged; communicate the possible one-time sign-in after migration.
- Standardize application-level unauthorized, forbidden, not-found, offline, and unrecoverable error states.

### Add family identity and access control

- Introduce durable HomeMail identities, linked to verified Stalwart OIDC subjects and separate from mailboxes.
- Represent the HomeMail administrator role explicitly.
- Represent mailbox assignments independently from login sessions.
- Bind every mail, contacts, settings, monitoring, statistics, and system request to the authenticated HomeMail user and authorized scope.
- Add member-facing forbidden states and administrator-facing member and mailbox management surfaces.
- Migrate existing sessions and account-switching behavior through an explicit operator-run server migration without exposing another family member's mailbox.
- Add authorization tests at the API boundary. Hiding navigation items alone is insufficient.
- Add migration tests for legacy sessions, explicit administrator bootstrap, identity linking, assignment validation, cutover, and rollback.
- Add integration tests for successful family provisioning, duplicate address rejection, idempotent retry, Stalwart failure, HomeMail persistence failure, safe cleanup, and audit redaction.
- Add security and integration tests for activation expiry, revocation, replacement, concurrent redemption, replay, token leakage, policy rejection, transient Stalwart failure, successful password replacement, and post-activation OIDC sign-in.
- Add security and integration tests for recovery issuance, one-hour expiry, replacement, replay, concurrent redemption, HomeMail session revocation, OAuth token deletion, provider capability fallback, suspension-first incident handling, and member-visible audit history.
- Add migration and authorization tests for member-scoped contacts, multiple assigned mailboxes, cross-member isolation, conflict reporting, compose autocomplete, import, and export.
- Add contract, authorization, and migration tests for member, mailbox, and instance setting scopes, including notification overrides and conflicting legacy preferences.

### Verify release quality

- Run unit, integration, accessibility, localization, visual regression, and Playwright suites.
- Require locale-catalog key parity and reject unintended mixed-language text on every redesigned route; intentional proper names, addresses, protocol names, and user content are exempt.
- Verify WCAG AA contrast and keyboard-only completion of primary workflows.
- Verify `prefers-reduced-motion` and system theme changes.
- Test narrow mobile, tablet, 1024 px desktop, 1440 px desktop, and ultrawide layouts.
- Test large folders, long conversations, large HTML mail, slow network, offline transitions, and failed image resources.
- Complete the image-proxy adversarial test matrix and trace every external URL and resource-token path in code before enabling automatic external images.

## Release gates

- GitHub merge, GHCR publication, production deployment, persisted-data migration, and feature enablement remain separate actions.
- Production HomeMail and Stalwart images use immutable reviewed tags or digests; `latest` is forbidden.
- Production inventory, backup evidence, isolated restore evidence, and last-known-good rollback commands are current before any stateful phase.
- Application startup, health checks, and routine deployment perform no irreversible migration or Stalwart administration mutation.
- Every persisted-data change is additive and readable by the previous release throughout its rollback window.
- Every migration supports dry-run, explicit apply, idempotent retry, verification, conflict reporting, and a documented recovery path.
- Feature flags default to disabled and can be rolled back without rebuilding an image.
- The disposable full integration stack uses generated users and isolated volumes and has no production connectivity or credentials.
- The supported Stalwart version and management capability are verified before administrative mutations are enabled.
- Activation secrets never appear in logs, analytics, referrers, cache entries, browser history titles, or persisted plaintext.
- A completed or replaced activation link cannot be replayed, including during concurrent requests.
- Recovery secrets meet the same non-disclosure and replay gates as activation secrets.
- HomeMail never reports complete recovery until the Stalwart password change and local session and token invalidation succeed or enter an explicit recoverable state.
- No route or state regression for folder, search, reader, Back, Forward, and refresh.
- Full-width desktop list remains scannable with long localized content.
- Conversation actions never mutate messages outside their defined folder scope.
- Reader content does not overflow the viewport or gain nested scrolling accidentally.
- No external image request can originate directly from the reader.
- Image proxy tests pass or automatic external images remain disabled.
- Light and dark themes pass contrast review.
- Core mail workflows work with keyboard only.
- No untranslated new strings in supported locales.

## Open decisions

No product or visual decision currently blocks implementation planning. Exact production HomeMail and Stalwart image digests, the Stalwart 0.15 patch version, active server mounts, storage backend, adapter capability matrix, HomeMail `/app/data` inventory, backup destinations, and rollback commands are Phase 0 preflight facts. Local observations cannot satisfy these production gates.

## Accepted ADRs

1. [ADR 0001: Use Stalwart OIDC for family identity](adr/0001-stalwart-oidc-family-identity.md)
2. [ADR 0002: Support Stalwart 0.15 through an administration adapter](adr/0002-support-stalwart-015-through-an-administration-adapter.md)
3. [ADR 0003: Activate family members with single-use links](adr/0003-activate-family-members-with-single-use-links.md)
4. [ADR 0004: Recover family credentials with administrator-issued links](adr/0004-recover-family-credentials-with-admin-issued-links.md)
5. [ADR 0005: Scope configuration to member, mailbox, or instance](adr/0005-scope-configuration-to-member-mailbox-or-instance.md)
6. [ADR 0006: Use a list-first route-backed mail workspace](adr/0006-use-a-list-first-route-backed-mail-workspace.md)
7. [ADR 0007: Load external email images only through a hardened proxy](adr/0007-load-external-email-images-only-through-a-hardened-proxy.md)
