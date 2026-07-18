'use client';

import { useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Sidebar } from '@/components/sidebar';
import { MessageList } from '@/components/message-list';
import { MessageViewer } from '@/components/message-viewer';
import { SearchBar } from '@/components/search-bar';
import { QuickFilters } from '@/components/quick-filters';
import { Button } from '@/components/ui/button';
import type { Folder, MessageDetail, MessageListItem, QuickFilterType } from '@/lib/types';

const folders: Folder[] = [
  { id: 'inbox', name: 'Inbox', role: 'inbox', unreadCount: 8 },
  { id: 'sent', name: 'Sent', role: 'sent', unreadCount: 0 },
  { id: 'drafts', name: 'Drafts', role: 'drafts', unreadCount: 2 },
  { id: 'archive', name: 'Archive', role: 'custom', unreadCount: 0 },
];

const messages: MessageListItem[] = [
  {
    id: 'm-104', threadId: 'thread-family-trip',
    from: { name: 'Elena Petrova', email: 'elena@example.test' },
    to: [{ email: 'alexander@example.test' }],
    subject: 'Family trip: tickets and final schedule',
    snippet: 'I attached the confirmed tickets and marked the meeting point.',
    date: new Date('2026-07-18T08:42:00Z'),
    flags: { unread: true, starred: true, important: false, hasAttachments: true }, size: 284000,
  },
  {
    id: 'm-103', threadId: 'thread-family-trip',
    from: { name: 'Alexander Pavlov', email: 'alexander@example.test' },
    to: [{ email: 'elena@example.test' }],
    subject: 'Family trip: tickets and final schedule',
    snippet: 'The morning train works for everyone.',
    date: new Date('2026-07-17T18:10:00Z'),
    flags: { unread: false, starred: false, important: false, hasAttachments: false }, size: 4200,
  },
  {
    id: 'm-102', threadId: 'thread-school',
    from: { name: 'School office', email: 'office@school.example' },
    to: [{ email: 'family@example.test' }],
    subject: 'Documents for the new school year',
    snippet: 'Please send the completed consent form before August 12.',
    date: new Date('2026-07-17T12:22:00Z'),
    flags: { unread: true, starred: false, important: true, hasAttachments: true }, size: 91000,
  },
  {
    id: 'm-101', threadId: 'thread-receipt',
    from: { name: 'North Market', email: 'receipts@northmarket.example' },
    to: [{ email: 'alexander@example.test' }],
    subject: 'Receipt for order 4819',
    snippet: 'Thank you. Your order has been delivered.',
    date: new Date('2026-07-16T15:05:00Z'),
    flags: { unread: false, starred: false, important: false, hasAttachments: true }, size: 32000,
  },
];

const readerMessage: MessageDetail = {
  id: 'm-104',
  from: { name: 'Elena Petrova', email: 'elena@example.test' },
  to: [{ name: 'Alexander Pavlov', email: 'alexander@example.test' }],
  subject: 'Family trip: tickets and final schedule',
  date: new Date('2026-07-18T08:42:00Z'),
  body: {
    html: '<h2>Everything is confirmed</h2><p>I attached the tickets and the final schedule. We meet by the main entrance at 08:15.</p><p>Please check the passenger names before tonight.</p>',
  },
  attachments: [{ id: 'ticket-pdf', filename: 'tickets-and-schedule.pdf', mime: 'application/pdf', size: 284000 }],
  flags: { unread: false, starred: true, important: false, hasAttachments: true },
  authResults: { dkim: 'pass', spf: 'pass', dmarc: 'pass' },
};

export function MailWorkspaceFixture({ screen }: { screen: 'list' | 'reader' }) {
  const t = useTranslations('layout');
  const locale = useLocale();
  const localizedFolders = folders.map((folder) => ({
    ...folder,
    name: locale === 'ru'
      ? ({ inbox: 'Входящие', sent: 'Отправленные', drafts: 'Черновики', archive: 'Архив' }[folder.id] || folder.name)
      : folder.name,
  }));
  const inboxLabel = locale === 'ru' ? 'Входящие' : 'Inbox';
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilterType | undefined>();

  return (
    <div className="product-shell flex h-dvh overflow-hidden" data-testid={`mail-${screen}-fixture`}>
      <div className="hidden flex-shrink-0 lg:block">
        <Sidebar
          folders={localizedFolders}
          account={{ id: 'fixture', email: 'alexander@example.test', displayName: 'Alexander Pavlov' }}
          selectedFolderId="inbox"
          onFolderSelect={() => {}}
          onCompose={() => {}}
          activeQuickFilter={filter}
          onQuickFilterChange={setFilter}
          layout="list-first"
        />
      </div>
      <main className="flex min-w-0 flex-1 flex-col bg-surface-panel">
        <header className="flex min-h-workspace-header items-center gap-3 border-b border-border px-workspace-gutter max-md:px-mobile-gutter">
          {screen === 'reader' && (
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-control" aria-label={t('backToList')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h1 className="w-28 truncate text-sm font-semibold">{inboxLabel}</h1>
          <SearchBar value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} className="mx-auto w-full max-w-2xl" />
        </header>
        {screen === 'list' ? (
          <>
            <div className="flex min-h-11 items-center gap-2 border-b border-border bg-surface-subtle px-3">
              <h2 className="mr-auto text-sm font-semibold">{inboxLabel}</h2>
              <QuickFilters activeFilter={filter} onFilterChange={setFilter} />
              <Button variant="secondary" size="sm" className="h-8 rounded-control px-2 shadow-none">
                <MessageSquare className="mr-1 h-4 w-4" />{t('threads')}
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <MessageList
                messages={messages}
                selectedIds={selectedIds}
                onSelect={(id) => setSelectedIds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
                onSelectAll={() => setSelectedIds(new Set(messages.map((message) => message.id)))}
                onMessageClick={() => {}}
                getMessageHref={(message) => `/${locale}/mail/messages/${message.id}?folder=inbox`}
                conversationView
                layout="list-first"
                density="comfortable"
              />
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1">
            <MessageViewer
              message={readerMessage}
              hasSelection
              layout="list-first"
              onReply={() => {}}
              onReplyAll={() => {}}
              onForward={() => {}}
              onArchive={() => {}}
              onDelete={() => {}}
            />
          </div>
        )}
      </main>
    </div>
  );
}
