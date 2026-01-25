import { loadCredentials } from '@/lib/storage';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { processNewMessage } from '@/lib/process-new-message';

type Unsubscribe = () => void;

declare global {
  // eslint-disable-next-line no-var
  var __autoSortDaemonStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __autoSortDaemonUnsubscribes: Map<string, Unsubscribe> | undefined;
}

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('429') || msg.toLowerCase().includes('too many');
}

const EXCLUDED_FOLDER_ROLES = new Set(['sent', 'trash', 'drafts']);

function isDeletedFolderName(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes('deleted');
}

async function startWatchingAccount(accountId: string): Promise<void> {
  if (!globalThis.__autoSortDaemonUnsubscribes) {
    globalThis.__autoSortDaemonUnsubscribes = new Map();
  }

  if (globalThis.__autoSortDaemonUnsubscribes.has(accountId)) {
    return;
  }

  const provider = process.env.MAIL_PROVIDER === 'stalwart'
    ? getMailProviderForAccount(accountId)
    : getMailProvider();

  // Build a mailboxId -> role map so we can exclude sent/trash/drafts even if provider emits events
  // for multiple folders.
  let folderRoleById = new Map<string, string>();
  let folderNameById = new Map<string, string>();
  try {
    const folders = await provider.getFolders(accountId);
    folderRoleById = new Map(folders.map((f) => [f.id, f.role]));
    folderNameById = new Map(folders.map((f) => [f.id, f.name]));
  } catch (e) {
    // Not fatal; we'll process events without role filtering.
    console.error('[auto-sort-daemon] Failed to load folders for account:', accountId, e);
  }

  const unsubscribe = provider.subscribeToUpdates(accountId, async (event) => {
    if (event.type !== 'message.new') {
      return;
    }

    const messageId = event.data?.messageId || event.data?.id;
    const folderId = event.data?.folderId || event.data?.mailboxId || 'inbox';

    if (!messageId) {
      return;
    }

    const role = folderRoleById.get(folderId);
    if (role && EXCLUDED_FOLDER_ROLES.has(role)) {
      return;
    }

    const name = folderNameById.get(folderId);
    if (isDeletedFolderName(name)) {
      return;
    }

    try {
      // Small delay to let Stalwart finish indexing the message.
      await new Promise((r) => setTimeout(r, 250));
      const message = await provider.getMessage(accountId, messageId);
      if (!message) {
        return;
      }
      await processNewMessage(message, accountId, folderId, provider);
    } catch (e) {
      console.error('[auto-sort-daemon] Failed to process new message:', {
        accountId,
        messageId,
        folderId,
        error: e instanceof Error ? e.message : String(e),
      });

      // If we are rate-limited, give the provider some breathing room.
      if (isRateLimitError(e)) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  });

  globalThis.__autoSortDaemonUnsubscribes.set(accountId, unsubscribe);
  console.log('[auto-sort-daemon] Watching account for new messages:', accountId);
}

async function startAutoSortDaemon(): Promise<void> {
  if (globalThis.__autoSortDaemonStarted) {
    return;
  }
  globalThis.__autoSortDaemonStarted = true;

  console.log('[auto-sort-daemon] Starting auto-sort daemon...');

  const refreshAccounts = async () => {
    try {
      const creds = await loadCredentials();
      const accountIds = Array.from(creds.keys());

      if (accountIds.length === 0) {
        return;
      }

      for (const accountId of accountIds) {
        try {
          await startWatchingAccount(accountId);
        } catch (e) {
          console.error('[auto-sort-daemon] Failed to start watcher for account:', accountId, e);
        }
      }
    } catch (e) {
      console.error('[auto-sort-daemon] Failed to refresh accounts:', e);
    }
  };

  // Start immediately + refresh periodically (new accounts could be added).
  await refreshAccounts();
  setInterval(refreshAccounts, 60_000);
}

export { startAutoSortDaemon };
