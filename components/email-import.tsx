'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Upload, FileText, X, Archive } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Folder } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';

async function getFolders(): Promise<Folder[]> {
  const res = await fetch('/api/mail/folders');
  if (!res.ok) {
    throw new Error('Failed to load folders');
  }
  return res.json();
}

async function importEmail(emlContent: string, folderId?: string): Promise<{ success: boolean; messageId: string }> {
  const res = await fetch('/api/mail/messages/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emlContent, folderId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to import email');
  }
  return res.json();
}

interface EmailImportProps {
  open: boolean;
  onClose: () => void;
}

export function EmailImport({ open, onClose }: EmailImportProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('inbox');
  const queryClient = useQueryClient();

  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

  const importMutation = useMutation({
    mutationFn: ({ file, folderId }: { file: File; folderId?: string }) => {
      return new Promise<{ success: boolean; messageId: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const result = await importEmail(content, folderId);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success('Письмо импортировано');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка импорта письма');
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    for (const file of files) {
      if (file.name.endsWith('.eml')) {
        setSelectedFiles((prev) => [...prev, file]);
      } else if (file.name.endsWith('.zip')) {
        try {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(file);
          const emlFiles = Object.keys(zip.files).filter((name) => name.endsWith('.eml'));
          
          for (const emlName of emlFiles) {
            const emlFile = zip.files[emlName];
            if (emlFile && !emlFile.dir) {
              const content = await emlFile.async('string');
              const blob = new Blob([content], { type: 'message/rfc822' });
              const extractedFile = new File([blob], emlName, { type: 'message/rfc822' });
              setSelectedFiles((prev) => [...prev, extractedFile]);
            }
          }
          
          if (emlFiles.length === 0) {
            toast.error(`В архиве ${file.name} не найдено EML файлов`);
          } else {
            toast.success(`Извлечено ${emlFiles.length} EML файлов из архива`);
          }
        } catch (error) {
          toast.error(`Ошибка чтения архива ${file.name}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
        }
      } else {
        toast.error(`Файл ${file.name} не поддерживается. Используйте .eml или .zip файлы`);
      }
    }
    
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Выберите файлы для импорта');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const file of selectedFiles) {
      try {
        await importMutation.mutateAsync({ file, folderId: selectedFolderId || undefined });
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(`Failed to import ${file.name}:`, error);
      }
    }

    if (successCount > 0) {
      toast.success(`Импортировано ${successCount} из ${selectedFiles.length} писем`);
    }
    if (errorCount > 0) {
      toast.error(`Не удалось импортировать ${errorCount} писем`);
    }

    setSelectedFiles([]);
    if (successCount > 0) {
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Импорт писем из EML</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Папка для импорта</label>
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
            <label className="text-sm font-medium mb-2 block">Файлы EML</label>
            <div className="border-2 border-dashed rounded-md p-4">
              <input
                type="file"
                accept=".eml,.zip"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="eml-upload"
              />
              <label
                htmlFor="eml-upload"
                className="flex flex-col items-center justify-center cursor-pointer"
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground text-center">
                  Нажмите для выбора файлов или перетащите EML файлы или ZIP архивы сюда
                </span>
                <span className="text-xs text-muted-foreground/70 mt-1">
                  Поддерживаются .eml файлы и .zip архивы с EML файлами
                </span>
              </label>
            </div>
            {selectedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-md border bg-card p-2"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(index)}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Отмена
          </Button>
          <Button
            onClick={handleImport}
            disabled={importMutation.isPending || selectedFiles.length === 0}
          >
            {importMutation.isPending ? 'Импорт...' : `Импортировать ${selectedFiles.length} файл(ов)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
