'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('settings.autoArchive');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('inbox');
  const [days, setDays] = useState<number>(30);
  const queryClient = useQueryClient();

  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

  const archiveMutation = useMutation({
    mutationFn: ({ folderId, days }: { folderId: string; days: number }) =>
      archiveMessages(folderId, days),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success(t('success', { count: result.archived }));
    },
    onError: (error: Error) => {
      toast.error(t('error'));
    },
  });

  const handleArchive = () => {
    if (!selectedFolderId || !days || days < 1) {
      toast.error(t('required'));
      return;
    }

    if (confirm(t('confirm', { days }))) {
      archiveMutation.mutate({ folderId: selectedFolderId, days });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('description')}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">{t('folder')}</label>
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
          <label className="text-sm font-medium mb-2 block">
            {t('days')}
          </label>
          <Input
            type="number"
            min="1"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('daysHelp')}
          </p>
        </div>

        <Button onClick={handleArchive} disabled={archiveMutation.isPending} className="w-full">
          <Archive className="h-4 w-4 mr-2" />
          {archiveMutation.isPending ? t('archiving') : t('archive')}
        </Button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
        <div className="flex items-start gap-2">
          <Calendar className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">{t('howItWorks')}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('stepChoose')}</li>
              <li>{t('stepMove')}</li>
              <li>{t('stepManual')}</li>
              <li>{t('stepRules')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
