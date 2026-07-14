# HomeMail

HomeMail is a web mail client for reading, organizing, and sending mail through a connected mail server.

## Language

**Mail client**:
The user-facing application for everyday work with mail.
_Avoid_: Website, mail site

**Mail workspace**:
The primary area where a person navigates mailboxes, scans messages, and works with the selected message.
_Avoid_: Dashboard, control panel

**Mailbox owner**:
The person who uses the mail client for everyday work with their mail.
_Avoid_: Administrator, operator

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
The default presentation where every message appears as its own item, including messages that belong to the same exchange.
_Avoid_: Conversation

**Conversation view**:
An optional presentation that groups related messages into a single exchange while preserving each message inside it.
_Avoid_: Folder, flat message list

**Mail search**:
A search across all available mail whose scope can be explicitly narrowed to a mail folder or another condition.
_Avoid_: Folder search, quick view

**Message draft**:
An unsent message being prepared by the mailbox owner, whether it is new, a reply, or a forward.
_Avoid_: Compose window, reply editor
