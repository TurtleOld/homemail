import * as dns from 'node:dns';
import { promisify } from 'node:util';

const lookup = promisify(dns.lookup);
const resolve4 = promisify(dns.resolve4);

try {
  dns.setServers(['127.0.0.11', '8.8.8.8']);
} catch (error) {
  // use system default DNS if Docker DNS is unavailable
}

interface JMAPSession {
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl?: string;
  accounts: Record<string, JMAPAccount>;
  primaryAccounts: {
    mail?: string;
  };
  capabilities: {
    'urn:ietf:params:jmap:mail'?: {
      maxMailboxesPerEmail?: number;
      maxMailboxDepth?: number;
    };
    'urn:ietf:params:jmap:core'?: {
      maxObjectsInGet?: number;
      maxObjectsInSet?: number;
    };
  };
}

interface JMAPAccount {
  id: string;
  name: string;
  isPersonal: boolean;
  isReadOnly: boolean;
  accountCapabilities: Record<string, any>;
}

interface JMAPRequest {
  using: string[];
  methodCalls: Array<[string, Record<string, any>, string]>;
}

interface JMAPResponse {
  methodResponses: Array<[string, Record<string, any> | { type: string; description?: string }, string]>;
  sessionState?: string;
}

interface JMAPMailbox {
  id: string;
  name: string;
  parentId?: string;
  role?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'junk' | 'archive';
  sortOrder?: number;
  totalEmails?: number;
  unreadEmails?: number;
  totalThreads?: number;
  unreadThreads?: number;
  myRights?: {
    mayReadItems?: boolean;
    mayAddItems?: boolean;
    mayRemoveItems?: boolean;
  };
}

interface JMAPIdentity {
  id: string;
  name?: string;
  email: string;
}

interface JMAPEmail {
  id: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  size: number;
  receivedAt: string;
  hasAttachment: boolean;
  preview?: string;
  subject?: string;
  from?: Array<{ name?: string; email: string }>;
  to?: Array<{ name?: string; email: string }>;
  cc?: Array<{ name?: string; email: string }>;
  bcc?: Array<{ name?: string; email: string }>;
  bodyStructure?: any;
  bodyValues?: Record<string, { value: string; isEncodingProblem?: boolean; isTruncated?: boolean }>;
  textBody?: Array<{ partId: string; type: string }>;
  htmlBody?: Array<{ partId: string; type: string }>;
}

const sessionCache = new Map<string, { session: JMAPSession; expiresAt: number }>();
const SESSION_CACHE_TTL = 5 * 60 * 1000;

export class JMAPClient {
  private baseUrl: string;
  private authHeader: string;
  private accountId: string;
  private email: string;
  private password: string;

  constructor(
    baseUrl: string,
    email: string,
    password: string,
    accountId: string,
    authMode: 'basic' | 'bearer' = 'basic'
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.accountId = accountId;
    this.email = email;
    this.password = password;

    if (authMode === 'bearer') {
      this.authHeader = `Bearer ${password}`;
      return;
    }

    const credentials = Buffer.from(`${email}:${password}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  getAuthHeader(): string {
    return this.authHeader;
  }

  private isDockerInternalIp(ip: string): boolean {
    return ip.startsWith('172.') || 
           ip.startsWith('10.') || 
           ip.startsWith('192.168.') ||
           ip.startsWith('169.254.');
  }

  private isAllowedHostIp(ip: string): boolean {
    const allowedNetworks = process.env.ALLOWED_DOCKER_NETWORKS
      ? process.env.ALLOWED_DOCKER_NETWORKS.split(',').map((n) => n.trim())
      : [];
    
    if (allowedNetworks.length === 0) {
      return false;
    }

    for (const network of allowedNetworks) {
      if (network.includes('/')) {
        const [networkIp, prefix] = network.split('/');
        const prefixLength = Number.parseInt(prefix, 10);
        const networkNum = this.ipToNumber(networkIp);
        const mask = (0xffffffff << (32 - prefixLength)) >>> 0;
        const ipNum = this.ipToNumber(ip);

        if ((networkNum & mask) === (ipNum & mask)) {
          return true;
        }
      } else if (ip.startsWith(network)) {
        return true;
      }
    }

    return false;
  }

  private ipToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return parts[0] * 256 ** 3 + parts[1] * 256 ** 2 + parts[2] * 256 + parts[3];
  }

  private async resolveHostnameToIp(hostname: string): Promise<string | null> {
    console.log(`[JMAPClient] ===== Resolving ${hostname} =====`);
    console.log(`[JMAPClient] Current DNS servers:`, dns.getServers());
    
    try {
      console.log(`[JMAPClient] Attempting resolve4 through Docker DNS...`);
      const ips = await resolve4(hostname);
      if (ips && ips.length > 0) {
        for (const ip of ips) {
          console.log(`[JMAPClient] resolve4 result: ${ip}`);
          if (this.isDockerInternalIp(ip) || this.isAllowedHostIp(ip)) {
            const ipType = this.isDockerInternalIp(ip) ? 'Docker internal' : 'allowed host';
            console.log(`[JMAPClient] ✓ Found ${ipType} IP via resolve4: ${ip}`);
            return ip;
          } else {
            console.warn(`[JMAPClient] ✗ resolve4 returned external IP: ${ip}`);
          }
        }
      }
    } catch (resolveError) {
      console.warn(`[JMAPClient] resolve4 failed for ${hostname}:`, resolveError);
    }
    
    try {
      console.log(`[JMAPClient] Attempting lookup as fallback...`);
      const addresses = await lookup(hostname, { family: 4, all: true });
      if (addresses && addresses.length > 0) {
        for (const addr of addresses) {
          const ip = addr.address;
          console.log(`[JMAPClient] lookup result: ${ip}`);
          if (this.isDockerInternalIp(ip) || this.isAllowedHostIp(ip)) {
            const ipType = this.isDockerInternalIp(ip) ? 'Docker internal' : 'allowed host';
            console.log(`[JMAPClient] ✓ Found ${ipType} IP via lookup: ${ip}`);
            return ip;
          } else {
            console.warn(`[JMAPClient] ✗ lookup returned external IP: ${ip}`);
          }
        }
      }
    } catch (lookupError) {
      console.error(`[JMAPClient] lookup failed for ${hostname}:`, lookupError);
    }
    
    console.error(`[JMAPClient] ===== FAILED: Could not resolve ${hostname} to Docker internal or allowed host IP =====`);
    console.error(`[JMAPClient] All DNS resolutions returned external/public IPs or failed`);
    console.error(`[JMAPClient] This indicates Docker DNS is not working properly or IP is not in ALLOWED_DOCKER_NETWORKS`);
    console.error(`[JMAPClient] Possible solutions:`);
    console.error(`[JMAPClient] 1. Ensure containers are in the same Docker network`);
    console.error(`[JMAPClient] 2. Check /etc/resolv.conf in container (should contain 127.0.0.11)`);
    console.error(`[JMAPClient] 3. Use container IP directly in STALWART_BASE_URL`);
    console.error(`[JMAPClient] 4. Configure extra_hosts in docker-compose.yml`);
    console.error(`[JMAPClient] 5. Add IP to ALLOWED_DOCKER_NETWORKS if using network_mode: host`);
    
    return null;
  }

  private async resolveUrlToIp(url: string): Promise<string> {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && !this.isDockerInternalIp(hostname) && !this.isAllowedHostIp(hostname)) {
          throw new Error(`URL contains external IP address ${hostname}. This will not work for Docker container communication. Please use container hostname, internal IP, or add IP to ALLOWED_DOCKER_NETWORKS.`);
        }
        return url;
      }
      
      const isContainerName = !hostname.includes('.') || hostname === 'stalwart' || hostname === 'homemail-stalwart' || hostname.startsWith('homemail-');
      
      if (isContainerName) {
        console.log(`[JMAPClient] Hostname ${hostname} appears to be a container name, attempting DNS resolution...`);
        const ip = await this.resolveHostnameToIp(hostname);
        if (ip && (this.isDockerInternalIp(ip) || this.isAllowedHostIp(ip))) {
          urlObj.hostname = ip;
          const resolvedUrl = urlObj.toString();
          const ipType = this.isDockerInternalIp(ip) ? 'Docker internal' : 'allowed host';
          console.log(`[JMAPClient] ✓ Successfully resolved container name to ${ipType} IP: ${url} -> ${resolvedUrl}`);
          return resolvedUrl;
        } else {
          console.error(`[JMAPClient] ✗ CRITICAL: Container name ${hostname} resolved to external IP or failed`);
          console.error(`[JMAPClient] ✗ This means Docker DNS is not working - fetch will also fail`);
          console.error(`[JMAPClient] ✗ Solutions:`);
          console.error(`[JMAPClient] ✗ 1. Check that containers are in the same Docker network`);
          console.error(`[JMAPClient] ✗ 2. Verify /etc/resolv.conf contains 127.0.0.11`);
          console.error(`[JMAPClient] ✗ 3. Use container IP directly (get with: docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' homemail-stalwart)`);
          console.error(`[JMAPClient] ✗ 4. Configure extra_hosts in docker-compose.yml`);
          console.error(`[JMAPClient] ✗ 5. Add IP to ALLOWED_DOCKER_NETWORKS if using network_mode: host`);
          throw new Error(`Container name ${hostname} cannot be resolved to Docker internal or allowed host IP. Docker DNS is not working. Please check network configuration, use container IP directly, or add IP to ALLOWED_DOCKER_NETWORKS.`);
        }
      } else {
        console.warn(`[JMAPClient] ⚠ Hostname ${hostname} appears to be a domain name, not a container name`);
        console.warn(`[JMAPClient] ⚠ For Docker container communication, use container name (e.g., 'stalwart' or 'homemail-stalwart') instead of domain name`);
        const ip = await this.resolveHostnameToIp(hostname);
        if (ip && (this.isDockerInternalIp(ip) || this.isAllowedHostIp(ip))) {
          urlObj.hostname = ip;
          const resolvedUrl = urlObj.toString();
          const ipType = this.isDockerInternalIp(ip) ? 'Docker internal' : 'allowed host';
          console.log(`[JMAPClient] ✓ Resolved domain to ${ipType} IP: ${url} -> ${resolvedUrl}`);
          return resolvedUrl;
        } else {
          throw new Error(`Failed to resolve ${hostname} to Docker internal or allowed host IP. DNS is resolving to external IP (${ip || 'unknown'}), which indicates Docker DNS is not working or IP is not in ALLOWED_DOCKER_NETWORKS. Please use container name (e.g., 'stalwart' or 'homemail-stalwart') in STALWART_BASE_URL instead of domain name, or add IP to ALLOWED_DOCKER_NETWORKS.`);
        }
      }
    } catch (error) {
      console.error(`[JMAPClient] Error resolving URL ${url}:`, error);
      throw error;
    }
  }

  private normalizeSessionUrls(session: JMAPSession): JMAPSession {
    const baseUrlObj = new URL(this.baseUrl);
    const baseHostname = baseUrlObj.hostname;
    
    const rewrite = (raw?: string): string | undefined => {
      if (!raw) return raw;
      try {
        const u = new URL(raw);
        const urlHostname = u.hostname;
        const baseProtocol = baseUrlObj.protocol;
        
        if (u.protocol !== baseProtocol) {
          console.warn(`[JMAPClient] ⚠ Session URL uses ${u.protocol} but baseUrl uses ${baseProtocol}`);
          console.warn(`[JMAPClient] ⚠ Replacing protocol to match baseUrl for Docker container communication`);
          u.protocol = baseProtocol;
        }
        
        if (urlHostname === 'localhost' || urlHostname === '127.0.0.1') {
          console.log(`[JMAPClient] Normalizing localhost URL: ${raw} -> replacing hostname with ${baseHostname}`);
          u.hostname = baseHostname;
          u.port = baseUrlObj.port || u.port;
        } else if (urlHostname.includes('.') && urlHostname !== baseHostname) {
          console.warn(`[JMAPClient] ⚠ Session URL contains domain name (${urlHostname}) instead of container name (${baseHostname})`);
          console.warn(`[JMAPClient] ⚠ This happens when Stalwart server.hostname differs from STALWART_BASE_URL`);
          console.warn(`[JMAPClient] ⚠ Replacing domain hostname with container hostname for Docker communication`);
          u.hostname = baseHostname;
          u.port = baseUrlObj.port || u.port;
          console.log(`[JMAPClient] ✓ Normalized URL: ${raw} -> ${u.toString()}`);
        }
        
        return u.toString().replace(/\/$/, '');
      } catch {
        return raw;
      }
    };

    return {
      ...session,
      apiUrl: rewrite(session.apiUrl) || session.apiUrl,
      downloadUrl: rewrite(session.downloadUrl) || session.downloadUrl,
      uploadUrl: rewrite(session.uploadUrl) || session.uploadUrl,
      eventSourceUrl: rewrite(session.eventSourceUrl),
    };
  }

  async getSession(): Promise<JMAPSession> {
    const cacheKey = `${this.accountId}:${this.authHeader}`;
    const cached = sessionCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.session;
    }

    const baseUrlObj = new URL(this.baseUrl);
    const hostname = baseUrlObj.hostname;
    
    console.log(`[JMAPClient] ===== DNS Resolution Debug =====`);
    console.log(`[JMAPClient] Base URL: ${this.baseUrl}`);
    console.log(`[JMAPClient] Hostname to resolve: ${hostname}`);
    
    try {
      const addresses = await lookup(hostname, { family: 4, all: true });
      const resolvedIps = addresses.map((a: { address: string; family: number }) => `${a.address} (family: ${a.family})`).join(', ');
      console.log(`[JMAPClient] DNS lookup SUCCESS: ${hostname} resolved to: ${resolvedIps}`);
      
      const firstAddress = addresses[0]?.address;
      if (firstAddress && (firstAddress.startsWith('172.') || firstAddress.startsWith('10.') || firstAddress.startsWith('192.168.'))) {
        console.log(`[JMAPClient] ✓ Resolved to Docker internal IP: ${firstAddress}`);
      } else if (firstAddress) {
        console.error(`[JMAPClient] ✗ WARNING: Resolved to external/public IP: ${firstAddress}. This indicates DNS is using external resolver instead of Docker DNS!`);
        console.error(`[JMAPClient] ✗ Expected: Docker internal IP (172.x.x.x, 10.x.x.x, or 192.168.x.x)`);
        console.error(`[JMAPClient] ✗ Solution: Use container IP directly or configure extra_hosts in docker-compose.yml`);
      }
    } catch (dnsError) {
      console.error(`[JMAPClient] DNS lookup FAILED for ${hostname}:`, dnsError);
    }
    console.log(`[JMAPClient] =================================`);

    const directSessionUrl = `${this.baseUrl}/jmap/session`;
    console.log(`[JMAPClient] Attempting to connect to: ${directSessionUrl}`);
    
    const resolvedDirectUrl = await this.resolveUrlToIp(directSessionUrl);
    
    try {
      const directRes = await fetch(resolvedDirectUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': this.authHeader,
        },
        redirect: 'follow',
      });

      if (directRes.ok) {
        const directSession = this.normalizeSessionUrls((await directRes.json()) as JMAPSession);
        if (directSession.accounts && Object.keys(directSession.accounts).length > 0) {
          sessionCache.set(cacheKey, {
            session: directSession,
            expiresAt: Date.now() + SESSION_CACHE_TTL,
          });
          return directSession;
        }
      }
    } catch (error) {
      console.error(`[JMAPClient] Connection error to ${resolvedDirectUrl} (original: ${directSessionUrl}):`, error);
      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        const cause = (error as any).cause;
        if (cause) {
          console.error(`[JMAPClient] Fetch error cause:`, {
            code: cause.code,
            errno: cause.errno,
            syscall: cause.syscall,
            address: cause.address,
            port: cause.port,
          });
        }
      }
    }

    const discoveryUrl = `${this.baseUrl}/.well-known/jmap`;
    console.log(`[JMAPClient] Attempting discovery at: ${discoveryUrl}`);
    
    const resolvedDiscoveryUrl = await this.resolveUrlToIp(discoveryUrl);
    
    try {
      const authHeaderPreview = this.authHeader.substring(0, 20) + '...';
      console.log(`[JMAPClient] Discovery request with auth header: ${authHeaderPreview}`);
      
      const discoveryRes = await fetch(resolvedDiscoveryUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': this.authHeader,
        },
        redirect: 'follow',
      });

      if (!discoveryRes.ok) {
        const errorText = await discoveryRes.text().catch(() => '');
        console.error(`[JMAPClient] Discovery failed: ${discoveryRes.status} ${discoveryRes.statusText}, response: ${errorText.substring(0, 200)}`);
        throw new Error(`JMAP discovery failed: ${discoveryRes.status} ${discoveryRes.statusText}`);
      }

      let discovery;
      try {
        discovery = await discoveryRes.json();
      } catch (e) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to parse discovery JSON, using default path:', e);
        discovery = { apiUrl: `${this.baseUrl}/jmap` };
      }
      
      let sessionUrl = discovery.apiUrl || `${this.baseUrl}/jmap`;
      
      const baseUrlObj = new URL(this.baseUrl);
      const baseHostname = baseUrlObj.hostname;
      
      try {
        const discoveryUrlObj = new URL(sessionUrl);
        const discoveryHostname = discoveryUrlObj.hostname;
        const baseProtocol = baseUrlObj.protocol;
        
        if (discoveryUrlObj.protocol !== baseProtocol) {
          console.warn(`[JMAPClient] ⚠ Discovery returned URL with ${discoveryUrlObj.protocol} but baseUrl uses ${baseProtocol}`);
          console.warn(`[JMAPClient] ⚠ Replacing protocol to match baseUrl for Docker container communication`);
          discoveryUrlObj.protocol = baseProtocol;
        }
        
        if (discoveryHostname !== baseHostname && (discoveryHostname.includes('.') || discoveryHostname === 'localhost' || discoveryHostname === '127.0.0.1')) {
          console.warn(`[JMAPClient] ⚠ Discovery returned URL with different hostname: ${discoveryHostname} (expected: ${baseHostname})`);
          console.warn(`[JMAPClient] ⚠ Stalwart server.hostname (${discoveryHostname}) differs from STALWART_BASE_URL hostname (${baseHostname})`);
          console.warn(`[JMAPClient] ⚠ Replacing discovery hostname with baseUrl hostname for Docker container communication`);
          discoveryUrlObj.hostname = baseHostname;
          discoveryUrlObj.port = baseUrlObj.port || discoveryUrlObj.port;
          sessionUrl = discoveryUrlObj.toString();
          console.log(`[JMAPClient] ✓ Normalized sessionUrl: ${sessionUrl}`);
        } else if (discoveryUrlObj.protocol !== baseProtocol) {
          sessionUrl = discoveryUrlObj.toString();
          console.log(`[JMAPClient] ✓ Normalized sessionUrl protocol: ${sessionUrl}`);
        }
      } catch (urlError) {
        console.warn(`[JMAPClient] Could not parse discovery URL ${sessionUrl}, using as-is:`, urlError);
      }
      
      if (sessionUrl.endsWith('/')) {
        sessionUrl = sessionUrl.slice(0, -1);
      }
      
      console.log(`[JMAPClient] Attempting session request to: ${sessionUrl}`);
      const resolvedSessionUrl = await this.resolveUrlToIp(sessionUrl);
      const sessionRes = await fetch(resolvedSessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
        body: JSON.stringify({
          using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
          methodCalls: [['Session/get', {}, '0']],
        }),
      });

      if (!sessionRes.ok) {
        throw new Error(`JMAP session failed: ${sessionRes.status} ${sessionRes.statusText}`);
      }

      const sessionData: JMAPResponse = await sessionRes.json();
      
      if (!sessionData.methodResponses || sessionData.methodResponses.length === 0) {
        throw new Error('Empty JMAP session response');
      }
      
      const sessionResponse = sessionData.methodResponses[0];

      if (sessionResponse[0] !== 'Session/get') {
        throw new Error(`Invalid session response: expected Session/get, got ${sessionResponse[0]}`);
      }

      if ('type' in sessionResponse[1] && sessionResponse[1].type === 'error') {
        const errorDesc = (sessionResponse[1] as any).description || 'Unknown error';
        throw new Error(`JMAP session error: ${errorDesc}`);
      }

      const session = this.normalizeSessionUrls(sessionResponse[1] as JMAPSession);
      
      if (!session.accounts || Object.keys(session.accounts).length === 0) {
        throw new Error('No accounts found in JMAP session. User may need mail access configured.');
      }
      
      sessionCache.set(cacheKey, {
        session,
        expiresAt: Date.now() + SESSION_CACHE_TTL,
      });

      return session;
    } catch (error) {
      console.error(`[JMAPClient] Error in getSession for baseUrl ${this.baseUrl}:`, error);
      
      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        const cause = (error as any).cause;
        if (cause) {
          console.error(`[JMAPClient] Fetch error details:`, {
            code: cause.code,
            errno: cause.errno,
            syscall: cause.syscall,
            address: cause.address,
            port: cause.port,
            message: cause.message,
          });
          
          if (cause.code === 'ECONNREFUSED') {
            throw new Error(`Cannot connect to Stalwart server at ${this.baseUrl}. Please check that Stalwart is running and STALWART_BASE_URL is correct. DNS resolved to: ${cause.address}:${cause.port}`);
          }
          
          if (cause.code === 'ENOTFOUND' || cause.code === 'EAI_AGAIN') {
            throw new Error(`DNS resolution failed for ${this.baseUrl}. Hostname ${new URL(this.baseUrl).hostname} could not be resolved. Please check network configuration and ensure containers are in the same Docker network.`);
          }
        }
      }
      throw error;
    }
  }

  async request(methodCalls: Array<[string, Record<string, any>, string]>): Promise<JMAPResponse> {
    const session = await this.getSession();
    const apiUrl = session.apiUrl || `${this.baseUrl}/jmap`;

    const using = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];
    const request: JMAPRequest = {
      using,
      methodCalls,
    };

    const resolvedApiUrl = await this.resolveUrlToIp(apiUrl);
    const response = await fetch(resolvedApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authHeader,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`JMAP request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async requestWithUsing(
    methodCalls: Array<[string, Record<string, any>, string]>,
    using: string[]
  ): Promise<JMAPResponse> {
    const session = await this.getSession();
    const apiUrl = session.apiUrl || `${this.baseUrl}/jmap`;

    const request: JMAPRequest = {
      using,
      methodCalls,
    };

    const requestBody = JSON.stringify(request);
    
    if (methodCalls[0]?.[0] === 'Identity/get') {
      console.log('[JMAPClient] Identity/get request body:', requestBody);
      console.log('[JMAPClient] Request structure:', JSON.stringify(request, null, 2));
    }

    const resolvedApiUrl = await this.resolveUrlToIp(apiUrl);
    const response = await fetch(resolvedApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authHeader,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[JMAPClient] Request failed:', {
        status: response.status,
        statusText: response.statusText,
        url: resolvedApiUrl,
        methodCalls: methodCalls.map(m => m[0]),
        errorBody: errorText,
      });
      throw new Error(`JMAP request failed: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json();
    
    if (methodCalls[0]?.[0] === 'Identity/get') {
      console.log('[JMAPClient] Identity/get response:', JSON.stringify(jsonResponse, null, 2));
    }
    
    return jsonResponse;
  }

  async getMailboxes(accountId?: string): Promise<JMAPMailbox[]> {
    const targetAccountId = accountId || this.accountId;
    const response = await this.request([
      [
        'Mailbox/get',
        {
          accountId: targetAccountId,
        },
        '0',
      ],
    ]);

    const mailboxResponse = response.methodResponses[0];
    if (mailboxResponse[0] !== 'Mailbox/get') {
      throw new Error('Invalid mailbox response');
    }

    if ('type' in mailboxResponse[1] && mailboxResponse[1].type === 'error') {
      throw new Error(`JMAP mailbox error: ${(mailboxResponse[1] as any).description}`);
    }

    const data = mailboxResponse[1] as { list: JMAPMailbox[] };
    return data.list || [];
  }

  async getIdentities(accountId?: string): Promise<JMAPIdentity[]> {
    const session = await this.getSession();
    
    let targetAccountId: string;
    if (accountId) {
      targetAccountId = accountId;
    } else {
      if (session.primaryAccounts?.mail) {
        targetAccountId = session.primaryAccounts.mail;
      } else {
        const accountKeys = Object.keys(session.accounts);
        if (accountKeys.length > 0) {
          targetAccountId = accountKeys[0];
        } else {
          throw new Error('No account found in session');
        }
      }
    }
    
    if (!targetAccountId || typeof targetAccountId !== 'string') {
      throw new Error(`Invalid accountId: ${targetAccountId}`);
    }
    
    const requestBody = {
      accountId: targetAccountId,
    };
    
    console.log('[JMAPClient] Identity/get request:', {
      accountId: targetAccountId,
      accountIdType: typeof targetAccountId,
      accountIdLength: targetAccountId.length,
      requestBody: JSON.stringify(requestBody, null, 2),
    });
    
    const response = await this.requestWithUsing(
      [
        [
          'Identity/get',
          requestBody,
          '0',
        ],
      ],
      ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:submission']
    );

    if (!response || !response.methodResponses) {
      console.error('[JMAPClient] Invalid response structure:', JSON.stringify(response, null, 2));
      throw new Error('Invalid identity response: missing methodResponses');
    }

    if (!Array.isArray(response.methodResponses) || response.methodResponses.length === 0) {
      console.error('[JMAPClient] Empty methodResponses:', JSON.stringify(response, null, 2));
      throw new Error('Invalid identity response: empty methodResponses');
    }

    const identityResponse = response.methodResponses[0];
    if (!identityResponse || !Array.isArray(identityResponse)) {
      console.error('[JMAPClient] Invalid identityResponse structure:', JSON.stringify(identityResponse, null, 2));
      throw new Error(`Invalid identity response: unexpected response structure. Got: ${JSON.stringify(identityResponse)}`);
    }

    if (identityResponse[0] === 'error') {
      const errorData = identityResponse[1] as { type?: string; description?: string };
      const errorType = errorData?.type || 'unknown';
      const errorDesc = errorData?.description || 'Unknown error';
      console.error('[JMAPClient] Identity/get server error:', {
        type: errorType,
        description: errorDesc,
        fullResponse: JSON.stringify(identityResponse, null, 2),
      });
      throw new Error(`JMAP identity error (${errorType}): ${errorDesc}`);
    }

    if (identityResponse[0] !== 'Identity/get') {
      console.error('[JMAPClient] Unexpected method name:', identityResponse[0], 'Expected: Identity/get');
      console.error('[JMAPClient] Full response:', JSON.stringify(response, null, 2));
      throw new Error(`Invalid identity response: expected 'Identity/get', got '${identityResponse[0]}'`);
    }

    if ('type' in identityResponse[1] && identityResponse[1].type === 'error') {
      const errorDesc = (identityResponse[1] as any).description || 'Unknown error';
      console.error('[JMAPClient] Identity/get error:', errorDesc);
      throw new Error(`JMAP identity error: ${errorDesc}`);
    }

    const data = identityResponse[1] as { list: JMAPIdentity[] };
    if (!data || typeof data !== 'object') {
      console.error('[JMAPClient] Invalid data structure:', JSON.stringify(identityResponse[1], null, 2));
      throw new Error('Invalid identity response: missing or invalid data');
    }

    return data.list || [];
  }

  async setIdentities(
    identities: Array<{ email: string; name?: string }>,
    accountId?: string
  ): Promise<{ created?: Record<string, JMAPIdentity>; updated?: Record<string, JMAPIdentity>; notCreated?: Record<string, any>; notUpdated?: Record<string, any> }> {
    const targetAccountId = accountId || this.accountId;
    
    const existingIdentities = await this.getIdentities(targetAccountId);
    const existingEmails = new Set(existingIdentities.map((id) => id.email));
    
    const create: Record<string, { email: string; name?: string }> = {};
    const update: Record<string, { email: string; name?: string }> = {};
    
    for (const identity of identities) {
      const existing = existingIdentities.find((id) => id.email === identity.email);
      if (existing) {
        update[existing.id] = { email: identity.email, name: identity.name };
      } else {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        create[tempId] = { email: identity.email, name: identity.name };
      }
    }
    
    const requestBody: any = {
      accountId: targetAccountId,
    };
    
    if (Object.keys(create).length > 0) {
      requestBody.create = create;
    }
    if (Object.keys(update).length > 0) {
      requestBody.update = update;
    }
    
    if (Object.keys(create).length === 0 && Object.keys(update).length === 0) {
      return { created: {}, updated: {} };
    }
    
    const response = await this.requestWithUsing(
      [
        [
          'Identity/set',
          requestBody,
          '0',
        ],
      ],
      ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:submission']
    );

    const setResponse = response.methodResponses[0];
    if (setResponse[0] !== 'Identity/set') {
      throw new Error('Invalid identity set response');
    }

    if ('type' in setResponse[1] && setResponse[1].type === 'error') {
      const errorDesc = (setResponse[1] as any).description || 'Unknown error';
      throw new Error(`JMAP identity set error: ${errorDesc}`);
    }

    const data = setResponse[1] as {
      created?: Record<string, JMAPIdentity>;
      updated?: Record<string, JMAPIdentity>;
      notCreated?: Record<string, any>;
      notUpdated?: Record<string, any>;
    };
    
    return {
      created: data.created || {},
      updated: data.updated || {},
      notCreated: data.notCreated,
      notUpdated: data.notUpdated,
    };
  }

  async queryEmails(
    mailboxId: string,
    options: {
      accountId?: string;
      position?: number;
      limit?: number;
      filter?: {
        inMailbox?: string;
        text?: string;
        hasAttachment?: boolean;
        isUnread?: boolean;
        isFlagged?: boolean;
        from?: string;
        to?: string;
        cc?: string;
        bcc?: string;
        subject?: string;
        header?: string[];
        after?: string;
        before?: string;
        minSize?: number;
        maxSize?: number;
      };
      sort?: Array<{ property: string; isAscending?: boolean }>;
    }
  ): Promise<{ ids: string[]; position: number; total?: number; queryState?: string }> {
    const targetAccountId = options.accountId || this.accountId;
    const finalFilter = options.filter || { inMailbox: mailboxId };
    
    console.error('[JMAPClient] queryEmails called:', {
      mailboxId,
      accountId: targetAccountId,
      filter: JSON.stringify(finalFilter, null, 2),
      position: options.position,
      limit: options.limit,
    });
    
    const response = await this.request([
      [
        'Email/query',
        {
          accountId: targetAccountId,
          filter: finalFilter,
          sort: options.sort || [{ property: 'receivedAt', isAscending: false }],
          position: options.position || 0,
          limit: options.limit || 50,
        },
        '0',
      ],
    ]);

    const queryResponse = response.methodResponses[0];
    if (queryResponse[0] !== 'Email/query') {
      throw new Error('Invalid email query response');
    }

    if ('type' in queryResponse[1] && queryResponse[1].type === 'error') {
      const errorDesc = (queryResponse[1] as any).description || 'Unknown error';
      console.error('[JMAPClient] Email/query error:', errorDesc);
      throw new Error(`JMAP email query error: ${errorDesc}`);
    }

    const result = queryResponse[1] as { ids: string[]; position: number; total?: number; queryState?: string };
    console.error('[JMAPClient] Email/query result:', {
      idsCount: result.ids?.length || 0,
      total: result.total,
      position: result.position,
      firstFewIds: result.ids?.slice(0, 5),
    });
    
    return result;
  }

  async getEmails(
    ids: string[],
    options?: {
      accountId?: string;
      properties?: string[];
      fetchTextBodyValues?: boolean;
      fetchHTMLBodyValues?: boolean;
    }
  ): Promise<JMAPEmail[]> {
    if (ids.length === 0) {
      return [];
    }

    const BATCH_SIZE = 500;
    const allEmails: JMAPEmail[] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);
      const targetAccountId = options?.accountId || this.accountId;
      const properties = options?.properties;
      const requestBody: any = {
        accountId: targetAccountId,
        ids: batchIds,
        properties: properties || [
          'id',
          'threadId',
          'mailboxIds',
          'keywords',
          'size',
          'receivedAt',
          'hasAttachment',
          'preview',
          'subject',
          'from',
          'to',
          'cc',
          'bcc',
          'bodyStructure',
          'bodyValues',
          'textBody',
          'htmlBody',
        ],
      };

      if (options?.fetchTextBodyValues !== undefined) {
        requestBody.fetchTextBodyValues = options.fetchTextBodyValues;
      }
      if (options?.fetchHTMLBodyValues !== undefined) {
        requestBody.fetchHTMLBodyValues = options.fetchHTMLBodyValues;
      }

      const response = await this.request([
        [
          'Email/get',
          requestBody,
          '0',
        ],
      ]);

      if (!response || !response.methodResponses || response.methodResponses.length === 0) {
        console.error('[JMAPClient] Invalid response structure:', JSON.stringify(response, null, 2));
        throw new Error('Invalid email get response: missing methodResponses');
      }

      const getResponse = response.methodResponses[0];
      if (!Array.isArray(getResponse) || getResponse.length < 2) {
        console.error('[JMAPClient] Invalid getResponse structure:', JSON.stringify(getResponse, null, 2));
        throw new Error('Invalid email get response: unexpected response structure');
      }

      if (getResponse[0] !== 'Email/get') {
        console.error('[JMAPClient] Unexpected method name:', getResponse[0], 'Expected: Email/get');
        console.error('[JMAPClient] Full response:', JSON.stringify(response, null, 2));
        throw new Error(`Invalid email get response: expected 'Email/get', got '${getResponse[0]}'`);
      }

      if ('type' in getResponse[1] && getResponse[1].type === 'error') {
        const errorDesc = (getResponse[1] as any).description || 'Unknown error';
        console.error('[JMAPClient] Email/get error:', errorDesc);
        throw new Error(`JMAP email get error: ${errorDesc}`);
      }

      const data = getResponse[1] as { list: JMAPEmail[] };
      if (!data || typeof data !== 'object') {
        console.error('[JMAPClient] Invalid data structure:', JSON.stringify(getResponse[1], null, 2));
        throw new Error('Invalid email get response: missing or invalid data');
      }

      allEmails.push(...(data.list || []));
    }

    return allEmails;
  }

  async setEmailFlags(
    emailId: string,
    flags: {
      accountId?: string;
      keywords?: Record<string, boolean>;
      mailboxIds?: Record<string, boolean>;
    }
  ): Promise<void> {
    const targetAccountId = flags.accountId || this.accountId;
    const { accountId: _, ...flagsData } = flags;
    const response = await this.request([
      [
        'Email/set',
        {
          accountId: targetAccountId,
          update: {
            [emailId]: flagsData,
          },
        },
        '0',
      ],
    ]);

    const setResponse = response.methodResponses[0];
    if (setResponse[0] !== 'Email/set') {
      throw new Error('Invalid email set response');
    }

    if ('type' in setResponse[1] && setResponse[1].type === 'error') {
      throw new Error(`JMAP email set error: ${(setResponse[1] as any).description}`);
    }
  }

  async bulkSetEmails(
    updates: Record<string, { keywords?: Record<string, boolean>; mailboxIds?: Record<string, boolean> }>,
    accountId?: string
  ): Promise<void> {
    const targetAccountId = accountId || this.accountId;
    const response = await this.request([
      [
        'Email/set',
        {
          accountId: targetAccountId,
          update: updates,
        },
        '0',
      ],
    ]);

    const setResponse = response.methodResponses[0];
    if (setResponse[0] !== 'Email/set') {
      throw new Error('Invalid email set response');
    }

    if ('type' in setResponse[1] && setResponse[1].type === 'error') {
      throw new Error(`JMAP email set error: ${(setResponse[1] as any).description}`);
    }
  }

  async destroyEmails(emailIds: string[], accountId?: string): Promise<void> {
    const targetAccountId = accountId || this.accountId;
    const response = await this.request([
      [
        'Email/set',
        {
          accountId: targetAccountId,
          destroy: emailIds,
        },
        '0',
      ],
    ]);

    const setResponse = response.methodResponses[0];
    if (setResponse[0] !== 'Email/set') {
      throw new Error('Invalid email destroy response');
    }

    if ('type' in setResponse[1] && setResponse[1].type === 'error') {
      throw new Error(`JMAP email destroy error: ${(setResponse[1] as any).description}`);
    }
  }

  async getBlobDownloadUrl(blobId: string, accountId: string, name?: string): Promise<string> {
    const session = await this.getSession();
    const downloadUrl = session.downloadUrl || `${this.baseUrl}/jmap/download/{accountId}/{blobId}/{name}`;
    // Stalwart may return URL-encoded placeholders (%7BaccountId%7D etc.) — decode before replacing
    return downloadUrl
      .replace(/%7BaccountId%7D/gi, accountId)
      .replace('{accountId}', accountId)
      .replace(/%7BblobId%7D/gi, blobId)
      .replace('{blobId}', blobId)
      .replace(/%7Bname%7D/gi, name || 'attachment')
      .replace('{name}', name || 'attachment');
  }

  async uploadBlob(blob: Buffer, accountId?: string, contentType?: string): Promise<string> {
    const targetAccountId = accountId || this.accountId;
    const session = await this.getSession();
    const rawUploadUrl = session.uploadUrl || `${this.baseUrl}/jmap/upload/{accountId}/`;
    // Stalwart may return URL-encoded placeholders (%7BaccountId%7D) — decode before replacing
    const resolvedUploadUrl = rawUploadUrl
      .replace(/%7BaccountId%7D/gi, targetAccountId)
      .replace('{accountId}', targetAccountId);

    console.log('[JMAPClient] uploadBlob:', {
      rawUploadUrl,
      resolvedUploadUrl,
      accountId: targetAccountId,
      contentType,
      size: blob.length,
    });

    const resolvedUrl = await this.resolveUrlToIp(resolvedUploadUrl);
    const headers: Record<string, string> = {
      'Authorization': this.authHeader,
    };
    
    if (contentType) {
      headers['Content-Type'] = contentType;
    } else {
      headers['Content-Type'] = 'application/octet-stream';
    }
    
    const response = await fetch(resolvedUrl, {
      method: 'POST',
      headers,
      body: new Uint8Array(blob),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[JMAPClient] uploadBlob failed:', {
        status: response.status,
        statusText: response.statusText,
        url: resolvedUrl,
        errorText,
      });
      throw new Error(`Blob upload failed: ${response.statusText} - ${errorText}`);
    }

    const uploadData = await response.json();
    if (!uploadData || !uploadData.blobId) {
      throw new Error('Invalid blob upload response');
    }

    return uploadData.blobId;
  }

  async sendEmail(
    emailId: string,
    accountId?: string,
    identityId?: string
  ): Promise<string> {
    const targetAccountId = accountId || this.accountId;
    const session = await this.getSession();
    
    let actualIdentityId = identityId;
    if (!actualIdentityId) {
      const identities = await this.getIdentities(targetAccountId);
      if (identities.length === 0) {
        throw new Error('No identity found for account');
      }
      actualIdentityId = identities[0].id;
    }

    const response = await this.requestWithUsing(
      [
        [
          'EmailSubmission/set',
          {
            accountId: targetAccountId,
            create: {
              submission1: {
                emailId,
                identityId: actualIdentityId,
                envelope: null,
              },
            },
          },
          '0',
        ],
      ],
      ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']
    );

    const submissionResponse = response.methodResponses[0];
    if (submissionResponse[0] !== 'EmailSubmission/set') {
      throw new Error('Invalid email submission response');
    }

    if ('type' in submissionResponse[1] && submissionResponse[1].type === 'error') {
      const errorDesc = (submissionResponse[1] as any).description || 'Unknown error';
      throw new Error(`JMAP email submission error: ${errorDesc}`);
    }

    const data = submissionResponse[1] as { created?: Record<string, { id: string }> };
    if (!data.created || Object.keys(data.created).length === 0) {
      throw new Error('Failed to create email submission');
    }

    return Object.values(data.created)[0].id;
  }

  // ── Sieve (RFC 9661) ──────────────────────────────────────────────────────

  private readonly SIEVE_USING = [
    'urn:ietf:params:jmap:core',
    'urn:ietf:params:jmap:sieve',
  ];

  async getSieveScripts(accountId?: string): Promise<Array<{
    id: string;
    name: string | null;
    blobId: string;
    isActive: boolean;
  }>> {
    const targetAccountId = accountId || this.accountId;
    const response = await this.requestWithUsing(
      [['SieveScript/get', { accountId: targetAccountId, ids: null }, '0']],
      this.SIEVE_USING
    );
    const res = response.methodResponses[0];
    if (res[0] === 'error') {
      throw new Error(`SieveScript/get error: ${(res[1] as any).description || 'unknown'}`);
    }
    const data = res[1] as { list: Array<{ id: string; name: string | null; blobId: string; isActive: boolean }> };
    return data.list || [];
  }

  async getSieveScriptContent(blobId: string, accountId?: string): Promise<string> {
    const targetAccountId = accountId || this.accountId;
    const url = await this.getBlobDownloadUrl(blobId, targetAccountId, 'script.sieve');
    const resolvedUrl = await this.resolveUrlToIp(url);
    const res = await fetch(resolvedUrl, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new Error(`Failed to download Sieve script blob: ${res.statusText}`);
    }
    return res.text();
  }

  async setSieveScript(params: {
    accountId?: string;
    existingId?: string;
    name: string | null;
    content: string;
    activate?: boolean;
  }): Promise<{ id: string; blobId: string }> {
    const targetAccountId = params.accountId || this.accountId;

    // RFC 9661: blobId is mandatory — upload content as blob first
    const blobId = await this.uploadBlob(
      Buffer.from(params.content, 'utf-8'),
      targetAccountId,
      'application/sieve'
    );

    const scriptProps = { name: params.name, blobId };
    const tempKey = 'script0';

    const requestBody: Record<string, any> = { accountId: targetAccountId };

    if (params.existingId) {
      requestBody.update = { [params.existingId]: scriptProps };
      if (params.activate === true) {
        requestBody.onSuccessActivateScript = params.existingId;
      } else if (params.activate === false) {
        // Explicitly deactivate: null deactivates whichever script is currently active
        requestBody.onSuccessActivateScript = null;
      }
    } else {
      requestBody.create = { [tempKey]: scriptProps };
      if (params.activate === true) {
        requestBody.onSuccessActivateScript = `#${tempKey}`;
      } else if (params.activate === false) {
        requestBody.onSuccessActivateScript = null;
      }
    }

    const response = await this.requestWithUsing(
      [['SieveScript/set', requestBody, '0']],
      this.SIEVE_USING
    );
    const res = response.methodResponses[0];
    if (res[0] === 'error') {
      throw new Error(`SieveScript/set error: ${(res[1] as any).description || 'unknown'}`);
    }
    const data = res[1] as {
      created?: Record<string, { id: string; blobId: string }>;
      updated?: Record<string, null>;
      notCreated?: Record<string, any>;
      notUpdated?: Record<string, any>;
    };

    if (params.existingId) {
      if (data.notUpdated?.[params.existingId]) {
        throw new Error(`SieveScript/set update failed: ${JSON.stringify(data.notUpdated[params.existingId])}`);
      }
      return { id: params.existingId, blobId };
    }

    const created = data.created?.[tempKey];
    if (!created) {
      const err = data.notCreated?.[tempKey];
      throw new Error(`SieveScript/set create failed: ${err ? JSON.stringify(err) : 'unknown'}`);
    }
    return { id: created.id, blobId };
  }

  async deleteSieveScript(id: string, accountId?: string): Promise<void> {
    const targetAccountId = accountId || this.accountId;

    // RFC 9661: an active script cannot be destroyed. Deactivate it first by
    // setting onSuccessActivateScript to null (which deactivates all scripts),
    // then destroy in the same request using a two-call JMAP batch.
    // We use two separate requests to keep error handling simple.

    // Step 1: deactivate (no-op if already inactive)
    await this.requestWithUsing(
      [['SieveScript/set', { accountId: targetAccountId, onSuccessActivateScript: null }, '0']],
      this.SIEVE_USING
    ).catch(() => {
      // Best-effort; ignore if deactivation fails (script may already be inactive)
    });

    // Step 2: destroy
    const response = await this.requestWithUsing(
      [['SieveScript/set', { accountId: targetAccountId, destroy: [id] }, '0']],
      this.SIEVE_USING
    );
    const res = response.methodResponses[0];
    if (res[0] === 'error') {
      throw new Error(`SieveScript/set destroy error: ${(res[1] as any).description || 'unknown'}`);
    }
    const data = res[1] as { notDestroyed?: Record<string, any> };
    if (data.notDestroyed?.[id]) {
      throw new Error(`SieveScript destroy failed: ${JSON.stringify(data.notDestroyed[id])}`);
    }
  }

  async validateSieveScript(content: string, accountId?: string): Promise<{ valid: boolean; error?: string }> {
    const targetAccountId = accountId || this.accountId;

    // Upload as blob first (validate endpoint requires blobId too)
    const blobId = await this.uploadBlob(
      Buffer.from(content, 'utf-8'),
      targetAccountId,
      'application/sieve'
    );

    const response = await this.requestWithUsing(
      [['SieveScript/validate', { accountId: targetAccountId, blobId }, '0']],
      this.SIEVE_USING
    );
    const res = response.methodResponses[0];

    if (res[0] === 'error') {
      const errData = res[1] as { type?: string; description?: string };
      // A parse error from validate is a validation failure, not a protocol error
      if (errData.type === 'invalidScript' || errData.type === 'invalidArguments') {
        return { valid: false, error: errData.description || 'Invalid script' };
      }
      throw new Error(`SieveScript/validate error: ${errData.description || 'unknown'}`);
    }

    // SieveScript/validate returns empty object on success
    return { valid: true };
  }
}
