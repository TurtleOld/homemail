'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Download, Upload, Database, AlertCircle } from 'lucide-react';

async function downloadBackup(): Promise<void> {
  const res = await fetch('/api/backup');
  if (!res.ok) {
    throw new Error('Failed to create backup');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup_${Date.now()}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

async function restoreBackup(file: File): Promise<{ restored: number; errors?: string[] }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch('/api/backup', {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to restore backup');
  }
  
  return res.json();
}

export function BackupRestore() {
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const backupMutation = useMutation({
    mutationFn: downloadBackup,
    onSuccess: () => {
      toast.success('Резервная копия создана и скачана');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка создания резервной копии');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreBackup,
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      if (result.errors && result.errors.length > 0) {
        toast.warning(`Восстановлено ${result.restored} файлов, но были ошибки: ${result.errors.join(', ')}`);
      } else {
        toast.success(`Восстановлено ${result.restored} файлов из резервной копии`);
      }
      setRestoreFile(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка восстановления из резервной копии');
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.zip')) {
      toast.error('Выберите ZIP файл резервной копии');
      return;
    }
    
    setRestoreFile(file);
  };

  const handleRestore = () => {
    if (!restoreFile) {
      toast.error('Выберите файл резервной копии');
      return;
    }

    if (!confirm('Восстановление из резервной копии заменит текущие данные. Продолжить?')) {
      return;
    }

    restoreMutation.mutate(restoreFile);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Резервное копирование и восстановление</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Создайте резервную копию ваших данных или восстановите из ранее созданной копии.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Database className="h-6 w-6 text-primary" />
            <h3 className="text-lg font-semibold">Создать резервную копию</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Скачайте ZIP архив со всеми вашими данными: контакты, метки, настройки, шаблоны и группы контактов.
          </p>
          <Button
            onClick={() => backupMutation.mutate()}
            disabled={backupMutation.isPending}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            {backupMutation.isPending ? 'Создание...' : 'Скачать резервную копию'}
          </Button>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Upload className="h-6 w-6 text-primary" />
            <h3 className="text-lg font-semibold">Восстановить из копии</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Загрузите ZIP файл резервной копии для восстановления данных. Текущие данные будут заменены.
          </p>
          <div className="space-y-3">
            <input
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="w-full text-sm"
            />
            {restoreFile && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{restoreFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(restoreFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              </div>
            )}
            <Button
              onClick={handleRestore}
              disabled={restoreMutation.isPending || !restoreFile}
              variant="outline"
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {restoreMutation.isPending ? 'Восстановление...' : 'Восстановить'}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Важно:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Резервная копия содержит только данные пользователя (контакты, метки, настройки)</li>
              <li>Письма не включаются в резервную копию</li>
              <li>Регулярно создавайте резервные копии для защиты данных</li>
              <li>Восстановление заменит все текущие данные данными из копии</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
