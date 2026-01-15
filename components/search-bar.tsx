'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, HelpCircle } from 'lucide-react';
import { FilterQueryParser } from '@/lib/filter-parser';
import type { QuickFilterType, FilterGroup } from '@/lib/types';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onFilterChange?: (quickFilter?: QuickFilterType, filterGroup?: FilterGroup) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ value, onChange, onFilterChange, placeholder = 'Поиск...', className }: SearchBarProps) {
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      const parsed = FilterQueryParser.parse(value);
      if (onFilterChange) {
        onFilterChange(parsed.quickFilter, parsed.filterGroup);
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
        <Search className="absolute left-3 h-4 w-4 max-md:h-3 max-md:w-3 max-md:left-2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="pl-10 pr-20 max-md:pl-8 max-md:pr-16 max-md:text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleClear();
            }
          }}
        />
        {value && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="absolute right-10 max-md:right-8 h-6 w-6 max-md:h-5 max-md:w-5 p-0"
          >
            <X className="h-4 w-4 max-md:h-3 max-md:w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHelp(!showHelp)}
          className="absolute right-2 max-md:right-1 h-6 w-6 max-md:h-5 max-md:w-5 p-0"
          title="Справка по поиску"
        >
          <HelpCircle className="h-4 w-4 max-md:h-3 max-md:w-3" />
        </Button>
      </div>
      {showHelp && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-background border rounded-lg shadow-lg p-4 max-md:p-2 max-md:text-xs">
          <h3 className="font-semibold mb-2 max-md:text-sm">Справка по поиску</h3>
          <div className="text-sm max-md:text-xs space-y-2">
            <div>
              <strong>Быстрые фильтры:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li><code>is:unread</code> - непрочитанные</li>
                <li><code>is:read</code> - прочитанные</li>
                <li><code>has:attachment</code> - с вложениями</li>
                <li><code>is:starred</code> - помеченные</li>
                <li><code>is:draft</code> - черновики</li>
              </ul>
            </div>
            <div>
              <strong>Поля:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li><code>from:email@example.com</code> - от кого</li>
                <li><code>subject:"текст"</code> - тема</li>
                <li><code>after:2026-01-01</code> - после даты</li>
                <li><code>before:2026-12-31</code> - до даты</li>
              </ul>
            </div>
            <div>
              <strong>Примеры:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li><code>from:amazon subject:"order"</code></li>
                <li><code>has:attachment after:2026-01-01</code></li>
                <li><code>-folder:spam</code> - исключить папку</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}