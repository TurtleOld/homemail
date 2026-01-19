export interface OAuthDiscoveryResponse {
  issuer: string;
  device_authorization_endpoint: string;
  token_endpoint: string;
  authorization_endpoint?: string;
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
      const response = await fetch(this.discoveryUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as OAuthDiscoveryResponse;

      if (!data.issuer) {
        throw new Error('Missing issuer in discovery response');
      }
      if (!data.device_authorization_endpoint) {
        throw new Error('Missing device_authorization_endpoint in discovery response');
      }
      if (!data.token_endpoint) {
        throw new Error('Missing token_endpoint in discovery response');
      }

      this.cachedDiscovery = data;
      this.cacheExpiry = now + this.CACHE_TTL;

      return data;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        throw new Error(`Network error during OAuth discovery: ${error.message}`);
      }
      throw error;
    }
  }

  clearCache(): void {
    this.cachedDiscovery = null;
    this.cacheExpiry = 0;
  }
}