# ADR 0007: Load external email images only through a hardened proxy

Status: Accepted

Date: 2026-07-18

## Context

HomeMail should display ordinary HTML email without leaving broken image markers or requiring a prominent manual-load banner. Direct browser requests to sender-controlled image URLs disclose the member's network address and reading activity and bypass HomeMail security controls.

An internal fetch endpoint introduces severe risks, including SSRF, DNS rebinding, access to instance metadata and private services, redirect bypasses, oversized responses, MIME confusion, cache poisoning, and resource exhaustion. The existing URL validator is not sufficient unchanged because it is IPv4-focused, can fail open on DNS errors, and does not pin resolved addresses or validate redirect chains.

## Decision

HTML email never loads external image URLs directly in the browser. Sanitized image sources are rewritten to authenticated, signed HomeMail resources backed by a dedicated hardened server fetcher. Inline `cid:` references resolve through authenticated internal attachment resources.

The proxy accepts only HTTP and HTTPS, validates IPv4 and IPv6 destinations, rejects non-public and metadata ranges, resolves DNS fail-closed, connects to the validated address, and revalidates every redirect hop. It enforces redirect, time, byte, concurrency, and rate limits; validates image MIME and content; forwards no user credentials or identifying request headers; and uses safe cache keys and cache headers.

Automatic external images remain disabled until the security suite and focused review pass. Failure renders a quiet placeholder and never falls back to the sender URL. The legacy opt-in banner is removed only after the protected path is ready.

## Consequences

### Positive

- HTML email displays images automatically without direct sender tracking requests from the browser.
- Inline attachments and external resources use explicit authenticated paths.
- Fetch policy, caching, limits, and logging are centralized and testable.

### Costs and risks

- The proxy becomes a high-risk network boundary and operational workload.
- Image fetching consumes HomeMail bandwidth, storage, DNS, and connection capacity.
- Some images may fail closed because of redirects, invalid MIME, private destinations, or configured limits.
- Security maintenance is ongoing as network and parser behavior evolves.

## Rejected alternatives

### Load sender URLs directly

Rejected because it exposes member network and read activity and provides no server-side fetch policy.

### Keep the current manual-load banner permanently

Rejected because the accepted product behavior is automatic images and the banner materially disrupts reading.

### Reuse the current URL validator unchanged

Rejected because it does not meet the required DNS, IPv6, redirect, and connection-pinning controls.

### Fall back to direct loading when the proxy fails

Rejected because failure must remain private and fail closed.
