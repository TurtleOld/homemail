import type { FolderRole, QuickFilterType } from './types';

export function getQuickFilterFolderRole(
  filter?: QuickFilterType
): Extract<FolderRole, 'inbox' | 'drafts' | 'sent'> | undefined {
  switch (filter) {
    case 'incoming':
      return 'inbox';
    case 'drafts':
      return 'drafts';
    case 'sent':
      return 'sent';
    default:
      return undefined;
  }
}
