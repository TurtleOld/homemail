import { OAuthDiscovery } from './oauth-discovery';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface TokenErrorResponse {
  error: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' | 'invalid_grant' | 'invalid_client' | 'invalid_request';
  error_description?: string;
  error_uri?: string;
}

export type TokenPollResult = 
  | { success: true; token: TokenResponse }
  | { success: false; error: TokenErrorResponse; retry: boolean };

export class DeviceFlowClient {
  private readonly discovery: OAuthDiscovery;
  private readonly clientId: string;
  private readonly scopes: string[];
  private readonly activePolling: Map<string, AbortController> = new Map();

  constructor(discoveryUrl: string, clientId: string, scopes: string[] = []) {
    this.discovery = new OAuthDiscovery(discoveryUrl);
    this.clientId = clientId;
    this.scopes = scopes.length > 0 
      ? scopes 
      : ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];
  }

  async getDiscovery(): Promise<import('./oauth-discovery').OAuthDiscoveryResponse> {
    return await this.discovery.discover();
  }

  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const discovery = await this.discovery.discover();
    
    const body = new URLSearchParams();
    body.append('client_id', this.clientId);
    if (this.scopes.length > 0) {
      body.append('scope', this.scopes.join(' '));
    }

    try {
      const response = await fetch(discovery.device_authorization_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Device code request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as DeviceCodeResponse;

      if (!data.device_code || !data.user_code || !data.verification_uri) {
        throw new Error('Invalid device code response: missing required fields');
      }

      return data;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        throw new Error(`Network error during device code request: ${error.message}`);
      }
      throw error;
    }
  }

  async pollForToken(
    deviceCode: string,
    interval: number = 5,
    expiresIn: number = 600,
    signal?: AbortSignal
  ): Promise<TokenPollResult> {
    const discovery = await this.discovery.discover();
    const startTime = Date.now();
    const expiryTime = startTime + (expiresIn * 1000);
    let currentInterval = interval * 1000;

    while (true) {
      if (signal?.aborted) {
        throw new Error('Token polling cancelled');
      }

      if (Date.now() >= expiryTime) {
        return {
          success: false,
          error: {
            error: 'expired_token',
            error_description: 'Device code has expired',
          },
          retry: false,
        };
      }

      const body = new URLSearchParams();
      body.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
      body.append('device_code', deviceCode);
      body.append('client_id', this.clientId);

      try {
        const response = await fetch(discovery.token_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: body.toString(),
          signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as TokenErrorResponse;
          
          if (errorData.error === 'authorization_pending') {
            await this.sleep(currentInterval);
            continue;
          }
          
          if (errorData.error === 'slow_down') {
            currentInterval = Math.min(currentInterval + 5000, 60000);
            await this.sleep(currentInterval);
            continue;
          }
          
          if (errorData.error === 'expired_token' || errorData.error === 'access_denied') {
            return {
              success: false,
              error: errorData,
              retry: false,
            };
          }

          return {
            success: false,
            error: errorData.error 
              ? errorData 
              : {
                  error: 'invalid_request',
                  error_description: `Token request failed: ${response.status} ${response.statusText}`,
                },
            retry: false,
          };
        }

        const tokenData = await response.json() as TokenResponse;

        if (!tokenData.access_token || !tokenData.token_type) {
          return {
            success: false,
            error: {
              error: 'invalid_request',
              error_description: 'Invalid token response: missing access_token or token_type',
            },
            retry: false,
          };
        }

        if (tokenData.token_type.toLowerCase() !== 'bearer') {
          return {
            success: false,
            error: {
              error: 'invalid_request',
              error_description: `Unsupported token type: ${tokenData.token_type}`,
            },
            retry: false,
          };
        }

        return {
          success: true,
          token: tokenData,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Token polling cancelled');
        }
        
        if (error instanceof TypeError && error.message.includes('fetch failed')) {
          await this.sleep(currentInterval);
          continue;
        }

        return {
          success: false,
          error: {
            error: 'invalid_request',
            error_description: error instanceof Error ? error.message : 'Unknown error during token polling',
          },
          retry: true,
        };
      }
    }
  }

  async authorizeDevice(
    onProgress?: (status: 'pending' | 'authorized' | 'error', message?: string) => void
  ): Promise<TokenResponse> {
    const deviceCodeResponse = await this.requestDeviceCode();
    
    const abortController = new AbortController();
    const pollingKey = `${Date.now()}-${Math.random()}`;
    this.activePolling.set(pollingKey, abortController);

    try {
      const interval = deviceCodeResponse.interval || 5;
      
      onProgress?.('pending', `Код авторизации: ${deviceCodeResponse.user_code}`);

      const pollResult = await this.pollForToken(
        deviceCodeResponse.device_code,
        interval,
        deviceCodeResponse.expires_in,
        abortController.signal
      );

      if (!pollResult.success) {
        const errorMessage = this.getErrorMessage(pollResult.error);
        onProgress?.('error', errorMessage);
        throw new Error(errorMessage);
      }

      onProgress?.('authorized', 'Авторизация успешна');
      return pollResult.token;
    } finally {
      this.activePolling.delete(pollingKey);
    }
  }

  cancelPolling(deviceCode: string): void {
    for (const [key, controller] of this.activePolling.entries()) {
      controller.abort();
      this.activePolling.delete(key);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getErrorMessage(error: TokenErrorResponse): string {
    switch (error.error) {
      case 'authorization_pending':
        return 'Ожидание авторизации пользователем';
      case 'slow_down':
        return 'Слишком частые запросы, замедление';
      case 'expired_token':
        return 'Код авторизации истёк. Пожалуйста, начните процесс заново';
      case 'access_denied':
        return 'Доступ запрещён. Пользователь отклонил авторизацию';
      case 'invalid_grant':
        return 'Неверный код авторизации';
      case 'invalid_client':
        return 'Неверный client_id';
      case 'invalid_request':
        return error.error_description || 'Неверный запрос';
      default:
        return error.error_description || 'Неизвестная ошибка';
    }
  }
}