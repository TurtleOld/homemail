import { cookies } from 'next/headers';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const SESSION_COOKIE_NAME = 'mail_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
const SESSIONS_FILE = path.join(process.cwd(), '.sessions.json');

export interface SessionData {
  sessionId: string;
  accountId: string;
  email: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionData>();

async function loadSessions(): Promise<void> {
  try {
    const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
    const loaded = JSON.parse(data) as Record<string, SessionData>;
    const now = Date.now();
    let loadedCount = 0;
    for (const [sessionId, session] of Object.entries(loaded)) {
      if (session.expiresAt > now) {
        sessions.set(sessionId, session);
        loadedCount++;
      }
    }
    if (loadedCount > 0) {
      console.log(`Loaded ${loadedCount} active session(s) from file`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Failed to load sessions:', error);
    }
  }
}

async function saveSessions(): Promise<void> {
  try {
    const data = Object.fromEntries(sessions);
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save sessions:', error);
  }
}

loadSessions().catch(console.error);

export async function createSession(accountId: string, email: string): Promise<string> {
  const sessionId = `sess_${crypto.randomBytes(32).toString('base64url')}`;
  const expiresAt = Date.now() + SESSION_DURATION;

  const session: SessionData = {
    sessionId,
    accountId,
    email,
    expiresAt,
  };

  sessions.set(sessionId, session);
  await saveSessions();

  const cookieStore = await cookies();
  const secureCookie = process.env.USE_HTTPS === 'true';
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION / 1000,
  });

  return sessionId;
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  let session = sessions.get(sessionId);

  if (!session) {
    await loadSessions();
    session = sessions.get(sessionId);
  }

  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      sessions.delete(sessionId);
      await saveSessions();
    }
    return null;
  }

  return session;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    sessions.delete(sessionId);
    await saveSessions();
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function cleanupExpiredSessions(): Promise<void> {
  const now = Date.now();
  let changed = false;
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(sessionId);
      changed = true;
    }
  }
  if (changed) {
    await saveSessions();
  }
}

setInterval(() => cleanupExpiredSessions().catch(console.error), 60 * 60 * 1000);
