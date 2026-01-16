'use client';

import { useState, memo } from 'react';
import type { MessageListItem } from '@/lib/types';
import type { ThreadGroup } from '@/lib/thread-utils';
import { formatDate } from '@/lib/utils';
import { Star, StarOff, Mail, MailOpen, Paperclip, AlertCircle, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageItem } from './message-list';

interface ThreadItemProps {
  thread: ThreadGroup;
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onMessageClick: (message: MessageListItem) => void;
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onDragStart?: (messageId: string) => void;
  onToggleImportant?: (messageId: string, important: boolean) => void;
  isExpanded?: boolean;
  onToggleExpand?: (threadId: string) => void;
}

export const ThreadItem = memo(function ThreadItem({
  thread,
  selectedIds,
  onSelect,
  onMessageClick,
  onMessageDoubleClick,
  onDragStart,
  onToggleImportant,
  isExpanded = false,
  onToggleExpand,
}: ThreadItemProps) {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);
  const expanded = onToggleExpand ? isExpanded : localExpanded;
  const toggleExpanded = onToggleExpand
    ? () => onToggleExpand(thread.threadId)
    : () => setLocalExpanded((prev) => !prev);

  const latestMessage = thread.messages[0]!;
  const allSelected = thread.messages.every((m) => selectedIds.has(m.id));
  const someSelected = thread.messages.some((m) => selectedIds.has(m.id));

  const handleThreadClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      thread.messages.forEach((msg) => onSelect(msg.id, true));
    } else {
      onMessageClick(latestMessage);
    }
  };

  const handleThreadDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMessageDoubleClick) {
      onMessageDoubleClick(latestMessage);
    }
  };

  return (
    <div className="border-b">
      <article
        role="article"
        aria-label={`Тред: ${latestMessage.subject || 'без темы'}, ${thread.messages.length} сообщений`}
        className={cn(
          'flex cursor-pointer items-start gap-3 p-3 max-md:p-4 transition-all duration-200 hover:bg-muted/50 active:bg-muted/70 touch-manipulation hover:shadow-sm',
          someSelected && 'bg-muted/30'
        )}
        onClick={handleThreadClick}
        onDoubleClick={handleThreadDoubleClick}
      >
        <div className="flex items-start gap-2 mt-1">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) {
                el.indeterminate = someSelected && !allSelected;
              }
            }}
            onChange={(e) => {
              e.stopPropagation();
              thread.messages.forEach((msg) => {
                if (allSelected) {
                  if (selectedIds.has(msg.id)) {
                    const newSet = new Set(selectedIds);
                    newSet.delete(msg.id);
                    onSelect(msg.id, true);
                  }
                } else {
                  if (!selectedIds.has(msg.id)) {
                    onSelect(msg.id, true);
                  }
                }
              });
            }}
            onClick={(e) => e.stopPropagation()}
            className="max-md:scale-110 max-md:min-w-[24px] max-md:min-h-[24px] touch-manipulation focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label={`Выбрать тред ${latestMessage.subject || 'без темы'}`}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded();
            }}
            className="p-0.5 hover:bg-muted rounded transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2 flex-shrink-0"
            aria-label={expanded ? 'Свернуть тред' : 'Развернуть тред'}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 max-md:h-3 max-md:w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 max-md:h-3 max-md:w-3 text-muted-foreground" />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 max-md:gap-1">
            {thread.hasStarred ? (
              <Star className="h-4 w-4 max-md:h-3 max-md:w-3 flex-shrink-0 fill-yellow-500 text-yellow-500" />
            ) : (
              <StarOff className="h-4 w-4 max-md:h-3 max-md:w-3 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 max-md:gap-1">
                <span className={cn('truncate max-md:text-sm', thread.unreadCount > 0 ? 'font-bold' : 'font-normal')}>
                  {thread.messages.length > 1 ? (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3 max-md:h-2.5 max-md:w-2.5" />
                      {thread.messages.length} участников
                    </span>
                  ) : (
                    latestMessage.from.name || latestMessage.from.email
                  )}
                </span>
                {thread.messages.some((m) => m.flags.hasAttachments) && (
                  <Paperclip className="h-3 w-3 max-md:h-2.5 max-md:w-2.5 flex-shrink-0 text-muted-foreground" />
                )}
              </div>
              <div className="mt-1 max-md:mt-0.5 flex items-center gap-2 text-sm max-md:text-xs">
                <span className={cn('truncate', thread.unreadCount > 0 ? 'font-semibold' : 'text-muted-foreground')}>
                  {latestMessage.subject || '(без темы)'}
                </span>
                {thread.messages.length > 1 && (
                  <span className="text-xs max-md:text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {thread.messages.length}
                  </span>
                )}
                {thread.unreadCount > 0 && (
                  <span className="text-xs max-md:text-[10px] text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded">
                    {thread.unreadCount}
                  </span>
                )}
                <span className="text-xs max-md:text-[10px] text-muted-foreground flex-shrink-0">
                  {formatDate(thread.latestDate)}
                </span>
              </div>
              {latestMessage.snippet && !expanded && (
                <div className="mt-1 max-md:mt-0.5 truncate text-xs max-md:text-[10px] text-muted-foreground">
                  {latestMessage.snippet}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 max-md:hidden">
              {thread.unreadCount > 0 ? (
                <Mail className="h-4 w-4 text-primary" />
              ) : (
                <MailOpen className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>
      </article>
      {expanded && (
        <div className="bg-muted/20 pl-8 max-md:pl-4">
          {thread.messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              index={index}
              isSelected={selectedIds.has(message.id)}
              isFocused={false}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onMessageClick={onMessageClick}
              onMessageDoubleClick={onMessageDoubleClick}
              onDragStart={onDragStart}
              onToggleImportant={onToggleImportant}
            />
          ))}
        </div>
      )}
    </div>
  );
});
