'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Eye, Type, Keyboard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

async function getSettings(): Promise<any> {
  const res = await fetch('/api/settings');
  if (!res.ok) {
    throw new Error('Failed to load settings');
  }
  return res.json();
}

async function saveSettings(settings: any): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error('Failed to save settings');
  }
}

export function AccessibilitySettings() {
  const t = useTranslations('settings.accessibility');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{
    fontSize?: number;
    highContrast?: boolean;
    reducedMotion?: boolean;
    screenReaderMode?: boolean;
  }>({});

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const fontSize = draft.fontSize ?? settings?.accessibility?.fontSize ?? 16;
  const highContrast = draft.highContrast ?? settings?.accessibility?.highContrast ?? false;
  const reducedMotion = draft.reducedMotion ?? settings?.accessibility?.reducedMotion ?? false;
  const screenReaderMode =
    draft.screenReaderMode ?? settings?.accessibility?.screenReaderMode ?? false;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--font-size-base', `${fontSize}px`);

    if (highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    if (reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }

    if (screenReaderMode) {
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('role', 'application');
    } else {
      root.removeAttribute('aria-live');
      root.removeAttribute('role');
    }
  }, [fontSize, highContrast, reducedMotion, screenReaderMode]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        ...settings,
        accessibility: {
          fontSize,
          highContrast,
          reducedMotion,
          screenReaderMode,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(t('saveSuccess'));
    },
    onError: () => {
      toast.error(t('saveError'));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('description')}
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Type className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">{t('fontSizeHeading')}</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t('fontSizeLabel', { size: fontSize })}
              </label>
              <input
                type="range"
                min="12"
                max="24"
                value={fontSize}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    fontSize: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>12px</span>
                <span>18px</span>
                <span>24px</span>
              </div>
            </div>
            <div className="p-4 rounded-md border bg-muted/30">
              <p style={{ fontSize: `${fontSize}px` }}>
                {t('preview')}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">{t('visualHeading')}</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="highContrast"
                checked={highContrast}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, highContrast: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="highContrast" className="text-sm font-medium">
                {t('highContrast')}
              </label>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              {t('highContrastHelp')}
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">{t('additionalHeading')}</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="reducedMotion"
                checked={reducedMotion}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, reducedMotion: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="reducedMotion" className="text-sm font-medium">
                {t('reducedMotion')}
              </label>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              {t('reducedMotionHelp')}
            </p>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="screenReaderMode"
                checked={screenReaderMode}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, screenReaderMode: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="screenReaderMode" className="text-sm font-medium">
                {t('screenReader')}
              </label>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              {t('screenReaderHelp')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}
