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
import { useTranslations } from 'next-intl';

interface QuickFilter {
  type: QuickFilterType;
  label: string;
  icon: React.ReactNode;
  category: 'status' | 'attachments' | 'actions' | 'other';
}

interface QuickFiltersProps {
  activeFilter?: QuickFilterType;
  onFilterChange: (filter?: QuickFilterType) => void;
  className?: string;
}

export function QuickFilters({ activeFilter, onFilterChange, className }: QuickFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('quickFilters');

  const QUICK_FILTERS: QuickFilter[] = [
    { type: 'unread', label: t('unread'), icon: <Mail className="h-4 w-4" />, category: 'status' },
    { type: 'read', label: t('read'), icon: <MailOpen className="h-4 w-4" />, category: 'status' },
    {
      type: 'hasAttachments',
      label: t('withAttachments'),
      icon: <Paperclip className="h-4 w-4" />,
      category: 'attachments',
    },
    {
      type: 'attachmentsImages',
      label: t('imagesOnly'),
      icon: <Image className="h-4 w-4" />,
      category: 'attachments',
    },
    {
      type: 'attachmentsDocuments',
      label: t('docsOnly'),
      icon: <FileText className="h-4 w-4" />,
      category: 'attachments',
    },
    {
      type: 'attachmentsArchives',
      label: t('archivesOnly'),
      icon: <Archive className="h-4 w-4" />,
      category: 'attachments',
    },
    {
      type: 'starred',
      label: t('starred'),
      icon: <Star className="h-4 w-4" />,
      category: 'actions',
    },
    {
      type: 'important',
      label: t('important'),
      icon: <AlertCircle className="h-4 w-4" />,
      category: 'actions',
    },
    {
      type: 'drafts',
      label: t('drafts'),
      icon: <FileText className="h-4 w-4" />,
      category: 'other',
    },
    { type: 'sent', label: t('sent'), icon: <Send className="h-4 w-4" />, category: 'other' },
    { type: 'incoming', label: t('inbox'), icon: <Inbox className="h-4 w-4" />, category: 'other' },
    {
      type: 'bounce',
      label: t('deliveryErrors'),
      icon: <Download className="h-4 w-4" />,
      category: 'other',
    },
    {
      type: 'bulk',
      label: t('newsletters'),
      icon: <List className="h-4 w-4" />,
      category: 'other',
    },
  ];

  const CATEGORIES = {
    status: t('categoryStatus'),
    attachments: t('categoryAttachments'),
    actions: t('categoryActions'),
    other: t('categoryOther'),
  };

  const activeFilterData = QUICK_FILTERS.find((f) => f.type === activeFilter);

  const filtersByCategory = QUICK_FILTERS.reduce(
    (acc, filter) => {
      if (!acc[filter.category]) {
        acc[filter.category] = [];
      }
      acc[filter.category].push(filter);
      return acc;
    },
    {} as Record<string, QuickFilter[]>
  );

  return (
    <div className={cn('flex items-center gap-2 max-md:gap-1', className)}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={activeFilter ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'flex h-10 items-center gap-2 rounded-2xl px-3 shadow-sm max-md:h-8 max-md:px-2 max-md:text-xs',
              activeFilter
                ? 'shadow-[0_14px_28px_-20px_hsl(var(--primary)/0.8)]'
                : 'border-white/80 bg-white/80 text-slate-700 hover:mail-hover-surface'
            )}
          >
            <Filter className="h-4 w-4 max-md:h-3 max-md:w-3" />
            <span className="max-md:text-xs">
              {activeFilterData ? activeFilterData.label : t('button')}
            </span>
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
        <DropdownMenuContent
          align="start"
          className="w-60 rounded-2xl border-white/80 bg-white/95 p-1 shadow-[0_24px_48px_-24px_hsl(var(--shadow-soft)/0.35)]"
        >
          {Object.entries(filtersByCategory).map(([category, filters]) => (
            <div key={category}>
              <DropdownMenuLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {CATEGORIES[category as keyof typeof CATEGORIES]}
              </DropdownMenuLabel>
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
                    'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]',
                    activeFilter === filter.type && 'mail-selected-surface text-foreground'
                  )}
                >
                  {filter.icon}
                  <span>{filter.label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border/70" />
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {activeFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFilterChange(undefined)}
          className="h-9 rounded-2xl px-2 text-slate-500 hover:mail-hover-surface hover:text-foreground max-md:h-7 max-md:px-1"
        >
          <X className="h-4 w-4 max-md:h-3 max-md:w-3" />
        </Button>
      )}
    </div>
  );
}
