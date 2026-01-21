'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Archive, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Folder } from '@/lib/types';

async function getFolders(): Promise<Folder[]> {
  const res = await fetch('/api/mail/folders');
  if (!res.ok) {
    throw new Error('Failed to load folders');
  }
  return res.json();
}

async function archiveMessages(folderId: string, days: number): Promise<{ archived: number }> {
  const res = await fetch('/api/mail/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId, days }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to archive messages');
  }
  return res.json();
}

export function AutoArchiveSettings() {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('inbox');
  const [days, setDays] = useState<number>(30);
  const queryClient = useQueryClient();

  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

  const archiveMutation = useMutation({
    mutationFn: ({ folderId, days }: { folderId: string; days: number }) => archiveMessages(folderId, days),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success(`Архивировано ${result.archived} писем`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка архивации');
    },
  });

  const handleArchive = () => {
    if (!selectedFolderId || !days || days < 1) {
      toast.error('Выберите папку и укажите количество дней');
      return;
    }

    if (confirm(`Архивировать письма старше ${days} дней из выбранной папки?`)) {
      archiveMutation.mutate({ folderId: selectedFolderId, days });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Автоматическая архивация</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Архивируйте старые письма из выбранной папки. Письма старше указанного количества дней будут перемещены в архив.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Папка для архивации</label>
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Архивировать письма старше (дней)</label>
          <Input
            type="number"
            min="1"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Письма старше указанного количества дней будут перемещены в архив
          </p>
        </div>

        <Button
          onClick={handleArchive}
          disabled={archiveMutation.isPending}
          className="w-full"
        >
          <Archive className="h-4 w-4 mr-2" />
          {archiveMutation.isPending ? 'Архивация...' : 'Заархивировать письма'}
        </Button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
        <div className="flex items-start gap-2">
          <Calendar className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Как это работает:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Выберите папку и количество дней</li>
              <li>Все письма старше указанного возраста будут перемещены в архив</li>
              <li>Архивация выполняется вручную по запросу</li>
              <li>Для автоматической архивации используйте правила авто-сортировки с действием "Автоархивация"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
