'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Key, Plus, Download, Upload, Lock, Trash2 } from 'lucide-react';
import type { PGPKey } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

async function getPGPKeys(): Promise<PGPKey[]> {
  const res = await fetch('/api/pgp/keys');
  if (!res.ok) {
    throw new Error('Failed to load PGP keys');
  }
  return res.json();
}

async function generateKey(data: { email: string; name?: string; passphrase?: string }): Promise<PGPKey> {
  const res = await fetch('/api/pgp/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const errorMessage = error.error || 'Ошибка создания ключа';
    const apiError = new Error(errorMessage);
    (apiError as any).response = res;
    throw apiError;
  }
  return res.json();
}

async function importKey(data: { keyData: string; email: string; name?: string }): Promise<PGPKey> {
  const res = await fetch('/api/pgp/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const errorMessage = error.error || 'Ошибка импорта ключа';
    const apiError = new Error(errorMessage);
    (apiError as any).response = res;
    throw apiError;
  }
  return res.json();
}

async function deleteKey(id: string): Promise<void> {
  const res = await fetch(`/api/pgp/keys/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const errorMessage = error.error || 'Ошибка удаления ключа';
    const apiError = new Error(errorMessage);
    (apiError as any).response = res;
    throw apiError;
  }
}

export function PGPManager() {
  const [showGenerate, setShowGenerate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [generateEmail, setGenerateEmail] = useState('');
  const [generateName, setGenerateName] = useState('');
  const [generatePassphrase, setGeneratePassphrase] = useState('');
  const [importKeyData, setImportKeyData] = useState('');
  const [importEmail, setImportEmail] = useState('');
  const [importName, setImportName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<PGPKey | null>(null);
  const queryClient = useQueryClient();

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['pgp-keys'],
    queryFn: getPGPKeys,
  });

  const generateMutation = useMutation({
    mutationFn: generateKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pgp-keys'] });
      setShowGenerate(false);
      setGenerateEmail('');
      setGenerateName('');
      setGeneratePassphrase('');
      toast.success('PGP ключ создан');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка создания ключа');
    },
  });

  const importMutation = useMutation({
    mutationFn: importKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pgp-keys'] });
      setShowImport(false);
      setImportKeyData('');
      setImportEmail('');
      setImportName('');
      toast.success('PGP ключ импортирован');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка импорта ключа');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pgp-keys'] });
      setDeleteDialogOpen(false);
      setKeyToDelete(null);
      toast.success('PGP ключ удален');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка удаления ключа');
    },
  });

  const handleGenerate = () => {
    if (!generateEmail) {
      toast.error('Введите email');
      return;
    }
    if (generateMutation.isPending) {
      return;
    }
    generateMutation.mutate({
      email: generateEmail,
      name: generateName || undefined,
      passphrase: generatePassphrase || undefined,
    });
  };

  const handleImport = () => {
    if (!importKeyData || !importEmail) {
      toast.error('Введите данные ключа и email');
      return;
    }
    if (importMutation.isPending) {
      return;
    }
    importMutation.mutate({
      keyData: importKeyData,
      email: importEmail,
      name: importName || undefined,
    });
  };

  const handleExport = (key: PGPKey) => {
    const blob = new Blob([key.publicKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pgp-key-${key.email}-${key.fingerprint.substring(0, 8)}.asc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDeleteClick = (key: PGPKey) => {
    setKeyToDelete(key);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (keyToDelete && !deleteMutation.isPending) {
      deleteMutation.mutate(keyToDelete.id);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">PGP/GPG шифрование</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Управление PGP ключами для шифрования и подписи писем.
        </p>
      </div>

      <div className="flex gap-4 mb-6">
        <Button onClick={() => setShowGenerate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Создать ключ
        </Button>
        <Button variant="outline" onClick={() => setShowImport(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Импортировать ключ
        </Button>
      </div>

      {showGenerate && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="font-semibold">Создать новый PGP ключ</h3>
          <Input
            value={generateEmail}
            onChange={(e) => setGenerateEmail(e.target.value)}
            placeholder="Email"
            type="email"
          />
          <Input
            value={generateName}
            onChange={(e) => setGenerateName(e.target.value)}
            placeholder="Имя (необязательно)"
          />
          <Input
            value={generatePassphrase}
            onChange={(e) => setGeneratePassphrase(e.target.value)}
            placeholder="Парольная фраза (необязательно)"
            type="password"
          />
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Создание...' : 'Создать'}
            </Button>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {showImport && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="font-semibold">Импортировать PGP ключ</h3>
          <textarea
            value={importKeyData}
            onChange={(e) => setImportKeyData(e.target.value)}
            placeholder="Вставьте PGP ключ (-----BEGIN PGP PUBLIC KEY BLOCK-----...)"
            className="w-full min-h-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Input
            value={importEmail}
            onChange={(e) => setImportEmail(e.target.value)}
            placeholder="Email"
            type="email"
          />
          <Input
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            placeholder="Имя (необязательно)"
          />
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importMutation.isPending}>
              {importMutation.isPending ? 'Импорт...' : 'Импортировать'}
            </Button>
            <Button variant="outline" onClick={() => setShowImport(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-sm text-muted-foreground">Загрузка ключей...</p>
        </div>
      )}

      {!isLoading && keys.length > 0 && (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{key.name || key.email}</div>
                <div className="text-sm text-muted-foreground truncate">{key.email}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Отпечаток: {key.fingerprint}
                </div>
                {key.privateKey && (
                  <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Приватный ключ доступен
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport(key)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Экспорт
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteClick(key)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && keys.length === 0 && (
        <div className="text-center py-8">
          <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            Нет PGP ключей. Создайте или импортируйте ключ для начала работы.
          </p>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить PGP ключ</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить ключ для {keyToDelete?.email}?
              <br />
              <span className="text-xs text-muted-foreground mt-2 block">
                Отпечаток: {keyToDelete?.fingerprint}
              </span>
              <br />
              <span className="text-xs text-destructive mt-2 block">
                Это действие нельзя отменить. Ключ будет удален с сервера.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setKeyToDelete(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
