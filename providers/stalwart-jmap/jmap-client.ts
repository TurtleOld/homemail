import * as dns from 'node:dns';
import { promisify } from 'node:util';
import { logger } from '@/lib/logger';
import { SendUnknownError } from '../mail-provider';

const lookup = promisify(dns.lookup);
const resolve4 = promisify(dns.resolve4);

try {
  dns.setServers(['127.0.0.11', '8.8.8.8']);
} catch (error) {
  // use system default DNS if Docker DNS is unavailable
}

// Module-level DNS resolution cache (TTL: 60 seconds)
const dnsCache = new Map<string, { resolved: string; expiresAt: number }>();
const DNS_CACHE_TTL_MS = 60_000;

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
  methodResponses: Array<
    [string, Record<string, any> | { type: string; description?: string }, string]
  >;
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
  blobId?: string;
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
  messageId?: string[];
  inReplyTo?: string[];
  references?: string[];
  bodyStructure?: any;
  bodyValues?: Record<
    string,
    { value: string; isEncodingProblem?: boolean; isTruncated?: boolean }
  >;
  textBody?: Array<{ partId: string; type: string }>;
  htmlBody?: Array<{ partId: string; type: string }>;
}

interface JMAPThread {
  id: string;
  emailIds: string[];
}

const sessionCache = new Map<
  string,
  { session: JMAPSession; expiresAt: number; authHeader: string }
>();
const SESSION_CACHE_TTL = 5 * 60 * 1000;

/**
 * Returns how many JMAP sessions are currently cached.
 *
 * Tests use this to verify that a refreshed OAuth access token replaces an
 * account's cache entry instead of accumulating stale ones.
 */
export function getJmapSessionCacheSize(): number {
  return sessionCache.size;
}

/**
 * Throws when Email/set rejected individual messages.
 *
 * Email/set resolves without a top-level error even when the server refuses
 * some messages (e.g. a Junk move or a destroy), so without this check the
 * client reports success while the message stays where it was.
 *
 * Args:
 *   data: The `Email/set` method response arguments.
 *   field: The rejection map to inspect, `notUpdated` or `notDestroyed`.
 *
 * Raises:
 *   Error: The server rejected one or more messages; the message names the
 *     count and the first rejected id.
 */
function throwIfEmailsRejected(data: unknown, field: 'notUpdated' | 'notDestroyed'): void {
  const rejected = (data as { [key: string]: Record<string, any> | undefined } | undefined)?.[
    field
  ];
  if (!rejected) return;
  const failedIds = Object.keys(rejected);
  if (failedIds.length === 0) return;
  const [firstId] = failedIds;
  const action = field === 'notDestroyed' ? 'destroy' : 'update';
  throw new Error(
    `JMAP email set error: server rejected the ${action} of ${failedIds.length} message(s) (e.g. ${firstId}: ${JSON.stringify(rejected[firstId])})`
  );
}

/**
 * Throws when a JMAP method response reports an error.
 *
 * JMAP signals a failed method as `["error", { type, description }, callId]`
 * rather than as a payload with `type: "error"`, so only the method name tells
 * a caller that the server rejected the request.
 *
 * Args:
 *   response: The parsed JMAP response to inspect.
 *
 * Raises:
 *   Error: The first method-level error, carrying the server-provided type
 *     and description.
 */
function throwIfMethodError(response: JMAPResponse): void {
  for (const [method, data] of response.methodResponses || []) {
    if (method !== 'error') continue;
    const errorData = data as { type?: string; description?: string };
    throw new Error(
      `JMAP method error (${errorData.type || 'unknown'}): ${errorData.description || 'no description'}`
    );
  }
}

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
    return (
      ip.startsWith('172.') ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('169.254.')
    );
  }

  private isLoopbackIp(ip: string): boolean {
    return ip === '127.0.0.1' || ip === '::1';
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
    try {
      const ips = await resolve4(hostname);
      for (const ip of ips) {
        if (this.isDockerInternalIp(ip) || this.isAllowedHostIp(ip)) return ip;
      }
    } catch {
      // resolve4 failed, try lookup
    }

    try {
      const addresses = await lookup(hostname, { family: 4, all: true });
      for (const addr of addresses) {
        if (this.isDockerInternalIp(addr.address) || this.isAllowedHostIp(addr.address))
          return addr.address;
      }
    } catch (lookupError) {
      logger.debug(`[JMAPClient] DNS lookup failed for ${hostname}:`, lookupError);
    }

    logger.debug(`[JMAPClient] Failed to resolve ${hostname} to internal IP`);
    return null;
  }

  private async resolveUrlToIp(url: string): Promise<string> {
    // Check cache first
    const cached = dnsCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.resolved;
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
      ) {
        if (
          /^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
          !this.isDockerInternalIp(hostname) &&
          !this.isAllowedHostIp(hostname) &&
          !this.isLoopbackIp(hostname)
        ) {
          throw new Error(
            `URL contains external IP address ${hostname}. This will not work for Docker container communication. Please use container hostname, internal IP, or add IP to ALLOWED_DOCKER_NETWORKS.`
          );
        }
        return url;
      }

      const isContainerName =
        !hostname.includes('.') ||
        hostname === 'stalwart' ||
        hostname === 'homemail-stalwart' ||
        hostname.startsWith('homemail-');

      if (isContainerName) {
        const ip = await this.resolveHostnameToIp(hostname);
        if (ip && (this.isDockerInternalIp(ip) || this.isAllowedHostIp(ip))) {
          urlObj.hostname = ip;
          const resolvedUrl = urlObj.toString();
          dnsCache.set(url, { resolved: resolvedUrl, expiresAt: Date.now() + DNS_CACHE_TTL_MS });
          return resolvedUrl;
        } else {
          logger.error(
            `[JMAPClient] ✗ CRITICAL: Container name ${hostname} resolved to external IP or failed`
          );
          logger.error(
            `[JMAPClient] ✗ This means Docker DNS is not working - fetch will also fail`
          );
          logger.error(`[JMAPClient] ✗ Solutions:`);
          throw new Error(
            `Container name ${hostname} cannot be resolved to internal IP. Check Docker network configuration.`
          );
        }
      } else {
        const ip = await this.resolveHostnameToIp(hostname);
        if (ip && (this.isDockerInternalIp(ip) || this.isAllowedHostIp(ip))) {
          urlObj.hostname = ip;
          const resolvedUrl = urlObj.toString();
          dnsCache.set(url, { resolved: resolvedUrl, expiresAt: Date.now() + DNS_CACHE_TTL_MS });
          return resolvedUrl;
        } else {
          throw new Error(
            `Failed to resolve ${hostname} to Docker internal or allowed host IP. DNS is resolving to external IP (${ip || 'unknown'}), which indicates Docker DNS is not working or IP is not in ALLOWED_DOCKER_NETWORKS. Please use container name (e.g., 'stalwart' or 'homemail-stalwart') in STALWART_BASE_URL instead of domain name, or add IP to ALLOWED_DOCKER_NETWORKS.`
          );
        }
      }
    } catch (error) {
      logger.error(`[JMAPClient] Error resolving URL ${url}:`, error);
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
          u.protocol = baseProtocol;
        }

        if (urlHostname === 'localhost' || urlHostname === '127.0.0.1') {
          u.hostname = baseHostname;
          u.port = baseUrlObj.port || u.port;
        } else if (urlHostname.includes('.') && urlHostname !== baseHostname) {
          u.hostname = baseHostname;
          u.port = baseUrlObj.port || u.port;
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
    // Keyed by account only: the bearer token rotates on OAuth refresh, and
    // including it in the key would leave one dead entry per refresh forever.
    const cacheKey = this.accountId;
    const cached = sessionCache.get(cacheKey);

    if (
      cached &&
      cached.expiresAt > Date.now() &&
      cached.authHeader === this.authHeader
    ) {
      return cached.session;
    }

    const baseUrlObj = new URL(this.baseUrl);
    const hostname = baseUrlObj.hostname;

    logger.debug(`[JMAPClient] ===== DNS Resolution Debug =====`);
    logger.debug(`[JMAPClient] Base URL: ${this.baseUrl}`);
    logger.debug(`[JMAPClient] Hostname to resolve: ${hostname}`);

    try {
      const addresses = await lookup(hostname, { family: 4, all: true });
      const resolvedIps = addresses
        .map((a: { address: string; family: number }) => `${a.address} (family: ${a.family})`)
        .join(', ');
      logger.debug(`[JMAPClient] DNS lookup SUCCESS: ${hostname} resolved to: ${resolvedIps}`);

      const firstAddress = addresses[0]?.address;
      if (
        firstAddress &&
        (firstAddress.startsWith('172.') ||
          firstAddress.startsWith('10.') ||
          firstAddress.startsWith('192.168.'))
      ) {
        logger.debug(`[JMAPClient] ✓ Resolved to Docker internal IP: ${firstAddress}`);
      } else if (firstAddress) {
        logger.warn(
          `[JMAPClient] ✗ WARNING: Resolved to external/public IP: ${firstAddress}. This indicates DNS is using external resolver instead of Docker DNS!`
        );
        logger.warn(
          `[JMAPClient] ✗ Expected: Docker internal IP (172.x.x.x, 10.x.x.x, or 192.168.x.x)`
        );
        logger.warn(
          `[JMAPClient] ✗ Solution: Use container IP directly or configure extra_hosts in docker-compose.yml`
        );
      }
    } catch (dnsError) {
      logger.debug(`[JMAPClient] DNS lookup FAILED for ${hostname}:`, dnsError);
    }
    logger.debug(`[JMAPClient] =================================`);

    const directSessionUrl = `${this.baseUrl}/jmap/session`;
    logger.debug(`[JMAPClient] Attempting to connect to: ${directSessionUrl}`);

    const resolvedDirectUrl = await this.resolveUrlToIp(directSessionUrl);

    try {
      const directRes = await fetch(resolvedDirectUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: this.authHeader,
        },
        redirect: 'follow',
      });

      if (directRes.ok) {
        const directSession = this.normalizeSessionUrls((await directRes.json()) as JMAPSession);
        if (directSession.accounts && Object.keys(directSession.accounts).length > 0) {
          sessionCache.set(cacheKey, {
            session: directSession,
            expiresAt: Date.now() + SESSION_CACHE_TTL,
            authHeader: this.authHeader,
          });
          return directSession;
        }
      }

      const directErrorText = await directRes.text().catch(() => '');
      logger.warn(
        `[JMAPClient] Direct session endpoint failed: ${directRes.status} ${directRes.statusText}, response: ${directErrorText.substring(0, 200)}`
      );
    } catch (error) {
      logger.error(
        `[JMAPClient] Connection error to ${resolvedDirectUrl} (original: ${directSessionUrl}):`,
        error
      );
      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        const cause = (error as any).cause;
        if (cause) {
          logger.error(`[JMAPClient] Fetch error cause:`, {
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
    logger.debug(`[JMAPClient] Attempting discovery at: ${discoveryUrl}`);

    const resolvedDiscoveryUrl = await this.resolveUrlToIp(discoveryUrl);

    try {
      const discoveryRes = await fetch(resolvedDiscoveryUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: this.authHeader,
        },
        redirect: 'follow',
      });

      if (!discoveryRes.ok) {
        const errorText = await discoveryRes.text().catch(() => '');
        logger.error(
          `[JMAPClient] Discovery failed: ${discoveryRes.status} ${discoveryRes.statusText}, response: ${errorText.substring(0, 200)}`
        );
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
          logger.warn(
            `[JMAPClient] ⚠ Discovery returned URL with ${discoveryUrlObj.protocol} but baseUrl uses ${baseProtocol}`
          );
          logger.warn(
            `[JMAPClient] ⚠ Replacing protocol to match baseUrl for Docker container communication`
          );
          discoveryUrlObj.protocol = baseProtocol;
        }

        if (
          discoveryHostname !== baseHostname &&
          (discoveryHostname.includes('.') ||
            discoveryHostname === 'localhost' ||
            discoveryHostname === '127.0.0.1')
        ) {
          logger.warn(
            `[JMAPClient] ⚠ Discovery returned URL with different hostname: ${discoveryHostname} (expected: ${baseHostname})`
          );
          logger.warn(
            `[JMAPClient] ⚠ Stalwart server.hostname (${discoveryHostname}) differs from STALWART_BASE_URL hostname (${baseHostname})`
          );
          logger.warn(
            `[JMAPClient] ⚠ Replacing discovery hostname with baseUrl hostname for Docker container communication`
          );
          discoveryUrlObj.hostname = baseHostname;
          discoveryUrlObj.port = baseUrlObj.port || discoveryUrlObj.port;
          sessionUrl = discoveryUrlObj.toString();
          logger.debug(`[JMAPClient] ✓ Normalized sessionUrl: ${sessionUrl}`);
        } else if (discoveryUrlObj.protocol !== baseProtocol) {
          sessionUrl = discoveryUrlObj.toString();
          logger.debug(`[JMAPClient] ✓ Normalized sessionUrl protocol: ${sessionUrl}`);
        }
      } catch (urlError) {
        logger.warn(
          `[JMAPClient] Could not parse discovery URL ${sessionUrl}, using as-is:`,
          urlError
        );
      }

      if (sessionUrl.endsWith('/')) {
        sessionUrl = sessionUrl.slice(0, -1);
      }

      logger.debug(`[JMAPClient] Attempting session request to: ${sessionUrl}`);
      const resolvedSessionUrl = await this.resolveUrlToIp(sessionUrl);
      const sessionRes = await fetch(resolvedSessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
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

      throwIfMethodError(sessionData);

      const sessionResponse = sessionData.methodResponses[0];

      if (sessionResponse[0] !== 'Session/get') {
        throw new Error(
          `Invalid session response: expected Session/get, got ${sessionResponse[0]}`
        );
      }

      const session = this.normalizeSessionUrls(sessionResponse[1] as JMAPSession);

      if (!session.accounts || Object.keys(session.accounts).length === 0) {
        throw new Error('No accounts found in JMAP session. User may need mail access configured.');
      }

      sessionCache.set(cacheKey, {
        session,
        expiresAt: Date.now() + SESSION_CACHE_TTL,
        authHeader: this.authHeader,
      });

      return session;
    } catch (error) {
      logger.error(`[JMAPClient] Error in getSession for baseUrl ${this.baseUrl}:`, error);

      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        const cause = (error as any).cause;
        if (cause) {
          logger.error(`[JMAPClient] Fetch error details:`, {
            code: cause.code,
            errno: cause.errno,
            syscall: cause.syscall,
            address: cause.address,
            port: cause.port,
            message: cause.message,
          });

          if (cause.code === 'ECONNREFUSED') {
            throw new Error(
              `Cannot connect to Stalwart server at ${this.baseUrl}. Please check that Stalwart is running and STALWART_BASE_URL is correct. DNS resolved to: ${cause.address}:${cause.port}`
            );
          }

          if (cause.code === 'ENOTFOUND' || cause.code === 'EAI_AGAIN') {
            throw new Error(
              `DNS resolution failed for ${this.baseUrl}. Hostname ${new URL(this.baseUrl).hostname} could not be resolved. Please check network configuration and ensure containers are in the same Docker network.`
            );
          }
        }
      }
      throw error;
    }
  }

  async request(
    methodCalls: Array<[string, Record<string, any>, string]>,
    options?: { allowMethodError?: boolean }
  ): Promise<JMAPResponse> {
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
        Authorization: this.authHeader,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`JMAP request failed: ${response.statusText}`);
    }

    const jsonResponse: JMAPResponse = await response.json();
    // /changes errors are expected and mean "re-seed", so those callers opt out.
    if (!options?.allowMethodError) {
      throwIfMethodError(jsonResponse);
    }
    return jsonResponse;
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

    const resolvedApiUrl = await this.resolveUrlToIp(apiUrl);
    const response = await fetch(resolvedApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error('[JMAPClient] Request failed:', {
        status: response.status,
        statusText: response.statusText,
        url: resolvedApiUrl,
        methodCalls: methodCalls.map((m) => m[0]),
        errorBody: errorText,
      });
      throw new Error(`JMAP request failed: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json();

    return jsonResponse;
  }

  async getMailboxes(accountId?: string): Promise<JMAPMailbox[]> {
    const { mailboxes } = await this.getMailboxesWithState(accountId);
    return mailboxes;
  }

  async getMailboxesWithState(
    accountId?: string
  ): Promise<{ mailboxes: JMAPMailbox[]; state: string }> {
    const targetAccountId = accountId || this.accountId;
    const response = await this.request([['Mailbox/get', { accountId: targetAccountId }, '0']]);

    const mailboxResponse = response.methodResponses[0];
    if (mailboxResponse[0] !== 'Mailbox/get') {
      throw new Error('Invalid mailbox response');
    }
    const data = mailboxResponse[1] as { list: JMAPMailbox[]; state: string };
    return { mailboxes: data.list || [], state: data.state || '' };
  }

  async getMailboxChanges(
    sinceState: string,
    accountId?: string
  ): Promise<
    | { changed: string[]; destroyed: string[]; newState: string; hasMoreChanges: boolean }
    | { cannotCalculateChanges: true }
  > {
    const targetAccountId = accountId || this.accountId;
    const response = await this.request(
      [['Mailbox/changes', { accountId: targetAccountId, sinceState }, '0']],
      { allowMethodError: true }
    );

    const [method, data] = response.methodResponses[0];
    if (method === 'error') {
      // Treat any error (invalidState, cannotCalculateChanges, etc.) as a signal to re-seed
      return { cannotCalculateChanges: true };
    }

    const d = data as {
      newState: string;
      hasMoreChanges: boolean;
      changed: string[];
      destroyed: string[];
    };
    return {
      changed: d.changed || [],
      destroyed: d.destroyed || [],
      newState: d.newState,
      hasMoreChanges: d.hasMoreChanges,
    };
  }

  async getEmailChanges(
    sinceState: string,
    accountId?: string,
    maxChanges = 500
  ): Promise<
    | {
        created: string[];
        updated: string[];
        destroyed: string[];
        newState: string;
        hasMoreChanges: boolean;
      }
    | { cannotCalculateChanges: true }
  > {
    const targetAccountId = accountId || this.accountId;
    const response = await this.request(
      [['Email/changes', { accountId: targetAccountId, sinceState, maxChanges }, '0']],
      { allowMethodError: true }
    );

    const [method, data] = response.methodResponses[0];
    if (method === 'error') {
      // Treat any error (invalidState, cannotCalculateChanges, etc.) as a signal to re-seed
      return { cannotCalculateChanges: true };
    }

    const d = data as {
      newState: string;
      hasMoreChanges: boolean;
      created: string[];
      updated: string[];
      destroyed: string[];
    };
    return {
      created: d.created || [],
      updated: d.updated || [],
      destroyed: d.destroyed || [],
      newState: d.newState,
      hasMoreChanges: d.hasMoreChanges,
    };
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

    const response = await this.requestWithUsing(
      [['Identity/get', requestBody, '0']],
      ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:submission']
    );

    if (!response || !response.methodResponses) {
      logger.error('[JMAPClient] Invalid response structure');
      throw new Error('Invalid identity response: missing methodResponses');
    }

    if (!Array.isArray(response.methodResponses) || response.methodResponses.length === 0) {
      logger.error('[JMAPClient] Empty methodResponses');
      throw new Error('Invalid identity response: empty methodResponses');
    }

    const identityResponse = response.methodResponses[0];
    if (!identityResponse || !Array.isArray(identityResponse)) {
      logger.error('[JMAPClient] Invalid identityResponse structure');
      throw new Error(
        `Invalid identity response: unexpected response structure. Got: ${JSON.stringify(identityResponse)}`
      );
    }

    if (identityResponse[0] === 'error') {
      const errorData = identityResponse[1] as { type?: string; description?: string };
      const errorType = errorData?.type || 'unknown';
      const errorDesc = errorData?.description || 'Unknown error';
      logger.error('[JMAPClient] Identity/get server error:', {
        type: errorType,
        description: errorDesc,
      });
      throw new Error(`JMAP identity error (${errorType}): ${errorDesc}`);
    }

    if (identityResponse[0] !== 'Identity/get') {
      logger.error(
        '[JMAPClient] Unexpected method name:',
        identityResponse[0],
        'Expected: Identity/get'
      );
      throw new Error(
        `Invalid identity response: expected 'Identity/get', got '${identityResponse[0]}'`
      );
    }

    const data = identityResponse[1] as { list: JMAPIdentity[] };
    if (!data || typeof data !== 'object') {
      logger.error('[JMAPClient] Invalid data structure');
      throw new Error('Invalid identity response: missing or invalid data');
    }

    return data.list || [];
  }

  async setIdentities(
    identities: Array<{ email: string; name?: string }>,
    accountId?: string
  ): Promise<{
    created?: Record<string, JMAPIdentity>;
    updated?: Record<string, JMAPIdentity>;
    notCreated?: Record<string, any>;
    notUpdated?: Record<string, any>;
  }> {
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
      [['Identity/set', requestBody, '0']],
      ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:submission']
    );

    // requestWithUsing leaves method errors to callers; Sieve validation relies on that.
    throwIfMethodError(response);

    const setResponse = response.methodResponses[0];
    if (setResponse[0] !== 'Identity/set') {
      throw new Error('Invalid identity set response');
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
        body?: string;
        hasAttachment?: boolean;
        hasKeyword?: string;
        notKeyword?: string;
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
        operator?: 'AND' | 'OR' | 'NOT';
        conditions?: any[];
      };
      sort?: Array<{ property: string; isAscending?: boolean }>;
    }
  ): Promise<{ ids: string[]; position: number; total?: number; queryState?: string }> {
    const targetAccountId = options.accountId || this.accountId;
    const finalFilter = options.filter || { inMailbox: mailboxId };

    logger.debug('[JMAPClient] queryEmails called:', {
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

    const result = queryResponse[1] as {
      ids: string[];
      position: number;
      total?: number;
      queryState?: string;
    };
    logger.debug('[JMAPClient] Email/query result:', {
      idsCount: result.ids?.length || 0,
      total: result.total,
      position: result.position,
      firstFewIds: result.ids?.slice(0, 5),
    });

    return result;
  }

  async getThreadEmailIds(threadId: string, accountId?: string): Promise<string[] | null> {
    const targetAccountId = accountId || this.accountId;
    const response = await this.request([
      ['Thread/get', { accountId: targetAccountId, ids: [threadId] }, '0'],
    ]);
    const threadResponse = response.methodResponses[0];

    if (!threadResponse || threadResponse[0] !== 'Thread/get') {
      throw new Error('Invalid thread get response');
    }
    const data = threadResponse[1] as {
      accountId?: string;
      list?: JMAPThread[];
      notFound?: string[];
    };
    if (data.accountId !== targetAccountId) {
      throw new Error('JMAP thread get returned a different account');
    }
    const thread = data.list?.find((item) => item.id === threadId);
    return thread ? thread.emailIds : null;
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

      const response = await this.request([['Email/get', requestBody, '0']]);

      if (!response || !response.methodResponses || response.methodResponses.length === 0) {
        logger.error('[JMAPClient] Invalid response structure');
        throw new Error('Invalid email get response: missing methodResponses');
      }

      const getResponse = response.methodResponses[0];
      if (!Array.isArray(getResponse) || getResponse.length < 2) {
        logger.error('[JMAPClient] Invalid getResponse structure');
        throw new Error('Invalid email get response: unexpected response structure');
      }

      if (getResponse[0] !== 'Email/get') {
        logger.error(
          '[JMAPClient] Unexpected method name:',
          getResponse[0],
          'Expected: Email/get'
        );
        throw new Error(
          `Invalid email get response: expected 'Email/get', got '${getResponse[0]}'`
        );
      }

      const data = getResponse[1] as { list: JMAPEmail[] };
      if (!data || typeof data !== 'object') {
        logger.error('[JMAPClient] Invalid data structure');
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

    throwIfEmailsRejected(setResponse[1], 'notUpdated');
  }

  async bulkSetEmails(
    updates: Record<
      string,
      { keywords?: Record<string, boolean>; mailboxIds?: Record<string, boolean> }
    >,
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

    throwIfEmailsRejected(setResponse[1], 'notUpdated');
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

    throwIfEmailsRejected(setResponse[1], 'notDestroyed');
  }

  async getBlobDownloadUrl(blobId: string, accountId: string, name?: string): Promise<string> {
    const session = await this.getSession();
    const downloadUrl =
      session.downloadUrl || `${this.baseUrl}/jmap/download/{accountId}/{blobId}/{name}`;
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

    logger.debug('[JMAPClient] uploadBlob:', {
      rawUploadUrl,
      resolvedUploadUrl,
      accountId: targetAccountId,
      contentType,
      size: blob.length,
    });

    const resolvedUrl = await this.resolveUrlToIp(resolvedUploadUrl);
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
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
      logger.error('[JMAPClient] uploadBlob failed:', {
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

  /**
   * Submits an email that already exists in the account.
   *
   * Args:
   *   emailId: Id of the email to submit.
   *   accountId: Account that owns the email; defaults to the client account.
   *   identityId: Explicit submission identity. When omitted, the identity
   *     matching `options.fromEmail` is used.
   *   options: Submission options. `fromEmail` selects the identity;
   *     `sentMailboxId` moves the email once the server accepts it. JMAP
   *     applies that update only on success, so a rejected submission leaves
   *     the email where it was created.
   *
   * Returns:
   *   Id of the created EmailSubmission.
   *
   * Raises:
   *   SendUnknownError: The request may have reached the server, but its result
   *     was not received.
   *   Error: The server explicitly rejected the submission.
   */
  async sendEmail(
    emailId: string,
    accountId?: string,
    identityId?: string,
    options?: { fromEmail?: string; sentMailboxId?: string }
  ): Promise<string> {
    const targetAccountId = accountId || this.accountId;

    let actualIdentityId = identityId;
    if (!actualIdentityId) {
      const identities = await this.getIdentities(targetAccountId);
      if (identities.length === 0) {
        throw new Error('No identity found for account');
      }
      const fromEmail = options?.fromEmail;
      const matchingIdentity = fromEmail
        ? identities.find(
            (identity) => identity.email.toLowerCase() === fromEmail.toLowerCase()
          )
        : undefined;
      if (fromEmail && !matchingIdentity) {
        throw new Error(`No identity found for sender address ${fromEmail}`);
      }
      actualIdentityId = matchingIdentity?.id ?? identities[0].id;
    }

    const submission: Record<string, any> = {
      emailId,
      identityId: actualIdentityId,
      envelope: null,
    };

    const setArguments: Record<string, any> = {
      accountId: targetAccountId,
      create: {
        submission1: submission,
      },
    };

    if (options?.sentMailboxId) {
      setArguments.onSuccessUpdateEmail = {
        '#submission1': {
          mailboxIds: { [options.sentMailboxId]: true },
          keywords: { $seen: true },
        },
      };
    }

    let response: JMAPResponse;
    try {
      response = await this.requestWithUsing(
        [['EmailSubmission/set', setArguments, '0']],
        ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']
      );
    } catch (error) {
      // The request may have been accepted before the connection broke.
      throw new SendUnknownError('Email submission result is unknown', { cause: error });
    }

    const submissionResponse = response.methodResponses[0];
    if (!submissionResponse) {
      throw new SendUnknownError('Email submission response contained no method response');
    }
    if (submissionResponse[0] === 'error') {
      const errorData = submissionResponse[1] as { type?: string; description?: string };
      throw new Error(
        `Email submission rejected: ${errorData.type || 'unknown'}: ${errorData.description || 'no description'}`,
      );
    }
    if (submissionResponse[0] !== 'EmailSubmission/set') {
      throw new SendUnknownError('Invalid email submission response');
    }

    const data = submissionResponse[1] as {
      created?: Record<string, { id: string }>;
      notCreated?: Record<string, unknown>;
    };
    if (!data.created || Object.keys(data.created).length === 0) {
      if (data.notCreated && Object.keys(data.notCreated).length > 0) {
        throw new Error(`Email submission rejected: ${JSON.stringify(data.notCreated)}`);
      }
      // A successful response without `created` is malformed, but the server
      // may already have queued the submission. Never invite a blind retry.
      throw new SendUnknownError('Email submission response did not report a created submission');
    }

    const created = Object.values(data.created)[0];
    if (!created?.id) {
      throw new SendUnknownError('Email submission response did not include a submission id');
    }
    return created.id;
  }

  // ── Sieve (RFC 9661) ──────────────────────────────────────────────────────

  private readonly SIEVE_USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:sieve'];

  async getSieveScripts(accountId?: string): Promise<
    Array<{
      id: string;
      name: string | null;
      blobId: string;
      isActive: boolean;
    }>
  > {
    const targetAccountId = accountId || this.accountId;
    const response = await this.requestWithUsing(
      [['SieveScript/get', { accountId: targetAccountId, ids: null }, '0']],
      this.SIEVE_USING
    );
    const res = response.methodResponses[0];
    if (res[0] === 'error') {
      throw new Error(`SieveScript/get error: ${(res[1] as any).description || 'unknown'}`);
    }
    const data = res[1] as {
      list: Array<{ id: string; name: string | null; blobId: string; isActive: boolean }>;
    };
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
        throw new Error(
          `SieveScript/set update failed: ${JSON.stringify(data.notUpdated[params.existingId])}`
        );
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

  async validateSieveScript(
    content: string,
    accountId?: string
  ): Promise<{ valid: boolean; error?: string }> {
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
