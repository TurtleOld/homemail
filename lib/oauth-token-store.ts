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
        
        for (const [accountId, token] of Object.entries(tokens)) {
          if (!token.expiresAt || token.expiresAt > now) {
            tokensCache.set(accountId, token);
          }
        }
        
        if (tokensCache.size !== Object.keys(tokens).length) {
          await this.saveTokens();
        }
      }
    } catch {
    }

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
      return null;
    }

    if (token.expiresAt && token.expiresAt <= Date.now()) {
      if (token.refreshToken) {
        return token;
      }
      tokensCache?.delete(accountId);
      await this.saveTokens();
      return null;
    }

    return token;
  }

  async saveToken(accountId: string, token: Omit<StoredToken, 'accountId' | 'issuedAt'>): Promise<void> {
    const tokens = await this.loadTokens();
    
    const storedToken: StoredToken = {
      accountId,
      ...token,
      issuedAt: Date.now(),
    };

    tokens.set(accountId, storedToken);
    tokensCache = tokens;
    await this.saveTokens();
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
    return token !== null;
  }
}