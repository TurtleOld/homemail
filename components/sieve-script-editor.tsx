'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('settings.sieveEditor');
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
      toast.error(t('contentRequired'));
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
      setValidationResult({ valid: false, error: t('connectionError') });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error(t('contentRequired'));
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
        // The background operation is intentionally not awaited.
        fetch('/api/mail/sieve/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              toast.warning(t('applyError'));
            } else {
              const data = await res.json().catch(() => ({}));
              toast.success(t('applySuccess', { count: data.applied ?? 0 }));
            }
          })
          .catch(() => {
            // Silently ignore network errors for background operation
          });
      }

      onClose();
    } catch {
      toast.error(t('saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-sm font-medium">{t('nameLabel')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={100}
            />
          </div>

          {/* Code editor */}
          <div className="space-y-1">
            <label className="text-sm font-medium">{t('contentLabel')}</label>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setValidationResult(null); }}
              className="w-full min-h-[300px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={`require ["fileinto"];\n\nif header :contains "From" "newsletter@example.com" {\n  fileinto "Newsletters";\n}`}
              spellCheck={false}
            />

            {/* Validation result */}
            {validationResult && (
              <p className={`text-xs mt-1 ${validationResult.valid ? 'text-green-600' : 'text-destructive'}`}>
                {validationResult.valid ? t('valid') : t('invalid', { reason: validationResult.error ?? t('invalidSyntax') })}
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
            <span className="text-sm">{t('activate')}</span>
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
              {t('applyExisting')}
              <span className="block text-xs text-muted-foreground">
                {t('applyExistingHelp')}
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
            {isValidating ? t('validating') : t('validate')}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !content.trim()}>
            {isSaving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
