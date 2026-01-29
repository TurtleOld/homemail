import fs from 'node:fs/promises';
import path from 'node:path';
import { encryptData, decryptData } from './storage';

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));
const TOKENS_FILE = path.join(DATA_DIR, 'oauth_tokens.enc');

export interface StoredToken {
  accountId: string;
  accessToken: string;
  tokenType: string;
  expiresAt?: number;
  refreshToken?: string;
  scopes?: string[];
  issuedAt: number;
}

let tokensCache: Map<string, StoredToken> | null = null;

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
  }
}

export class OAuthTokenStore {
  async loadTokens(): Promise<Map<string, StoredToken>> {
    if (tokensCache !== null) {
      return tokensCache;
    }

    await ensureDataDir();
    tokensCache = new Map();

    try {
      const encryptedData = await fs.readFile(TOKENS_FILE, 'utf-8');
      const decryptedData = decryptData(encryptedData);

      if (decryptedData) {
        const tokens = JSON.parse(decryptedData) as Record<string, StoredToken>;
        const now = Date.now();

        console.log(`[OAuthTokenStore] Loading tokens from file, found ${Object.keys(tokens).length} token(s)`);

        for (const [accountId, token] of Object.entries(tokens)) {
          if (!token.expiresAt || token.expiresAt > now) {
            tokensCache.set(accountId, token);
            console.log(`[OAuthTokenStore] Loaded valid token for accountId: ${accountId}`);
          } else {
            console.log(`[OAuthTokenStore] Skipped expired token for accountId: ${accountId}`);
          }
        }

        if (tokensCache.size !== Object.keys(tokens).length) {
          await this.saveTokens();
        }
      } else {
        console.log('[OAuthTokenStore] No tokens file found or decryption failed');
      }
    } catch (error) {
      console.log(`[OAuthTokenStore] Failed to load tokens: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log(`[OAuthTokenStore] Token cache initialized with ${tokensCache.size} token(s)`);
    return tokensCache;
  }

  async saveTokens(): Promise<void> {
    if (tokensCache === null) {
      return;
    }

    await ensureDataDir();
    const tokensObj: Record<string, StoredToken> = {};
    
    for (const [accountId, token] of tokensCache.entries()) {
      tokensObj[accountId] = token;
    }

    const jsonData = JSON.stringify(tokensObj);
    const encryptedData = encryptData(jsonData);
    await fs.writeFile(TOKENS_FILE, encryptedData, 'utf-8');
  }

  async getToken(accountId: string): Promise<StoredToken | null> {
    const tokens = await this.loadTokens();
    const token = tokens.get(accountId);

    if (!token) {
      console.log(`[OAuthTokenStore] No token found for accountId: ${accountId}`);
      console.log(`[OAuthTokenStore] Available accountIds: ${Array.from(tokens.keys()).join(', ')}`);
      return null;
    }

    if (token.expiresAt && token.expiresAt <= Date.now()) {
      if (token.refreshToken) {
        console.log(`[OAuthTokenStore] Token expired for accountId: ${accountId}, but has refresh token`);
        return token;
      }
      console.log(`[OAuthTokenStore] Token expired for accountId: ${accountId}, no refresh token available`);
      tokensCache?.delete(accountId);
      await this.saveTokens();
      return null;
    }

    console.log(`[OAuthTokenStore] Valid token found for accountId: ${accountId}`);
    return token;
  }

  async saveToken(accountId: string, token: Omit<StoredToken, 'accountId' | 'issuedAt'>): Promise<void> {
    const tokens = await this.loadTokens();

    const storedToken: StoredToken = {
      accountId,
      ...token,
      issuedAt: Date.now(),
    };

    console.log(`[OAuthTokenStore] Saving token for accountId: ${accountId}, hasRefreshToken: ${!!token.refreshToken}`);
    tokens.set(accountId, storedToken);
    tokensCache = tokens;
    await this.saveTokens();
    console.log(`[OAuthTokenStore] Token saved successfully for accountId: ${accountId}`);
  }

  async deleteToken(accountId: string): Promise<void> {
    const tokens = await this.loadTokens();
    tokens.delete(accountId);
    tokensCache = tokens;
    await this.saveTokens();
  }

  async clearAllTokens(): Promise<void> {
    tokensCache = new Map();
    await this.saveTokens();
  }

  async hasValidToken(accountId: string): Promise<boolean> {
    const token = await this.getToken(accountId);
    const isValid = token !== null;
    console.log(`[OAuthTokenStore] hasValidToken for accountId: ${accountId} = ${isValid}`);
    return isValid;
  }
}