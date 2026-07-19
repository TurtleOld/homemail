# HomeMail family identity first-run guide

This document is for the operator standing up family identity (Phase 5 of `docs/MAIL-REDESIGN-PLAN.md`) on a HomeMail instance for the first time. It explains the exact sequence, why two separate administrator concepts exist, and which credentials belong to a human versus which belong to HomeMail itself.

It assumes Stalwart's OIDC signing key is already a persistent asymmetric key and the `mailclient` OAuth client redirect URI already matches your deployment — see the "OIDC identity prerequisites" section of `docs/MAIL-REDESIGN-IMPLEMENTATION.md` if not.

## Two administrators, not one

HomeMail family identity introduces a role that is easy to confuse with an existing one because the same human usually holds both:

- **Stalwart administrator** (`admin`, or whichever fallback account Stalwart generated on its own first run). This account manages the mail server itself: domains, TLS, DKIM, principals, mailboxes, OAuth clients, OIDC signing. You already used it in Stalwart Web Admin to set the OIDC signing key and register the `mailclient` OAuth client.
- **HomeMail administrator**. This is a role *inside the HomeMail application*, held by whichever verified identity matches `HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL`. It grants access to HomeMail's Family, Contacts, and Instance settings workspaces — it does not itself grant any access to Stalwart Web Admin or the Stalwart Management API.

These are deliberately not merged. Stalwart's own administrator credential is a human login with full server control; HomeMail must never store or reuse it for its own automation, so that rotating your personal Stalwart credential can never silently break HomeMail's ability to provision mailboxes, and Stalwart's audit log can always tell "an administrator logged in" apart from "HomeMail's automation made an API call."

A third, narrower credential exists purely for that automation:

- **HomeMail's Stalwart service credential** (`STALWART_ADMIN_API_KEY`). This is a Stalwart API-key principal, scoped in *Replace* mode to only the operations HomeMail's `StalwartAdminAdapter` actually needs (principal and mailbox management), used only by HomeMail's own server-side code to provision family members — never entered by a person into any login form, and never the same secret as any human's Stalwart password.

## First-run sequence

1. **Stalwart's own first run** generates its fallback administrator account and password (already done if Stalwart has run before; you will see a line like `🔑 Your administrator account is 'admin' with password '...'` in its logs the first time it starts).
2. **The operator signs in to Stalwart Web Admin** with that fallback administrator account.
3. **The operator creates a Stalwart API key for HomeMail** under Stalwart Web Admin → Account → Credentials → API Keys. Name it something identifiable (e.g. `homemail-service`), set its permission mode to **Replace**, and grant only principal and mailbox management operations — not full administrator rights. Stalwart shows the generated secret once; copy it immediately, it cannot be retrieved again later.
4. **The operator sets HomeMail's environment variables** and redeploys:
   ```env
   HOMEMAIL_FEATURE_FAMILY_IDENTITY=true
   HOMEMAIL_FEATURE_STALWART_ADMINISTRATION=true
   HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL=<the email you will sign in to HomeMail with>
   STALWART_ADMIN_API_KEY=<the secret generated in step 3>
   ```
   `HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL` and `STALWART_ADMIN_API_KEY` are unrelated to each other: the first identifies which verified sign-in becomes the HomeMail administrator; the second is the credential HomeMail's own backend uses against Stalwart. Neither is a person's Stalwart login password.
5. **The operator signs in to HomeMail** through the normal OIDC sign-in flow, using the same real Stalwart credentials they already use today. HomeMail compares the verified ID-token email claim against `HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL`; on a match, and only if no HomeMail administrator identity exists yet, it creates one bound to that verified `(issuer, subject)` pair. This never happens by virtue of being the first person to sign in — only by matching the configured email, per the explicit-bootstrap requirement in `docs/adr/0001-stalwart-oidc-family-identity.md`.
6. **The HomeMail administrator provisions family members from inside HomeMail's Family workspace.** HomeMail's backend, authenticating to Stalwart with `STALWART_ADMIN_API_KEY` rather than any human credential, creates the Stalwart principal and mailbox, then generates a single-use activation link (`docs/adr/0003-activate-family-members-with-single-use-links.md`) for the administrator to deliver to that family member out of band.

## What each credential is for

| Credential | Held by | Used for | Never used for |
| --- | --- | --- | --- |
| Stalwart fallback/administrator login | A human operator | Stalwart Web Admin: server configuration, TLS, DKIM, OIDC signing, OAuth clients | HomeMail's own automation |
| `HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL` | Configured by the operator, matched against a verified sign-in | Deciding which HomeMail identity becomes the HomeMail administrator role | Authenticating to Stalwart's Management API |
| `STALWART_ADMIN_API_KEY` | HomeMail's backend only | HomeMail's `StalwartAdminAdapter` calls to create/update principals and mailboxes | Signing in as a person, anywhere |

## Rollback

Disabling `HOMEMAIL_FEATURE_FAMILY_IDENTITY` and/or `HOMEMAIL_FEATURE_STALWART_ADMINISTRATION` reverts HomeMail to its existing legacy sign-in and mailbox-access behavior without requiring any data restore, consistent with every other Phase 5 feature flag. The Stalwart fallback administrator account and the `STALWART_ADMIN_API_KEY` API key remain valid on Stalwart's side regardless of HomeMail's flag state; revoking the API key from Stalwart Web Admin (rather than the HomeMail flags) is the way to cut off HomeMail's provisioning access specifically if that credential is ever suspected compromised.
