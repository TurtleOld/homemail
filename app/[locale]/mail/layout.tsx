'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Sidebar } from '@/components/sidebar';
import { MessageList } from '@/components/message-list';
import { MessageViewer } from '@/components/message-viewer';
import { QuickFilters } from '@/components/quick-filters';
import { SearchBar } from '@/components/search-bar';
import type {
  Folder,
  Account,
  MessageListItem,
  MessageDetail,
  Draft,
  QuickFilterType,
  FilterGroup,
  Label,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Trash2,
  Star,
  Mail,
  MailOpen,
  FileText,
  X,
  Menu,
  ArrowLeft,
  Folder as FolderIcon,
  Inbox,
  Send,
  AlertTriangle,
  AlertCircle,
  WifiOff,
  Archive,
  MessageSquare,
  FileDown,
  MoreHorizontal,
  Tag,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useDebounce } from '@/lib/hooks';
import { FilterQueryParser } from '@/lib/filter-parser';
import { useSwipeable } from 'react-swipeable';
import { useHotkeys } from 'react-hotkeys-hook';
import { getMailViewport } from '@/lib/mail-responsive';
import { getQuickFilterFolderRole } from '@/lib/quick-filter-utils';

interface MinimizedDraft {
  id: string;
  to: string;
  subject: string;
  html: string;
}

interface Signature {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
  context?: 'work' | 'personal' | 'autoReply' | 'general';
}

interface UserSettings {
  signature?: string;
  signatures?: Signature[];
  theme: 'light' | 'dark' | 'system';
  ui?: {
    density: 'compact' | 'comfortable' | 'spacious';
    messagesPerPage: number;
    sortBy: 'date' | 'from' | 'subject' | 'size';
    sortOrder: 'asc' | 'desc';
    groupBy: 'none' | 'date' | 'sender';
  };
  notifications?: {
    enabled?: boolean;
    browser?: boolean;
    onlyImportant?: boolean;
    sound?: boolean;
  };
}

interface ServerStatus {
  smtp: 'up' | 'down' | 'unknown';
  imapJmap: 'up' | 'down' | 'unknown';
  queueSize: number | null;
  deliveryErrors: number | null;
  updatedAt: string;
}

const Compose = dynamic(() => import('@/components/compose').then((mod) => mod.Compose), {
  ssr: false,
  loading: () => null,
});

export default function MailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations('layout');

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>('inbox');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allMessagesSelected, setAllMessagesSelected] = useState(false);
  const [isSelectingAllInFolder, setIsSelectingAllInFolder] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{
    subject: string;
    from: { email: string; name?: string };
    body: string;
    recipients?: string[];
  } | null>(null);
  const [forwardFrom, setForwardFrom] = useState<{ subject: string; body: string } | null>(null);
  const [composerMode, setComposerMode] = useState<'floating' | 'inline'>('floating');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterType | undefined>();
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>();
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [minimizedDrafts, setMinimizedDrafts] = useState<MinimizedDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [loadedDraft, setLoadedDraft] = useState<Draft | null>(null);
  const [messageListWidth, setMessageListWidth] = useState(() => {
    if (typeof window === 'undefined') return 400;
    const saved = window.localStorage.getItem('messageListWidth');
    if (!saved) return 400;
    const width = parseInt(saved, 10);
    if (Number.isNaN(width)) return 400;
    if (width < 360 || width > 640) return 400;
    return width;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ pointerX: 0, width: 400 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const listScrollPositionsRef = useRef(new Map<string, number>());
  const [conversationView, setConversationView] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('conversationView');
    return saved === 'true';
  });
  const debouncedSearch = useDebounce(searchQuery, 400);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('conversationView', conversationView.toString());
    }
  }, [conversationView]);

  useEffect(() => {
    const checkViewport = () => {
      const viewport = getMailViewport(window.innerWidth);
      setIsMobile(viewport === 'mobile');
      setIsTablet(viewport === 'tablet');
      if (viewport === 'desktop') {
        setSidebarOpen(false);
      }
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    const updateConnectionState = () => setIsOnline(window.navigator.onLine);
    updateConnectionState();
    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);
    return () => {
      window.removeEventListener('online', updateConnectionState);
      window.removeEventListener('offline', updateConnectionState);
    };
  }, []);

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (res.status === 401) {
        router.push(`/${locale}/login?redirect=/${locale}/mail`);
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') return false;
      return failureCount < 2;
    },
    staleTime: 60 * 1000,
  });

  const { data: labels = [] } = useQuery<Label[]>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/mail/labels');
      if (!res.ok) throw new Error('Failed to load labels');
      return res.json();
    },
  });

  useEffect(() => {
    if (
      'Notification' in window &&
      Notification.permission === 'default' &&
      settings?.notifications?.browser
    ) {
      Notification.requestPermission();
    }
  }, [settings?.notifications?.browser]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = { pointerX: e.clientX, width: messageListWidth };
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = e.clientX - resizeStartRef.current.pointerX;
      const newWidth = Math.min(640, Math.max(360, resizeStartRef.current.width + delta));
      setMessageListWidth(newWidth);
      localStorage.setItem('messageListWidth', newWidth.toString());
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
        router.push(`/${locale}/login?redirect=/${locale}/mail`);
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch account');
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') return false;
      return failureCount < 2;
    },
  });

  const { data: folders = [], refetch: refetchFolders } = useQuery<Folder[]>({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await fetch('/api/mail/folders');
      if (res.status === 401) {
        router.push(`/${locale}/login?redirect=/${locale}/mail`);
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch folders');
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') return false;
      return failureCount < 2;
    },
    refetchInterval: realtimeConnected ? 30000 : 10000,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  const { data: serverStatus, isError: isServerStatusError } = useQuery<ServerStatus>({
    queryKey: ['server-status'],
    queryFn: async () => {
      const res = await fetch('/api/mail/status');
      if (!res.ok) throw new Error('Failed to load server status');
      return res.json();
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const hasConnectionProblem = isServerStatusError || serverStatus?.imapJmap === 'down';

  useEffect(() => {
    if (!folders.length) return;

    const inboxFolder = folders.find((folder) => folder.role === 'inbox');
    if (!inboxFolder) return;

    setSelectedFolderId((current) => {
      if (!current || current === 'inbox') {
        return inboxFolder.id;
      }

      const exists = folders.some((folder) => folder.id === current);
      return exists ? current : inboxFolder.id;
    });
  }, [folders]);

  const {
    data: messagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isMessagesLoading,
    isError: isMessagesError,
    error: messagesError,
    refetch: refetchMessages,
  } = useInfiniteQuery<{
    messages: MessageListItem[];
    nextCursor?: string;
  }>({
    queryKey: ['messages', selectedFolderId, debouncedSearch, quickFilter, filterGroup],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('folderId', selectedFolderId || 'inbox');
      if (pageParam && typeof pageParam === 'string') {
        params.set('cursor', pageParam);
      }
      const uiSettings = settings?.ui;
      if (uiSettings?.messagesPerPage) {
        params.set('limit', uiSettings.messagesPerPage.toString());
      }
      if (debouncedSearch) {
        params.set('q', debouncedSearch);
      }
      if (quickFilter || filterGroup) {
        const messageFilter = { quickFilter, filterGroup };
        params.set('messageFilter', JSON.stringify(messageFilter));
      }
      const res = await fetch(`/api/mail/messages?${params}`);
      if (res.status === 401) {
        router.push(`/${locale}/login?redirect=/${locale}/mail`);
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!selectedFolderId,
    initialPageParam: undefined,
    refetchInterval: realtimeConnected ? false : 10000,
    refetchOnWindowFocus: !realtimeConnected,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') return false;
      return failureCount < 2;
    },
  });

  const uiSettings = useMemo(() => {
    return (
      settings?.ui || {
        sortBy: 'date' as const,
        sortOrder: 'desc' as const,
        groupBy: 'none' as const,
      }
    );
  }, [settings?.ui?.sortBy, settings?.ui?.sortOrder, settings?.ui?.groupBy]);

  const messages = useMemo(() => {
    let allMessages = messagesData?.pages.flatMap((p) => p.messages) || [];

    allMessages = allMessages.map((msg) => ({
      ...msg,
      date: msg.date instanceof Date ? msg.date : new Date(msg.date),
    }));

    allMessages.sort((a, b) => {
      let comparison = 0;
      switch (uiSettings.sortBy) {
        case 'date': {
          const aDate = a.date instanceof Date ? a.date : new Date(a.date);
          const bDate = b.date instanceof Date ? b.date : new Date(b.date);
          comparison = aDate.getTime() - bDate.getTime();
          break;
        }
        case 'from':
          comparison = (a.from.name || a.from.email).localeCompare(
            b.from.name || b.from.email,
            locale
          );
          break;
        case 'subject':
          comparison = (a.subject || '').localeCompare(b.subject || '', locale);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
      }
      return uiSettings.sortOrder === 'asc' ? comparison : -comparison;
    });

    return allMessages;
  }, [messagesData, quickFilter, uiSettings, locale]);

  const listScopeKey = useMemo(
    () =>
      JSON.stringify({
        folder: selectedFolderId,
        search: debouncedSearch,
        quickFilter,
        filterGroup,
      }),
    [selectedFolderId, debouncedSearch, quickFilter, filterGroup]
  );

  useEffect(() => {
    setSelectedIds(new Set());
    setAllMessagesSelected(false);
  }, [selectedFolderId, debouncedSearch, quickFilter, filterGroup]);

  const {
    data: selectedMessage,
    isLoading: isMessageLoading,
    error: messageError,
  } = useQuery<MessageDetail>({
    queryKey: ['message', selectedMessageId],
    queryFn: async () => {
      if (!selectedMessageId) return null;
      const res = await fetch(`/api/mail/messages/${selectedMessageId}`);
      if (res.status === 401) {
        router.push(`/${locale}/login?redirect=/${locale}/mail`);
        throw new Error('Unauthorized');
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to fetch message' }));
        throw new Error(errorData.error || 'Failed to fetch message');
      }
      const data = await res.json();
      if (!data || !data.id) throw new Error('Invalid message data received');
      return data;
    },
    enabled: !!selectedMessageId,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') return false;
      return failureCount < 2;
    },
  });

  const errorShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (messageError && messageError instanceof Error) {
      const errorKey = `${selectedMessageId}-${messageError.message}`;
      if (errorShownRef.current !== errorKey && messageError.message !== 'Unauthorized') {
        errorShownRef.current = errorKey;
        toast.error(t('loadError') + ': ' + messageError.message);
      }
    } else if (!messageError) {
      errorShownRef.current = null;
    }
  }, [messageError, selectedMessageId, t]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let invalidateTimeout: NodeJS.Timeout | null = null;
    let lastInvalidateTime = 0;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 1000;

    const connect = () => {
      if (eventSource) eventSource.close();

      eventSource = new EventSource('/api/mail/realtime');

      eventSource.addEventListener('connected', () => {
        reconnectAttempts = 0;
        setRealtimeConnected(true);
      });

      eventSource.addEventListener('message.new', async (event: MessageEvent) => {
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        refetchFolders();

        const currentSettings = settingsRef.current;
        const notificationsEnabled = currentSettings?.notifications?.enabled !== false;
        const browserNotifications = currentSettings?.notifications?.browser !== false;
        const onlyImportant = currentSettings?.notifications?.onlyImportant === true;

        if (
          notificationsEnabled &&
          browserNotifications &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            const data = JSON.parse(event.data);
            const messageId = data.messageId || data.id;
            if (messageId) {
              const res = await fetch(`/api/mail/messages/${messageId}`);
              if (res.ok) {
                const message = await res.json();
                if (message && (!onlyImportant || message.flags?.important)) {
                  const notification = new Notification('New message', {
                    body: `${message.from?.name || message.from?.email || 'Unknown'}: ${message.subject || '(no subject)'}`,
                    icon: '/icons/mail-icon.png',
                    tag: message.id,
                    requireInteraction: false,
                  });
                  notification.onclick = () => {
                    window.focus();
                    notification.close();
                  };
                  if (currentSettings?.notifications?.sound) {
                    const audio = new Audio('/sounds/notification.mp3');
                    audio.play().catch(() => {});
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error showing notification:', error);
          }
        }
      });

      eventSource.addEventListener('mailbox.counts', () => {
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        refetchFolders();
      });

      eventSource.addEventListener('message.updated', () => {
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        refetchFolders();
      });

      eventSource.addEventListener('ping', () => {});

      eventSource.onerror = () => {
        setRealtimeConnected(false);
        if (eventSource?.readyState === EventSource.CLOSED) {
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
            reconnectAttempts++;
            reconnectTimeout = setTimeout(() => connect(), delay);
          }
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (invalidateTimeout) clearTimeout(invalidateTimeout);
      if (eventSource) eventSource.close();
      setRealtimeConnected(false);
    };
  }, [queryClient]);

  const updateMessageInList = useCallback(
    (messageId: string, updater: (message: MessageListItem) => MessageListItem | null) => {
      queryClient.setQueriesData({ queryKey: ['messages'] }, (oldData) => {
        if (!oldData || typeof oldData !== 'object') return oldData;
        const data = oldData as {
          pages: { messages: MessageListItem[]; nextCursor?: string }[];
          pageParams: unknown[];
        };
        const pages = data.pages.map((page) => ({
          ...page,
          messages: page.messages
            .map((message) => (message.id === messageId ? updater(message) : message))
            .filter((message): message is MessageListItem => message !== null),
        }));
        return { ...data, pages };
      });
    },
    [queryClient]
  );

  const updateMessageDetail = useCallback(
    (messageId: string, updater: (message: MessageDetail) => MessageDetail) => {
      queryClient.setQueryData(['message', messageId], (oldData) => {
        if (!oldData) return oldData;
        return updater(oldData as MessageDetail);
      });
    },
    [queryClient]
  );

  const updateFolderCount = useCallback(
    (folderId: string, delta: number) => {
      queryClient.setQueryData<Folder[]>(['folders'], (oldFolders) => {
        if (!oldFolders) return oldFolders;
        return oldFolders.map((folder) =>
          folder.id === folderId
            ? { ...folder, unreadCount: Math.max(0, folder.unreadCount + delta) }
            : folder
        );
      });
    },
    [queryClient]
  );

  const handleBulkAction = async (action: string, payload?: { folderId?: string }) => {
    if (selectedIds.size === 0) {
      toast.error(t('selectMessages'));
      return;
    }

    try {
      const res = await fetch('/api/mail/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), action, payload }),
      });

      if (!res.ok) {
        toast.error(t('actionError'));
        return;
      }

      toast.success(t('actionSuccess'));
      setAllMessagesSelected(false);
      setSelectedIds(new Set());

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ]);
      refetchFolders();
    } catch (error) {
      toast.error(t('connectionError'));
    }
  };

  const handleMoveMessage = async (messageId: string, folderId: string) => {
    try {
      const res = await fetch('/api/mail/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [messageId], action: 'move', payload: { folderId } }),
      });

      if (!res.ok) {
        toast.error(t('moveError'));
        return;
      }

      toast.success(t('moveSuccess'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ]);
      refetchFolders();
    } catch (error) {
      toast.error(t('connectionError'));
    }
  };

  const handleBulkExport = async () => {
    if (selectedIds.size === 0) {
      toast.error(t('selectForExport'));
      return;
    }

    try {
      const res = await fetch('/api/mail/messages/bulk/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: Array.from(selectedIds), format: 'zip' }),
      });

      if (!res.ok) {
        toast.error(t('exportError'));
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `messages_export_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(t('exportSuccess', { count: selectedIds.size }));
    } catch (error) {
      toast.error(t('exportErrorGeneric'));
    }
  };

  const handleBulkLabel = async (labelId: string) => {
    const selectedMessages = messages.filter((message) => selectedIds.has(message.id));
    if (selectedMessages.length === 0 || allMessagesSelected) {
      toast.error(t('labelsLoadedOnly'));
      return;
    }

    const shouldRemove = selectedMessages.every((message) => message.labels?.includes(labelId));

    try {
      const results = await Promise.all(
        selectedMessages.map((message) => {
          const currentLabels = message.labels || [];
          const labelIds = shouldRemove
            ? currentLabels.filter((id) => id !== labelId)
            : Array.from(new Set([...currentLabels, labelId]));

          return fetch(`/api/mail/messages/${message.id}/labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labelIds }),
          });
        })
      );

      if (results.some((result) => !result.ok)) {
        toast.error(t('labelsUpdateError'));
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success(t('labelsUpdated'));
    } catch {
      toast.error(t('labelsUpdateError'));
    }
  };

  const handleSelectAllInFolder = useCallback(async () => {
    if (!selectedFolderId || isSelectingAllInFolder) return;

    setIsSelectingAllInFolder(true);

    try {
      const params = new URLSearchParams();
      params.set('folderId', selectedFolderId);

      if (debouncedSearch) {
        params.set('q', debouncedSearch);
      }

      if (quickFilter || filterGroup) {
        params.set('messageFilter', JSON.stringify({ quickFilter, filterGroup }));
      }

      const res = await fetch(`/api/mail/messages/selection?${params.toString()}`);
      if (!res.ok) {
        toast.error(t('actionError'));
        return;
      }

      const data = (await res.json()) as { ids: string[]; total: number };
      setSelectedIds(new Set(data.ids));
      setAllMessagesSelected(true);
      toast.success(t('selected', { count: data.total }));
    } catch {
      toast.error(t('connectionError'));
    } finally {
      setIsSelectingAllInFolder(false);
    }
  }, [selectedFolderId, isSelectingAllInFolder, debouncedSearch, quickFilter, filterGroup, t]);

  const handleReply = () => {
    if (!selectedMessage) return;
    const replyRecipient = selectedMessage.replyTo?.[0] || selectedMessage.from;
    setReplyTo({
      subject: selectedMessage.subject,
      from: replyRecipient,
      body: selectedMessage.body.html || selectedMessage.body.text || '',
    });
    setForwardFrom(null);
    setLoadedDraft(null);
    setActiveDraftId(null);
    setComposerMode('inline');
    setComposeOpen(true);
  };

  const handleReplyAll = () => {
    if (!selectedMessage) return;
    const ownEmail = account?.email?.toLowerCase();
    const replyRecipients = selectedMessage.replyTo?.length
      ? selectedMessage.replyTo
      : [selectedMessage.from];
    const recipients = [...replyRecipients, ...selectedMessage.to, ...(selectedMessage.cc || [])]
      .filter((recipient) => recipient.email.toLowerCase() !== ownEmail)
      .filter(
        (recipient, index, values) =>
          values.findIndex((item) => item.email.toLowerCase() === recipient.email.toLowerCase()) ===
          index
      )
      .map((recipient) =>
        recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email
      );
    setReplyTo({
      subject: selectedMessage.subject,
      from: replyRecipients[0] || selectedMessage.from,
      body: selectedMessage.body.html || selectedMessage.body.text || '',
      recipients,
    });
    setForwardFrom(null);
    setLoadedDraft(null);
    setActiveDraftId(null);
    setComposerMode('inline');
    setComposeOpen(true);
  };

  const handleForward = () => {
    if (!selectedMessage) return;
    setForwardFrom({
      subject: selectedMessage.subject,
      body: selectedMessage.body.html || selectedMessage.body.text || '',
    });
    setReplyTo(null);
    setLoadedDraft(null);
    setActiveDraftId(null);
    setComposerMode('inline');
    setComposeOpen(true);
  };

  const handleArchive = async () => {
    if (!selectedMessage) return;
    await handleBulkAction('archive');
    setSelectedMessageId(null);
  };

  const handleDelete = async () => {
    if (selectedMessage) {
      await handleBulkAction('delete');
      setSelectedMessageId(null);
    }
  };

  const handleMinimizeDraft = useCallback((draft: MinimizedDraft) => {
    setMinimizedDrafts((prev) => {
      const existing = prev.find((d) => d.id === draft.id);
      if (existing) return prev.map((d) => (d.id === draft.id ? draft : d));
      return [...prev, draft];
    });
    setComposeOpen(false);
    setActiveDraftId(null);
  }, []);

  const handleRestoreDraft = useCallback(
    (draftId: string) => {
      const draft = minimizedDrafts.find((d) => d.id === draftId);
      if (draft) {
        setLoadedDraft(null);
        setActiveDraftId(draftId);
        setReplyTo(null);
        setForwardFrom(null);
        setComposerMode('floating');
        setComposeOpen(true);
      }
    },
    [minimizedDrafts]
  );

  const handleCloseDraft = useCallback((draftId: string) => {
    setMinimizedDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  const handleComposeClose = useCallback(() => {
    setComposeOpen(false);
    setReplyTo(null);
    setForwardFrom(null);
    setActiveDraftId(null);
    setLoadedDraft(null);
  }, []);

  const handleMessageDoubleClick = useCallback(
    async (message: MessageListItem) => {
      const selectedFolder = folders.find((f) => f.id === selectedFolderId);
      const isDraft = selectedFolder?.role === 'drafts';

      if (isDraft) {
        try {
          const res = await fetch(`/api/mail/messages/${message.id}`);
          if (!res.ok) {
            toast.error(t('draftLoadError'));
            return;
          }
          const messageDetail: MessageDetail = await res.json();
          const draft: Draft = {
            id: messageDetail.id,
            to: messageDetail.to.map((to) => to.email),
            cc: messageDetail.cc?.map((c) => c.email),
            bcc: messageDetail.bcc?.map((b) => b.email),
            subject: messageDetail.subject,
            html: messageDetail.body.html || messageDetail.body.text?.replace(/\n/g, '<br>') || '',
          };
          setLoadedDraft(draft);
          setActiveDraftId(draft.id ?? null);
          setReplyTo(null);
          setForwardFrom(null);
          setComposerMode('floating');
          setComposeOpen(true);
        } catch (error) {
          toast.error(t('draftLoadErrorTitle'));
        }
      } else {
        setSelectedMessageId(message.id);
        setSelectedIds(new Set([message.id]));
      }
    },
    [selectedFolderId, folders, t]
  );

  const activeDraft = activeDraftId ? minimizedDrafts.find((d) => d.id === activeDraftId) : null;
  const composeDraft =
    loadedDraft ||
    (activeDraft
      ? {
          id: activeDraft.id,
          to: activeDraft.to ? [activeDraft.to] : [],
          subject: activeDraft.subject,
          html: activeDraft.html,
        }
      : undefined);

  const handleFolderSelect = (id: string) => {
    setSelectedFolderId(id);
    setSelectedMessageId(null);
    setSelectedIds(new Set());
    if (isMobile || isTablet) setSidebarOpen(false);
  };

  const handleQuickFilterChange = (filter?: QuickFilterType) => {
    const folderRole = getQuickFilterFolderRole(filter);
    const targetFolder = folderRole
      ? folders.find((folder) => folder.role === folderRole)
      : undefined;

    if (targetFolder && targetFolder.id !== selectedFolderId) {
      setSelectedFolderId(targetFolder.id);
      setSelectedMessageId(null);
      setSelectedIds(new Set());
    }

    setQuickFilter(filter);
    setFilterGroup(undefined);
    if (isMobile || isTablet) setSidebarOpen(false);
  };

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    const hasStructuredSyntax =
      /(?:^|\s)(?:from|to|cc|bcc|subject|body|date|folder|tag|tags|size|attachment|attachments|filename|after|before|is|has|message-id|messageid|id):/i.test(
        query
      );
    if (hasStructuredSyntax) {
      const parsed = FilterQueryParser.parse(query);
      setQuickFilter(parsed.quickFilter);
      setFilterGroup(parsed.filterGroup);
    } else {
      setQuickFilter(undefined);
      setFilterGroup(undefined);
    }
  }, []);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId),
    [folders, selectedFolderId]
  );

  const handleMessageClick = (message: MessageListItem) => {
    setSelectedMessageId(message.id);
    setSelectedIds(new Set([message.id]));
    if (isMobile) setSidebarOpen(false);
  };

  useEffect(() => {
    if (isMobile || selectedMessageId || messages.length === 0) return;

    const currentFolder = folders.find((folder) => folder.id === selectedFolderId);
    const isInbox = selectedFolderId === 'inbox' || currentFolder?.role === 'inbox';

    if (!isInbox) return;

    const latestMessage = messages[0];
    if (!latestMessage) return;

    setSelectedMessageId(latestMessage.id);
    setSelectedIds(new Set([latestMessage.id]));
  }, [isMobile, selectedMessageId, messages, folders, selectedFolderId]);

  const folderIcons: Record<string, React.ReactNode> = {
    inbox: <Inbox className="h-4 w-4" />,
    sent: <Send className="h-4 w-4" />,
    drafts: <FileText className="h-4 w-4" />,
    trash: <Trash2 className="h-4 w-4" />,
    spam: <AlertTriangle className="h-4 w-4" />,
    custom: <FileText className="h-4 w-4" />,
  };

  useHotkeys(
    'ctrl+k, cmd+k',
    (e) => {
      e.preventDefault();
      if (!composeOpen) {
        setReplyTo(null);
        setForwardFrom(null);
        setLoadedDraft(null);
        setActiveDraftId(null);
        setComposerMode('floating');
        setComposeOpen(true);
      }
    },
    { enabled: !isMobile }
  );

  useHotkeys(
    '/',
    (e) => {
      if (composeOpen) return;
      e.preventDefault();
      document.querySelector<HTMLInputElement>('[data-mail-search]')?.focus();
    },
    { enabled: !composeOpen }
  );

  useHotkeys(
    'ctrl+/',
    (e) => {
      e.preventDefault();
      toast.info(t('hotkeysHint'));
    },
    { enabled: !isMobile }
  );

  useHotkeys(
    'delete, backspace',
    (e) => {
      if (selectedIds.size > 0 && !composeOpen) {
        e.preventDefault();
        handleBulkAction('delete');
      }
    },
    { enabled: !isMobile && selectedIds.size > 0 }
  );

  useHotkeys(
    'r',
    (e) => {
      if (selectedMessage && !composeOpen) {
        e.preventDefault();
        handleReply();
      }
    },
    { enabled: !isMobile && !!selectedMessage }
  );

  useHotkeys(
    'f',
    (e) => {
      if (selectedMessage && !composeOpen) {
        e.preventDefault();
        handleForward();
      }
    },
    { enabled: !isMobile && !!selectedMessage }
  );

  const swipeHandlers = useSwipeable({
    onSwipedRight: () => {
      if (isMobile && selectedMessageId) {
        setSelectedMessageId(null);
        setSelectedIds(new Set());
      }
    },
    trackMouse: false,
    trackTouch: true,
    preventScrollOnSwipe: true,
    delta: 50,
  });

  const selectedMessages = messages.filter((message) => selectedIds.has(message.id));
  const shouldMarkRead = selectedMessages.some((message) => message.flags.unread);
  const allSelectedImportant =
    selectedMessages.length > 0 && selectedMessages.every((message) => message.flags.important);
  const currentFolder = folders.find((folder) => folder.id === selectedFolderId);
  const isInboxFolder = currentFolder?.role === 'inbox';
  const isSpamFolder = currentFolder?.role === 'spam' || selectedFolderId === 'c';
  const inboxFolder = folders.find((folder) => folder.role === 'inbox');
  const isNavigationOverlay = isMobile || isTablet;

  return (
    <div
      id="main-content"
      className="mail-app-shell flex h-dvh flex-col overflow-hidden"
      role="main"
      aria-label={t('appLabel')}
    >
      {isMobile && (
        <div className="mail-panel-muted flex items-center gap-2 border-b border-white/80 p-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/70 text-slate-700 shadow-sm touch-manipulation hover:mail-hover-surface"
            aria-label={t('openMenu')}
          >
            <Menu className="h-6 w-6" />
          </Button>
          <div className="flex-1 text-slate-900">
            <img src="/icons/mail-icon.png" alt="Mail" className="h-5 w-5 inline mr-2" />
            <span className="text-lg font-bold">Mail</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setReplyTo(null);
              setForwardFrom(null);
              setLoadedDraft(null);
              setActiveDraftId(null);
              setComposerMode('floating');
              setComposeOpen(true);
            }}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/70 text-slate-700 shadow-sm touch-manipulation hover:mail-hover-surface"
            aria-label={t('composeMail')}
          >
            <FileText className="h-6 w-6" />
          </Button>
        </div>
      )}
      <div className="relative flex flex-1 overflow-hidden">
        {(!isNavigationOverlay || sidebarOpen) && (
          <>
            {isNavigationOverlay && sidebarOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <div
              className={`
              ${isNavigationOverlay ? 'fixed inset-y-0 left-0 z-50 w-60 bg-background shadow-lg' : 'relative overflow-hidden'}
              ${isNavigationOverlay && !sidebarOpen ? 'hidden' : ''}
            `}
            >
              <Sidebar
                folders={folders}
                account={account || null}
                selectedFolderId={selectedFolderId}
                onFolderSelect={handleFolderSelect}
                onCompose={() => {
                  setReplyTo(null);
                  setForwardFrom(null);
                  setLoadedDraft(null);
                  setActiveDraftId(null);
                  setComposerMode('floating');
                  setComposeOpen(true);
                  if (isNavigationOverlay) setSidebarOpen(false);
                }}
                activeQuickFilter={quickFilter}
                onQuickFilterChange={handleQuickFilterChange}
                isMobile={isNavigationOverlay}
                onClose={() => setSidebarOpen(false)}
                onDropMessage={handleMoveMessage}
                onRefreshFolders={async () => {
                  await queryClient.invalidateQueries({ queryKey: ['folders'] });
                  await refetchFolders();
                }}
              />
            </div>
          </>
        )}
        <section className="flex min-w-0 flex-1 flex-col" aria-label={t('workspaceLabel')}>
          {(!isMobile || !selectedMessageId) && (
            <header className="mail-panel-surface flex min-h-16 flex-shrink-0 items-center gap-4 border-b border-border px-4 py-2 max-md:min-h-14 max-md:px-3">
              {isTablet && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(true)}
                  className="min-h-11 min-w-11 flex-shrink-0 rounded-lg"
                  aria-label={t('openMenu')}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              <div className="min-w-0 flex-shrink-0 max-md:hidden">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selectedFolder?.name || t('allMail')}
                </p>
                <p className="text-xs text-muted-foreground">{t('searchAllMail')}</p>
              </div>
              <SearchBar
                value={searchQuery}
                onChange={handleSearchChange}
                onFilterChange={(nextQuickFilter, nextFilterGroup) => {
                  setQuickFilter(nextQuickFilter);
                  setFilterGroup(nextFilterGroup);
                }}
                placeholder={t('searchPlaceholder')}
                className="mx-auto w-full max-w-2xl"
              />
            </header>
          )}
          {!isOnline && (
            <div
              className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-muted/70 px-4 py-2 text-sm"
              role="status"
              aria-live="polite"
            >
              <WifiOff className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span>{t('offline')}</span>
            </div>
          )}
          {isOnline && hasConnectionProblem && (
            <div
              className="flex flex-shrink-0 items-center gap-3 border-b border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.1)] px-4 py-2 text-sm"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[hsl(var(--status-warning))]" />
              <span className="flex-1">{t('connectionWarning')}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg px-2 font-medium"
                onClick={() => router.push(`/${locale}/settings/stalwart`)}
              >
                {t('openSystemSettings')}
              </Button>
            </div>
          )}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {isMobile && selectedMessageId ? null : (
              <div
                className={`relative flex flex-col flex-shrink-0 border-r border-border ${isMobile ? 'w-full' : 'overflow-hidden'}`}
                style={
                  !isMobile
                    ? { width: isTablet ? 'clamp(340px, 44vw, 400px)' : `${messageListWidth}px` }
                    : {}
                }
                suppressHydrationWarning
                {...(isMobile ? swipeHandlers : {})}
              >
                <div className="mail-panel-muted flex min-h-12 flex-shrink-0 items-center border-b border-border px-2 py-1.5 transition-colors duration-200">
                  {selectedIds.size > 0 ? (
                    <div
                      className="flex min-w-0 flex-1 items-center gap-1"
                      role="toolbar"
                      aria-label={t('selectionActions')}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedIds(new Set());
                          setAllMessagesSelected(false);
                        }}
                        className="h-8 w-8 flex-shrink-0 max-md:h-11 max-md:w-11"
                        aria-label={t('clearSelection')}
                        title={t('clearSelection')}
                      >
                        <X className="h-4 w-4" strokeWidth={1.8} />
                      </Button>
                      <span
                        className="mr-auto min-w-7 truncate px-1 font-mono text-xs font-medium tabular-nums text-foreground"
                        aria-live="polite"
                      >
                        {selectedIds.size}
                      </span>
                      {isInboxFolder && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleBulkAction('archive')}
                          className="h-8 w-8 max-md:h-11 max-md:w-11"
                          aria-label={t('archiveAria')}
                          title={t('archive')}
                        >
                          <Archive className="h-4 w-4" strokeWidth={1.8} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleBulkAction(shouldMarkRead ? 'markRead' : 'markUnread')}
                        className="h-8 w-8 max-md:h-11 max-md:w-11"
                        aria-label={shouldMarkRead ? t('markReadAria') : t('markUnreadAria')}
                        title={shouldMarkRead ? t('markRead') : t('markUnread')}
                      >
                        {shouldMarkRead ? (
                          <MailOpen className="h-4 w-4" strokeWidth={1.8} />
                        ) : (
                          <Mail className="h-4 w-4" strokeWidth={1.8} />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 max-md:h-11 max-md:w-11"
                            aria-label={t('moveAria')}
                            title={t('move')}
                          >
                            <FolderIcon className="h-4 w-4" strokeWidth={1.8} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
                          {folders
                            .filter((folder) => folder.id !== selectedFolderId)
                            .map((folder) => (
                              <DropdownMenuItem
                                key={folder.id}
                                onClick={() => handleBulkAction('move', { folderId: folder.id })}
                                className="min-h-10"
                              >
                                {folderIcons[folder.role] || folderIcons.custom}
                                <span className="ml-2">{folder.name}</span>
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleBulkAction('delete')}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive max-md:h-11 max-md:w-11"
                        aria-label={t('deleteAria')}
                        title={t('delete')}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 max-md:h-11 max-md:w-11"
                            aria-label={t('moreActions')}
                            title={t('moreActions')}
                          >
                            <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isSpamFolder && inboxFolder && (
                            <DropdownMenuItem
                              onClick={() => handleBulkAction('move', { folderId: inboxFolder.id })}
                            >
                              <Inbox className="mr-2 h-4 w-4" strokeWidth={1.8} />
                              {t('notSpam')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger disabled={allMessagesSelected}>
                              <Tag className="mr-2 h-4 w-4" strokeWidth={1.8} />
                              {t('labels')}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="max-h-[280px] overflow-y-auto">
                              {labels.length > 0 ? (
                                labels.map((label) => (
                                  <DropdownMenuCheckboxItem
                                    key={label.id}
                                    checked={
                                      selectedMessages.length > 0 &&
                                      selectedMessages.every((message) =>
                                        message.labels?.includes(label.id)
                                      )
                                    }
                                    onCheckedChange={() => handleBulkLabel(label.id)}
                                  >
                                    <span
                                      className="mr-2 h-2 w-2 rounded-full border border-border"
                                      style={{
                                        backgroundColor: label.color || 'hsl(var(--primary))',
                                      }}
                                    />
                                    {label.name}
                                  </DropdownMenuCheckboxItem>
                                ))
                              ) : (
                                <DropdownMenuItem disabled>{t('noLabels')}</DropdownMenuItem>
                              )}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuItem onClick={() => handleBulkAction('star')}>
                            <Star className="mr-2 h-4 w-4" strokeWidth={1.8} />
                            {t('star')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleBulkAction(
                                allSelectedImportant ? 'unmarkImportant' : 'markImportant'
                              )
                            }
                          >
                            <AlertCircle className="mr-2 h-4 w-4" strokeWidth={1.8} />
                            {t('important')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleBulkExport}>
                            <FileDown className="mr-2 h-4 w-4" strokeWidth={1.8} />
                            {t('export')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2 max-md:gap-1">
                      <h2 className="mr-auto truncate px-1 text-sm font-semibold">
                        {selectedFolder?.name || t('allMail')}
                      </h2>
                      <QuickFilters
                        activeFilter={quickFilter}
                        onFilterChange={handleQuickFilterChange}
                      />
                      <Button
                        variant={conversationView ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setConversationView(!conversationView)}
                        className="h-8 rounded-lg px-2 shadow-none"
                        title={conversationView ? t('switchToNormal') : t('switchToThread')}
                        aria-label={conversationView ? t('switchToNormal') : t('switchToThread')}
                      >
                        <MessageSquare className="mr-1 h-4 w-4 max-md:mr-0" strokeWidth={1.8} />
                        <span className="max-md:hidden">{t('threads')}</span>
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-h-0">
                  <MessageList
                    key={listScopeKey}
                    messages={messages}
                    selectedIds={selectedIds}
                    conversationView={conversationView}
                    density={settings?.ui?.density || 'comfortable'}
                    groupBy={settings?.ui?.groupBy || 'none'}
                    onClearSelection={() => {
                      setSelectedIds(new Set());
                      setAllMessagesSelected(false);
                    }}
                    onSelect={(id, multi) => {
                      if (multi) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                        setAllMessagesSelected(false);
                      } else {
                        setSelectedIds(new Set([id]));
                        setAllMessagesSelected(false);
                      }
                    }}
                    onSelectAll={() => {
                      if (selectedIds.size === messages.length && messages.length > 0) {
                        setSelectedIds(new Set());
                        setAllMessagesSelected(false);
                      } else {
                        setSelectedIds(new Set(messages.map((m) => m.id)));
                        setAllMessagesSelected(false);
                      }
                    }}
                    onSelectAllInFolder={handleSelectAllInFolder}
                    isSelectingAllInFolder={isSelectingAllInFolder}
                    allMessagesSelected={allMessagesSelected}
                    onMessageClick={handleMessageClick}
                    onMessageDoubleClick={handleMessageDoubleClick}
                    onLoadMore={() => {
                      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                    }}
                    hasMore={hasNextPage}
                    isLoading={isMessagesLoading}
                    isFetchingMore={isFetchingNextPage}
                    isSearching={debouncedSearch.length > 0}
                    error={isMessagesError ? (messagesError as Error) : null}
                    onRetry={() => void refetchMessages()}
                    initialTopMostItemIndex={listScrollPositionsRef.current.get(listScopeKey) || 0}
                    onTopMostItemChange={(index) => {
                      listScrollPositionsRef.current.set(listScopeKey, index);
                    }}
                    onDragStart={() => {}}
                  />
                </div>
              </div>
            )}
            {!isMobile && (
              <div
                className="group relative hidden w-1 flex-shrink-0 cursor-col-resize bg-transparent transition-colors lg:block"
                onMouseDown={handleMouseDown}
              >
                <div className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2 rounded-full bg-border/45 opacity-70 group-hover:bg-border group-hover:opacity-100" />
              </div>
            )}
            {isMobile && !selectedMessageId ? null : (
              <div
                className={`
              flex-1 min-w-0
              ${isMobile ? 'fixed inset-0 z-40 bg-background' : 'overflow-hidden'}
              ${isMobile && !selectedMessageId ? 'hidden' : ''}
            `}
                {...(isMobile && selectedMessageId ? swipeHandlers : {})}
              >
                {isMobile && (
                  <div className="mail-panel-muted flex items-center gap-2 border-b border-white/80 p-3 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedMessageId(null);
                        setSelectedIds(new Set());
                      }}
                      className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/70 text-slate-700 shadow-sm touch-manipulation hover:mail-hover-surface"
                      aria-label={t('backToList')}
                    >
                      <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <span className="text-sm font-medium truncate flex-1">
                      {selectedMessage?.subject || ''}
                    </span>
                  </div>
                )}
                <MessageViewer
                  key={selectedMessageId || 'empty-viewer'}
                  message={selectedMessage || null}
                  onReply={handleReply}
                  onReplyAll={handleReplyAll}
                  onForward={handleForward}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onStar={(starred) => {
                    if (!selectedMessageId) return;
                    updateMessageInList(selectedMessageId, (message) => ({
                      ...message,
                      flags: { ...message.flags, starred },
                    }));
                    updateMessageDetail(selectedMessageId, (message) => ({
                      ...message,
                      flags: { ...message.flags, starred },
                    }));
                  }}
                  onMarkRead={(read) => {
                    if (!selectedMessageId) return;
                    const message = messages.find((m) => m.id === selectedMessageId);
                    const wasUnread = message?.flags.unread;
                    updateMessageInList(selectedMessageId, (message) => ({
                      ...message,
                      flags: { ...message.flags, unread: !read },
                    }));
                    updateMessageDetail(selectedMessageId, (message) => ({
                      ...message,
                      flags: { ...message.flags, unread: !read },
                    }));
                    if (selectedFolderId && wasUnread !== undefined) {
                      const delta = read && wasUnread ? -1 : !read && !wasUnread ? 1 : 0;
                      if (delta !== 0) updateFolderCount(selectedFolderId, delta);
                    }
                    queryClient.invalidateQueries({ queryKey: ['folders'] });
                    refetchFolders();
                  }}
                  onToggleImportant={(important) => {
                    if (!selectedMessageId) return;
                    updateMessageInList(selectedMessageId, (message) => ({
                      ...message,
                      flags: { ...message.flags, important },
                    }));
                    updateMessageDetail(selectedMessageId, (message) => ({
                      ...message,
                      flags: { ...message.flags, important },
                    }));
                  }}
                  allowRemoteImages={allowRemoteImages}
                  isLoading={isMessageLoading}
                  hasSelection={!!selectedMessageId}
                  error={messageError}
                  isMobile={isMobile}
                  inlineComposer={
                    composeOpen && composerMode === 'inline' ? (
                      <Compose
                        open
                        mode="inline"
                        onClose={handleComposeClose}
                        replyTo={replyTo || undefined}
                        forwardFrom={forwardFrom || undefined}
                        signatures={settings?.signatures || []}
                      />
                    ) : null
                  }
                />
              </div>
            )}
          </div>
        </section>
      </div>
      <Compose
        open={composeOpen && composerMode === 'floating'}
        mode="floating"
        onClose={handleComposeClose}
        onMinimize={handleMinimizeDraft}
        replyTo={replyTo || undefined}
        forwardFrom={forwardFrom || undefined}
        initialDraft={composeDraft}
        signatures={settings?.signatures || []}
      />
      {minimizedDrafts.length > 0 && (
        <div className="fixed bottom-0 right-4 flex gap-2 z-50 max-md:right-2 max-md:bottom-16">
          {minimizedDrafts.map((draft) => (
            <div
              key={draft.id}
              className="flex cursor-pointer items-center gap-2 rounded-t-2xl border border-white/80 bg-background/95 px-3 py-2 shadow-lg transition-colors hover:mail-hover-surface"
              onClick={() => handleRestoreDraft(draft.id)}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm max-w-[150px] truncate">
                {draft.subject || draft.to || ''}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseDraft(draft.id);
                }}
                className="p-1 hover:bg-destructive/20 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
