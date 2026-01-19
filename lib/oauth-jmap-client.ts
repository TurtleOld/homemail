import { DeviceFlowClient, type TokenResponse } from './oauth-device-flow';
import { OAuthTokenStore } from './oauth-token-store';
import { JMAPClient } from '../providers/stalwart-jmap/jmap-client';

export interface OAuthJMAPConfig {
  discoveryUrl: string;
  clientId: string;
  scopes?: string[];
  baseUrl: string;
  accountId: string;
}

export class OAuthJMAPClient {
  private readonly deviceFlow: DeviceFlowClient;
  private readonly tokenStore: OAuthTokenStore;
  private readonly config: OAuthJMAPConfig;
  private jmapClient: JMAPClient | null = null;

  constructor(config: OAuthJMAPConfig) {
    this.config = config;
    this.deviceFlow = new DeviceFlowClient(
      config.discoveryUrl,
      config.clientId,
      config.scopes
    );
    this.tokenStore = new OAuthTokenStore();
  }

  async authorize(
    onProgress?: (status: 'pending' | 'authorized' | 'error', message?: string) => void
  ): Promise<void> {
    const token = await this.deviceFlow.authorizeDevice(onProgress);
    
    const expiresAt = token.expires_in 
      ? Date.now() + (token.expires_in * 1000)
      : undefined;

    await this.tokenStore.saveToken(this.config.accountId, {
      accessToken: token.access_token,
      tokenType: token.token_type,
      expiresAt,
      refreshToken: token.refresh_token,
      scopes: token.scope?.split(' ') || this.config.scopes,
    });

    this.jmapClient = null;
  }

  async getJMAPClient(forceRefresh: boolean = false): Promise<JMAPClient> {
    if (this.jmapClient && !forceRefresh) {
      return this.jmapClient;
    }

    const token = await this.tokenStore.getToken(this.config.accountId);
    
    if (!token) {
      throw new Error('No valid OAuth token found. Please authorize first.');
    }

    if (token.expiresAt && token.expiresAt <= Date.now()) {
      if (token.refreshToken) {
        try {
          await this.refreshToken();
          const refreshedToken = await this.tokenStore.getToken(this.config.accountId);
          if (!refreshedToken) {
            throw new Error('Token expired and refresh failed. Please re-authorize.');
          }
          this.jmapClient = new JMAPClient(
            this.config.baseUrl,
            '',
            refreshedToken.accessToken,
            this.config.accountId,
            'bearer'
          );
          return this.jmapClient;
        } catch (error) {
          throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please re-authorize.`);
        }
      } else {
        throw new Error('Token expired. Please re-authorize.');
      }
    }

    this.jmapClient = new JMAPClient(
      this.config.baseUrl,
      '',
      token.accessToken,
      this.config.accountId,
      'bearer'
    );

    return this.jmapClient;
  }

  async handleJMAPRequest<T>(
    requestFn: (client: JMAPClient) => Promise<T>
  ): Promise<T> {
    let client = await this.getJMAPClient();
    
    try {
      return await requestFn(client);
    } catch (error: any) {
      if (error?.message?.includes('401') || error?.message?.includes('403') || error?.message?.includes('Unauthorized')) {
        const token = await this.tokenStore.getToken(this.config.accountId);
        
        if (token?.refreshToken) {
          try {
            await this.refreshToken();
            client = await this.getJMAPClient(true);
            return await requestFn(client);
          } catch {
            throw new Error('Token refresh failed. Please re-authorize.');
          }
        } else {
          throw new Error('Token expired. Please re-authorize.');
        }
      }
      throw error;
    }
  }

  async refreshToken(): Promise<void> {
    const token = await this.tokenStore.getToken(this.config.accountId);
    
    if (!token?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const discovery = await this.deviceFlow.getDiscovery();
    
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', token.refreshToken);
    body.append('client_id', this.config.clientId);

    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const newToken = await response.json() as TokenResponse;

    const expiresAt = newToken.expires_in 
      ? Date.now() + (newToken.expires_in * 1000)
      : undefined;

    await this.tokenStore.saveToken(this.config.accountId, {
      accessToken: newToken.access_token,
      tokenType: newToken.token_type,
      expiresAt,
      refreshToken: newToken.refresh_token ?? token.refreshToken,
      scopes: newToken.scope?.split(' ') ?? token.scopes,
    });

    this.jmapClient = null;
  }

  async logout(): Promise<void> {
    await this.tokenStore.deleteToken(this.config.accountId);
    this.jmapClient = null;
  }

  async hasValidToken(): Promise<boolean> {
    return await this.tokenStore.hasValidToken(this.config.accountId);
  }

  async ensureAuthenticated(): Promise<JMAPClient> {
    const hasToken = await this.hasValidToken();
    
    if (!hasToken) {
      throw new Error('Not authenticated. Please call authorize() first.');
    }

    return await this.getJMAPClient();
  }

  getDeviceCodeInfo(): { verificationUri?: string; userCode?: string } {
    return {};
  }
}