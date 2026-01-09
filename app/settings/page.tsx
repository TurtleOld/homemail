'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

interface UserSettings {
  signature: string;
  autoReply: {
    enabled: boolean;
    subject: string;
    message: string;
  };
}

async function getSettings(): Promise<UserSettings> {
  const res = await fetch('/api/settings');
  if (!res.ok) {
    throw new Error('Failed to load settings');
  }
  return res.json();
}

async function saveSettings(settings: UserSettings): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error('Failed to save settings');
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signature, setSignature] = useState('');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplySubject, setAutoReplySubject] = useState('');
  const [autoReplyMessage, setAutoReplyMessage] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Настройки сохранены');
    },
    onError: () => {
      toast.error('Ошибка сохранения настроек');
    },
  });

  useEffect(() => {
    if (settings) {
      setSignature(settings.signature || '');
      setAutoReplyEnabled(settings.autoReply?.enabled || false);
      setAutoReplySubject(settings.autoReply?.subject || '');
      setAutoReplyMessage(settings.autoReply?.message || '');
    }
  }, [settings]);

  const handleSave = () => {
    saveMutation.mutate({
      signature,
      autoReply: {
        enabled: autoReplyEnabled,
        subject: autoReplySubject,
        message: autoReplyMessage,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Загрузка настроек...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b bg-card p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/mail')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Настройки</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="space-y-4 rounded-lg border bg-card p-6">
            <h2 className="text-xl font-semibold">Подпись письма</h2>
            <div className="space-y-2">
              <label className="text-sm font-medium">Текст подписи</label>
              <textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Введите текст подписи, которая будет добавляться к каждому отправляемому письму..."
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Подпись будет автоматически добавляться в конец каждого отправляемого письма
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border bg-card p-6">
            <h2 className="text-xl font-semibold">Автоответ</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoReplyEnabled"
                  checked={autoReplyEnabled}
                  onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="autoReplyEnabled" className="text-sm font-medium">
                  Включить автоответ
                </label>
              </div>

              {autoReplyEnabled && (
                <div className="space-y-4 pl-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Тема письма</label>
                    <Input
                      value={autoReplySubject}
                      onChange={(e) => setAutoReplySubject(e.target.value)}
                      placeholder="Re: тема исходного письма"
                    />
                    <p className="text-xs text-muted-foreground">
                      Если оставить пустым, будет использоваться &quot;Re: тема исходного письма&quot;
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Текст автоответа</label>
                    <textarea
                      value={autoReplyMessage}
                      onChange={(e) => setAutoReplyMessage(e.target.value)}
                      placeholder="Введите текст автоматического ответа..."
                      className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      rows={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      Этот текст будет отправляться автоматически на каждое входящее письмо
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/mail')}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
