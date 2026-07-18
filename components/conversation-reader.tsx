'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { MessageDetail, MessageThreadDetail } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useLocaleSettings } from '@/lib/hooks';
import { MessageViewer } from '@/components/message-viewer';

interface ConversationReaderProps {
  thread: MessageThreadDetail;
  activeMessage: MessageDetail;
  onActivateMessage: (messageId: string) => void;
  getMessageHref: (messageId: string) => string;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onStar?: (starred: boolean) => void;
  onMarkRead?: (read: boolean) => void;
  onToggleImportant?: (important: boolean) => void;
  allowRemoteImages?: boolean;
  inlineComposer?: React.ReactNode;
}

function plainPreview(message: MessageDetail): string {
  const source = message.body.text || message.body.html || '';
  return source
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function ConversationReader({
  thread,
  activeMessage,
  onActivateMessage,
  getMessageHref,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onStar,
  onMarkRead,
  onToggleImportant,
  allowRemoteImages,
  inlineComposer,
}: ConversationReaderProps) {
  const t = useTranslations('conversationReader');
  const tCommon = useTranslations('common');
  const localeSettings = useLocaleSettings();
  const messages = useMemo(() => {
    if (activeMessage.threadId && activeMessage.threadId !== thread.id) {
      return [activeMessage];
    }
    const byId = new Map(thread.messages.map((message) => [message.id, message]));
    byId.set(activeMessage.id, activeMessage);
    return [...byId.values()].sort(
      (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()
    );
  }, [activeMessage, thread.messages]);

  return (
    <section
      className="mail-panel-surface flex h-full min-h-0 flex-col overflow-hidden"
      aria-label={t('regionLabel')}
    >
      <header className="flex-shrink-0 border-b border-border px-6 py-4 max-md:px-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="min-w-0 flex-1 break-words text-xl font-semibold leading-tight max-md:text-base">
            {activeMessage.subject || tCommon('noSubject')}
          </h2>
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {t('messageCount', { count: thread.total })}
          </span>
        </div>
        {thread.truncated && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('truncated', { count: messages.length, total: thread.total })}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {messages.map((message) => {
          const isActive = message.id === activeMessage.id;
          if (isActive) {
            return (
              <div key={message.id} className="border-b border-border last:border-b-0">
                <MessageViewer
                  message={message}
                  hasSelection
                  layout="list-first"
                  embedded
                  hideSubject
                  onReply={onReply}
                  onReplyAll={onReplyAll}
                  onForward={onForward}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  onStar={onStar}
                  onMarkRead={onMarkRead}
                  onToggleImportant={onToggleImportant}
                  allowRemoteImages={allowRemoteImages}
                  inlineComposer={inlineComposer}
                />
              </div>
            );
          }

          const sender = message.from.name || message.from.email;
          return (
            <a
              key={message.id}
              href={getMessageHref(message.id)}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                onActivateMessage(message.id);
              }}
              className="group grid w-full grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-6 py-4 text-left transition-colors hover:mail-hover-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:px-3"
              aria-label={t('openMessage', { sender })}
            >
              <span className="truncate text-sm font-medium">{sender}</span>
              <span className="truncate text-sm text-muted-foreground max-md:col-span-2 max-md:row-start-2">
                {plainPreview(message)}
              </span>
              <time className="text-xs text-muted-foreground" dateTime={new Date(message.date).toISOString()}>
                {formatDate(message.date, localeSettings)}
              </time>
            </a>
          );
        })}
      </div>
    </section>
  );
}
