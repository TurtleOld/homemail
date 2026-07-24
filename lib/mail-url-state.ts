import type { QuickFilterType } from '@/lib/types';

export type MailPresentation = 'conversation' | 'flat';

export interface MailListUrlState {
  folderId?: string;
  search: string;
  quickFilter?: QuickFilterType;
  presentation: MailPresentation;
}

const QUICK_FILTERS = new Set<QuickFilterType>([
  'unread',
  'read',
  'starred',
  'important',
  'hasAttachments',
]);

function clean(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function parseMailListUrlState(searchParams: URLSearchParams): MailListUrlState {
  const filter = clean(searchParams.get('filter'));
  const view = searchParams.get('view');

  return {
    folderId: clean(searchParams.get('folder')),
    search: clean(searchParams.get('q')) ?? '',
    quickFilter: filter && QUICK_FILTERS.has(filter as QuickFilterType)
      ? filter as QuickFilterType
      : undefined,
    presentation: view === 'flat' ? 'flat' : 'conversation',
  };
}

export function serializeMailListUrlState(state: MailListUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.folderId) params.set('folder', state.folderId);
  if (state.search) params.set('q', state.search);
  if (state.quickFilter) params.set('filter', state.quickFilter);
  if (state.presentation === 'flat') params.set('view', 'flat');
  return params;
}

export function buildMailListHref(locale: string, state: MailListUrlState): string {
  const query = serializeMailListUrlState(state).toString();
  return `/${locale}/mail${query ? `?${query}` : ''}`;
}

export function buildMailMessageHref(
  locale: string,
  messageId: string,
  state: MailListUrlState,
): string {
  const query = serializeMailListUrlState(state).toString();
  const path = `/${locale}/mail/messages/${encodeURIComponent(messageId)}`;
  return `${path}${query ? `?${query}` : ''}`;
}
