'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Languages, Loader2 } from 'lucide-react';

const LANGUAGES = [
  { code: 'ru', name: 'Русский' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'ar', name: 'العربية' },
];

async function translateText(text: string, targetLang: string, sourceLang?: string): Promise<string> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLang, sourceLang }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to translate');
  }
  const data = await res.json();
  return data.translatedText;
}

interface MessageTranslatorProps {
  originalText: string;
  originalHtml?: string;
  onTranslated?: (translatedText: string, translatedHtml: string) => void;
}

export function MessageTranslator({ originalText, originalHtml, onTranslated }: MessageTranslatorProps) {
  const [targetLang, setTargetLang] = useState('ru');
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedHtml, setTranslatedHtml] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(true);

  const translateMutation = useMutation({
    mutationFn: () => translateText(originalText, targetLang),
    onSuccess: (translated) => {
      setTranslatedText(translated);
      const htmlTranslated = originalHtml
        ? originalHtml.replace(/<[^>]*>/g, (match) => {
            const textContent = originalHtml.replace(/<[^>]*>/g, '');
            const translatedContent = translated;
            return match;
          })
        : translated.replace(/\n/g, '<br>');
      setTranslatedHtml(htmlTranslated);
      if (onTranslated) {
        onTranslated(translated, htmlTranslated);
      }
      toast.success('Письмо переведено');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка перевода');
    },
  });

  const handleTranslate = () => {
    translateMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Перевод письма</span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        <Button
          onClick={handleTranslate}
          disabled={translateMutation.isPending}
          size="sm"
        >
          {translateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Перевод...
            </>
          ) : (
            <>
              <Languages className="h-4 w-4 mr-2" />
              Перевести
            </>
          )}
        </Button>
        {translatedText && (
          <Button
            variant="outline"
            onClick={() => setShowOriginal(!showOriginal)}
            size="sm"
          >
            {showOriginal ? 'Показать перевод' : 'Показать оригинал'}
          </Button>
        )}
      </div>

      {translatedText && (
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium mb-2">
            {showOriginal ? 'Оригинал' : 'Перевод'}
          </div>
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{
              __html: showOriginal
                ? originalHtml || originalText.replace(/\n/g, '<br>')
                : translatedHtml || translatedText.replace(/\n/g, '<br>'),
            }}
          />
        </div>
      )}
    </div>
  );
}
