import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function useLocaleSettings() {
  const { data: settings } = useQuery<{
    locale?: {
      language?: 'ru' | 'en';
      dateFormat?: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
      timeFormat?: '24h' | '12h';
      timezone?: string;
    };
  }>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  return settings?.locale || {
    language: 'ru' as const,
    dateFormat: 'DD.MM.YYYY' as const,
    timeFormat: '24h' as const,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
