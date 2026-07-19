'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/toast';
import { PerformanceReporter } from '@/components/performance-reporter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';
import { ProductShellFeatureProvider } from '@/components/product-shell/shell-feature-context';
import { RouteAwareShell } from '@/components/product-shell/route-aware-shell';

export function Providers({
  children,
  protectedMessageContentEnabled = false,
}: {
  children: React.ReactNode;
  protectedMessageContentEnabled?: boolean;
}) {
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
    const handleSettingsChange = (event: StorageEvent) => {
      if (event.key === 'homemail-settings-updated-at') {
        queryClient.invalidateQueries({ queryKey: ['settings'] });
      }
    };

    window.addEventListener('storage', handleSettingsChange);
    return () => window.removeEventListener('storage', handleSettingsChange);
  }, [queryClient]);

  useEffect(() => {
    const root = document.documentElement;

    type ThemePreference = 'light' | 'dark' | 'system';
    type ThemeColors = { primary?: string; secondary?: string; accent?: string };
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    let removeSystemListener: (() => void) | undefined;

    const applyThemePreference = (preference: ThemePreference) => {
      removeSystemListener?.();
      root.dataset.theme = preference;

      const updateResolvedTheme = () => {
        const dark = preference === 'dark' || (preference === 'system' && systemTheme.matches);
        root.classList.toggle('dark', dark);
        root.style.colorScheme = dark ? 'dark' : 'light';
      };

      updateResolvedTheme();
      if (preference === 'system') {
        systemTheme.addEventListener('change', updateResolvedTheme);
        removeSystemListener = () => systemTheme.removeEventListener('change', updateResolvedTheme);
      }
    };

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

    const applyThemeColors = (colors?: ThemeColors) => {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--secondary');
      root.style.removeProperty('--accent');
      if (colors?.primary) root.style.setProperty('--primary', hexToHsl(colors.primary));
      if (colors?.secondary) root.style.setProperty('--secondary', hexToHsl(colors.secondary));
      if (colors?.accent) root.style.setProperty('--accent', hexToHsl(colors.accent));
    };

    const handleThemeChange = (event: Event) => {
      const { preference, colors } = (
        event as CustomEvent<{ preference: ThemePreference; colors?: ThemeColors }>
      ).detail;
      if (['light', 'dark', 'system'].includes(preference)) {
        applyThemePreference(preference);
        applyThemeColors(colors);
      }
    };

    window.addEventListener('homemail-theme-change', handleThemeChange);

    const applyTheme = async () => {
      applyThemeColors();

      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const settings = await res.json();
          const theme: ThemePreference = ['light', 'dark', 'system'].includes(settings.theme)
            ? settings.theme
            : 'system';
          applyThemePreference(theme);

          if (settings.customTheme?.colors) {
            applyThemeColors(settings.customTheme.colors);
          }
        } else {
          applyThemePreference('system');
        }
      } catch {
        applyThemePreference('system');
      }
    };

    applyTheme();

    return () => {
      removeSystemListener?.();
      window.removeEventListener('homemail-theme-change', handleThemeChange);
    };
  }, []);

  return (
    <ProductShellFeatureProvider
      protectedMessageContentEnabled={protectedMessageContentEnabled}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <RouteAwareShell>{children}</RouteAwareShell>
          <PerformanceReporter />
          <PWAInstallPrompt />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ProductShellFeatureProvider>
  );
}
