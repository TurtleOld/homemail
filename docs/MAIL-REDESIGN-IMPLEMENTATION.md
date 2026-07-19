# HomeMail redesign implementation log

Status: Phase 0 through Phase 4 complete; Phase 5 not started

Last updated: 2026-07-19

This log records implementation evidence for `docs/MAIL-REDESIGN-PLAN.md`. It does not replace `CONTEXT.md` or the accepted ADRs.

## Phase 0: Establish the production safety boundary

### Completed

- Read the redesign plan, `CONTEXT.md`, ADR 0001, ADR 0002, and the existing deployment implementation.
- Replaced the Stalwart `latest` reference in development and production Compose with the exact locally observed Stalwart 0.15.3 tag and immutable digest. This freezes the image delivered through GitHub but does not establish the image currently running on the separate production host.
- Inspected the running local container without pulling an image or recreating the service.
- Recorded the active storage backend, configuration path, mount layout, HomeMail OAuth variables, Stalwart OAuth/OIDC discovery metadata, and effective OAuth policy.
- Created and verified an offline backup of the active local Stalwart volume.
- Restored that archive into an isolated scratch volume and confirmed that the pinned Stalwart 0.15.3 image could open it while disconnected from the network.
- Added `scripts/verify-stalwart-phase0.sh` for repeatable static and runtime verification.

No Stalwart 0.16 image was pulled or started. No production migration was performed.

### Exact Stalwart image identity

| Item | Recorded value |
| --- | --- |
| Runtime version | `0.15.3` |
| Compose reference | `stalwartlabs/stalwart:v0.15.3@sha256:8c977e1dc736f0078179074aa97f46aca6b387692fec09352cf160e9f5010c9c` |
| Local image ID | `sha256:523b50aaa48ea212791815db47ada906fe4ce768872c20066360d77875f1daaf` |
| OCI revision | `8b09a01c7309b590998fe513bc914a3ae457e42a` |
| Locally observed container | `homemail-stalwart-dev` |

The inspected Docker daemon belongs to the local development PC. Production runs elsewhere and receives repository changes through GitHub. The production Compose definition is now pinned to the locally verified image, but the actual production Stalwart version, image ID, digest, configuration, storage backend, mount layout, and OAuth state have not been observed. No production pull or deployment may occur until those facts are collected read-only on the production host and its authoritative volume is backed up.

Stalwart 0.15.4 and 0.15.5 exist, and 0.15.5 includes a security fix for cyclic MIME structures. Phase 0 pins the exact locally observed 0.15.3 binary to prevent an unreviewed repository change. A 0.15 patch upgrade requires a separate backup, compatibility test, and release decision; it must not be smuggled into the redesign.

### Locally observed storage backend and active configuration

The running service uses one RocksDB store for every configured storage role:

- `storage.data = rocksdb`
- `storage.fts = rocksdb`
- `storage.blob = rocksdb`
- `storage.lookup = rocksdb`
- `storage.directory = internal`
- RocksDB path: `/opt/stalwart/data`
- Active local configuration: `/opt/stalwart/etc/config.toml`
- Active logs: `/opt/stalwart/logs`

The active volume contained approximately 80 MB at inspection time.

The repository configuration and both Compose files still describe the pre-0.15 path `/opt/stalwart-mail`. That is not the path used by the running v0.15.3 entrypoint. The image starts with:

```text
/usr/local/bin/stalwart --config /opt/stalwart/etc/config.toml
```

### Locally observed mount layout

The inspected local container had three relevant mounts:

| Destination | Type | Purpose | State |
| --- | --- | --- | --- |
| `/opt/stalwart` | anonymous Docker volume | Active configuration, RocksDB data, and logs | Authoritative |
| `/opt/stalwart-mail` | named volume `mailclient_stalwart-data` | Legacy path declared by Compose | Not used by the running entrypoint |
| `/opt/stalwart-mail/etc/config.toml` | read-only bind mount | Repository TOML | Not the active configuration |

The anonymous volume name observed on 2026-07-18 was `9015af42dc475d17ee6119394ea797e424a3e6ea082ec79883019b0bbca62d58`. Operators must resolve the current volume by destination before every backup instead of assuming this identifier remains current.

This mismatch is a release blocker. `docker compose down` followed by `docker compose up`, anonymous-volume renewal, or an attempted path correction without an offline copy can start Stalwart against an empty `/opt/stalwart` volume. Phase 0 deliberately does not move the data or rewrite the mount because that would be a separate operational migration.

### Repository and locally observed OAuth/OIDC configuration

The production environment file contains the intended HomeMail OAuth client configuration:

| Variable | Value |
| --- | --- |
| `STALWART_AUTH_MODE` | `oauth` in `.env.production` |
| `STALWART_BASE_URL` | `http://stalwart:8080` |
| `STALWART_PUBLIC_URL` | `https://auth.pavlovteam.ru` |
| `OAUTH_CLIENT_ID` | `mailclient` |
| `OAUTH_REDIRECT_URI` | `https://mail.pavlovteam.ru/api/auth/oauth/callback` |
| `OAUTH_DISCOVERY_URL` | not set; HomeMail derives discovery from the internal base URL and normalizes public endpoints with `STALWART_PUBLIC_URL` |
| OAuth client secret | not configured; HomeMail uses Authorization Code with PKCE as a public client |

Both Compose files currently set `STALWART_AUTH_MODE=basic` directly under `environment`. Compose gives that value precedence over the `env_file`, so the effective production Compose mode is `basic`, not the `oauth` value written in `.env.production`. This is recorded rather than silently changed because switching the effective authentication mode is a behavior change.

The active Stalwart database had no stored overrides for the non-secret OAuth policy keys. Stalwart 0.15.3 therefore uses these defaults:

| Policy | Effective value |
| --- | --- |
| Authorization code lifetime | 10 minutes |
| Access token lifetime | 1 hour |
| Refresh token lifetime | 30 days |
| Refresh-token renewal window | 4 days |
| Device user-code lifetime | 30 minutes |
| ID token lifetime | 15 minutes |
| Maximum authorization attempts | 3 |
| Anonymous client registration | disabled |
| Required client registration | disabled |
| OIDC signing algorithm | HS256 |

The local discovery documents advertised Authorization Code, implicit, and device-code grants; `openid`, `offline_access`, and JMAP scopes; UserInfo; JWKS; token; introspection; registration; and device endpoints.

The local discovery issuer was `http://5e092cd72147:8080`, derived from the container hostname. This is not a stable production OIDC issuer. The active configuration also had no explicit OIDC signature-key override. A stable public issuer and persistent signing key must be established and verified before the Phase 1 identity model can trust `(issuer, sub)` or ID tokens.

The Stalwart OAuth-client registry could not be read through the Management API because no usable management credential was available to this workspace. Since client registration is not required, the configured `mailclient` identifier can still participate in OAuth, but the presence and exact redirect list of a stored OAuth-client principal remain unverified.

### Verified backup rehearsal

The local rehearsal used an offline archive of the authoritative local `/opt/stalwart` volume. The running local Stalwart container was stopped before RocksDB was read and restarted immediately after the archive completed.

| Check | Result |
| --- | --- |
| Archive | `/tmp/homemail-stalwart-phase0-20260718/stalwart-opt-stalwart.tar.gz` |
| SHA-256 | `00dcc60c0e6cd47a281cb3a275cde93a755da517095c0bc6f40c4ffc419aeed4` |
| Required paths | `etc/config.toml`, `data`, and `logs` present |
| Restore target | New scratch Docker volume |
| Restore server | Exact local image ID for Stalwart 0.15.3 |
| Network during restore test | `none` |
| Server opened restored volume | Passed |
| Scratch container and volume | Removed after the check |

The archive is a temporary local rehearsal artifact, not a production backup or an off-host copy. It proves the procedure against the local layout only; production must be inventoried and rehearsed independently.

### Backup checklist before any pull, recreate, or deployment

1. On the production host, perform read-only inventory before merging or deploying the GitHub-delivered Compose change.
2. Record the current production Git commit or release, Compose files, container names, runtime version, image ID, RepoDigest, storage backend, configuration path, OAuth settings, and all mounts.
3. If production is not exactly Stalwart 0.15.3 with the recorded digest, stop and review the mismatch. Do not pull, recreate, or force the repository pin onto production.
4. Schedule a maintenance window and stop HomeMail writes and background jobs.
5. Confirm both checked-out Compose files resolve the pinned digest with `scripts/verify-stalwart-phase0.sh`.
6. Resolve the authoritative production volume by inspecting the running container's destination and record its Docker volume name. Do not assume production matches the local `/opt/stalwart` layout.
7. Stop Stalwart before reading RocksDB. Do not use a live filesystem copy for this embedded backend.
8. Archive the complete authoritative production volume with numeric ownership preserved.
9. Back up the HomeMail `data` bind mount and the deployment files separately. `npm run backup` covers HomeMail application data only; it does not back up Stalwart.
10. Store image metadata, Compose files, environment files, reverse-proxy configuration, Stalwart archive, HomeMail archive, Git revision, and checksums together in an encrypted off-host location.
11. Verify the archive checksum and listing without extracting over the source.
12. Restore into a new scratch volume, start the exact production image with `--network none`, and verify version, configuration presence, storage opening, and process stability.
13. Remove only the explicitly named scratch container and volume after evidence has been retained.
14. Restart the unchanged original container and verify OAuth/OIDC discovery, JMAP discovery, SMTP submission, IMAP, and HomeMail sign-in.

The following read-only checks are the local example. Production commands must use the actual production container name discovered on that host:

```bash
docker exec homemail-stalwart-dev /usr/local/bin/stalwart --version
docker inspect homemail-stalwart-dev --format '{{.Image}}'
docker image inspect stalwartlabs/stalwart:v0.15.3@sha256:8c977e1dc736f0078179074aa97f46aca6b387692fec09352cf160e9f5010c9c --format '{{json .RepoDigests}}'
docker inspect homemail-stalwart-dev --format '{{range .Mounts}}{{if eq .Destination "/opt/stalwart"}}{{.Name}}{{end}}{{end}}'
```

### Rollback checklist

1. Stop HomeMail and Stalwart without running `docker compose down`.
2. Preserve the failed deployment's container metadata and volume as read-only evidence.
3. Verify the selected backup checksum against the retained manifest.
4. Restore into a newly named empty Docker volume; never extract over the current volume.
5. Start `stalwartlabs/stalwart:v0.15.3@sha256:8c977e1dc736f0078179074aa97f46aca6b387692fec09352cf160e9f5010c9c` with the restored volume mounted at `/opt/stalwart` and no network.
6. Confirm `stalwart --version` returns `0.15.3`, the active config is `/opt/stalwart/etc/config.toml`, and the server process remains running after opening RocksDB.
7. Attach only the expected HomeMail Docker network and expose the previously recorded ports.
8. Verify discovery, JMAP, one read-only mailbox login, SMTP submission, IMAP, OAuth sign-in when enabled, queue state, domains, principals, aliases, DKIM, TLS, Sieve, and recent mail counts.
9. Restore the matching HomeMail application version and HomeMail `data` archive if the application was part of the failed deployment.
10. Keep the failed and previous volumes until validation and the rollback observation window complete.

The present Compose mount mismatch must be resolved through a reviewed offline copy before Compose can safely own the restored `/opt/stalwart` volume. Until then, rollback uses an explicit container invocation or a reviewed one-off override, not the current Compose Stalwart mount declaration.

### Verification performed

- `docker compose config --images` for development and production definitions.
- `bash -n scripts/verify-stalwart-phase0.sh` and the verifier's static and Docker runtime checks.
- Runtime `stalwart --version` and immutable image identity inspection.
- Active entrypoint, process command, storage configuration, directory sizes, and mount inspection.
- Local OAuth and OIDC discovery requests.
- Offline inspection of non-secret stored OAuth policy overrides.
- Offline archive creation, SHA-256 validation, archive listing, isolated restore, and Stalwart 0.15.3 startup against the restored copy.
- `npm test`: 19 test files passed, 141 tests passed.
- `npx playwright test`: baseline failed before any UI change. All four foundation visual snapshots differed from the current render, and the login-flow test expected `Вход в почту` while the page rendered `Добро пожаловать`. The remaining five tests were interrupted after the baseline failures were captured. Snapshots were not updated.

### Known limitations

- The production host was not accessed. Its runtime identity, storage backend, configuration, mounts, OAuth registration, and rollback backup remain unknown and block deployment of the GitHub-delivered change.
- The repository Compose mount layout is incompatible with the locally observed image entrypoint. Whether production has the same unsafe mismatch is unknown and must be checked before deployment.
- The effective production auth-mode precedence contradicts `.env.production` and remains unchanged.
- The stored OAuth-client principal and exact registered redirect list remain unverified without a usable Stalwart management credential.
- The discovered issuer is container-derived and unsuitable as a durable HomeMail identity issuer.
- The repository TOML is not the active Stalwart configuration despite being bind-mounted.
- The temporary rehearsal archive is not an off-host production backup.
- Stalwart 0.15.3 predates later 0.15 security fixes; no patch upgrade was performed in this phase.
- The existing Playwright baseline is red: four stale visual snapshots and one stale login heading expectation were observed. These were not changed in Phase 0.

### Next safe step

Remain in Phase 0. First collect the production inventory read-only on the separate host and compare it with the local findings and repository pin. Do not deploy the GitHub change yet. After an encrypted off-host production backup and isolated restore rehearsal pass, prepare a production-specific mount correction only if the same mismatch is confirmed there. Resolve the intended effective authentication mode and establish a stable public OIDC issuer, persistent signing key, and verified `mailclient` redirect registration. Do not start Phase 1 until these blockers are closed.

### Phase 0 exit-gate recheck (2026-07-18)

Phase 0 remains incomplete. No Phase 1 code was started during this recheck.

The repository and available local evidence were checked again against the Phase 0 exit gate:

- `scripts/verify-stalwart-phase0.sh` passes syntax validation and confirms that both Compose files pin Stalwart to `stalwartlabs/stalwart:v0.15.3@sha256:8c977e1dc736f0078179074aa97f46aca6b387692fec09352cf160e9f5010c9c` with no Stalwart `latest` reference.
- The verifier reported `SKIP: Docker daemon is unavailable; runtime identity and mounts were not checked`. A successful exit after this skip is static evidence only and does not satisfy the runtime or production inventory gate.
- `docker-compose.production.yml` still references `ghcr.io/turtleold/homemail:latest`. The production HomeMail image therefore is not pinned to a reviewed immutable tag or digest as required by the Phase 0 exit gate.
- There is still no evidence from the production host for its running HomeMail and Stalwart image identities, active mounts, storage backend, active configuration, OAuth client and issuer state, HomeMail `/app/data`, reverse proxy, or deployment procedure.
- There is still no verified production backup and isolated restore rehearsal for both the authoritative Stalwart state and HomeMail `/app/data`, nor a rehearsed production rollback using recorded last-known-good immutable images.
- The local mount mismatch, effective authentication-mode conflict, container-derived OIDC issuer, unverified persistent signing key, and unverified OAuth redirect registration remain unresolved production preflight blockers.

The next safe step remains a read-only production inventory performed on the production host. Record the currently running immutable image identities and deployment facts before changing repository image references or pulling anything. Then create separate encrypted off-host backups of Stalwart state and HomeMail `/app/data`, prove both restores into isolated destinations, and rehearse rollback with the recorded last-known-good images without touching live volumes. Treat any HomeMail image pin, mount correction, authentication-mode decision, stable issuer/signing-key change, or OAuth registration change as its own reviewed operation. Re-run the Phase 0 exit gate after that evidence is attached; only then may Phase 1 begin.

### Phase 0 production-evidence tooling (2026-07-18)

Phase 0 remains incomplete. No production command or Phase 1 change was executed during this work.

#### Added

- Added `scripts/collect-production-phase0-inventory.sh`. It prints a read-only inventory to stdout for operator-selected HomeMail, Stalwart, and optional reverse-proxy containers.
- The collector records runtime image IDs, RepoDigests, OCI labels, status, mounts, published ports, Stalwart runtime version, safe filesystem-usage totals, configuration fingerprints, repository revision, file fingerprints, and resolved Compose images.
- The collector deliberately excludes container environment arrays, configuration contents, credentials, tokens, logs, message metadata, and mail data. It does not pull, stop, restart, or recreate containers.
- Added `docs/MAIL-REDESIGN-PHASE0-RUNBOOK.md` with the two-stage production inventory, evidence matrix, backup planning boundary, isolated restore requirements, and exit-gate checklist.
- Updated the Phase 0 starter prompt to use the runbook and collector.
- Updated `scripts/verify-stalwart-phase0.sh` so it also requires the production HomeMail image to use an immutable GHCR digest. The verifier now fails while `docker-compose.production.yml` contains `ghcr.io/turtleold/homemail:latest`.

#### New deployment finding

- `deploy.sh production` is not safe for the current Phase 0 state. Its Docker branch uses `docker-compose.yml`, runs `docker-compose down`, rebuilds locally, and starts the development definition. With the unresolved Stalwart `/opt/stalwart` versus `/opt/stalwart-mail` mount mismatch, that path can recreate the service without the authoritative state. The runbook forbids using it for production inventory or deployment. It was not executed or rewritten because the actual production delivery procedure is still unknown.

#### Verification performed

- `bash -n scripts/collect-production-phase0-inventory.sh`: passed.
- `scripts/collect-production-phase0-inventory.sh --help`: passed without Docker access or writes.
- `bash -n scripts/verify-stalwart-phase0.sh`: passed.
- `git diff --check`: passed.
- `bash scripts/verify-stalwart-phase0.sh`: intentionally failed after confirming both immutable Stalwart references because production HomeMail still resolves to mutable `ghcr.io/turtleold/homemail:latest`.

#### Evidence requested next

The first production request is limited to the existing checkout revision, Docker version, HomeMail project container names/images/statuses, selected Compose project and service labels, and resolved production image references. It performs no container exec and no writes. Do not collect labels from unrelated containers. After the operator returns this output, the second request will inspect only the confirmed container names and will not infer production layout from repository defaults.

### First production inventory response (2026-07-18)

The operator ran the first read-only commands on the production host. No HomeMail container was changed.

#### Confirmed production facts

- Docker server version is `29.4.0`.
- `/opt/docker/homemail` is not a Git checkout. Production does not deploy directly from the repository layout inspected locally.
- The active Compose project is `homemail`, its working directory is `/opt/docker/homemail`, its configuration file is `/opt/docker/homemail/compose.yaml`, and its environment file is `/opt/docker/homemail/.env`.
- The production Compose file is named `compose.yaml`; the requested repository filename `docker-compose.production.yml` does not exist on the host.
- The running HomeMail container is `homemail-webclient`, service `webmail`. Its configured reference is `ghcr.io/turtleold/homemail:latest`, Compose image ID is `sha256:028836bf961c6ca4f9fbadefcf3387b7553828b9b69a23688ee8e0aecdfcb5d9`, and OCI revision is `d693b62b21d2e040f6b8b6e311402eb8bfcab919` with OCI version `main`.
- The running Stalwart container is `homemail-stalwart`, service `stalwart`. Its configured reference is `stalwartlabs/stalwart:v0.15`, Compose image ID is `sha256:dcf575db2d53d9ef86d6ced8abe4ba491984659a0f8862cc6079ee7b41c3c568`, and OCI revision is `9aecfc1dfd53a87c8918a6a98123c50af2001998` with OCI version `v0.15`.
- HomeMail and Stalwart are routed by the shared Traefik deployment. HomeMail uses the public mail route; Stalwart exposes separate public authentication and administration routes.
- The containers had been running for approximately 17 and 18 hours respectively at collection time. The cause of their recent recreation is not yet recorded.

#### Corrections to prior assumptions

- Production is not using the repository `docker-compose.production.yml` directly.
- Production Stalwart is not yet proven to be the locally observed `0.15.3` image or digest. A `v0.15` configured tag and OCI revision are insufficient; runtime patch version and RepoDigest remain required.
- The actual GitHub-to-server delivery mechanism must be documented from Komodo or the operator workflow rather than inferred from `.github/workflows/docker-build.yml` alone.

#### Collection-scope correction

The initial `docker ps` command printed labels for every running container and exposed an unrelated bcrypt basic-auth hash from another service. The hash is not recorded in this repository and should not be shared further. The Phase 0 runbook now filters container discovery to the `homemail` Compose project and does not request unrelated labels.

#### Still required

- Exact running image IDs and RepoDigests from Docker inspection rather than Compose labels alone.
- Stalwart runtime patch version, mounts, active path, storage size, and safe configuration fingerprint.
- HomeMail `/app/data` mount and size.
- Effective HomeMail authentication mode from a single allowlisted environment key.
- Public OIDC discovery metadata, persistent signing-key evidence, redacted OAuth client registration, and exact redirect URI list.
- The production `compose.yaml` fingerprint and resolved image list without printing `.env` or configuration contents.

### Second production inventory response (2026-07-18)

The operator ran the second read-only inventory against the two confirmed HomeMail containers. No image was pulled and no container, mount, configuration, or production volume was changed.

#### Confirmed immutable baseline

- The active `/opt/docker/homemail/compose.yaml` SHA-256 is `092b567fb4c7c30871f82d4065665dd0172c864bc1eb06015ffe482629fa4610` and currently resolves `ghcr.io/turtleold/homemail:latest` plus `stalwartlabs/stalwart:v0.15`.
- The running HomeMail image is exactly `ghcr.io/turtleold/homemail@sha256:028836bf961c6ca4f9fbadefcf3387b7553828b9b69a23688ee8e0aecdfcb5d9`, created at `2026-07-17T16:08:41.113960481Z`, with OCI revision `d693b62b21d2e040f6b8b6e311402eb8bfcab919` and version `main`.
- The running Stalwart image is exactly `stalwartlabs/stalwart@sha256:dcf575db2d53d9ef86d6ced8abe4ba491984659a0f8862cc6079ee7b41c3c568`, created at `2026-07-17T15:01:31.899792411Z`, with OCI revision `9aecfc1dfd53a87c8918a6a98123c50af2001998` and version `v0.15`.
- The Stalwart executable reports `0.15.5`. Therefore the actual production baseline differs from the repository's locally verified `0.15.3` pin and must not be replaced by that older digest.
- Both containers were running with zero recorded restarts and without Docker healthchecks at collection time.

#### Confirmed state and authentication layout

- HomeMail uses a writable bind mount from `/opt/docker/homemail/data` to `/app/data`; the visible data size inside the container is 424 KiB.
- The allowlisted HomeMail settings confirm OAuth mode, internal Stalwart URL `http://stalwart:8080`, public issuer base `https://auth.pavlovteam.ru`, OAuth client ID `mailclient`, and redirect URI `https://mail.pavlovteam.ru/api/auth/oauth/callback`. No explicit `OAUTH_DISCOVERY_URL` was reported.
- Stalwart uses a writable bind mount from `/opt/docker/homemail/stalwart` to `/opt/stalwart` and a second writable bind from `/opt/homemail/stalwart-data` to `/opt/stalwart/data`.
- `/opt/stalwart` occupies approximately 1,402,980 KiB in the container. Backup planning must treat `/opt/stalwart/data` as the authoritative nested RocksDB state while also retaining the outer `/opt/stalwart` tree and active configuration.
- The active configuration is `/opt/stalwart/etc/config.toml`, with SHA-256 `fce2785924c5a32c6c452f4ec0a6089323f14b3216be1a1a0f5510bb7cbd10d1`.
- The safe configuration keys confirm hostname `pavlovteam.ru`, RocksDB for blob, data, FTS, and lookup storage, plus the internal directory backend.

#### OIDC observation

Both public discovery requests made from the production host failed to connect to `auth.pavlovteam.ru:443`. This does not by itself prove that the public endpoint is unavailable to clients: the result can also be caused by missing DNS or NAT loopback from the server. Discovery must next be checked separately from inside the HomeMail Docker network and from an external client.

#### Remaining Phase 0 evidence

- Internal and external OIDC discovery metadata, including the effective issuer, JWKS URI, and ID-token signing algorithms.
- Evidence that the signing material used by Stalwart is persistent, without disclosing key values.
- Redacted OAuth client registration and exact redirect URI evidence from the authoritative Stalwart state or management interface.
- Host filesystem identities, capacity, and safe top-level inventory for both production bind mounts before any backup is attempted.
- The exact Komodo/GitHub/GHCR deployment trigger, source of the generated Compose file, update behavior for mutable tags, and operator rollback procedure.
- Operator-approved downtime and encrypted off-host backup destination.
- Separate backups and isolated restore rehearsals for HomeMail data and Stalwart state. Until these pass, Phase 0 remains incomplete and production must not be recreated or deployed.

### Third production inventory response (2026-07-18)

The operator completed internal and external OIDC discovery plus read-only host-filesystem inspection. No production state was changed.

#### Confirmed OIDC boundary

- From inside the HomeMail container, `http://stalwart:8080/.well-known/openid-configuration` returned HTTP 200 with the stable issuer `https://auth.pavlovteam.ru`.
- The internal OAuth authorization-server metadata returned the same issuer and public authorization and token endpoints.
- From an external workstation, `https://auth.pavlovteam.ru/.well-known/openid-configuration` was reachable and returned the same issuer, authorization endpoint, token endpoint, UserInfo endpoint, and JWKS URI.
- External discovery advertises Authorization Code, implicit, and device-code grants; `openid` and `offline_access` scopes; public subject identifiers; dynamic registration; and the expected identity claims.
- The earlier connection failure from the production host is therefore a host-to-public-route loopback limitation, not evidence of general public OIDC unavailability.
- Discovery advertises multiple supported HMAC, RSA, ECDSA, and RSA-PSS ID-token algorithms. This list does not identify the algorithm or key currently selected by the provider. The active JWKS shape and OIDC-provider configuration still need to be recorded.

#### Confirmed filesystem boundary

- HomeMail data, the outer Stalwart tree, and the nested Stalwart data tree are all directories on the same ext4 filesystem, `/dev/sda2` mounted at `/`.
- At collection time the filesystem was 47% used, with approximately 113 GiB available. This is enough for an on-host isolated copy by size, but an on-host copy alone is not an acceptable off-host backup.
- `/opt/docker/homemail/data` is owned by `turtleold:turtleold`, mode `0755`, occupies 424 KiB, and contains one top-level directory plus fourteen top-level regular files.
- `/opt/docker/homemail/stalwart` is owned by `root:root`, mode `0777`, and occupies approximately 2,345,088 KiB as observed from the host.
- `/opt/homemail/stalwart-data` is owned by `root:root`, mode `0755`, and occupies approximately 929,580 KiB.
- Because `/opt/homemail/stalwart-data` is bind-mounted inside the outer Stalwart tree at `/opt/stalwart/data`, archive commands must avoid ambiguously traversing and duplicating the nested data. The configuration tree and authoritative data tree require explicit sources in the backup manifest.
- World-writable mode `0777` on the outer Stalwart host directory is a production hardening concern because the active configuration is stored below it. Ownership, the permissions of `etc/config.toml`, and the container process UID/GID must be inventoried before proposing a permission change. No permission was changed during Phase 0.

#### Phase 0 status after this response

The stable public issuer and OIDC discovery path are now confirmed. Phase 0 remains incomplete pending the active signing-key evidence, OAuth-client registration state, deployment procedure, approved backup destination and downtime, production backup creation, isolated restore rehearsals, and rollback proof.

### Fourth production inventory response (2026-07-18)

The operator supplied the redacted JWKS shape, configuration-path permissions, process identity, deployment procedure, backup-location preference, and the visible Stalwart 0.15 OIDC-provider settings.

#### Active OIDC signing state

- The public JWKS contains one key with `kid=default`, `kty=oct`, `use=sig`, and `alg=HS256`. Its canonical redacted response fingerprint at collection time is `2cd210a21ea2c815559a08f1c7cfdda1faa14e21323806ee152d0c23d3b5d235`.
- Stalwart Web Admin confirms that the selected signature algorithm is HS256 and the visible Signature Key field is empty.
- The evidence confirms the active algorithm and symmetric key type but does not yet prove that the generated key remains identical across a process restart. The JWKS fingerprint must be compared after the controlled backup/restart rehearsal before HomeMail relies on `(issuer, sub)` identities.
- The symmetric key value was not requested or recorded. It must never be copied into the repository or operator evidence.

#### Permission and process findings

- Stalwart runs as `root:root` inside the production container.
- `/opt/docker/homemail/stalwart`, its `etc` directory, and active `etc/config.toml` are owned by `root:root` but are world-writable. `config.toml` is mode `0777`, executable, and 5,862 bytes at collection time.
- This is a concrete integrity weakness: any host process or account able to write through those permissions can alter the active mail-server configuration. Phase 0 records the issue but does not change permissions before backup and rollback evidence exist.
- `/opt/homemail/stalwart-data` remains `root:root` mode `0755`, and Stalwart currently has the privileges needed to access it.

#### Confirmed deployment and recovery assumptions

- Komodo manages the containers but is not the source of the Compose definition. The production Compose file was created manually through a terminal on the server.
- Production updates are initiated manually with Komodo redeploy. There is no reported automatic GitHub or GHCR deployment trigger.
- The operator accepts an offline maintenance window of any required length.
- `/opt/backup` on the same server is available as a proposed staging and fast-rollback destination. This can support an isolated restore rehearsal, but it is not resilient to loss or corruption of `/dev/sda2`, because production state and the proposed backup reside on the same physical filesystem. A copied archive on an operator workstation or other host is still required for the Phase 0 disaster-recovery boundary.

#### Remaining inventory and next safe operation

- Determine whether OAuth client registration is required and whether a stored `mailclient` record exists. In Stalwart Web Admin this may be exposed under the directory-management OAuth-client list rather than the OIDC signing form.
- Record a safe top-level Stalwart tree inventory so the archive excludes the nested data bind from the outer configuration archive and avoids ambiguous duplication.
- Prepare exact commands for separate HomeMail, Stalwart configuration, and offline RocksDB archives; checksum them; copy at least one verified copy off-host; restore only into isolated destinations; and compare OIDC JWKS before and after restarting the unchanged production version.

### Fifth production inventory response (2026-07-18)

#### Public symmetric-key exposure

- The operator confirmed that the public `https://auth.pavlovteam.ru/auth/jwks.json` response contains the `k` member for the active `kty=oct`, `alg=HS256` key. The key value itself was not printed, shared, or recorded.
- This means the symmetric ID-token signing material is publicly retrievable. Because HMAC verification uses the same material as signing, this key must not become a HomeMail trust anchor for Phase 1.
- The current HomeMail callback does not consume or validate `id_token`. It validates one-time OAuth state, uses Authorization Code with PKCE, exchanges the code directly at Stalwart, then authenticates to JMAP with the returned access token. Therefore the exposed OIDC signing material is not, by itself, a demonstrated bypass of the current HomeMail login callback.
- It is nevertheless a blocker for the planned `(issuer, sub)` identity validation and may affect any other client that accepts Stalwart ID tokens. After backup and rollback are proven, replacing HS256 with a persistent asymmetric key is required as a separate reviewed production change.

#### Registered-client mismatch

- Stalwart contains a registered OAuth client with client ID `mail-client`, display name `Mail client (web & mobile)`, and redirect URI `https://auth.pavlovteam.ru/oauth/callback`.
- Production HomeMail is configured with client ID `mailclient` and redirect URI `https://mail.pavlovteam.ru/api/auth/oauth/callback`.
- The stored registration therefore does not describe the running HomeMail client. The existing flow can only work while client registration is not enforced or an applicable override bypasses registry validation.
- Phase 1 must create and test a correctly named first-party client with an exact HomeMail callback before enforcing registration. The existing record must not be edited or deleted during Phase 0.

#### Active and masked Stalwart data

- On the host, `/opt/docker/homemail/stalwart/data` occupies approximately 1,871,548 KiB.
- Inside the running container, `/opt/stalwart/data` occupies approximately 929,908 KiB because the separate host directory `/opt/homemail/stalwart-data` is mounted over that path.
- The larger data directory under the outer host tree is masked and is not the live RocksDB directory used by the running container. It may contain historical state and must be retained as a separate rollback artifact until its origin is understood.
- The outer tree also contains `certs`, `etc`, and `logs`; the live container sees those same paths plus the separately mounted active data directory.
- The production backup must therefore preserve three independent sources: HomeMail `/app/data`, the complete outer Stalwart tree including masked historical data, and the active `/opt/homemail/stalwart-data` directory. Restore rehearsal must overlay the restored active-data copy at `/opt/stalwart/data`, matching the running mount topology.

### Prepared production backup and restore rehearsal (2026-07-18)

The procedures are prepared but have not been run on production. Phase 0 remains incomplete.

#### Backup helper

- Added `scripts/backup-production-phase0.sh` for the exact inventoried container names, image IDs, and bind mounts.
- The helper requires root and an explicit `--execute` argument. It refuses image-ID drift, missing sources, changed mounts, missing deployment files, or already stopped containers.
- It records the internal JWKS fingerprint, stops HomeMail before Stalwart, archives HomeMail data, the complete outer Stalwart tree, active Stalwart RocksDB data, and the private materialized Compose definition separately, then verifies SHA-256 checksums.
- An error trap restarts the unchanged Stalwart and HomeMail containers if archive creation fails. On success it starts the same containers, waits for internal OIDC discovery, records the post-restart JWKS fingerprint, and flags signing-key instability.
- The helper does not pull images, recreate containers, change mounts, change permissions, or modify OIDC configuration.

#### Isolated restore helper

- Added `scripts/rehearse-production-restore-phase0.sh` for a selected Phase 0 backup directory.
- It verifies archive and manifest checksums before extraction, rejects any restore destination overlapping the three live production state paths, and restores into a newly named scratch tree.
- It starts exact Stalwart production digest `sha256:dcf575db2d53d9ef86d6ced8abe4ba491984659a0f8862cc6079ee7b41c3c568` with `--pull never`, `--network none`, no published ports, and only restored scratch binds.
- It confirms that Stalwart remains running after opening the restored state and records its runtime version. The exact HomeMail production digest checks restored `/app/data` through a read-only scratch bind.
- The rehearsal removes only its uniquely named scratch container and retains restored evidence files for operator review. It never stops or mounts state from the live production containers.

#### Static verification

- `bash -n` passed for both new helpers and the existing Phase 0 shell scripts.
- Both helpers' refusal/help paths were executed without Docker or filesystem writes and returned their intended non-success status.
- `git diff --check` passed.
- `shellcheck` is unavailable in the current workspace, so no ShellCheck result is claimed.

#### Authorization boundary

No production backup, stop, restart, restore, permission change, client-registration change, or signing-algorithm change was executed. The next operation requires explicit operator approval for the maintenance window. The completed backup must be copied off `/dev/sda2` before the isolated restore rehearsal is treated as disaster-recovery evidence.

### Production backup execution (2026-07-18)

The operator explicitly approved the maintenance window and ran the reviewed backup helper on production.

#### Confirmed result

- Backup directory: `/opt/backup/homemail-phase0-20260718T095046Z`.
- `deployment-private.tar.gz`: checksum verification passed.
- `homemail-data.tar.gz`: checksum verification passed.
- `stalwart-active-data.tar.gz`: checksum verification passed.
- `stalwart-outer.tar.gz`: checksum verification passed.
- The unchanged HomeMail and Stalwart containers were restarted by the helper, and internal OIDC discovery became reachable before the helper completed.
- No image was pulled, no container was recreated, and no live mount, permission, OAuth client, or OIDC setting was changed.

#### Signing-key persistence result

- The pre-restart and post-restart JWKS fingerprints differed.
- The empty HS256 Signature Key field therefore results in signing material that is not stable across the observed restart boundary.
- Combined with the previously confirmed public `k` member, the current OIDC key is both publicly retrievable and ephemeral. It is explicitly disqualified as a HomeMail identity trust anchor.
- Phase 1 remains blocked. After restore and rollback evidence pass, production requires a separately reviewed asymmetric signing-key operation with persistent private material and a stable public JWKS.

#### Evidence still required

- Read-only post-maintenance smoke evidence for the unchanged HomeMail and Stalwart containers plus external OIDC discovery.
- A verified copy of the entire backup directory outside production `/dev/sda2`.
- An isolated restore rehearsal using the exact recorded production image digests and only restored scratch paths.
- A recorded rollback procedure and restoration result. Phase 0 is not complete until these gates pass.

### Post-backup smoke check and off-host copy (2026-07-18)

#### Unchanged production services

- `homemail-webclient` and `homemail-stalwart` were both running after the backup maintenance window.
- Stalwart continued to report version `0.15.5`.
- Internal OIDC discovery returned HTTP 200 with issuer `https://auth.pavlovteam.ru` and JWKS URI `https://auth.pavlovteam.ru/auth/jwks.json`.
- External HomeMail returned HTTP 307 from its root URL, consistent with an application redirect, and external OIDC discovery returned HTTP 200.
- A fresh browser sign-in was not included in the returned evidence and remains the user-level smoke check.

#### Verified off-host copy

- The production backup occupied approximately 950 MiB.
- The transport archive `/tmp/homemail-phase0-20260718T095046Z.tar` had SHA-256 `16ca1a435fd2373fdbb935192f1b87f2bfb6b9bd54836eba4e62ceec78967f9d` on the production server.
- The copied workstation archive `/home/alexander/homemail-phase0-backups/homemail-phase0-20260718T095046Z.tar` had the identical SHA-256.
- After extraction on the workstation, `deployment-private.tar.gz`, `homemail-data.tar.gz`, `stalwart-active-data.tar.gz`, `stalwart-outer.tar.gz`, and the final manifest all passed their recorded SHA-256 checks.
- The backup is now independently retained outside production `/dev/sda2`; the off-host Phase 0 backup boundary is satisfied.

#### Next gate

Run the prepared isolated restore rehearsal against the verified server-side backup. The rehearsal may write only to a newly named directory below `/opt/backup`, must use the exact recorded images with pulling disabled, must have no network or published ports, and must not stop or mount paths from the live containers.

### Isolated production restore rehearsal (2026-07-18)

#### Confirmed result

- All four backup archives and the final manifest passed checksum verification again on the production host before extraction.
- The exact recorded Stalwart 0.15.5 image opened the restored configuration and active RocksDB state in a uniquely named scratch container.
- The scratch Stalwart container used `--network none`, published no ports, and mounted only restored paths below `/opt/backup`.
- The exact recorded HomeMail image successfully read restored `/app/data` through a read-only scratch mount.
- The rehearsal passed and retained evidence at `/opt/backup/homemail-phase0-20260718T095046Z-restore-20260718T095838Z`.
- No live production state path was mounted by the rehearsal, and the live HomeMail and Stalwart containers were not stopped or recreated.

#### User-level smoke check

- After the backup restart, the operator successfully completed a new HomeMail sign-in in a private browser window.
- Together with the internal and external discovery checks, this confirms that the unchanged production login flow remained operational after the maintenance restart despite OIDC JWKS rotation.

#### Exit-gate status

The production backup, off-host copy, checksum validation, isolated Stalwart restore, restored HomeMail-data readability, service restart, and user-level sign-in gates have passed. Before Phase 0 can be declared complete, retain exact reviewed rollback commands for the observed bind-mount topology and close any remaining production inventory gaps, including immutable reverse-proxy identity and configuration fingerprint if those were not captured in earlier evidence.

### Reverse-proxy and network inventory (2026-07-18)

- The shared reverse proxy runs configured reference `traefik:v3`, currently resolved to immutable image `traefik@sha256:c549d482c55d7a797398562064f35428cc53e748d84d7190997930e7b31bcc32`.
- The image was created at `2026-03-06T18:26:49.065839386Z`. The container was running with zero recorded restarts and restart policy `unless-stopped`.
- Traefik mounts `/opt/traefik/config/traefik.yml` and `/opt/traefik/config/dynamic` read-only, `/opt/traefik/auth` read-only, `/opt/traefik/certs/acme.json` read-write, `/opt/traefik/logs` read-write, and the Docker socket read-only.
- HomeMail attaches to `homemail_homemail` and `traefik-public`.
- Stalwart attaches to `homemail_homemail`, `smtp-monitor`, and `traefik-public`, and owns host port bindings for TCP 25, 465, 587, and 993.
- Both HomeMail containers use restart policy `unless-stopped`.
- A content fingerprint of Traefik static, dynamic, authentication, and ACME files is intentionally not required. Traefik is outside the HomeMail redesign mutation scope, its immutable running image and mount topology are recorded, and both public routes passed smoke checks. ACME state changes during normal certificate renewal, so its hash would be a noisy and misleading release gate. Configuration and credential contents must not be copied into repository evidence.

### Reviewed production rollback procedure

Rollback is not executed during Phase 0. These commands define the recovery path for a future failed HomeMail, identity, OIDC, or Stalwart change. Before use, replace the placeholder timestamp, verify the selected backup checksums, and obtain explicit production authorization.

#### Rollback triggers

- HomeMail authorization or a fresh browser sign-in fails after a change.
- OIDC discovery has the wrong issuer, an unavailable endpoint, or an unexpected JWKS.
- Stalwart cannot open storage, repeatedly exits, or loses JMAP, SMTP submission, or IMAP availability.
- Expected accounts, mailboxes, messages, aliases, domains, or application state are missing.
- The failed change cannot pass smoke checks inside the accepted maintenance window. The operator accepts the downtime required for recovery; preserving state takes priority over a fast destructive overwrite.

#### Image-only rollback

Use this path when data and configuration are valid and only an application image must be reverted. It preserves the live state directories.

Create a private override in `/opt/docker/homemail/rollback-images.yaml` containing only:

```yaml
services:
  webmail:
    image: ghcr.io/turtleold/homemail@sha256:028836bf961c6ca4f9fbadefcf3387b7553828b9b69a23688ee8e0aecdfcb5d9
  stalwart:
    image: stalwartlabs/stalwart@sha256:dcf575db2d53d9ef86d6ced8abe4ba491984659a0f8862cc6079ee7b41c3c568
```

Then review the resolved images before recreation:

```bash
cd /opt/docker/homemail
docker compose \
  --project-name homemail \
  --env-file .env \
  -f compose.yaml \
  -f rollback-images.yaml \
  config --images
```

The output must contain exactly the two recorded immutable image references. Only after that check, the approved image rollback command is:

```bash
docker compose \
  --project-name homemail \
  --env-file .env \
  -f compose.yaml \
  -f rollback-images.yaml \
  up -d --pull never --no-build --force-recreate webmail stalwart
```

#### Full state rollback

Use this path only when live state or configuration is invalid. Never extract over live RocksDB. Stop HomeMail first and Stalwart second, move all three live state roots into a timestamped failed-state directory on the same filesystem, and restore into newly created original paths:

```bash
BACKUP=/opt/backup/homemail-phase0-20260718T095046Z
FAILED=/opt/backup/failed-state-REPLACE_WITH_UTC_TIMESTAMP

cd "$BACKUP"
sha256sum -c SHA256SUMS
sha256sum -c manifest.txt.sha256

install -d -m 0700 "$FAILED"
docker stop homemail-webclient
docker stop homemail-stalwart

mv /opt/docker/homemail/data "$FAILED/homemail-data"
mv /opt/docker/homemail/stalwart "$FAILED/stalwart-outer"
mv /opt/homemail/stalwart-data "$FAILED/stalwart-active-data"

install -d -m 0755 \
  /opt/docker/homemail/data \
  /opt/docker/homemail/stalwart \
  /opt/homemail/stalwart-data

tar --numeric-owner --acls --xattrs \
  -C /opt/docker/homemail/data \
  -xzf "$BACKUP/homemail-data.tar.gz"

tar --numeric-owner --acls --xattrs \
  -C /opt/docker/homemail/stalwart \
  -xzf "$BACKUP/stalwart-outer.tar.gz"

tar --numeric-owner --acls --xattrs \
  -C /opt/homemail/stalwart-data \
  -xzf "$BACKUP/stalwart-active-data.tar.gz"
```

Preserve the current deployment definition before restoring the private baseline definition:

```bash
cp -a /opt/docker/homemail/compose.yaml "$FAILED/compose.failed.yaml"
cp -a /opt/docker/homemail/.env "$FAILED/env.failed"

tar --numeric-owner --acls --xattrs \
  -C /opt/docker/homemail \
  -xzf "$BACKUP/deployment-private.tar.gz"
```

Create the immutable `rollback-images.yaml`, verify `config --images`, and run the image-only rollback command above. This recreates the two services from the recorded deployment definition while resolving relative bind mounts from their original `/opt/docker/homemail` directory. It does not recreate or modify Traefik.

#### Required rollback validation

After either rollback path, verify running image IDs, Stalwart `0.15.5`, internal and external discovery, HomeMail browser sign-in, one read-only mailbox session, SMTP submission, IMAP, and expected account/domain/mailbox state. Keep both the failed-state directory and the verified backup until the rollback observation window closes. Do not delete them as part of the rollback command sequence.

### Final Phase 0 exit-gate review (2026-07-18)

#### Passed

- Production runtime, deployment procedure, image identities, mounts, storage, authentication mode, OIDC issuer, signing behavior, OAuth-client mismatch, reverse-proxy identity, networks, and host filesystems are inventoried from real production evidence.
- Separate HomeMail, Stalwart outer-tree, active RocksDB, and private deployment backups passed checksums.
- The backup was copied off-host and independently verified.
- Exact production images opened the restored Stalwart state and read restored HomeMail data using only isolated scratch paths.
- The unchanged live deployment passed internal discovery, external routing, and fresh browser sign-in checks after restart.
- Last-known-good image digests and both image-only and full-state rollback commands are recorded.
- Traefik configuration fingerprints are optional and do not block the HomeMail Phase 0 boundary.

#### Owner-accepted image-reference exception

- The materialized production Compose definition may continue to use mutable image references. The owner explicitly accepts the risk that a future manual Komodo redeploy can resolve a different HomeMail or Stalwart image than the currently recorded last-known-good digest.
- No additional digest pin, Compose edit, pull, redeploy, stop, or recreate is required to close Phase 0.
- The exact currently verified image digests remain recorded for rollback even though they are not required as active Compose references.

#### Phase 0 decision

Phase 0 is complete as of 2026-07-18 with the mutable-image risk explicitly accepted by the owner. Production inventory, separate backups, off-host verification, isolated restore rehearsal, post-maintenance smoke tests, and rollback procedures are confirmed by real evidence.

The public, ephemeral HS256 signing key and mismatched registered OAuth client remain mandatory prerequisites before Phase 1 identity validation can be enabled or trusted. They do not reopen Phase 0 and do not prevent Phase 1 code from being developed behind disabled feature flags.

## Phase 1: Make new code safe to deploy while inert

### Implemented locally

- Added four independent runtime feature flags for the identity foundation, authorization policy, OIDC identity validation, and Stalwart administration. Missing, empty, or unexpected values resolve to disabled; `.env.production.example` records every flag as `false`.
- Added domain boundaries for a HomeMail identity keyed by the exact verified `(issuer, sub)` pair, `administrator` and `member` roles, private mailboxes, mailbox assignments, and explicit member/mailbox/instance configuration scopes.
- Added a centralized server-side authorization policy. It authorizes only from the authenticated subject and server-derived assignments; a client-supplied member or mailbox identifier is treated only as a requested resource and cannot establish ownership.
- Added read-only legacy compatibility adapters. Existing sessions and `user_accounts.json` records resolve to a compatibility subject, the active mailbox remains available when the account list is absent, and current `.settings.json` ownership continues to use the authenticated session's mailbox account ID.
- Added an unwired OIDC ID-token validation boundary for asymmetric RS, PS, and ES signatures, exact issuer, audience and `azp`, expiry, not-before time, nonce, and stable subject. It does not create a HomeMail session or identity record.
- The OIDC validator deliberately rejects `none`, HMAC algorithms, and `oct` JWKS keys. The production Stalwart 0.15 HS256 key is therefore not accepted as an identity trust anchor.
- Added a `StalwartAdminAdapter` contract and a Stalwart 0.15 capability detector. Administrative calls require an independently enabled flag, an observed `0.15.x` version, the expected administration protocol, and explicit operation-level capability evidence immediately before delegation.

No existing session, OAuth callback, provider, API route, settings route, storage schema, or startup path was switched to the new boundaries. No family record, mailbox assignment, principal, migration, backfill, activation, recovery, or Stalwart mutation was added. The accepted domain vocabulary already covered every new type, so `CONTEXT.md` required no Phase 1 terminology change.

### Verification results

- `npx tsc --noEmit`: passed.
- `npm test`: passed, 24 files and 161 tests.
- Focused identity/authorization foundation suite: passed, 5 files and 20 tests.
- `npm run lint`: passed with zero errors; 11 pre-existing warnings remain in unrelated files.
- `npm run build`: passed using Next.js 16.1.5 after rerunning outside the restricted sandbox because Turbopack's PostCSS worker requires a local process/port. The first sandboxed attempt failed only with `Operation not permitted` while binding that worker port.
- `git diff --check`: passed.

The permanent domain and contract tests confirm that every flag defaults off, legacy mailbox and settings keys remain readable, client-provided owner identifiers grant no access, forged and expired ID tokens are rejected, issuer/audience/nonce are mandatory, symmetric signing is rejected, unsupported Stalwart versions fail closed, missing operation capability blocks delegation, and the disabled administration flag never invokes its mutation transport.

Rollback compatibility is structural at this stage: Phase 1 adds modules and an example configuration only, changes no persisted schema, emits no new records, and is not imported by the current production authentication or mailbox paths. Returning to the previous HomeMail image therefore requires no data downgrade based on the code implemented here.

### Known limitations and enablement blockers

- The Phase 1 paths are intentionally not wired into production behavior. Their flags must remain disabled.
- The production Stalwart JWKS still exposes an ephemeral symmetric HS256 key. OIDC identity validation cannot be enabled until a separately reviewed asymmetric, persistent signing configuration is installed and verified across restart.
- The observed Stalwart OAuth client is `mail-client` with a redirect URI for the Stalwart-hosted callback, while HomeMail is configured as `mailclient` with its own callback. This mismatch must be resolved with a separate first-party client before identity cutover.
- The administration adapter contains a tested contract and fail-closed capability boundary, not guessed production REST endpoints or credentials. A real 0.15 transport requires disposable-stack contract evidence in a later authorized step.
- A successful local production build proves deployability of the code, but does not prove the Phase 1 production exit gate by itself.

### Next safe step

Publish and deploy the new HomeMail image with all four flags absent or explicitly `false`, without changing Stalwart, OIDC, mounts, or persisted data. Run read-only HomeMail sign-in, mailbox-list/message-read, settings-read, health, and OIDC-discovery smoke checks. Record the HomeMail data-file fingerprints or modification times before and after to confirm that the deploy introduced no transformation beyond ordinary legacy runtime behavior. Returning to the previously recorded HomeMail image is not a mandatory rehearsal for this phase, but the recorded rollback image and commands must remain available if the inert deployment fails. No data restore should be needed because Phase 1 introduces no persisted schema or state transformation.

### Production inert-deploy evidence and Phase 1 decision (2026-07-18)

The operator confirmed the new inert build in production with redesign and identity paths disabled. The existing browser session remained valid, a fresh sign-in succeeded, and existing messages remained available. No family cutover, OIDC identity validation, Stalwart administration, migration, or persisted-format change was enabled.

The operator chose not to rehearse returning to the previous HomeMail image. This does not block the adjusted Phase 1 gate because the release introduced no data transformation. The previously recorded image identity and rollback commands remain the emergency path and must stay available if a later deployment requires them.

Phase 1 is complete. Phase 2 may begin behind its own disabled shell flag.

## Phase 2: Establish the product shell and visual tokens

### Implemented locally

- Added the independent runtime flag `HOMEMAIL_FEATURE_PRODUCT_SHELL`. It is disabled for absent, malformed, and explicit `false` values and is documented as `false` in the production environment example.
- Added a server-provided shell feature context and a route-aware client boundary. With the flag disabled it returns the existing React tree directly; with the flag enabled it identifies Mail, Contacts, Settings, System, and authentication workspaces without changing session, provider, API, or storage contracts.
- Added permanent route classification for localized and non-localized workspace paths.
- Added a responsive `WorkspaceFrame` foundation with a 224 px desktop secondary navigation, 60 px content header, accessible mobile overlay drawer, stable landmarks, current-route state, and tokenized gutters.
- Added shared loading skeleton, empty, offline, unauthorized, forbidden, and route-error patterns. Stalwart settings use the shared loading and route-error patterns only when the shell flag is enabled.
- Added a dedicated Contacts workspace route behind the shell flag. When disabled, the route is unavailable and the existing settings-hosted Contacts behavior remains unchanged. When enabled, it requires the existing authenticated session and reuses the current Contacts provider and API contracts.
- Updated the localized authentication surface behind the flag to use the semantic light/dark tokens, restrained shape system, Lucide icons, and a focused form column. The flag-off branch retains the previous classes and SVGs.
- Consolidated shell tokens for subtle surface, spacing, data/control/overlay/pill radii, control and touch heights, workspace header/navigation dimensions, message-row height, overlay scrim, z-index layers, and overlay shadow. Existing token values and legacy selectors were not replaced.
- Rebuilt the visual-regression fixture as a flat route-aware Settings shell in English and Russian, light and dark themes. Persistent surfaces use spacing and dividers rather than decorative cards or shadows.

No mail operation, JMAP call, session schema, settings payload, stored setting, mailbox identifier, reader route, message-list layout, or Stalwart configuration changed. Phase 3 list-first behavior was not implemented.

### Verification results

- `npx tsc --noEmit`: passed.
- `npm test`: passed, 26 files and 173 tests.
- `npm run lint`: passed with zero errors; the same 11 unrelated warnings remain.
- `npm run build`: passed with Next.js 16.1.5.
- Product-shell component and routing tests cover flag-off legacy passthrough, route classification, responsive drawer open/close, current navigation, loading, offline, empty, unauthorized, forbidden, and error semantics.
- Playwright shell tests passed for keyboard focus and landmarks in English and Russian plus the 390 px responsive drawer and horizontal-overflow check.
- Four Chromium visual baselines were regenerated and then passed for English/Russian and light/dark.
- The regenerated light and dark images were inspected: hierarchy, one blue accent, flat persistent surfaces, 8 px controls, readable form labels, visible selection, and stable bilingual geometry are present.
- `git diff --check`: passed.

### Design pre-flight

- Redesign mode remains a product overhaul with preserved routes, data contracts, and current mail behavior.
- The implemented shell uses `DESIGN_VARIANCE 4`, `MOTION_INTENSITY 2`, and `VISUAL_DENSITY 7`; it uses only hover, focus, pressed, and drawer state transitions.
- Geist and the existing Lucide icon family remain the sole application typography and icon foundations.
- Light and dark use the same hierarchy and one cool-blue accent. Persistent surfaces do not use decorative shadows; overlay shadow is reserved for the mobile drawer and authentication container.
- The fixture contains no decorative illustrations, marketing hero patterns, scroll effects, arbitrary gradients, duplicate calls to action, or new em/en dashes.
- Mobile navigation collapses explicitly below the desktop breakpoint, uses 44 px touch controls, and does not introduce horizontal overflow.

### Known limitations and exit-gate status

- The shell flag remains disabled by default and has not been enabled in production.
- The shared frame is now exercised by the fixture and the gated Contacts route. The current Mail and Settings implementations retain their existing chrome; Phase 3 owns the list-first Mail decomposition, and the later settings phase owns route-splitting the monolithic settings page.
- The localized `/{locale}/login` route has the gated authentication shell. The older top-level `/login` compatibility route remains visually unchanged and does not receive locale-layout feature context.
- Custom primary-color validation and reduction from the existing three custom color fields to one safe primary remain part of the later settings work. Phase 2 adds the semantic token destinations without migrating or rewriting stored theme values.
- No full Stalwart stack was needed because this phase changes no provider integration contract.

The local exit property is proven: disabling `HOMEMAIL_FEATURE_PRODUCT_SHELL` removes the route-aware wrapper, retains the legacy localized login branch, keeps the dedicated Contacts route unavailable, and performs no server-data transformation. Phase 2 remains in progress until the new build is deployed with the flag disabled, smoke-checked, and then enabled for the administrator for visual and navigation acceptance. Disabling the flag is the immediate UI fallback and requires no data restore.

### Next safe step

Deploy the build with `HOMEMAIL_FEATURE_PRODUCT_SHELL=false` and repeat the read-only session, login, mailbox, settings, and health smoke checks. Then enable only `HOMEMAIL_FEATURE_PRODUCT_SHELL=true` for the administrator deployment, verify the localized login, Mail and Settings chrome, Contacts route, Stalwart loading/error states, light/dark themes, keyboard focus, and mobile drawer, and disable the flag immediately if navigation regresses. Do not begin Phase 3 until this acceptance evidence is recorded.

### Production shell acceptance and localization follow-up (2026-07-18)

The operator confirmed that sign-in, existing mail, Contacts, Stalwart settings, responsive behavior, themes, session refresh, and the remaining Phase 2 acceptance checks passed with `HOMEMAIL_FEATURE_PRODUCT_SHELL=true`. The English Settings navigation exposed Russian content in the legacy Language and region form. Code inspection confirmed that the navigation was locale-aware but the shared Advanced/Language form still contained hard-coded Russian strings.

The shared Forwarding and aliases / Language and region form now reads all headings, labels, help text, validation, save state, and toast feedback from matching English and Russian message catalogs. This is the narrow Phase 2 acceptance fix. The fix is covered by locale-catalog parity tests and was committed as `40ea1d3` for deployment.

The monolithic legacy Settings page and several embedded settings components contain additional hard-coded Russian strings. A complete Settings localization audit is now an explicit Phase 6 deliverable alongside route decomposition. Its exit gate requires locale-catalog key parity and English/Russian browser checks for every Settings route without unintended mixed-language system text. Localization remains a per-phase requirement for every newly redesigned route rather than being deferred entirely to Phase 6.

The operator accepted all other production shell checks with `HOMEMAIL_FEATURE_PRODUCT_SHELL=true` and explicitly authorized Phase 2 closure after the localization fix. Phase 2 is complete. Phase 3 may proceed behind its own disabled feature flag; the legacy mail workspace remains the required immediate fallback.

## Phase 3: Deliver the list-first mail workspace

### Implemented locally so far

- Added the independent `HOMEMAIL_FEATURE_LIST_FIRST_MAIL` runtime flag. It defaults to disabled, is exposed to the client only through the server-provided feature context, and leaves the legacy split-pane workspace intact when disabled.
- Added a route-backed reader at `/{locale}/mail/messages/{messageId}`. Existing JMAP Email IDs are URL encoded rather than migrated or rewritten.
- Added permanent URL-state helpers for folder, search, quick filter, conversation/flat presentation, list hrefs, and reader hrefs. Invalid values fail closed to defaults.
- Added session-scoped list-scroll storage so returning from a reader can restore the previous list index without persisting mailbox content.
- Added a desktop list-first branch that retains the mail sidebar while giving the remaining width to either the message list or the dedicated reader. The legacy resizable split pane remains the flag-off fallback.
- Added durable reader links to message and conversation rows, including normal browser new-tab behavior, and synchronized folder, filter, search, presentation, selection, Back/Forward, and refresh state with the URL.
- Added list-first density and hierarchy for message and conversation rows while retaining legacy row rendering behind the flag.
- Added a flatter list-first sidebar treatment and a full-width reader treatment. In the list-first reader, message content precedes attachments; successful authentication badges are quiet while failures remain visible.
- Localized the delivery-tracking surface and changed locale-setting fallback to the active application locale so newly redesigned English routes do not fall back to Russian system text when settings data is temporarily unavailable.
- Added bilingual light/dark mail list and reader fixtures, permanent URL/scroll/list tests, browser semantics checks, and visual baselines. These artifacts are Phase 3 verification infrastructure, not phase-named temporary product tests.
- Added a read-only JMAP `Thread/get` boundary, a feature-gated thread endpoint, and a conversation reader. The server returns at most 50 latest messages, reports the real total and truncation state, and resolves message details in batches of five. The selected message is expanded; older messages use compact route-backed headers and can become active without relying on the currently paginated list.
- Aligned the existing composer without changing send, draft, signature, scheduling, receipt, encryption, contact, or attachment behavior. Inline reply is now a flat continuation of the reader rather than an elevated card; floating compose uses the overlay token and a 600 px cap; attachment selection is a compact drop target; editor height and localized window controls are mode-aware.
- Completed a focused review of the conversation-reader increment. `Thread/get` now rejects a response whose account does not match the current JMAP account, and route tests prove that the endpoint is unavailable before authentication when the list-first flag is disabled and delegates only with the session account.
- Compact conversation headers are real reader links, including normal modified-click and new-tab behavior. The active message is retained when it falls outside the bounded recent-message response, empty subjects stay locale-owned instead of receiving a provider-level Russian fallback, and truncation text remains accurate when the selected older message is added locally.
- Added visible keyboard focus to the new composer window controls and removed the remaining visible em-dash separators from the English and Russian shortcut hints.
- Kept the active-message reply hierarchy visible while reading long conversations by moving Reply, conditional Reply all, and Forward into a persistent bottom reader action bar. The bar sits outside the scroll container so it does not cover message content, replaces the duplicated embedded footer, uses 44 px mobile targets, and yields to the inline composer when a reply or forward is opened.

No mutating mail API operation, JMAP identifier, session schema, mailbox assignment, persisted settings schema, Stalwart configuration, or production data was changed. The new read-only thread endpoint is unavailable while the list-first feature flag is disabled.

### Verification performed

- `npm run build`: passed with Next.js 16.1.5 after the initial Phase 3 route and fixture implementation.
- Final `npx tsc --noEmit`: passed after the reader-order and localization follow-up.
- Final focused Vitest run used one worker and disabled file parallelism: 5 files and 17 tests passed.
- `git diff --check`: passed.
- A sequential Playwright run created all eight English/Russian light/dark list and reader baselines and completed nine of eleven checks. The two failures were inaccurate new assertions: the mobile test expected the intentionally hidden desktop sidebar, and the protected reader-route test expected an HTTP 404 before authentication middleware. Both assertions were corrected.
- The generated list and reader baselines were inspected without launching another browser. This inspection found the mixed-language delivery status and pre-body attachment placement; both were corrected in code.
- After the first checkpoint commit `c3f05e1`, the conversation-reader increment passed `npx tsc --noEmit` and six focused tests across the thread protocol adapter, conversation interaction, and locale-catalog parity. Vitest used one worker with file parallelism disabled.
- After the focused review, `npx tsc --noEmit` passed again. Eight focused Vitest files passed with 27 tests covering JMAP account validation, five-request detail batching, endpoint gating and session scope, active-message retention, real conversation links, URL state, feature-flag defaults, list rendering, and locale-catalog parity. Both Vitest runs used `--maxWorkers=1 --no-file-parallelism`.
- The final visible-string scan found no em dash or en dash in the English or Russian catalogs or the new conversation/composer UI. `git diff --check` passed. Playwright, the Next development server, the full test suite, and the production build were not run during this review.

### Resource-safety note

The first Playwright attempt used the Next development server and caused excessive concurrent route compilation even after reducing Playwright to one worker. The operator reported that this made the workstation unresponsive. All remaining Playwright, Chromium, and Next processes were checked and none remained. Playwright was not rerun after the final localization and attachment-order fixes. Do not treat the current visual baselines as final acceptance evidence until a resource-bounded manual check or a production-build browser run is completed under explicit operator control.

### Known limitations and current gate

- Phase 3 is in progress and `HOMEMAIL_FEATURE_LIST_FIRST_MAIL` must remain `false` in production.
- The conversation reader is implemented locally but has not been verified against production Stalwart 0.15 data. Its 50-message resource boundary and truncation notice require acceptance with a real long thread.
- Compose behavior is preserved and its Phase 3 structural alignment is implemented, but it still requires manual keyboard, draft-save, attachment, minimize, expand, and mobile acceptance.
- Back/Forward, refresh, new-tab, scroll restoration, real mailbox data, both locales, both themes, and narrow mobile behavior require a final resource-bounded acceptance pass.
- Browser assertions were corrected after the partial run but were not rerun because of the workstation resource incident.

### Next safe step

Keep every identity/authorization flag and `HOMEMAIL_FEATURE_LIST_FIRST_MAIL` disabled. Prepare a short manual browser checklist for the operator and use only sequential unit/static checks for any follow-up. Do not enable the list-first flag in production or close Phase 3 until that checklist passes with real mailbox data, including a multi-message thread and composer workflows, and the legacy flag-off fallback is reconfirmed.

### Production acceptance and Phase 3 decision (2026-07-18)

The operator completed the production checklist and accepted the list-first workspace. Follow-up acceptance defects were corrected before closure: conversation-list pixel scroll restoration, compact inline forward with focus and collapsed quoted content, permanent removal of a successfully sent saved draft instead of moving it to Deleted Items, settings localization gaps, and duplicate Inbox presentation. The final acceptance fixes are recorded in commit `94d9c2b`.

The operator explicitly confirmed Phase 3 closure and authorized Phase 4. The list-first feature remains independently reversible through `HOMEMAIL_FEATURE_LIST_FIRST_MAIL`; no message or settings data conversion is required to disable it.

## Phase 4: Deliver protected message content

### Implemented locally so far

- Added `HOMEMAIL_FEATURE_PROTECTED_MESSAGE_CONTENT` and the independent remote-fetch kill switch `HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING`. Both fail closed and default to `false`.
- Added short-lived HMAC-signed internal image resource tokens. Tokens bind resource kind, current mailbox account, message, attachment or external URL, version, and expiry. The resource route also requires the current authenticated session to match the token mailbox.
- Extended JMAP attachment mapping with inline disposition and normalized Content-ID metadata. Sanitized `cid:` image sources now resolve to authenticated HomeMail attachment resources rather than browser schemes.
- Added server-side HTML sanitization and image-source rewriting on both single-message and conversation responses. External image sources become signed same-origin HomeMail paths only when the remote-fetch flag is enabled; otherwise they are removed by the existing blocked-image sanitizer path.
- Added a protected iframe CSP (`img-src 'self' data:`) and `no-referrer` policy. In protected mode the legacy local opt-in cannot re-enable direct sender URLs. The existing image-banner implementation has not been deleted.
- Added a dedicated fetcher that accepts only HTTP and HTTPS without embedded credentials, resolves all IPv4 and IPv6 answers fail-closed, rejects non-public and metadata ranges, pins the validated address through the HTTP client's lookup callback, disables connection pooling, verifies the connected socket's actual remote address, and repeats validation for every redirect hop.
- Added a four-hop redirect limit, eight-second total deadline, eight-MiB response limit, six-request concurrency boundary, bounded wait queue, account-and-client-IP route rate limit, fixed non-identifying request headers, and no forwarding of cookies, authorization, client IP, or referrer.
- Added strict JPEG, PNG, GIF, WebP, and AVIF header/content agreement. SVG, HTML, unknown content, MIME spoofing, and mismatches fail closed.
- Added a disposable in-memory URL-hash cache with ten-minute TTL, 128-entry limit, and 32-MiB total byte limit. Cache entries contain validated image bytes only and are separate from HomeMail and Stalwart state.
- Added redacted structured events containing a short token hash, outcome, resource kind, and cache result. Full sender URLs are not logged. A pre-existing provider log that exposed a Stalwart blob download URL was removed.
- Every route refusal and fetch failure returns a same-origin one-pixel PNG placeholder with `private, no-store`, `nosniff`, same-origin resource policy, and no direct-browser fallback.

### Resource-path trace

External path: provider message HTML -> authenticated message or thread route -> sanitizer -> signed same-origin resource URL -> client sanitizer -> isolated iframe CSP -> authenticated resource route -> token and mailbox check -> rate/concurrency boundary -> fail-closed DNS validation -> pinned HTTP/TLS connection -> redirect-hop validation -> byte and MIME validation -> disposable cache -> private image response.

Inline path: JMAP `bodyStructure` Content-ID and blob ID -> provider attachment metadata -> authenticated message or thread route -> signed same-origin cid resource -> isolated iframe -> authenticated resource route -> token and mailbox check -> provider `getAttachment(accountId, messageId, blobId)` -> size and MIME/content validation -> private image response.

No protected rendering path emits a sender-controlled image URL to the iframe. Link navigation remains separate from image delivery and retains the existing sanitized external-link behavior.

### Proxy test matrix

| Case | Result |
| --- | --- |
| Missing, malformed, expired, tampered, or cross-mailbox token | Closed with placeholder |
| Protected path or remote fetching disabled | Closed with placeholder; message access remains available |
| Loopback, RFC1918, carrier NAT, link-local, metadata, benchmark, documentation, multicast, reserved IPv4 | Rejected before transport |
| Unspecified, loopback, mapped private IPv4, unique-local, link-local, site-local, documentation, transition, multicast IPv6 | Rejected before transport |
| DNS failure, empty answer, or mixed public/private answers | Rejected fail-closed |
| DNS rebinding attempt | Transport receives only the validated pinned address |
| Redirect to metadata/private destination | Redirect rejected before the second transport call |
| Redirect loop or excessive redirects | Rejected at the four-hop boundary |
| MIME spoofing or unsupported content | Rejected by declared-type and magic-byte agreement |
| Oversized response | Rejected at the eight-MiB boundary |
| Timeout | Closed with placeholder |
| Cache key collision/poisoning attempt using a different URL | Separate SHA-256 cache entry |
| Protected iframe with a raw sender image and legacy allow-images prop | Sender URL removed; CSP permits only same-origin/data images |

The adversarial cases use deterministic controlled resolver and HTTP-hop fixtures. They do not require production connectivity or permit a test server to bypass the same private-address policy being tested.

### Verification performed

- `npx tsc --noEmit`: passed.
- Focused protected-content, route, thread, and reader suite: 5 files and 29 tests passed.
- Full `npm test -- --maxWorkers=1 --no-file-parallelism`: 38 files and 214 tests passed.
- Focused ESLint over every changed runtime and test module: passed without errors or warnings.
- `npm run build`: passed with Next.js 16.1.5. The first sandboxed attempt failed only because Turbopack could not create its PostCSS helper process/port; the permitted production build completed successfully outside that restriction and includes `/api/mail/resources/image/[token]`.

### Defects found and corrected

- The legacy manual image opt-in allowed direct browser requests to sender hosts. Protected mode now ignores that direct-loading state and enforces a same-origin image CSP.
- `lib/url-validator.ts` performs IPv4-only checks, can continue after DNS failure, and does not pin or revalidate redirects. It remains unchanged for existing callers and is not used by protected image delivery.
- The attachment model discarded Content-ID and omitted unnamed inline parts. The provider now retains both inline disposition and Content-ID.
- Attachment diagnostics logged the complete Stalwart blob download URL. That log now records only that a URL was obtained.
- The initial cache bound counted entries but not aggregate bytes. A 32-MiB total byte boundary was added.
- Redirect responses initially consumed their bodies before validation. The transport now discards redirect bodies immediately and validates the next hop first.

### Current limitations and next safe step

- The cache, concurrency limiter, queue, and rate limiter are process-local. This is safe and disposable but limits are per HomeMail worker rather than globally coordinated. A multi-replica deployment would require an isolated shared limiter/cache or an enforced single-worker boundary.
- Docker currently gives HomeMail general outbound connectivity. Application-layer destination pinning is the enforced boundary; a separate egress firewall is defense in depth and has not been added to the repository or the separately managed production Compose deployment.
- The proxy deliberately supports only JPEG, PNG, GIF, WebP, and AVIF. Other image formats fail closed.
- Automatic images and removal of the legacy banner are not yet accepted. First deploy with both flags false, then enable protected content plus remote fetching only for controlled synthetic messages. Inspect browser network requests and redacted rejection logs. Keep `HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING=false` as the no-redeploy emergency stop.

### Disposable full-stack `cid:` contract verification (2026-07-18)

The real Stalwart Content-ID/blob contract that Phase 4 depended on was proved end-to-end, closing the last local gate before production acceptance.

#### Disposable stack

- Started an isolated Stalwart 0.15.3 container (`stalwartlabs/stalwart:v0.15.3@sha256:8c977e1dc736f0078179074aa97f46aca6b387692fec09352cf160e9f5010c9c`) with a dedicated Docker volume mounted at the real `/opt/stalwart` entrypoint path, on a network with no external egress (`Internal=true`).
- The container reported runtime version `0.15.3` after a fresh first-boot configuration write; it generated its own one-time administrator credential, which was used only to provision the synthetic principal below and was not reused or persisted anywhere.
- Created a synthetic `test.local` domain and a synthetic principal named with its full email address (`phase4b@test.local`, matching how HomeMail's basic-auth login sends the JMAP username) with a generated password and the minimal `user` role required for SMTP submission and JMAP access.
- Sent a synthetic multipart/related message over authenticated SMTP submission containing one inline `image/png` part with `Content-Disposition: inline` and `Content-ID: <test-inline-image@phase4>`, referenced from the HTML body as `<img src="cid:test-inline-image@phase4">`, plus a second `<img src="https://example.com/tracker.png">` for the external-image path.
- Queried the raw JMAP `Email/get` response directly (bypassing HomeMail) to confirm Stalwart 0.15.5's real `bodyStructure` shape before testing the app: the inline part reports `disposition: "inline"`, `cid: "test-inline-image@phase4"` (already unwrapped, no angle brackets), and a `blobId`. This exactly matches the provider's existing assumptions (`attachment.id = part.blobId`, `attachment.contentId = part.cid`) with no code change required for the mapping itself.
- Built the HomeMail application in a separate container attached first to a normal network (for `npm ci`, since the isolated Stalwart network has no DNS/registry egress by design) and then run attached only to the isolated Stalwart network, with `HOMEMAIL_FEATURE_PROTECTED_MESSAGE_CONTENT=true`, `HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING=true`, and (for the thread check) `HOMEMAIL_FEATURE_LIST_FIRST_MAIL=true`, using disposable signing secrets generated only for this run.

#### Defect found and fixed: real accountId storage keys were rejected

Standing up the real flow surfaced a defect unrelated to the Phase 4 image work but severe enough to block every mailbox: `GET /api/mail/messages` failed with `Invalid storage key` for the synthetic account, and the same failure reproduces for any real email-shaped `accountId`, including the existing production account `admin@rem.ru`.

- `STORAGE_KEY_RE` in `lib/storage.ts` was tightened during the March storage-hardening commit (`add33f1`) to `^[a-zA-Z0-9_\-:]{1,256}$`, which silently excludes `@` and `.`. Dozens of routes (`mail/messages`, `mail/messages/[id]`, `mail/messages/[id]/labels`, `mail/statistics`, `mail/labels`, `mail/templates`, `contacts`, `contacts/groups`, `subscriptions`, `settings/hotkeys`, `push/subscribe`, backup) key `readStorage`/`writeStorage` calls with `` `prefix:${session.accountId}` ``, and `session.accountId` is a real email address in the current basic-auth login path.
- Before the March hardening, `readStorage`/`writeStorage` applied no validation and only replaced `:` with `_`, so `@` and `.` already reached existing on-disk filenames unescaped. The fix widens `STORAGE_KEY_RE` to allow `@` and `.` (rejecting `..` explicitly, since a lone `.` is otherwise permitted) and leaves the `:`→`_` filename encoding unchanged, so it is compatible with any file created either before or after the March hardening; it does not change the on-disk filename for any existing key shape.
- Added `lib/__tests__/storage-key.test.ts`: an email-shaped key now round-trips through `writeStorage`/`readStorage`; a key containing `..` or `/` is still rejected; and a key matching the pre-existing on-disk filename convention is verified against the literal file written to disk.
- `npx tsc --noEmit` and the full `npx vitest run --maxWorkers=1 --no-file-parallelism` (39 files, 218 tests, including the 4 new storage tests) passed after the fix. This defect and fix are orthogonal to the protected-image feature flags and required no change to `protected-message-content.ts`, `protected-image-fetcher.ts`, or the resource route.

#### Confirmed end-to-end evidence

- `GET /api/mail/messages?folderId=inbox` returned the synthetic message with `hasAttachments: true` once the storage fix was applied.
- `GET /api/mail/messages/{id}` returned a `body.html` with both the `cid:` and the `https://` image sources rewritten to signed same-origin `/api/mail/resources/image/{token}` paths, and an `attachments` entry with the real Stalwart `blobId` as `id`, `contentId: "test-inline-image@phase4"`, and `disposition: "inline"`.
- `GET /api/mail/threads/{threadId}` (list-first flag enabled) applied the identical protection and rewriting to the conversation-reader response built from the same real message.
- Fetching the signed `cid` resource URL returned HTTP 200, `X-HomeMail-Image-Status: ok`, `Content-Type: image/png`, `Content-Length: 66`, and the exact 66-byte PNG payload originally sent (verified byte-for-byte against the source PNG's magic bytes and IDAT/IEND structure). This is the real `provider.getAttachment(accountId, messageId, blobId)` path against a live Stalwart blob download, not a fixture.
- Fetching the signed external-image resource URL on the egress-isolated network returned HTTP 200 with `X-HomeMail-Image-Status: placeholder` and the quiet one-pixel PNG, `private, no-store` — the expected fail-closed behavior for a destination the fetcher cannot reach, with no direct-browser fallback.
- A tampered token (one flipped character) returned the identical placeholder response.
- Application logs for both the successful `cid` fetch and the rejected external fetch contained only redacted event records (`event`, truncated `tokenId` hash, `cache`/`reason`); no full sender URL or token was logged.

#### Disposal

All disposable resources were removed after evidence collection: the Stalwart and HomeMail containers, the dedicated internal Docker network, the Stalwart data volume, and the locally built HomeMail image. No host `.env`/`.env.local`/`.env.production` file, no tracked Compose file, and no production state was read from or written to during this verification; only new disposable containers, an isolated network, and a scratch volume were created and then deleted.

### Production acceptance defects found and fixed (2026-07-19)

The operator enabled both Phase 4 flags in production and exercised real inbox messages containing `cid:` and external images. Four defects surfaced only under real production conditions (real Stalwart TLS, real Traefik, real dual-stack DNS, real inbox messages) that neither the disposable-stack verification above nor the existing unit/component suite exercised, because each depends on infrastructure or message shapes the local verification didn't reproduce.

- **CSP blocked its own same-origin resource URL** (`fd97731`). The protected message iframe's CSP used `img-src 'self'`, but the iframe content is set via `srcDoc`, which gets an opaque, unique origin regardless of the sandbox's `allow-same-origin` token — so `'self'` never resolved to the real app origin. Fixed by naming the origin explicitly via `window.location.origin`.
- **Manually-set `Content-Length` went stale** (`6920e45`). The image resource route computed `Content-Length` from the buffer before any proxy or Next's own compress layer could re-encode the body; if that layer touched the body, the stale header no longer matched the bytes sent, and the browser reported "Image corrupt or truncated" even on HTTP 200. Fixed by no longer setting it manually and letting the runtime compute it from the final wire bytes.
- **Pinned DNS lookup didn't handle Node's Happy-Eyeballs callback shape** (`d1c59ea`), the root cause of every real external image failing as "corrupt or truncated" at HTTP 200. Node's http/https client invokes the `lookup` request option with `options.all: true` under Happy Eyeballs (the default for dual-stack hosts) and expects the callback to receive an address array, not a single `(address, family)` pair. The fetcher only supported the single-value shape, so the real request threw `ERR_INVALID_IP_ADDRESS` inside Node's own connect path before any bytes were read; that error was swallowed into a generic `fetch_failed` well before it reached the browser as a truncated image. This is why the disposable-stack verification above passed: it exercised the code path through injected test dependencies, never the real `defaultRequestHop` against a real dual-stack-resolving hostname over TLS. Fixed by extracting an exported `pinnedLookup()` that handles both callback shapes, with regression tests exercising it directly against both invocation forms (verified by temporarily reverting the fix and confirming the new test fails).
- **Delivery-tracking polled a 404 that could never resolve** (`e8e3219`), an unrelated pre-existing bug the operator also asked to be looked at while testing Phase 4. `DeliveryTracking` rendered under every open message unconditionally and polled `GET /api/mail/delivery` every 30 seconds regardless of the response; for any received (non-sent) message the endpoint always 404s, so opening such a message produced a recurring 404 in the console for as long as it stayed open. Fixed by stopping `refetchInterval` once a query returns no data.

All four fixes passed `npx tsc --noEmit` and the full `npx vitest run --maxWorkers=1 --no-file-parallelism` (40 files, 221 tests) before being deployed. After deployment, the operator confirmed both `cid:` and external images render correctly in production with no CSP, corrupt-image, or delivery-tracking errors in the browser console.

### Phase 4 decision

Phase 4 is complete as of 2026-07-19. Both feature flags (`HOMEMAIL_FEATURE_PROTECTED_MESSAGE_CONTENT`, `HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING`) are enabled in production, real `cid:` and external images render correctly through the hardened proxy, and the four production-only defects above are fixed and deployed. `HOMEMAIL_FEATURE_REMOTE_IMAGE_FETCHING=false` remains the no-redeploy emergency stop if a regression is found later. Phase 5 may begin behind its own disabled feature flags.
