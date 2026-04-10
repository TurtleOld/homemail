'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, HelpCircle, Bookmark, BookmarkCheck } from 'lucide-react';
import { FilterQueryParser } from '@/lib/filter-parser';
import type { QuickFilterType, FilterGroup, SavedFilter } from '@/lib/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

async function getSavedFilters(): Promise<SavedFilter[]> {
  const res = await fetch('/api/mail/filters');
  if (!res.ok) {
    return [];
  }
  return res.json();
}

async function saveSearchQuery(name: string, query: string): Promise<SavedFilter> {
  const res = await fetch('/api/mail/filters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, query }),
  });
  if (!res.ok) {
    throw new Error('Failed to save search');
  }
  return res.json();
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onFilterChange?: (quickFilter?: QuickFilterType, filterGroup?: FilterGroup) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  onFilterChange,
  placeholder = 'Поиск...',
  className,
}: SearchBarProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['saved-filters'],
    queryFn: getSavedFilters,
    staleTime: 60000,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSearchQuery(saveName || `Поиск ${new Date().toLocaleDateString()}`, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      setShowSaveDialog(false);
      setSaveName('');
    },
  });

  const matchedFilter = savedFilters.find((f) => f.query === value);

  useEffect(() => {
    if (value && onFilterChange) {
      const hasStructuredSyntax =
        /(?:^|\s)(?:from|to|cc|bcc|subject|body|date|folder|tag|tags|size|attachment|attachments|filename|after|before|is|has|message-id|messageid|id):/i.test(
          value
        );
      if (hasStructuredSyntax) {
        const parsed = FilterQueryParser.parse(value);
        onFilterChange(parsed.quickFilter, parsed.filterGroup);
      } else {
        onFilterChange(undefined, undefined);
      }
    }
  }, [value, onFilterChange]);

  const handleChange = (newValue: string) => {
    onChange(newValue);
  };

  const handleClear = () => {
    onChange('');
    if (onFilterChange) {
      onFilterChange(undefined, undefined);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-slate-400 max-md:left-2 max-md:h-3 max-md:w-3" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 rounded-2xl border-white/80 bg-white/80 pl-10 pr-24 text-slate-700 shadow-[0_14px_32px_-24px_hsl(var(--shadow-soft)/0.3)] placeholder:text-slate-400 focus-visible:ring-primary/30 focus-visible:ring-offset-0 max-md:pl-8 max-md:pr-16 max-md:text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleClear();
            }
          }}
        />
        {value && (
          <>
            {!matchedFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(true)}
                className="absolute right-20 h-7 w-7 rounded-xl p-0 text-slate-500 hover:mail-hover-surface hover:text-foreground max-md:right-16 max-md:h-5 max-md:w-5"
                title="Сохранить поиск"
              >
                <Bookmark className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="absolute right-10 h-7 w-7 rounded-xl p-0 text-slate-500 hover:mail-hover-surface hover:text-foreground max-md:right-8 max-md:h-5 max-md:w-5"
            >
              <X className="h-4 w-4 max-md:h-3 max-md:w-3" />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 h-7 w-7 rounded-xl p-0 text-slate-500 hover:mail-hover-surface hover:text-foreground max-md:right-1 max-md:h-5 max-md:w-5"
              title="Сохраненные поиски и справка"
            >
              <HelpCircle className="h-4 w-4 max-md:h-3 max-md:w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 rounded-2xl border-white/80 bg-white/95 p-1 shadow-[0_24px_48px_-24px_hsl(var(--shadow-soft)/0.35)]"
          >
            {savedFilters.length > 0 && (
              <>
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Сохраненные поиски
                </div>
                {savedFilters.map((filter) => (
                  <DropdownMenuItem
                    key={filter.id}
                    onClick={() => {
                      onChange(filter.query);
                      setShowHelp(false);
                    }}
                    className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                  >
                    <BookmarkCheck className="h-4 w-4 mr-2" />
                    <span className="truncate">{filter.name}</span>
                  </DropdownMenuItem>
                ))}
                <div className="my-1 border-t border-border/70" />
              </>
            )}
            <DropdownMenuItem
              onClick={() => setShowHelp(!showHelp)}
              className="rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Справка по поиску
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showHelp && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_28px_56px_-28px_hsl(var(--shadow-soft)/0.38)] backdrop-blur-sm max-md:p-2 max-md:text-xs">
          <h3 className="font-semibold mb-2 max-md:text-sm">Справка по поиску</h3>
          <div className="space-y-3 text-sm text-slate-600 max-md:text-xs">
            <div>
              <strong>Быстрые фильтры:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li>
                  <code>is:unread</code> - непрочитанные
                </li>
                <li>
                  <code>is:read</code> - прочитанные
                </li>
                <li>
                  <code>has:attachment</code> - с вложениями
                </li>
                <li>
                  <code>is:starred</code> - помеченные
                </li>
                <li>
                  <code>is:draft</code> - черновики
                </li>
              </ul>
            </div>
            <div>
              <strong>Поля:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li>
                  <code>from:email@example.com</code> - от кого
                </li>
                <li>
                  <code>subject:&quot;текст&quot;</code> - тема
                </li>
                <li>
                  <code>after:2026-01-01</code> - после даты
                </li>
                <li>
                  <code>before:2026-12-31</code> - до даты
                </li>
                <li>
                  <code>filename:&quot;document.pdf&quot;</code> - поиск по имени файла вложения
                </li>
                <li>
                  <code>attachment:&quot;текст&quot;</code> - поиск по содержимому вложений
                </li>
              </ul>
            </div>
            <div>
              <strong>Примеры:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li>
                  <code>from:amazon subject:&quot;order&quot;</code>
                </li>
                <li>
                  <code>has:attachment after:2026-01-01</code>
                </li>
                <li>
                  <code>filename:&quot;invoice&quot;</code> - письма с файлами, содержащими
                  &quot;invoice&quot;
                </li>
                <li>
                  <code>-folder:spam</code> - исключить папку
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
      {showSaveDialog && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_28px_56px_-28px_hsl(var(--shadow-soft)/0.38)] backdrop-blur-sm">
          <h3 className="font-semibold mb-2">Сохранить поисковый запрос</h3>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Название поиска"
            className="mb-2 rounded-2xl border-border/80 bg-white/80"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && saveName.trim()) {
                saveMutation.mutate();
              } else if (e.key === 'Escape') {
                setShowSaveDialog(false);
              }
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!saveName.trim() || saveMutation.isPending}
              className="rounded-xl"
            >
              Сохранить
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                setShowSaveDialog(false);
                setSaveName('');
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
