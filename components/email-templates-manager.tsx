'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, FileText, Briefcase, User, Folder } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { SettingsSectionEmpty, SettingsSectionError, SettingsSectionHeader, SettingsSectionLoading } from '@/components/settings/settings-section-state';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category?: 'work' | 'personal' | 'general';
  variables?: string[];
  createdAt: Date;
  updatedAt: Date;
}

async function getTemplates(): Promise<EmailTemplate[]> {
  const res = await fetch('/api/mail/templates');
  if (!res.ok) {
    throw new Error('Failed to load templates');
  }
  return res.json();
}

async function createTemplate(template: { name: string; subject: string; body: string; category?: 'work' | 'personal' | 'general' }): Promise<EmailTemplate> {
  const res = await fetch('/api/mail/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create template');
  }
  return res.json();
}

async function updateTemplate(id: string, template: { name?: string; subject?: string; body?: string; category?: 'work' | 'personal' | 'general' }): Promise<EmailTemplate> {
  const res = await fetch(`/api/mail/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update template');
  }
  return res.json();
}

async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/mail/templates/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete template');
  }
}

function extractVariables(text: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  
  while ((match = variableRegex.exec(text)) !== null) {
    variables.add(match[1]!);
  }
  
  return Array.from(variables);
}

export function EmailTemplatesManager() {
  const t = useTranslations('settings.templates');
  const common = useTranslations('common');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateCategory, setTemplateCategory] = useState<'work' | 'personal' | 'general'>('general');

  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error, refetch } = useQuery({
    queryKey: ['email-templates'],
    queryFn: getTemplates,
  });

  const createMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success(t('createSuccess'));
    },
    onError: () => {
      toast.error(t('createError'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, template }: { id: string; template: { name?: string; subject?: string; body?: string; category?: 'work' | 'personal' | 'general' } }) =>
      updateTemplate(id, template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success(t('updateSuccess'));
    },
    onError: () => {
      toast.error(t('updateError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success(t('deleteSuccess'));
    },
    onError: () => {
      toast.error(t('deleteError'));
    },
  });

  const resetForm = () => {
    setTemplateName('');
    setTemplateSubject('');
    setTemplateBody('');
    setTemplateCategory('general');
    setEditingTemplate(null);
  };

  const handleOpenDialog = (template?: EmailTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateName(template.name);
      setTemplateSubject(template.subject);
      setTemplateBody(template.body);
      setTemplateCategory(template.category || 'general');
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const handleSubmit = () => {
    if (!templateName.trim() || !templateSubject.trim() || !templateBody.trim()) {
      toast.error(t('requiredError'));
      return;
    }

    if (editingTemplate) {
      updateMutation.mutate({
        id: editingTemplate.id,
        template: {
          name: templateName.trim(),
          subject: templateSubject.trim(),
          body: templateBody.trim(),
          category: templateCategory,
        },
      });
    } else {
      createMutation.mutate({
        name: templateName.trim(),
        subject: templateSubject.trim(),
        body: templateBody.trim(),
        category: templateCategory,
      });
    }
  };

  const handleDelete = (template: EmailTemplate) => {
    if (confirm(t('deleteConfirm', { name: template.name }))) {
      deleteMutation.mutate(template.id);
    }
  };

  const detectedVariables = extractVariables(templateSubject + ' ' + templateBody);

  const categoryIcons = {
    work: <Briefcase className="h-4 w-4" />,
    personal: <User className="h-4 w-4" />,
    general: <Folder className="h-4 w-4" />,
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader title={t('heading')} actions={<Button onClick={() => handleOpenDialog()} size="sm"><Plus className="h-4 w-4 mr-2" />{t('create')}</Button>} />

      <div className="space-y-4">
        {isLoading && <SettingsSectionLoading label={t('loading')} />}

        {!isLoading && error && <SettingsSectionError title={t('loadError')} description={t('loadErrorDescription')} retryLabel={t('retry')} onRetry={() => void refetch()} />}

        {!isLoading && !error && templates.length === 0 && <SettingsSectionEmpty>{t('empty')}</SettingsSectionEmpty>}

        {!isLoading && !error && templates.length > 0 && (
          <div className="space-y-2">
            {templates.map((template) => {
              const templateVariables = extractVariables(template.subject + ' ' + template.body);
              return (
                <div
                  key={template.id}
                  className="flex items-start justify-between rounded-md border bg-card p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {categoryIcons[template.category || 'general']}
                      <span className="font-medium">{template.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {template.category === 'work' ? t('categoryWork') : template.category === 'personal' ? t('categoryPersonal') : t('categoryGeneral')}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <div className="truncate"><strong>{t('subject')}:</strong> {template.subject}</div>
                      {templateVariables.length > 0 && (
                        <div className="text-xs mt-1">
                          {t('variables')}: {templateVariables.map((v) => `{{${v}}}`).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(template)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(template)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? t('editTitle') : t('newTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-auto">
            <div>
              <label className="text-sm font-medium">{t('nameLabel')}</label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('category')}</label>
              <select
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value as 'work' | 'personal' | 'general')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
              >
                <option value="general">{t('categoryGeneral')}</option>
                <option value="work">{t('categoryWork')}</option>
                <option value="personal">{t('categoryPersonal')}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('subjectLabel')}</label>
              <Input
                value={templateSubject}
                onChange={(e) => setTemplateSubject(e.target.value)}
                placeholder={t('subjectPlaceholder')}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('bodyLabel')}</label>
              <textarea
                value={templateBody}
                onChange={(e) => setTemplateBody(e.target.value)}
                placeholder={t('bodyPlaceholder')}
                className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                rows={10}
              />
            </div>
            {detectedVariables.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-medium mb-2">{t('detectedVariables')}</p>
                <div className="flex flex-wrap gap-2">
                  {detectedVariables.map((variable) => (
                    <span
                      key={variable}
                      className="inline-flex items-center px-2 py-1 rounded bg-background border text-xs font-mono"
                    >
                      {`{{${variable}}}`}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('variablesHelp')}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              {common('cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? common('saving')
                : editingTemplate
                  ? common('save')
                  : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
