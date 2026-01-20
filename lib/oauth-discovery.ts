import * as dns from 'node:dns';
import { promisify } from 'node:util';

const lookup = promisify(dns.lookup);
const resolve4 = promisify(dns.resolve4);

export interface OAuthDiscoveryResponse {
  issuer: string;
  device_authorization_endpoint: string;
  token_endpoint: string;
  authorization_endpoint?: string;
  grant_types_supported?: string[];
  scopes_supported?: string[];
  response_types_supported?: string[];
}

function isDockerInternalIp(ip: string): boolean {
  return ip.startsWith('172.') || 
         ip.startsWith('10.') || 
         ip.startsWith('192.168.') ||
         ip.startsWith('169.254.');
}

function isAllowedHostIp(ip: string): boolean {
  const allowedNetworks = process.env.ALLOWED_DOCKER_NETWORKS
    ? process.env.ALLOWED_DOCKER_NETWORKS.split(',').map((n) => n.trim())
    : [];
  
  if (allowedNetworks.length === 0) {
    return false;
  }

  function ipToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return parts[0] * 256 ** 3 + parts[1] * 256 ** 2 + parts[2] * 256 + parts[3];
  }

  for (const network of allowedNetworks) {
    if (network.includes('/')) {
      const [networkIp, prefix] = network.split('/');
      const prefixLength = Number.parseInt(prefix, 10);
      const networkNum = ipToNumber(networkIp);
      const mask = (0xffffffff << (32 - prefixLength)) >>> 0;
      const ipNum = ipToNumber(ip);

      if ((networkNum & mask) === (ipNum & mask)) {
        return true;
      }
    } else if (ip.startsWith(network)) {
      return true;
    }
  }

  return false;
}

async function resolveHostnameToIp(hostname: string): Promise<string | null> {
  try {
    const ips = await resolve4(hostname);
    if (ips && ips.length > 0) {
      for (const ip of ips) {
        if (isDockerInternalIp(ip) || isAllowedHostIp(ip)) {
          return ip;
        }
      }
    }
  } catch {
  }
  
  try {
    const addresses = await lookup(hostname, { family: 4, all: true });
    if (addresses && addresses.length > 0) {
      for (const addr of addresses) {
        const ip = addr.address;
        if (isDockerInternalIp(ip) || isAllowedHostIp(ip)) {
          return ip;
        }
      }
    }
  } catch {
  }
  
  return null;
}

async function resolveUrlToIp(url: string): Promise<string> {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:86',message:'resolveUrlToIp entry',data:{url:url,hostname:hostname,port:urlObj.port},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && !isDockerInternalIp(hostname) && !isAllowedHostIp(hostname)) {
        throw new Error(`URL contains external IP address ${hostname}. This will not work for Docker container communication. Please use container hostname, internal IP, or add IP to ALLOWED_DOCKER_NETWORKS.`);
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:95',message:'resolveUrlToIp - localhost/IP path',data:{url:url,hostname:hostname,returning:url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      return url;
    }
    
    const isContainerName = !hostname.includes('.') || hostname === 'stalwart' || hostname === 'homemail-stalwart' || hostname.startsWith('homemail-');
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:100',message:'resolveUrlToIp - checking container name',data:{hostname:hostname,isContainerName:isContainerName,includesStalwart:hostname.includes('stalwart')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    if (isContainerName || hostname.includes('stalwart')) {
      const ip = await resolveHostnameToIp(hostname);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:103',message:'resolveUrlToIp - DNS resolution result',data:{hostname:hostname,resolvedIp:ip,isDockerInternal:ip?isDockerInternalIp(ip):false,isAllowedHost:ip?isAllowedHostIp(ip):false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      if (ip && (isDockerInternalIp(ip) || isAllowedHostIp(ip))) {
        urlObj.hostname = ip;
        const resolved = urlObj.toString();
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:106',message:'resolveUrlToIp - resolved to IP',data:{originalUrl:url,resolvedUrl:resolved,ip:ip},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        return resolved;
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:111',message:'resolveUrlToIp - returning original URL',data:{url:url,reason:'not container name or DNS resolution failed'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    return url;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:115',message:'resolveUrlToIp - error',data:{url:url,error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return url;
  }
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
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:153',message:'Discovery attempt started',data:{discoveryUrl:this.discoveryUrl,stalwartBaseUrl:process.env.STALWART_BASE_URL,stalwartPublicUrl:process.env.STALWART_PUBLIC_URL,oauthDiscoveryUrl:process.env.OAUTH_DISCOVERY_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
      // #endregion
      
      const resolvedUrl = await resolveUrlToIp(this.discoveryUrl);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:159',message:'URL resolved',data:{originalUrl:this.discoveryUrl,resolvedUrl:resolvedUrl,urlChanged:resolvedUrl!==this.discoveryUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      if (resolvedUrl !== this.discoveryUrl) {
        logger.info(`[OAuthDiscovery] Resolved discovery URL to IP: ${this.discoveryUrl} -> ${resolvedUrl}`);
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:165',message:'Before fetch request',data:{url:resolvedUrl,method:'GET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,D'})}).catch(()=>{});
      // #endregion
      
      const response = await fetch(resolvedUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:172',message:'After fetch request',data:{status:response.status,statusText:response.statusText,ok:response.ok,url:resolvedUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,D'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/fa9b7cc5-98e5-4a0a-936d-4178fa20d3d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-discovery.ts:175',message:'Discovery failed - 404 error',data:{status:response.status,statusText:response.statusText,url:resolvedUrl,originalUrl:this.discoveryUrl,errorText:errorText.substring(0,500),stalwartBaseUrl:process.env.STALWART_BASE_URL,networkMode:process.env.NETWORK_MODE},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,D,E'})}).catch(()=>{});
        // #endregion
        
        logger.error(`[OAuthDiscovery] Discovery failed: ${response.status} ${response.statusText}, URL: ${this.discoveryUrl}, Response: ${errorText.substring(0, 200)}`);
        throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
      }

      let data = await response.json() as OAuthDiscoveryResponse;

      if (!data.issuer) {
        throw new Error('Missing issuer in discovery response');
      }
      if (!data.device_authorization_endpoint) {
        throw new Error('Missing device_authorization_endpoint in discovery response');
      }
      if (!data.token_endpoint) {
        throw new Error('Missing token_endpoint in discovery response');
      }

      const publicUrl = process.env.STALWART_PUBLIC_URL;
      if (publicUrl) {
        const normalizeUrl = (url: string | undefined): string | undefined => {
          if (!url) return url;
          try {
            const urlObj = new URL(url);
            const isInternal = urlObj.hostname.includes('stalwart') || 
                              urlObj.hostname === 'localhost' || 
                              urlObj.hostname === '127.0.0.1' ||
                              /^\d+\.\d+\.\d+\.\d+$/.test(urlObj.hostname);
            
            if (isInternal) {
              const publicUrlObj = new URL(publicUrl);
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
          } catch {
          }
          return url;
        };

        data = {
          ...data,
          issuer: normalizeUrl(data.issuer) || data.issuer,
          device_authorization_endpoint: normalizeUrl(data.device_authorization_endpoint) || data.device_authorization_endpoint,
          token_endpoint: normalizeUrl(data.token_endpoint) || data.token_endpoint,
          authorization_endpoint: normalizeUrl(data.authorization_endpoint),
        };
      }

      logger.info(`[OAuthDiscovery] Discovery successful, issuer: ${data.issuer}, device_endpoint: ${data.device_authorization_endpoint}`);

      this.cachedDiscovery = data;
      this.cacheExpiry = now + this.CACHE_TTL;

      return data;
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