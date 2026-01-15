'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/toast';
import { PerformanceReporter } from '@/components/performance-reporter';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    const applyTheme = async () => {
      const pathname = window.location.pathname;
      if (pathname === '/login' || pathname.startsWith('/login')) {
        document.documentElement.classList.remove('dark');
        return;
      }

      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const settings = await res.json();
          const theme = settings.theme || 'light';
          if (theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      } catch (error) {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <PerformanceReporter />
      <Toaster />
    </QueryClientProvider>
  );
}
