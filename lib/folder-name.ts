import type { Folder } from '@/lib/types';

const LOCALIZED_ROLES = new Set<Folder['role']>(['inbox', 'sent', 'drafts', 'trash', 'spam']);

/**
 * Returns the localized display name for a system folder (by role, via the
 * `folderRoles` message namespace), falling back to the server-provided
 * name for custom folders.
 */
export function getLocalizedFolderName(
  folder: Pick<Folder, 'name' | 'role'>,
  t: (key: string) => string
): string {
  return LOCALIZED_ROLES.has(folder.role) ? t(folder.role) : folder.name;
}
