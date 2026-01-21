'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Keyboard, Plus, Trash2, Edit2 } from 'lucide-react';

export interface CustomHotkey {
  id: string;
  action: string;
  keys: string;
  enabled: boolean;
}

const DEFAULT_HOTKEYS: CustomHotkey[] = [
  { id: 'compose', action: 'Новое письмо', keys: 'ctrl+k,cmd+k', enabled: true },
  { id: 'reply', action: 'Ответить', keys: 'r', enabled: true },
  { id: 'forward', action: 'Переслать', keys: 'f', enabled: true },
  { id: 'delete', action: 'Удалить', keys: 'delete,backspace', enabled: true },
];

async function getHotkeys(): Promise<CustomHotkey[]> {
  const res = await fetch('/api/settings/hotkeys');
  if (!res.ok) {
    return DEFAULT_HOTKEYS;
  }
  return res.json();
}

async function saveHotkeys(hotkeys: CustomHotkey[]): Promise<void> {
  const res = await fetch('/api/settings/hotkeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hotkeys }),
  });
  if (!res.ok) {
    throw new Error('Failed to save hotkeys');
  }
}

export function CustomHotkeysSettings() {
  const [hotkeys, setHotkeys] = useState<CustomHotkey[]>(DEFAULT_HOTKEYS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKeys, setEditKeys] = useState('');
  const queryClient = useQueryClient();

  const { data: savedHotkeys } = useQuery({
    queryKey: ['hotkeys'],
    queryFn: getHotkeys,
  });

  useEffect(() => {
    if (savedHotkeys && savedHotkeys.length > 0) {
      setHotkeys(savedHotkeys);
    }
  }, [savedHotkeys]);

  const saveMutation = useMutation({
    mutationFn: saveHotkeys,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotkeys'] });
      toast.success('Горячие клавиши сохранены');
      setEditingId(null);
    },
    onError: () => {
      toast.error('Ошибка сохранения горячих клавиш');
    },
  });

  const handleEdit = (id: string) => {
    const hotkey = hotkeys.find((h) => h.id === id);
    if (hotkey) {
      setEditingId(id);
      setEditKeys(hotkey.keys);
    }
  };

  const handleSave = (id: string) => {
    const updated = hotkeys.map((h) =>
      h.id === id ? { ...h, keys: editKeys } : h
    );
    setHotkeys(updated);
    saveMutation.mutate(updated);
  };

  const handleToggle = (id: string) => {
    const updated = hotkeys.map((h) =>
      h.id === id ? { ...h, enabled: !h.enabled } : h
    );
    setHotkeys(updated);
    saveMutation.mutate(updated);
  };

  const handleDelete = (id: string) => {
    if (confirm('Удалить эту горячую клавишу?')) {
      const updated = hotkeys.filter((h) => h.id !== id);
      setHotkeys(updated);
      saveMutation.mutate(updated);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Пользовательские горячие клавиши</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Настройте горячие клавиши для быстрого доступа к функциям. Используйте формат: <code>ctrl+k</code>, <code>cmd+k</code>, <code>r</code>, <code>delete</code> и т.д.
        </p>
      </div>

      <div className="space-y-2">
        {hotkeys.map((hotkey) => (
          <div
            key={hotkey.id}
            className="flex items-center justify-between rounded-md border bg-card p-3"
          >
            <div className="flex items-center gap-3 flex-1">
              <input
                type="checkbox"
                checked={hotkey.enabled}
                onChange={() => handleToggle(hotkey.id)}
                className="h-4 w-4"
              />
              <span className="font-medium">{hotkey.action}</span>
              {editingId === hotkey.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editKeys}
                    onChange={(e) => setEditKeys(e.target.value)}
                    placeholder="ctrl+k,cmd+k"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSave(hotkey.id);
                      } else if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => handleSave(hotkey.id)}>
                    Сохранить
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    Отмена
                  </Button>
                </div>
              ) : (
                <code className="text-sm bg-muted px-2 py-1 rounded">
                  {hotkey.keys}
                </code>
              )}
            </div>
            {editingId !== hotkey.id && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(hotkey.id)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(hotkey.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
        <div className="flex items-start gap-2">
          <Keyboard className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Формат горячих клавиш:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Одиночные клавиши: <code>r</code>, <code>f</code>, <code>delete</code></li>
              <li>Комбинации: <code>ctrl+k</code>, <code>cmd+k</code>, <code>shift+delete</code></li>
              <li>Несколько вариантов: <code>ctrl+k,cmd+k</code> (через запятую)</li>
              <li>Модификаторы: <code>ctrl</code>, <code>cmd</code>, <code>shift</code>, <code>alt</code></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
