'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from '@/components/ui/toast';
import { PerformanceReporter } from '@/components/performance-reporter';
import { TooltipProvider } from '@/components/ui/tooltip';

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
  const pathname = usePathname();

  useEffect(() => {
    const applyTheme = async () => {
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
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (error) {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <PerformanceReporter />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
