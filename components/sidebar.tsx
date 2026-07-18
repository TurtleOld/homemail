'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Folder, Account, QuickFilterType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertTriangle,
  Settings,
  LogOut,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  User,
  RefreshCw,
  Mail,
  Star,
  Paperclip,
  ChevronsUpDown,
  ServerCog,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';

interface SidebarProps {
  folders: Folder[];
  account: Account | null;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string) => void;
  onCompose: () => void;
  activeQuickFilter?: QuickFilterType;
  onQuickFilterChange: (filter?: QuickFilterType) => void;
  isMobile?: boolean;
  onClose?: () => void;
  onDropMessage?: (messageId: string, folderId: string) => void;
  onRefreshFolders?: () => void;
  layout?: 'legacy' | 'list-first';
}

const folderIcons: Record<string, React.ReactNode> = {
  inbox: <Inbox className="h-4 w-4" />,
  sent: <Send className="h-4 w-4" />,
  drafts: <FileText className="h-4 w-4" />,
  trash: <Trash2 className="h-4 w-4" />,
  spam: <AlertTriangle className="h-4 w-4" />,
  custom: <FileText className="h-4 w-4" />,
};

export function Sidebar({
  folders,
  account,
  selectedFolderId,
  onFolderSelect,
  onCompose,
  activeQuickFilter,
  onQuickFilterChange,
  isMobile = false,
  onClose,
  onDropMessage,
  onRefreshFolders,
  layout = 'legacy',
}: SidebarProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('sidebar');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggedOverFolderId, setDraggedOverFolderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { data: accountsData } = useQuery<{
    accounts: Array<{ id: string; email: string; displayName?: string; isActive?: boolean }>;
  }>({
    queryKey: ['user-accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) {
        throw new Error('Failed to load accounts');
      }
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const switchAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch('/api/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to switch account');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account'] });
      queryClient.invalidateQueries({ queryKey: ['user-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success(t('accountSwitched'));
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('accountSwitchError'));
    },
  });

  const handleSwitchAccount = (accountId: string) => {
    if (accountId === account?.id) {
      return;
    }
    switchAccountMutation.mutate(accountId);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push(`/${locale}/login`);
    router.refresh();
  };

  const handleSettings = () => {
    router.push(`/${locale}/settings`);
  };

  const handleStalwartManagement = () => {
    router.push(`/${locale}/settings/stalwart`);
  };

  const otherAccounts = (accountsData?.accounts || []).filter(
    (availableAccount) => availableAccount.id !== account?.id
  );

  const organizedFolders = useMemo(() => {
    const folderMap = new Map<string, Folder & { children: Folder[] }>();
    const rootFolders: (Folder & { children: Folder[] })[] = [];

    folders.forEach((folder) => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    folders.forEach((folder) => {
      const folderWithChildren = folderMap.get(folder.id)!;
      if (folder.parentId && folderMap.has(folder.parentId)) {
        const parent = folderMap.get(folder.parentId)!;
        parent.children.push(folderWithChildren);
      } else {
        rootFolders.push(folderWithChildren);
      }
    });

    return rootFolders;
  }, [folders]);

  const quickViews: Array<{
    type: QuickFilterType | undefined;
    label: string;
    icon: React.ReactNode;
  }> = [
    { type: 'incoming', label: t('quickInbox'), icon: <Inbox className="h-4 w-4" /> },
    { type: 'unread', label: t('quickUnread'), icon: <Mail className="h-4 w-4" /> },
    { type: 'starred', label: t('quickStarred'), icon: <Star className="h-4 w-4" /> },
    {
      type: 'hasAttachments',
      label: t('quickAttachments'),
      icon: <Paperclip className="h-4 w-4" />,
    },
  ];

  const renderFolderItem = useCallback(
    (folder: Folder & { children?: Folder[] }, level = 0) => {
      return (
        <div key={folder.id}>
          <button
            onClick={() => onFolderSelect(folder.id)}
            onDragOver={(e) => {
              if (onDropMessage) {
                e.preventDefault();
                e.stopPropagation();
                setDraggedOverFolderId(folder.id);
              }
            }}
            onDragLeave={() => {
              if (onDropMessage) {
                setDraggedOverFolderId(null);
              }
            }}
            onDrop={(e) => {
              if (onDropMessage) {
                e.preventDefault();
                e.stopPropagation();
                setDraggedOverFolderId(null);
                try {
                  const data = e.dataTransfer.getData('application/json');
                  if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'message' && parsed.id) {
                      onDropMessage(parsed.id, folder.id);
                    }
                  } else {
                    const messageId = e.dataTransfer.getData('text/plain');
                    if (messageId) {
                      onDropMessage(messageId, folder.id);
                    }
                  }
                } catch (error) {
                  console.error('Error handling drop:', error);
                }
              }
            }}
            className={cn(
              'group flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-foreground/80 transition-colors duration-150 hover:mail-hover-surface hover:text-foreground max-md:min-h-[44px] touch-manipulation',
              layout === 'list-first' ? 'rounded-control' : 'rounded-xl active:scale-[0.995]',
              selectedFolderId === folder.id &&
                (layout === 'list-first'
                  ? 'mail-selected-surface font-medium text-foreground'
                  : 'mail-selected-surface mail-border-strong border font-medium text-foreground shadow-sm'),
              draggedOverFolderId === folder.id &&
                'bg-primary/12 ring-2 ring-primary/30 ring-offset-1',
              level > 0 && 'ml-4'
            )}
          >
            {folderIcons[folder.role] || folderIcons.custom}
            <span className="flex-1 truncate">{folder.name}</span>
            {folder.unreadCount > 0 && (
              <span
                className={cn(
                  'flex items-center justify-center rounded-full px-2 min-w-[24px] h-5 text-[11px] font-semibold tabular-nums whitespace-nowrap',
                  selectedFolderId === folder.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'border border-border/80 bg-card/80 text-muted-foreground'
                )}
              >
                {folder.unreadCount > 999 ? '999+' : folder.unreadCount}
              </span>
            )}
          </button>
          {folder.children && folder.children.length > 0 && (
            <div className="ml-4">
              {folder.children.map((child) => renderFolderItem(child, level + 1))}
            </div>
          )}
        </div>
      );
    },
    [selectedFolderId, draggedOverFolderId, onFolderSelect, onDropMessage, layout]
  );

  if (isCollapsed && !isMobile) {
    return (
      <aside className="mail-sidebar-surface flex h-full w-16 flex-col border-r border-border">
        <div className="border-b border-border p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(false)}
            title={t('openMenu')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <nav className="space-y-2">
            {organizedFolders.map((folder) => {
              const renderCollapsedFolder = (f: Folder & { children?: Folder[] }) => (
                <div key={f.id}>
                  <button
                    onClick={() => onFolderSelect(f.id)}
                    className={cn(
                      'flex w-full items-center justify-center rounded-xl p-2 text-sm text-foreground/75 transition-colors hover:mail-hover-surface hover:text-foreground',
                      selectedFolderId === f.id &&
                        'mail-selected-surface mail-border-strong border font-medium text-foreground',
                      draggedOverFolderId === f.id &&
                        'bg-primary/12 ring-2 ring-primary/30 ring-offset-1 scale-105'
                    )}
                    title={f.name}
                  >
                    {folderIcons[f.role] || folderIcons.custom}
                  </button>
                  {f.children && f.children.length > 0 && (
                    <div className="ml-2">
                      {f.children.map((child) => renderCollapsedFolder(child))}
                    </div>
                  )}
                </div>
              );
              return renderCollapsedFolder(folder);
            })}
          </nav>
        </div>
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            onClick={handleSettings}
            title={t('settingsLabel')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`
      mail-sidebar-surface flex h-full flex-col border-r border-border
      ${isMobile ? 'w-full' : layout === 'list-first' ? 'w-[232px]' : 'w-60'}
    `}
    >
      {isMobile && (
        <div className="border-b border-border p-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">{t('menuHeading')}</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] touch-manipulation"
            aria-label={t('closeMenuAria')}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      )}
      <div className="border-b border-border p-3">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {!isMobile && (
              <div className="flex items-center gap-2 text-foreground">
                <img
                  src="/icons/mail-icon.png"
                  alt={t('appHeading')}
                  className="h-5 w-5 flex-shrink-0"
                />
                <h1 className="text-lg font-bold">{t('appHeading')}</h1>
              </div>
            )}
          </div>
          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(layout === 'list-first' ? 'rounded-control' : 'rounded-xl', 'text-muted-foreground hover:mail-hover-surface hover:text-foreground')}
              onClick={() => setIsCollapsed(true)}
              title={t('closeMenu')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button
          className="w-full rounded-control max-md:min-h-[44px] touch-manipulation font-semibold shadow-none hover:shadow-none"
          onClick={onCompose}
          aria-label={t('compose')}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('compose')}
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="border-b border-border px-2 py-3">
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
            {t('quickViewsSection')}
          </p>
          <nav className="space-y-0.5" aria-label={t('quickViewsSection')}>
            {quickViews.map((view) => (
              <button
                key={view.type}
                type="button"
                onClick={() =>
                  onQuickFilterChange(activeQuickFilter === view.type ? undefined : view.type)
                }
                className={cn(
                  'flex min-h-9 w-full items-center gap-3 rounded-control px-2 text-left text-sm text-foreground/80 hover:mail-hover-surface hover:text-foreground',
                  activeQuickFilter === view.type &&
                    'mail-selected-surface font-medium text-foreground'
                )}
                aria-current={activeQuickFilter === view.type ? 'page' : undefined}
              >
                {view.icon}
                <span className="truncate">{view.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">{t('foldersSection')}</span>
          {onRefreshFolders && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-xl p-0 text-muted-foreground hover:mail-hover-surface hover:text-foreground"
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await onRefreshFolders();
                  toast.success(t('foldersRefreshed'));
                } catch (error) {
                  toast.error(t('refreshError'));
                } finally {
                  setTimeout(() => setIsRefreshing(false), 500);
                }
              }}
              disabled={isRefreshing}
              title={t('refreshFolders')}
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
        <nav className="space-y-1 p-2">
          {organizedFolders.map((folder) => renderFolderItem(folder))}
        </nav>
      </div>
      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn('h-auto min-h-12 w-full justify-start gap-3 px-2.5 py-2 text-left touch-manipulation hover:mail-hover-surface', layout === 'list-first' ? 'rounded-control' : 'rounded-xl')}
              aria-label={t('accountMenu')}
            >
              {account ? (
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground shadow-sm">
                  {(account.displayName || account.email || '?')[0].toUpperCase()}
                </div>
              ) : (
                <Settings className="h-4 w-4 flex-shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {account?.displayName || account?.email || t('defaultAccount')}
                </span>
                <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                  {account?.displayName && account.displayName !== account.email
                    ? account.email
                    : t('currentMailbox')}
                </span>
              </span>
              <ChevronsUpDown
                className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-64 rounded-xl border-border p-1.5 shadow-[0_18px_44px_-24px_hsl(var(--shadow-soft)/0.55)]"
          >
            {otherAccounts.length > 0 && (
              <>
                <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                  {t('switchMailbox')}
                </DropdownMenuLabel>
                {otherAccounts.map((availableAccount) => (
                  <DropdownMenuItem
                    key={availableAccount.id}
                    onClick={() => handleSwitchAccount(availableAccount.id)}
                    disabled={switchAccountMutation.isPending}
                    className="min-h-10 rounded-lg px-2"
                  >
                    <User className="mr-2 h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                    <span className="truncate">
                      {availableAccount.displayName || availableAccount.email}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={handleSettings} className="min-h-10 rounded-lg px-2">
              <Settings className="mr-2 h-4 w-4" strokeWidth={1.8} />
              {t('mailSettings')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleStalwartManagement}
              className="min-h-10 rounded-lg px-2"
            >
              <ServerCog className="mr-2 h-4 w-4" strokeWidth={1.8} />
              {t('manageInStalwart')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="min-h-10 rounded-lg px-2">
              <LogOut className="mr-2 h-4 w-4" strokeWidth={1.8} />
              {t('logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
