'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { QuickFilterType } from '@/lib/types';
import {
  Mail,
  MailOpen,
  Paperclip,
  Image,
  FileText,
  Archive,
  Star,
  AlertCircle,
  Inbox,
  Send,
  Download,
  List,
  Filter,
  X,
} from 'lucide-react';

interface QuickFilter {
  type: QuickFilterType;
  label: string;
  icon: React.ReactNode;
  category: 'status' | 'attachments' | 'actions' | 'other';
}

const QUICK_FILTERS: QuickFilter[] = [
  { type: 'unread', label: 'Непрочитанные', icon: <Mail className="h-4 w-4" />, category: 'status' },
  { type: 'read', label: 'Прочитанные', icon: <MailOpen className="h-4 w-4" />, category: 'status' },
  { type: 'hasAttachments', label: 'С вложениями', icon: <Paperclip className="h-4 w-4" />, category: 'attachments' },
  { type: 'attachmentsImages', label: 'Только изображения', icon: <Image className="h-4 w-4" />, category: 'attachments' },
  { type: 'attachmentsDocuments', label: 'Только документы', icon: <FileText className="h-4 w-4" />, category: 'attachments' },
  { type: 'attachmentsArchives', label: 'Только архивы', icon: <Archive className="h-4 w-4" />, category: 'attachments' },
  { type: 'starred', label: 'Помеченные', icon: <Star className="h-4 w-4" />, category: 'actions' },
  { type: 'important', label: 'Важные', icon: <AlertCircle className="h-4 w-4" />, category: 'actions' },
  { type: 'drafts', label: 'Черновики', icon: <FileText className="h-4 w-4" />, category: 'other' },
  { type: 'sent', label: 'Отправленные', icon: <Send className="h-4 w-4" />, category: 'other' },
  { type: 'incoming', label: 'Входящие', icon: <Inbox className="h-4 w-4" />, category: 'other' },
  { type: 'bounce', label: 'Ошибки доставки', icon: <Download className="h-4 w-4" />, category: 'other' },
  { type: 'bulk', label: 'Рассылки', icon: <List className="h-4 w-4" />, category: 'other' },
];

const CATEGORIES = {
  status: 'Статус',
  attachments: 'Вложения',
  actions: 'Действия',
  other: 'Прочее',
};

interface QuickFiltersProps {
  activeFilter?: QuickFilterType;
  onFilterChange: (filter?: QuickFilterType) => void;
  className?: string;
}

export function QuickFilters({ activeFilter, onFilterChange, className }: QuickFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeFilterData = QUICK_FILTERS.find((f) => f.type === activeFilter);

  const filtersByCategory = QUICK_FILTERS.reduce((acc, filter) => {
    if (!acc[filter.category]) {
      acc[filter.category] = [];
    }
    acc[filter.category].push(filter);
    return acc;
  }, {} as Record<string, QuickFilter[]>);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant={activeFilter ? 'default' : 'outline'} size="sm" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span>{activeFilterData ? activeFilterData.label : 'Фильтры'}</span>
            {activeFilter && (
              <X
                className="h-3 w-3 ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterChange(undefined);
                }}
              />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {Object.entries(filtersByCategory).map(([category, filters]) => (
            <div key={category}>
              <DropdownMenuLabel>{CATEGORIES[category as keyof typeof CATEGORIES]}</DropdownMenuLabel>
              {filters.map((filter) => (
                <DropdownMenuItem
                  key={filter.type}
                  onClick={() => {
                    if (activeFilter === filter.type) {
                      onFilterChange(undefined);
                    } else {
                      onFilterChange(filter.type);
                    }
                    setIsOpen(false);
                  }}
                  className={cn(
                    'flex items-center gap-2 cursor-pointer',
                    activeFilter === filter.type && 'bg-accent'
                  )}
                >
                  {filter.icon}
                  <span>{filter.label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {activeFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFilterChange(undefined)}
          className="h-8 px-2"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}