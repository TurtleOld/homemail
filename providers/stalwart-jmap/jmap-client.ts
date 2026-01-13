import * as dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

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

  private normalizeSessionUrls(session: JMAPSession): JMAPSession {
    const baseUrlObj = new URL(this.baseUrl);
    const rewrite = (raw?: string): string | undefined => {
      if (!raw) return raw;
      try {
        const u = new URL(raw);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          u.hostname = baseUrlObj.hostname;
          u.port = baseUrlObj.port;
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
    
    try {
      console.log(`[JMAPClient] Attempting to resolve hostname: ${hostname} for baseUrl: ${this.baseUrl}`);
      const addresses = await lookup(hostname, { family: 4, all: true });
      console.log(`[JMAPClient] Resolved ${hostname} to:`, addresses.map((a: { address: string; family: number }) => `${a.address} (family: ${a.family})`).join(', '));
    } catch (dnsError) {
      console.error(`[JMAPClient] DNS lookup failed for ${hostname}:`, dnsError);
    }

    const directSessionUrl = `${this.baseUrl}/jmap/session`;
    console.log(`[JMAPClient] Attempting to connect to: ${directSessionUrl}`);
    
    try {
      const directRes = await fetch(directSessionUrl, {
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
      console.error(`[JMAPClient] Connection error to ${directSessionUrl}:`, error);
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
    
    try {
      const discoveryRes = await fetch(discoveryUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': this.authHeader,
        },
        redirect: 'follow',
      });

      if (!discoveryRes.ok) {
        const errorText = await discoveryRes.text().catch(() => '');
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
      
      if (sessionUrl.includes('localhost') || sessionUrl.includes('127.0.0.1')) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Discovery returned localhost URL, replacing with baseUrl:', sessionUrl);
        const url = new URL(sessionUrl);
        const baseUrlObj = new URL(this.baseUrl);
        url.hostname = baseUrlObj.hostname;
        url.port = baseUrlObj.port;
        sessionUrl = url.toString();
      }
      
      if (sessionUrl.endsWith('/')) {
        sessionUrl = sessionUrl.slice(0, -1);
      }
      
      console.log(`[JMAPClient] Attempting session request to: ${sessionUrl}`);
      const sessionRes = await fetch(sessionUrl, {
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

    const response = await fetch(apiUrl, {
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

    const response = await fetch(apiUrl, {
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
    const targetAccountId = accountId || this.accountId;
    const response = await this.requestWithUsing(
      [
        [
          'Identity/get',
          {
            accountId: targetAccountId,
          },
          '0',
        ],
      ],
      ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:submission']
    );

    const identityResponse = response.methodResponses[0];
    if (identityResponse[0] !== 'Identity/get') {
      throw new Error('Invalid identity response');
    }

    if ('type' in identityResponse[1] && identityResponse[1].type === 'error') {
      throw new Error(`JMAP identity error: ${(identityResponse[1] as any).description}`);
    }

    const data = identityResponse[1] as { list: JMAPIdentity[] };
    return data.list || [];
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
      };
      sort?: Array<{ property: string; isAscending?: boolean }>;
    }
  ): Promise<{ ids: string[]; position: number; total?: number; queryState?: string }> {
    const targetAccountId = options.accountId || this.accountId;
    const response = await this.request([
      [
        'Email/query',
        {
          accountId: targetAccountId,
          filter: options.filter || { inMailbox: mailboxId },
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
      throw new Error(`JMAP email query error: ${(queryResponse[1] as any).description}`);
    }

    return queryResponse[1] as { ids: string[]; position: number; total?: number; queryState?: string };
  }

  async getEmails(
    ids: string[],
    options?: {
      accountId?: string;
      properties?: string[];
    }
  ): Promise<JMAPEmail[]> {
    const targetAccountId = options?.accountId || this.accountId;
    const properties = options?.properties;
    const response = await this.request([
      [
        'Email/get',
        {
          accountId: targetAccountId,
          ids,
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
        },
        '0',
      ],
    ]);

    const getResponse = response.methodResponses[0];
    if (getResponse[0] !== 'Email/get') {
      throw new Error('Invalid email get response');
    }

    if ('type' in getResponse[1] && getResponse[1].type === 'error') {
      throw new Error(`JMAP email get error: ${(getResponse[1] as any).description}`);
    }

    const data = getResponse[1] as { list: JMAPEmail[] };
    return data.list || [];
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
    const downloadUrl = session.downloadUrl || `${this.baseUrl}/download/{accountId}/{blobId}/{name}`;
    return downloadUrl
      .replace('{accountId}', accountId)
      .replace('{blobId}', blobId)
      .replace('{name}', name || 'attachment');
  }
}
