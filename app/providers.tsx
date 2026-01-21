'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from '@/components/ui/toast';
import { PerformanceReporter } from '@/components/performance-reporter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';

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
          const root = document.documentElement;
          
          if (theme === 'dark') {
            root.classList.add('dark');
          } else {
            root.classList.remove('dark');
          }

          if (settings.customTheme?.colors) {
            const colors = settings.customTheme.colors;
            const hexToHsl = (hex: string): string => {
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              let h = 0;
              let s = 0;
              const l = (max + min) / 2;
              if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                  case r:
                    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                    break;
                  case g:
                    h = ((b - r) / d + 2) / 6;
                    break;
                  case b:
                    h = ((r - g) / d + 4) / 6;
                    break;
                }
              }
              return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
            };

            if (colors.primary) {
              root.style.setProperty('--primary', hexToHsl(colors.primary));
            }
            if (colors.secondary) {
              root.style.setProperty('--secondary', hexToHsl(colors.secondary));
            }
            if (colors.accent) {
              root.style.setProperty('--accent', hexToHsl(colors.accent));
            }
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
        <PWAInstallPrompt />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
