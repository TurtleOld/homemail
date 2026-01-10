'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/sidebar';
import { MessageList } from '@/components/message-list';
import { MessageViewer } from '@/components/message-viewer';
import { Compose } from '@/components/compose';
import type { Folder, Account, MessageListItem, MessageDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Trash2, Star, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useDebounce } from '@/lib/hooks';

export default function MailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>('inbox');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ subject: string; from: { email: string; name?: string }; body: string } | null>(null);
  const [forwardFrom, setForwardFrom] = useState<{ subject: string; body: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [messageListWidth, setMessageListWidth] = useState(() => {
    if (typeof window === 'undefined') return 400;
    const saved = window.localStorage.getItem('messageListWidth');
    if (!saved) return 400;
    const width = parseInt(saved, 10);
    if (Number.isNaN(width)) return 400;
    if (width < 300 || width > 800) return 400;
    return width;
  });
  const [isResizing, setIsResizing] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 400);
  const queryClient = useQueryClient();

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 256;
      if (newWidth >= 300 && newWidth <= 800) {
        setMessageListWidth(newWidth);
        localStorage.setItem('messageListWidth', newWidth.toString());
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const { data: account } = useQuery<Account>({
    queryKey: ['account'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch account');
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
  });

  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await fetch('/api/mail/folders');
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch folders');
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
    refetchInterval: 30000,
  });

  const { data: messagesData, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<{
    messages: MessageListItem[];
    nextCursor?: string;
  }>({
    queryKey: ['messages', selectedFolderId, debouncedSearch],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('folderId', selectedFolderId || 'inbox');
      if (pageParam && typeof pageParam === 'string') {
        params.set('cursor', pageParam);
      }
      if (debouncedSearch) {
        params.set('q', debouncedSearch);
      }
      const res = await fetch(`/api/mail/messages?${params}`);
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!selectedFolderId,
    initialPageParam: undefined,
    refetchInterval: 10000,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
  });

  const messages = messagesData?.pages.flatMap((p) => p.messages) || [];

  const { data: selectedMessage } = useQuery<MessageDetail>({
    queryKey: ['message', selectedMessageId],
    queryFn: async () => {
      if (!selectedMessageId) return null;
      const res = await fetch(`/api/mail/messages/${selectedMessageId}`);
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch message');
      return res.json();
    },
    enabled: !!selectedMessageId,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
  });

  useEffect(() => {
    const eventSource = new EventSource('/api/mail/realtime');
    eventSource.addEventListener('message.new', () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    });
    eventSource.addEventListener('mailbox.counts', () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    });
    eventSource.addEventListener('message.updated', () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    });
    return () => eventSource.close();
  }, [queryClient]);

  const handleBulkAction = async (action: string) => {
    if (selectedIds.size === 0) {
      toast.error('Выберите письма');
      return;
    }

    try {
      const res = await fetch('/api/mail/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action,
        }),
      });

      if (!res.ok) {
        toast.error('Ошибка выполнения действия');
        return;
      }

      toast.success('Действие выполнено');
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    } catch (error) {
      toast.error('Ошибка соединения');
    }
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setReplyTo({
      subject: selectedMessage.subject,
      from: selectedMessage.from,
      body: selectedMessage.body.html || selectedMessage.body.text || '',
    });
    setForwardFrom(null);
    setComposeOpen(true);
  };

  const handleReplyAll = () => {
    handleReply();
  };

  const handleForward = () => {
    if (!selectedMessage) return;
    setForwardFrom({
      subject: selectedMessage.subject,
      body: selectedMessage.body.html || selectedMessage.body.text || '',
    });
    setReplyTo(null);
    setComposeOpen(true);
  };

  const handleDelete = async () => {
    if (selectedMessage) {
      await handleBulkAction('delete');
      setSelectedMessageId(null);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          folders={folders}
          account={account || null}
          selectedFolderId={selectedFolderId}
          onFolderSelect={(id) => {
            setSelectedFolderId(id);
            setSelectedMessageId(null);
            setSelectedIds(new Set());
          }}
          onCompose={() => {
            setReplyTo(null);
            setForwardFrom(null);
            setComposeOpen(true);
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <div className="relative flex-shrink-0" style={{ width: `${messageListWidth}px` }} suppressHydrationWarning>
          <MessageList
            messages={messages}
            selectedIds={selectedIds}
            onSelect={(id, multi) => {
              if (multi) {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) {
                    next.delete(id);
                  } else {
                    next.add(id);
                  }
                  return next;
                });
              } else {
                setSelectedIds(new Set([id]));
              }
            }}
            onSelectAll={() => {
              if (selectedIds.size === messages.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(messages.map((m) => m.id)));
              }
            }}
            onMessageClick={(message) => {
              setSelectedMessageId(message.id);
              setSelectedIds(new Set([message.id]));
            }}
            onLoadMore={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            hasMore={hasNextPage}
          />
        </div>
        <div
          className="group relative w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 transition-colors"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border group-hover:bg-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <MessageViewer
          message={selectedMessage || null}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onDelete={handleDelete}
          onStar={(starred) => {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
          }}
          onMarkRead={(read) => {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['folders'] });
          }}
          allowRemoteImages={allowRemoteImages}
          />
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="border-t bg-muted/50 p-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">Выбрано: {selectedIds.size}</span>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('markRead')}>
              <Mail className="mr-2 h-4 w-4" />
              Прочитано
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('markUnread')}>
              Непрочитано
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('star')}>
              <Star className="mr-2 h-4 w-4" />
              В избранное
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('delete')}>
              <Trash2 className="mr-2 h-4 w-4" />
              Удалить
            </Button>
          </div>
        </div>
      )}
      <Compose
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setReplyTo(null);
          setForwardFrom(null);
        }}
        replyTo={replyTo || undefined}
        forwardFrom={forwardFrom || undefined}
      />
      {children}
    </div>
  );
}
