'use client';

import { useState, useEffect } from 'react';
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
  const queryClient = useQueryClient();
  const [fontSize, setFontSize] = useState(16);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [screenReaderMode, setScreenReaderMode] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  useEffect(() => {
    if (settings?.accessibility) {
      setFontSize(settings.accessibility.fontSize || 16);
      setHighContrast(settings.accessibility.highContrast || false);
      setReducedMotion(settings.accessibility.reducedMotion || false);
      setScreenReaderMode(settings.accessibility.screenReaderMode || false);
    }
  }, [settings]);

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
    mutationFn: () => saveSettings({
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
      toast.success('Настройки доступности сохранены');
    },
    onError: () => {
      toast.error('Ошибка сохранения настроек');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Доступность</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Настройки для улучшения доступности интерфейса для пользователей с ограниченными возможностями.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Type className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Размер шрифта</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Базовый размер шрифта: {fontSize}px
              </label>
              <input
                type="range"
                min="12"
                max="24"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
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
                Пример текста с выбранным размером шрифта. Это поможет вам оценить, как будет выглядеть интерфейс.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Визуальные настройки</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="highContrast"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="highContrast" className="text-sm font-medium">
                Высокий контраст
              </label>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Увеличивает контрастность цветов для лучшей читаемости
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Дополнительные настройки</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="reducedMotion"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="reducedMotion" className="text-sm font-medium">
                Уменьшить анимации
              </label>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Отключает или уменьшает анимации для пользователей с вестибулярными расстройствами
            </p>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="screenReaderMode"
                checked={screenReaderMode}
                onChange={(e) => setScreenReaderMode(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="screenReaderMode" className="text-sm font-medium">
                Режим для экранных дикторов
              </label>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Оптимизирует интерфейс для работы с экранными дикторами (NVDA, JAWS, VoiceOver)
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
        </Button>
      </div>
    </div>
  );
}
