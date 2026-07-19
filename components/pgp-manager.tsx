'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { SettingsSectionEmpty, SettingsSectionError, SettingsSectionHeader, SettingsSectionLoading } from '@/components/settings/settings-section-state';

async function getPGPKeys(): Promise<PGPKey[]> {
  const res = await fetch('/api/pgp/keys');
  if (!res.ok) {
    throw new Error('Failed to load PGP keys');
  }
  return res.json();
}

async function generateKey(data: {
  email: string;
  name?: string;
  passphrase?: string;
}): Promise<PGPKey> {
  const res = await fetch('/api/pgp/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const errorMessage = error.error || 'Failed to create key';
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
    const errorMessage = error.error || 'Failed to import key';
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
    const errorMessage = error.error || 'Failed to delete key';
    const apiError = new Error(errorMessage);
    (apiError as any).response = res;
    throw apiError;
  }
}

export function PGPManager() {
  const t = useTranslations('settings.pgp');
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

  const { data: keys = [], isLoading, error, refetch } = useQuery({
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
      toast.success(t('generateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(t('generateError'));
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
      toast.success(t('importSuccess'));
    },
    onError: (error: Error) => {
      toast.error(t('importError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pgp-keys'] });
      setDeleteDialogOpen(false);
      setKeyToDelete(null);
      toast.success(t('deleteSuccess'));
    },
    onError: (error: Error) => {
      toast.error(t('deleteError'));
    },
  });

  const handleGenerate = () => {
    if (!generateEmail) {
      toast.error(t('emailRequired'));
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
      toast.error(t('keyRequired'));
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
      <SettingsSectionHeader title={t('heading')} description={t('description')} />

      <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-4 space-y-3">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
          <Key className="h-5 w-5" />
          {t('instructionsHeading')}
        </h3>
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <p className="font-medium">{t('sendHeading')}</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>{t('sendStepKey')}</li>
            <li>{t('sendStepImport')}</li>
            <li>{t('sendStepAddress')}</li>
            <li>{t('sendStepEncrypt')}</li>
          </ol>
          <p className="font-medium mt-3">{t('important')}</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t('notePerRecipient')}</li>
            <li>{t('noteAddress')}</li>
            <li>{t('noteKeyChoice')}</li>
            <li>{t('notePrivateKey')}</li>
          </ul>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <Button onClick={() => setShowGenerate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('generate')}
        </Button>
        <Button variant="outline" onClick={() => setShowImport(true)}>
          <Upload className="h-4 w-4 mr-2" />
          {t('import')}
        </Button>
      </div>

      {showGenerate && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="font-semibold">{t('generateHeading')}</h3>
          <Input
            value={generateEmail}
            onChange={(e) => setGenerateEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            aria-label={t('email')}
            type="email"
          />
          <Input
            value={generateName}
            onChange={(e) => setGenerateName(e.target.value)}
            placeholder={t('namePlaceholder')}
          />
          <Input
            value={generatePassphrase}
            onChange={(e) => setGeneratePassphrase(e.target.value)}
            placeholder={t('passphrasePlaceholder')}
            type="password"
          />
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? t('generating') : t('create')}
            </Button>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {showImport && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="font-semibold">{t('importHeading')}</h3>
          <textarea
            value={importKeyData}
            onChange={(e) => setImportKeyData(e.target.value)}
            placeholder={t('keyPlaceholder')}
            className="w-full min-h-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Input
            value={importEmail}
            onChange={(e) => setImportEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            aria-label={t('email')}
            type="email"
          />
          <Input
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            placeholder={t('namePlaceholder')}
          />
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importMutation.isPending}>
              {importMutation.isPending ? t('importing') : t('import')}
            </Button>
            <Button variant="outline" onClick={() => setShowImport(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {isLoading && <SettingsSectionLoading label={t('loading')} />}
      {!isLoading && error && <SettingsSectionError title={t('loadError')} description={t('loadErrorDescription')} retryLabel={t('retry')} onRetry={() => void refetch()} />}

      {!isLoading && !error && keys.length > 0 && (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-lg border bg-card p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{key.name || key.email}</div>
                <div className="text-sm text-muted-foreground truncate">{key.email}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t('fingerprint')}: {key.fingerprint}
                </div>
                {key.privateKey && (
                  <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    {t('privateKeyAvailable')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExport(key)}>
                  <Download className="h-4 w-4 mr-2" />
                  {t('export')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteClick(key)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && keys.length === 0 && <SettingsSectionEmpty>{t('empty')}</SettingsSectionEmpty>}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteConfirm', { email: keyToDelete?.email ?? '' })}
              <br />
              <span className="text-xs text-muted-foreground mt-2 block">
                {t('fingerprint')}: {keyToDelete?.fingerprint}
              </span>
              <br />
              <span className="text-xs text-destructive mt-2 block">
                {t('deleteWarning')}
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
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('deleting') : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
