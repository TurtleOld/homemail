# HomeMail redesign

## Design read

HomeMail is a daily-use web mail client for mailbox owners working through Stalwart. The redesign uses a calm, precise, keyboard-friendly product language. It favors fast scanning and predictable actions over decorative surfaces.

- Redesign mode: visual overhaul with preserved capabilities, routes, and three-pane architecture
- Design variance: 3
- Motion intensity: 3
- Visual density: 7
- Existing stack: Next.js, Tailwind CSS 3, Radix primitives, Lucide icons
- Typography: Geist Sans 1.7 or newer, with Geist Mono for dates, counters, shortcuts, and search operators
- Theme: system preference by default, with explicit light and dark overrides

## Goals

1. Make scanning, opening, replying to, and organizing mail faster.
2. Give everyday mail tasks priority over server administration.
3. Preserve Stalwart folders as the source of truth.
4. Keep advanced capabilities without exposing all of them at the same visual level.
5. Provide consistent desktop, tablet, and mobile behavior.
6. Preserve keyboard navigation, accessibility settings, localization, and existing routes.

## Non-goals

- Replacing Stalwart or changing the mail provider contract
- Removing existing mail, security, import, backup, or monitoring capabilities
- Changing route slugs, API request shapes, form field names, or analytics identifiers without a separate decision
- Migrating to another frontend framework or design-system package
- Turning the client into an experimental or animation-heavy interface

## Information architecture

### Primary area

The mail workspace contains the actions used every day:

- Compose
- Global mail search
- Quick views
- Mail folders
- Flat message list
- Optional conversation view
- Message reader
- Contextual selection actions

### Secondary area

Settings are grouped into six sections:

1. Mail
   - Signatures
   - Auto-reply
   - Forwarding
   - Aliases
   - Templates
2. Organization
   - Folders
   - Labels
   - Filters
   - Subscriptions
   - Auto-archive
3. Interface
   - Theme
   - Density
   - Language and region
   - Notifications
   - Accessibility
   - Keyboard shortcuts
4. Contacts and data
   - Contacts
   - Import
   - Backup and restore
5. Security
   - PGP/GPG
6. System
   - Stalwart connection
   - Sieve scripts
   - Monitoring
   - Statistics

## Desktop workspace

```text
+----------------------+-----------------------------------------------+
| Compose              | Global search                    Account      |
+----------------------+-------------------+---------------------------+
| Quick views          | Folder title      | Message actions           |
| Inbox                | Filters / sort    |                           |
| Unread               +-------------------+---------------------------+
| Starred              | Sender       Date | Subject                   |
| Attachments          | Subject / snippet | Sender details            |
|                      |-------------------|                           |
| Folders              | Sender       Date | Message body              |
| Sent                 | Subject / snippet |                           |
| Drafts               |-------------------| Attachments                |
| Trash                | Sender       Date |                           |
| Custom folders       | Subject / snippet | Reply area                |
|                      |                   |                           |
+----------------------+-------------------+---------------------------+
```

### Layout behavior

- Navigation width: 224-240 px
- Message list default width: 400-440 px
- Message list remains resizable within safe bounds
- Reader consumes the remaining width
- Panels use separators and surface contrast instead of large floating cards
- The application uses `min-height: 100dvh`
- On narrow desktop widths, the navigation can collapse to icons
- On tablet widths, the interface becomes a two-pane list and reader layout

## Navigation

### Quick views

Quick views sit above server folders:

- Inbox
- Unread
- Starred
- With attachments

A quick view selects messages without changing their folder. Active scope is always visible near the list title.

### Folders

- Stalwart folders remain the source of truth
- Standard folders are visible first
- Custom folders appear in a collapsible group
- Unread counts use tabular figures
- The server status is hidden during normal operation
- A connection problem appears as a contextual warning with a link to System settings

### Account area

The account switcher remains at the bottom of the navigation. Settings, account management, theme override, and logout are available from this menu.

## Search

Mail search moves from the navigation sidebar to the top workspace bar.

- Default scope: all mail
- Optional scopes: current folder, sender, date, attachment, label, read state
- Existing structured operators remain supported
- Active constraints appear as removable tokens inside the search experience
- Search help and saved searches are available from the search panel
- Mobile search opens as a dedicated full-screen surface
- `/` continues to focus search

## Message list

### Default mode

The flat message list remains the default. Every message has its own row even when related messages share a thread.

### Optional conversation mode

Conversation mode remains available as a list-view preference. It groups related messages without changing their storage or flags.

### Standard density

- Target row height: about 64 px
- First line: sender and date
- Second line: subject and subdued snippet
- Unread state: stronger text weight and a restrained accent marker
- Selected state: semantic selected surface and visible focus outline
- Attachment and label indicators appear only when present
- Colored avatars are removed from compact and standard density
- Compact and spacious density options remain available

### Selection mode

Selecting a message replaces the normal list header with a contextual toolbar:

- Selected count
- Archive
- Read or unread
- Move
- Delete
- More menu for labels, importance, and export

`Escape` clears the selection. Selecting every message in a folder remains an explicit confirmed action.

## Message reader

### Header

- Subject is the primary heading
- Sender identity, recipients, and date form a compact metadata block
- Secondary recipient details are progressively disclosed
- Labels remain visible but do not compete with the subject
- Remote-image warnings remain contextual

### Top action bar

Persistent actions:

- Archive
- Delete
- Mark unread
- More

The More menu contains labels, translation, export, print, PGP, importance, and technical details.

### Message body

- Reading column targets 72-78 characters for text messages
- HTML mail can use the available reader width when its original layout requires it
- Attachments appear after message metadata and before the reply area
- Long messages keep the action bar visible
- Sanitization and remote-image protections remain unchanged

### Reply hierarchy

- Reply is the primary action below the message
- Reply all appears only when multiple recipients make it relevant
- Forward is a secondary action
- Reply and forward editors open inline beneath the message

## Composer

### New message

- Desktop: floating composer anchored to the lower right
- Mobile: full-screen composer
- The workspace remains available behind the desktop composer
- Minimize and restore behavior remains supported
- Draft state remains one domain object across all presentations

### Reply and forward

- Open inline under the source message
- Preserve recipient validation, signatures, attachments, scheduling, read receipts, and PGP
- Advanced options remain collapsed until requested
- Send is the only visually primary action

## Mobile and tablet

### Mobile

The interface uses a predictable screen sequence:

```text
Folders -> Message list -> Message reader
```

- Back navigation preserves list scroll position and selected message
- Swipe right from the reader returns to the list
- Swipe left does not automatically open the first message
- Search opens full screen
- Reader actions use a fixed bottom toolbar
- Compose, reply, and forward use a full-screen editor
- Touch targets are at least 44 by 44 px

### Tablet

- Two panes: message list and reader
- Folder navigation opens as a dismissible panel
- Composer may use a centered or edge-aligned overlay depending on available width

## Visual system

### Color

The palette uses cool neutral surfaces and one restrained cobalt accent.

- Cobalt communicates focus, selection, primary actions, and links
- Red is reserved for destructive actions and errors
- Green is reserved for success and healthy status
- Yellow is reserved for warnings
- Starred state may retain a semantic amber icon, but amber is not a general accent
- Decorative gradients, neon glows, and purple `calm-productivity` overrides are removed
- Light and dark themes share the same semantic token hierarchy

Required semantic tokens:

- App background
- Navigation surface
- Panel surface
- Raised surface
- Hover surface
- Selected surface
- Unread surface
- Primary text
- Secondary text
- Disabled text
- Border subtle
- Border strong
- Focus ring
- Primary action
- Destructive action

Hardcoded `bg-white`, `text-slate`, and theme-specific border utilities should not appear in workspace components.

### Typography

- Geist Sans 1.7 or newer for the interface
- Geist Mono for dates, counts, shortcuts, and structured search operators
- Use weights 400, 500, and 600 for hierarchy
- Avoid 700 weight except for rare high-priority headings
- Enable tabular figures for dates and unread counts
- Keep message HTML typography isolated from the application font rules
- Use a system sans-serif fallback

### Shape

- Workspace panels: 0-12 px depending on viewport and containment
- Controls: 8 px
- Menus and dialogs: 12 px
- Pills only for values whose shape communicates grouping, such as filter tokens
- Remove 28 px workspace panel radii and repeated `rounded-2xl` styling

### Icons

- Keep Lucide to avoid an unnecessary dependency migration
- Standardize icon size and stroke width
- Use text labels for unfamiliar or destructive actions
- Tooltips supplement labels but do not replace accessible names

### Motion

Motion communicates state changes only:

- 150-200 ms hover and press feedback
- 180-240 ms panel and composer transitions
- Transform and opacity only
- No perpetual decoration
- Respect `prefers-reduced-motion` and the existing reduced-motion setting

## States

### Loading

- Message skeletons match the selected density
- Reader skeleton matches subject, metadata, and body structure
- Settings use section skeletons instead of a circular spinner

### Empty

- Empty folder identifies the folder and offers relevant next actions
- Empty search summarizes active constraints and offers to clear them
- Empty reader explains that selecting a message opens it
- No decorative illustration is required for dense product surfaces

### Error

- Folder and list failures appear in their affected pane
- Reader failures keep the selected item visible and offer retry
- Connection failure appears once at workspace level
- Destructive-action failures restore optimistic state where possible
- Toasts are reserved for transient confirmation and cross-pane results

## Accessibility

- Preserve the skip link and semantic regions
- Use one actual `main` landmark
- Maintain visible focus for every interactive element
- Support full keyboard navigation in folders, message list, reader, menus, and composer
- Keep 44 px minimum touch targets on mobile
- Meet WCAG AA contrast for controls and AAA where practical for reading text
- Do not encode unread, selected, important, or error state with color alone
- Announce selection counts, loading, and message changes with appropriate live regions
- Keep high-contrast, font-size, screen-reader, and reduced-motion settings

## Implementation sequence

### Phase 1: foundation

- Replace Inter with a fixed Geist release that includes redesigned Cyrillic
- Consolidate semantic light, dark, and system theme tokens
- Establish shape, spacing, icon, focus, and motion rules
- Replace `h-screen` with stable dynamic viewport sizing
- Add visual regression fixtures for Russian and English UI strings

### Phase 2: workspace shell

- Recompose the navigation, global search, list header, and reader shell
- Remove floating-card treatment from primary panes
- Move server health into contextual error and System surfaces
- Preserve current data fetching and provider behavior

### Phase 3: message list

- Implement the new flat row hierarchy and density variants
- Preserve virtualization, grouping preferences, drag and drop, and keyboard navigation
- Replace the bottom bulk toolbar with contextual list actions
- Retain optional conversation view

### Phase 4: reader and composer

- Simplify reader action hierarchy
- Add the inline reply and forward editor
- Restyle the floating new-message composer
- Preserve sanitization, attachments, scheduling, tracking, translation, and PGP

### Phase 5: settings

- Replace the flat tab list with six grouped sections
- Add System theme preference
- Preserve API field names and existing setting values
- Provide migration defaults for existing users

### Phase 6: responsive and quality pass

- Implement mobile screen navigation and tablet two-pane behavior
- Verify scroll restoration and swipe behavior
- Test loading, empty, error, offline, and selection states
- Run unit, integration, end-to-end, accessibility, and visual regression checks

## Acceptance criteria

- A mailbox owner can compose, search, open, reply to, archive, move, and delete mail without entering settings
- Flat message list is the default for new and existing users unless they previously enabled conversation view
- Search is visible from the workspace and defaults to all mail
- All existing Stalwart folders and custom folders remain accessible
- Existing route slugs and mail APIs remain unchanged
- No primary workspace component uses hardcoded light-only colors
- Light, dark, and system themes work without hierarchy loss
- Russian and English text render without fallback-font changes inside the same label
- Desktop supports three panes, tablet supports two panes, and mobile uses sequential screens
- Keyboard workflows and accessibility settings do not regress
- Loading, empty, error, and offline states are present for every primary pane
- The redesign does not remove advanced Stalwart, PGP, Sieve, import, backup, or monitoring capabilities
