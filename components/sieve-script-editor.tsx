'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { SieveScript } from '@/lib/types';
import { toast } from 'sonner';

interface SieveScriptEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (params: { id?: string; name: string | null; content: string; activate: boolean }) => Promise<void>;
  existing?: SieveScript;
}

export function SieveScriptEditor({ open, onClose, onSave, existing }: SieveScriptEditorProps) {
  const [name, setName] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [activate, setActivate] = useState(false);
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (open && existing) {
      setName(existing.name ?? '');
      setContent(existing.content ?? '');
      setActivate(existing.isActive);
      setApplyToExisting(false);
      setValidationResult(null);
    } else if (open && !existing) {
      setName('');
      setContent('');
      setActivate(false);
      setApplyToExisting(false);
      setValidationResult(null);
    }
  }, [open, existing]);

  const handleValidate = async () => {
    if (!content.trim()) {
      toast.error('Введите текст скрипта');
      return;
    }
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch('/api/mail/sieve/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: 'Ошибка соединения с сервером' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error('Введите текст скрипта');
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        id: existing?.id,
        name: name.trim() || null,
        content,
        activate,
      });

      if (applyToExisting) {
        // Fire-and-forget — not awaited
        fetch('/api/mail/sieve/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              const reason = data.reason || data.message || 'Не удалось применить к существующим письмам';
              toast.warning(`Sieve: ${reason}`);
            } else {
              const data = await res.json().catch(() => ({}));
              toast.success(`Sieve: применено к ${data.applied ?? 0} письмам`);
            }
          })
          .catch(() => {
            // Silently ignore network errors for background operation
          });
      }

      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка сохранения скрипта');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Редактировать Sieve-скрипт' : 'Создать Sieve-скрипт'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Название скрипта (необязательно)</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Сортировка рассылок"
              maxLength={100}
            />
          </div>

          {/* Code editor */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Sieve-скрипт</label>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setValidationResult(null); }}
              className="w-full min-h-[300px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={`require ["fileinto"];\n\nif header :contains "From" "newsletter@example.com" {\n  fileinto "Рассылки";\n}`}
              spellCheck={false}
            />

            {/* Validation result */}
            {validationResult && (
              <p className={`text-xs mt-1 ${validationResult.valid ? 'text-green-600' : 'text-destructive'}`}>
                {validationResult.valid ? 'Скрипт корректен' : `Ошибка: ${validationResult.error ?? 'Неверный синтаксис'}`}
              </p>
            )}
          </div>

          {/* Activate toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activate}
              onChange={(e) => setActivate(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Активировать после сохранения</span>
          </label>

          {/* Apply to existing */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
              className="h-4 w-4 mt-0.5"
            />
            <span className="text-sm">
              Применить к существующим письмам
              <span className="block text-xs text-muted-foreground">
                Работает только для простых условий (From, To, Subject, Size). Сложные скрипты (vacation, body и т.д.) — не поддерживаются.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={isValidating || !content.trim()}
          >
            {isValidating ? 'Проверка…' : 'Проверить синтаксис'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !content.trim()}>
            {isSaving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
