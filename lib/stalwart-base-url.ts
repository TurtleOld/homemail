function isContainerHostname(hostname: string): boolean {
  return (
    !hostname.includes('.') ||
    hostname === 'stalwart' ||
    hostname === 'homemail-stalwart' ||
    hostname.startsWith('homemail-')
  );
}

function addLoopbackCandidates(candidates: Set<string>, baseUrl: URL): void {
  const localhostUrl = new URL(baseUrl.toString());
  localhostUrl.hostname = 'localhost';
  candidates.add(localhostUrl.toString().replace(/\/$/, ''));

  const loopbackUrl = new URL(baseUrl.toString());
  loopbackUrl.hostname = '127.0.0.1';
  candidates.add(loopbackUrl.toString().replace(/\/$/, ''));
}

export function getStalwartBaseUrlCandidates(): string[] {
  const configuredBaseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
  const candidates = new Set<string>();

  candidates.add(configuredBaseUrl.replace(/\/$/, ''));

  try {
    const baseUrl = new URL(configuredBaseUrl);
    const publicUrl = process.env.STALWART_PUBLIC_URL?.trim();

    if (publicUrl) {
      candidates.add(publicUrl.replace(/\/$/, ''));
    }

    if (isContainerHostname(baseUrl.hostname)) {
      addLoopbackCandidates(candidates, baseUrl);

      if (baseUrl.port === '8080') {
        const mappedPortUrl = new URL(baseUrl.toString());
        mappedPortUrl.port = '9080';
        addLoopbackCandidates(candidates, mappedPortUrl);
      }
    }
  } catch {
    // Ignore malformed URLs here; the client will surface the actual error later.
  }

  return Array.from(candidates);
}
