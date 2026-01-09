'use client';

import { useState } from 'react';
import type { Folder, Account } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Inbox, Send, FileText, Trash2, AlertTriangle, Settings, LogOut, Plus, Search, MailPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface SidebarProps {
  folders: Folder[];
  account: Account | null;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string) => void;
  onCompose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
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
  searchQuery,
  onSearchChange,
}: SidebarProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleSimulateNewMessage = async () => {
    try {
      await fetch('/api/mail/debug/newMessage', { method: 'POST' });
    } catch (error) {
      console.error('Failed to simulate new message:', error);
    }
  };

  const handleSettings = () => {
    router.push('/settings');
  };

  if (isCollapsed) {
    return (
      <div className="flex h-full w-16 flex-col border-r bg-muted/30">
        <div className="border-b p-2">
          <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} title="Раскрыть меню">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <nav className="space-y-2">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => onFolderSelect(folder.id)}
                className={cn(
                  'flex w-full items-center justify-center rounded-md p-2 text-sm transition-colors hover:bg-muted',
                  selectedFolderId === folder.id && 'bg-muted font-medium'
                )}
                title={folder.name}
              >
                {folderIcons[folder.role] || folderIcons.custom}
              </button>
            ))}
          </nav>
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="icon" className="w-full" onClick={handleSettings} title="Настройки">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="border-b p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">Почта</h1>
          <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)} title="Скрыть меню">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <Button className="w-full" onClick={onCompose}>
          <Plus className="mr-2 h-4 w-4" />
          Написать
        </Button>
        <div className="mt-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <nav className="p-2">
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => onFolderSelect(folder.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                selectedFolderId === folder.id && 'bg-muted font-medium'
              )}
            >
              {folderIcons[folder.role] || folderIcons.custom}
              <span className="flex-1">{folder.name}</span>
              {folder.unreadCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {folder.unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start">
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{account?.email || 'Аккаунт'}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSettings}>
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </DropdownMenuItem>
            {process.env.NODE_ENV === 'development' && (
              <DropdownMenuItem onClick={handleSimulateNewMessage}>
                <MailPlus className="mr-2 h-4 w-4" />
                Симулировать новое письмо
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
