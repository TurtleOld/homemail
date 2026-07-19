export interface OAuthDiscoveryResponse {
  issuer: string;
  device_authorization_endpoint?: string;
  token_endpoint: string;
  authorization_endpoint?: string;
  introspection_endpoint?: string;
  jwks_uri?: string;
  grant_types_supported?: string[];
  scopes_supported?: string[];
  response_types_supported?: string[];
}

export class OAuthDiscovery {
  private readonly discoveryUrl: string;
  private cachedDiscovery: OAuthDiscoveryResponse | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 3600000;

  constructor(discoveryUrl: string) {
    this.discoveryUrl = discoveryUrl.replace(/\/$/, '');
  }

  async discover(): Promise<OAuthDiscoveryResponse> {
    const now = Date.now();
    
    if (this.cachedDiscovery && this.cacheExpiry > now) {
      return this.cachedDiscovery;
    }

    try {
      const { logger } = await import('@/lib/logger');
      logger.info(`[OAuthDiscovery] Attempting discovery at: ${this.discoveryUrl}`);
      
      const response = await fetch(this.discoveryUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        logger.error(`[OAuthDiscovery] Discovery failed: ${response.status} ${response.statusText}, URL: ${this.discoveryUrl}, Response: ${errorText.substring(0, 200)}`);
        throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
      }

      let data = await response.json() as Partial<OAuthDiscoveryResponse>;

      if (!data.token_endpoint) {
        logger.error('[OAuthDiscovery] Discovery response missing token_endpoint', {
          url: this.discoveryUrl,
          keys: Object.keys(data),
        });
        throw new Error('Missing token_endpoint in discovery response');
      }
      if (!data.issuer) {
        const issuerFallback = process.env.STALWART_PUBLIC_URL || new URL(this.discoveryUrl).origin;
        logger.warn('[OAuthDiscovery] Discovery response missing issuer; using configured URL as issuer fallback', {
          url: this.discoveryUrl,
          issuerFallback,
          keys: Object.keys(data),
        });
        data.issuer = issuerFallback;
      }

      const publicUrl = process.env.STALWART_PUBLIC_URL;
      const endpointBaseUrl = publicUrl || data.issuer || new URL(this.discoveryUrl).origin;
      if (endpointBaseUrl) {
        const normalizeUrl = (url: string | undefined): string | undefined => {
          if (!url) return url;
          try {
            const urlObj = new URL(url, endpointBaseUrl);
            const isInternal = !urlObj.hostname.includes('.') ||
                              urlObj.hostname.includes('stalwart') || 
                              urlObj.hostname === 'localhost' || 
                              urlObj.hostname === '127.0.0.1' ||
                              /^\d+\.\d+\.\d+\.\d+$/.test(urlObj.hostname);
            
            if (isInternal) {
              const publicUrlObj = new URL(endpointBaseUrl);
              urlObj.hostname = publicUrlObj.hostname;
              urlObj.protocol = publicUrlObj.protocol;
              if (publicUrlObj.port && publicUrlObj.port !== '80' && publicUrlObj.port !== '443') {
                urlObj.port = publicUrlObj.port;
              } else if (urlObj.protocol === 'https:') {
                urlObj.port = '';
              }
              const normalized = urlObj.toString();
              logger.info(`[OAuthDiscovery] Normalized internal URL to public: ${url} -> ${normalized}`);
              return normalized;
            }

            if (url !== urlObj.toString()) {
              const normalized = urlObj.toString();
              logger.info(`[OAuthDiscovery] Resolved relative URL: ${url} -> ${normalized}`);
              return normalized;
            }
          } catch {
          }
          return url;
        };

        const normalizeIssuer = (issuer: string | undefined): string | undefined => {
          if (!issuer) return issuer;
          try {
            const issuerUrl = new URL(issuer);
            const isInternal = !issuerUrl.hostname.includes('.') ||
                              issuerUrl.hostname.includes('stalwart') ||
                              issuerUrl.hostname === 'localhost' ||
                              issuerUrl.hostname === '127.0.0.1' ||
                              /^\d+\.\d+\.\d+\.\d+$/.test(issuerUrl.hostname);

            return isInternal ? normalizeUrl(issuer) : issuer;
          } catch {
            return normalizeUrl(issuer) || issuer;
          }
        };

        data = {
          ...data,
          issuer: normalizeIssuer(data.issuer),
          device_authorization_endpoint: normalizeUrl(data.device_authorization_endpoint) || data.device_authorization_endpoint,
          token_endpoint: normalizeUrl(data.token_endpoint) || data.token_endpoint,
          authorization_endpoint: normalizeUrl(data.authorization_endpoint),
          introspection_endpoint: normalizeUrl(data.introspection_endpoint),
        };
      }

      const discovered = data as OAuthDiscoveryResponse;

      logger.info(`[OAuthDiscovery] Discovery successful, issuer: ${discovered.issuer}, device_endpoint: ${discovered.device_authorization_endpoint || 'not advertised'}`);

      this.cachedDiscovery = discovered;
      this.cacheExpiry = now + this.CACHE_TTL;

      return discovered;
    } catch (error) {
      const { logger } = await import('@/lib/logger');
      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        const cause = (error as any).cause;
        logger.error(`[OAuthDiscovery] Network error during discovery, URL: ${this.discoveryUrl}`, {
          message: error.message,
          cause: cause ? {
            code: cause.code,
            errno: cause.errno,
            syscall: cause.syscall,
            address: cause.address,
            port: cause.port,
          } : undefined,
        });
        throw new Error(`Network error during OAuth discovery: ${error.message}. URL: ${this.discoveryUrl}. Check that STALWART_PUBLIC_URL is set correctly and the discovery endpoint is accessible.`);
      }
      logger.error(`[OAuthDiscovery] Discovery error, URL: ${this.discoveryUrl}`, error);
      throw error;
    }
  }

  clearCache(): void {
    this.cachedDiscovery = null;
    this.cacheExpiry = 0;
  }
}
