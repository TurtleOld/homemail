# HomeMail

HomeMail is a web mail client for reading, organizing, and sending mail through a connected mail server.

## Language

**Mail client**:
The user-facing application for everyday work with mail.
_Avoid_: Website, mail site

**Mail workspace**:
The primary area where a person navigates mailboxes, scans messages, and works with the selected message.
_Avoid_: Dashboard, control panel

**Settings workspace**:
The secondary area where a family member configures mail behavior, organization, interface, data, and security preferences available to that member.
_Avoid_: Settings tab, system area, mail workspace

**Contacts workspace**:
The dedicated area where a family member manages contacts and contact groups used when addressing mail.
_Avoid_: Contacts setting, address folder

**Personal address book**:
The private collection of contacts and contact groups owned by one family member and available when composing from any mailbox assigned to that member.
_Avoid_: Mailbox contacts, family address book, shared contacts

**Family member**:
A person who uses the HomeMail instance for everyday work with mailboxes assigned to that person.
_Avoid_: Mailbox owner, administrator, operator

**HomeMail administrator**:
The person who operates the family HomeMail instance and provisions mailboxes for family members.
_Avoid_: Family member, mailbox owner, server operator

**HomeMail identity**:
The durable record of a family member inside HomeMail. It is linked to the verified Stalwart OIDC issuer and subject and is separate from every mailbox assigned to that member.
_Avoid_: Email identity, mailbox account, account ID

**Stalwart administration adapter**:
The server-side HomeMail boundary that provisions and manages Stalwart resources without exposing version-specific management protocols to product code. The Stalwart 0.15 implementation uses its REST Management API; a future 0.16 or later implementation uses management objects over JMAP.
_Avoid_: Stalwart proxy, mail provider, direct management API calls

**Family provisioning**:
The administrator workflow that creates a HomeMail family member, provisions that member's first private mailbox in Stalwart, and records the mailbox assignment as one recoverable operation.
_Avoid_: Add account, create login, invite mailbox

**Activation link**:
A short-lived, single-use HomeMail bearer link that lets a pending family member choose the initial Stalwart password for a newly provisioned private mailbox. HomeMail stores only a protected token digest and never stores the chosen password.
_Avoid_: Temporary password, password reset link, invitation email

**Recovery link**:
A short-lived, single-use HomeMail bearer link explicitly issued by the administrator so an active family member can replace a forgotten Stalwart password. Issuing recovery does not silently grant mailbox access to the administrator.
_Avoid_: Activation link, administrator password, emergency access

**Mailbox**:
A server-backed email identity and message store that the HomeMail administrator can assign to a family member.
_Avoid_: User, account, mail folder

**Private mailbox**:
A mailbox assigned to exactly one family member. A family member may have more than one private mailbox.
_Avoid_: Shared mailbox, user account

**Mailbox assignment**:
The authorization relationship that allows a family member to use a mailbox through HomeMail.
_Avoid_: Account switch, mailbox ownership, login

**Member preference**:
A personal HomeMail setting that follows a family member across every assigned mailbox, such as theme, language, density, accessibility, keyboard, and general notification preferences.
_Avoid_: Mailbox setting, system setting, browser setting

**Mailbox setting**:
A setting whose behavior or data belongs to one mailbox or sender identity, such as signatures, aliases, forwarding, auto-reply, filters, Sieve, folders, labels, subscriptions, and PGP material.
_Avoid_: Member preference, system setting

**Instance setting**:
An administrator-controlled setting that affects the entire HomeMail deployment, including Stalwart integration, family membership, mailbox assignments, backup, monitoring, security policy, and system limits.
_Avoid_: Member preference, mailbox setting

**System area**:
The secondary area for server-oriented capabilities that are not part of everyday mail work.
_Avoid_: Mail workspace, advanced mail

**Mail folder**:
A server-backed container that determines where a message is stored.
_Avoid_: Quick view, filter

**Quick view**:
A reusable selection of messages that match a common condition without changing where those messages are stored.
_Avoid_: Folder, smart folder

**Flat message list**:
An optional presentation where every message appears as its own item, including messages that belong to the same exchange.
_Avoid_: Default message list, conversation view

**Conversation view**:
The default presentation that groups related messages into a single exchange while preserving each message inside it.
_Avoid_: Folder, thread folder, flat message list

**Conversation action**:
An operation applied to the messages in a selected conversation that belong to the current mail folder.
_Avoid_: Whole-thread action, message action

**Mail search**:
A search across all available mail whose scope can be explicitly narrowed to a mail folder or another condition.
_Avoid_: Folder search, quick view

**Message reader**:
The dedicated view where a family member reads and acts on a selected conversation, or on one message when using the flat message list.
_Avoid_: Message preview, reading pane

**Message draft**:
An unsent message being prepared by a family member, whether it is new, a reply, or a forward.
_Avoid_: Compose window, reply editor
