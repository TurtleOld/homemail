# ADR 0002: Support Stalwart 0.15 through an administration adapter

Status: Accepted

Date: 2026-07-17

## Context

The deployed HomeMail mail server is Stalwart 0.15. The HomeMail redesign must support this deployment without forcing a mail-server migration.

Stalwart 0.15 already provides the OIDC provider capabilities required by the HomeMail family identity model. Moving to Stalwart 0.16 is therefore not required for sign-in.

Stalwart 0.16 is nevertheless an incompatible administration platform. It removes the previous REST Management API, represents management and configuration as JMAP objects, replaces most TOML configuration, requires full-email account names, changes container mount points, and requires a documented data and configuration migration. HomeMail needs to provision family members and mailboxes without coupling its product model to either management protocol.

The repository currently uses the `stalwartlabs/stalwart:latest` image tag in development and production Compose definitions. This can cross the incompatible version boundary during an ordinary pull.

## Decision

Stalwart 0.15 is the required server compatibility baseline for the HomeMail redesign. A Stalwart 0.16 upgrade is a separate future infrastructure project and is not a redesign prerequisite.

HomeMail introduces a server-side `StalwartAdminAdapter` boundary for principal, mailbox, domain, alias, and server-configuration administration. Family-domain services and product routes depend on this boundary rather than a Stalwart protocol.

The initial implementation uses the Stalwart 0.15 REST Management API. A future Stalwart 0.16 or later implementation uses management objects over JMAP behind the same HomeMail boundary. Product UI and route handlers do not issue version-specific management calls directly.

HomeMail verifies that the connected server exposes a supported management capability before allowing administrative mutations. Unknown or unsupported versions fail closed and provide an actionable administrator error.

All distributed deployment definitions pin Stalwart to an explicitly supported version tag or immutable digest. The `latest` tag is forbidden for production and migration testing.

## Consequences

### Positive

- The redesign can ship without risking the existing Stalwart data migration.
- OIDC family identity can be implemented on the deployed 0.15 server.
- A later 0.16 migration does not require rewriting family management UI or domain services.
- Version-specific integration tests can make compatibility claims explicit.
- Pinning the image prevents an accidental breaking upgrade.

### Costs and risks

- HomeMail must maintain a defined adapter contract and a Stalwart 0.15 integration-test environment.
- Supporting a future 0.16 adapter adds implementation and test work.
- Capabilities that exist only in a newer Stalwart version must be hidden or reported as unavailable on 0.15.
- Version detection alone is insufficient; HomeMail must probe the required capability and fail closed if it is absent.
- The 0.15 line will eventually require a planned migration for continued upstream support and newer security fixes.

## Future 0.16 migration

The future migration must follow Stalwart's official upgrading documentation and have its own rehearsal, backup, validation, cutover, and rollback procedure. It must account for configuration conversion, management API replacement, directory recreation, OAuth client recreation, container paths, manually recreated settings, and post-migration quota recalculation.

The migration may use Stalwart's account-by-account migration proxy or a scheduled offline procedure. That operational choice is not made by this ADR.

## Rejected alternatives

### Require Stalwart 0.16 before redesign work

Rejected because 0.15 already satisfies the OIDC requirement and coupling the projects would add a risky server migration to a product redesign.

### Call the Stalwart 0.15 REST API directly from product routes

Rejected because those calls would fail after a 0.16 migration and spread version-specific behavior throughout HomeMail.

### Build only for Stalwart 0.16

Rejected because it would make the current production deployment unsupported.

### Continue using the latest image tag

Rejected because a routine image pull could perform an unplanned incompatible server upgrade.
