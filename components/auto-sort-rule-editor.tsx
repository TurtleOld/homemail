'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { AutoSortRule, FilterCondition, FilterField, FilterGroup, FilterOperator, Folder } from '@/lib/types';
import type { FilterJob } from '@/lib/filter-job-queue';
import { getCsrfHeader } from '@/lib/csrf-client';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

interface AutoSortRuleEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (rule: Omit<AutoSortRule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  folders: Folder[];
  existingRule?: AutoSortRule;
}

// The practical field/operator subset actually used by saved rules and
// correctly handled by every matching path (daemon + Sieve accelerator).
// Fields like date/tags/folder/messageId/attachment/filename/status exist in
// FilterField but aren't exposed here — see ADR 0011.
const TEXT_FIELDS: FilterField[] = ['from', 'to', 'cc', 'bcc', 'subject', 'body'];
const TEXT_OPERATORS: FilterOperator[] = ['contains', 'equals', 'startsWith', 'endsWith', 'matches'];
const SIZE_OPERATORS: FilterOperator[] = ['gt', 'gte', 'lt', 'lte', 'equals'];

type UiCondition = {
  key: string;
  field: FilterField;
  operator: FilterOperator;
  value: string;
};

let uiConditionKeySeq = 0;
function nextConditionKey(): string {
  uiConditionKeySeq += 1;
  return `cond_${uiConditionKeySeq}`;
}

function newCondition(): UiCondition {
  return { key: nextConditionKey(), field: 'from', operator: 'contains', value: '' };
}

function conditionsFromFilterGroup(group: FilterGroup | undefined): { logic: 'AND' | 'OR'; conditions: UiCondition[] } {
  if (!group || !group.conditions || group.conditions.length === 0) {
    return { logic: 'AND', conditions: [newCondition()] };
  }
  return {
    logic: group.logic,
    conditions: group.conditions.map((c) => ({
      key: nextConditionKey(),
      field: c.field,
      operator: c.operator,
      value: Array.isArray(c.value) ? c.value.join(', ') : String(c.value),
    })),
  };
}

function conditionsToFilterGroup(logic: 'AND' | 'OR', conditions: UiCondition[]): FilterGroup | null {
  const valid = conditions.filter((c) => c.value.trim().length > 0);
  if (valid.length === 0) {
    return null;
  }
  return {
    logic,
    conditions: valid.map((c): FilterCondition => ({
      field: c.field,
      operator: c.operator,
      value: c.field === 'size' ? Number(c.value) || 0 : c.value.trim(),
      caseSensitive: false,
    })),
  };
}

function operatorsForField(field: FilterField): FilterOperator[] {
  return field === 'size' ? SIZE_OPERATORS : TEXT_OPERATORS;
}

export function AutoSortRuleEditor({
  open,
  onClose,
  onSave,
  folders,
  existingRule,
}: AutoSortRuleEditorProps) {
  const t = useTranslations('settings.autoSortRule');
  const common = useTranslations('common');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<UiCondition[]>([newCondition()]);
  const [actions, setActions] = useState<AutoSortRule['actions']>([
    { type: 'moveToFolder', folderId: folders.find((f) => f.role === 'inbox')?.id || '' }
  ]);
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<FilterJob | null>(null);
  const [isStartingPreview, setIsStartingPreview] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open && existingRule) {
      setName(existingRule.name || '');
      setEnabled(existingRule.enabled ?? true);
      const parsed = conditionsFromFilterGroup(existingRule.conditions);
      setLogic(parsed.logic);
      setConditions(parsed.conditions);
      setActions(
        existingRule.actions && existingRule.actions.length > 0
          ? existingRule.actions
          : [{ type: 'moveToFolder', folderId: folders.find((f) => f.role === 'inbox')?.id || '' }]
      );
      setApplyToExisting(existingRule.applyToExisting ?? false);
    } else if (open && !existingRule) {
      setName('');
      setEnabled(true);
      setLogic('AND');
      setConditions([newCondition()]);
      setActions([{ type: 'moveToFolder', folderId: folders.find((f) => f.role === 'inbox')?.id || '' }]);
      setApplyToExisting(false);
    }
    if (open) {
      setPreviewJobId(null);
      setPreviewJob(null);
    }
  }, [open, existingRule, folders]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const handleAddCondition = () => {
    setConditions([...conditions, newCondition()]);
  };

  const handleRemoveCondition = (key: string) => {
    setConditions(conditions.filter((c) => c.key !== key));
  };

  const handleConditionChange = (key: string, updates: Partial<UiCondition>) => {
    setConditions(conditions.map((c) => {
      if (c.key !== key) return c;
      const next = { ...c, ...updates };
      // Reset operator if it isn't valid for the newly selected field.
      if (updates.field && !operatorsForField(updates.field).includes(next.operator)) {
        next.operator = operatorsForField(updates.field)[0];
      }
      return next;
    }));
  };

  const handleAddAction = () => {
    setActions([...actions, { type: 'moveToFolder', folderId: folders[0]?.id || '' }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionChange = (index: number, action: AutoSortRule['actions'][0]) => {
    const newActions = [...actions];
    newActions[index] = action;
    setActions(newActions);
  };

  const handleCheckMatches = async () => {
    const filterGroup = conditionsToFilterGroup(logic, conditions);
    if (!filterGroup) {
      toast.error(t('queryRequired'));
      return;
    }

    stopPolling();
    setPreviewJob(null);
    setIsStartingPreview(true);
    try {
      const res = await fetch('/api/mail/filters/rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
        body: JSON.stringify({ conditions: filterGroup }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start preview');
      }
      const { jobId } = await res.json();
      setPreviewJobId(jobId);

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/mail/filters/rules/jobs?jobId=${encodeURIComponent(jobId)}`);
          if (!statusRes.ok) return;
          const job: FilterJob = await statusRes.json();
          setPreviewJob(job);
          if (job.status === 'completed' || job.status === 'failed') {
            stopPolling();
          }
        } catch {
          // Transient errors are ignored; polling continues until it succeeds or completes.
        }
      }, 2000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('previewError'));
    } finally {
      setIsStartingPreview(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }

    const filterGroup = conditionsToFilterGroup(logic, conditions);
    if (!filterGroup) {
      toast.error(t('queryRequired'));
      return;
    }

    if (actions.length === 0) {
      toast.error(t('actionRequired'));
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        enabled,
        conditions: filterGroup,
        actions,
        priority: 0,
        applyToExisting,
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingRule ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('nameLabel')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t('conditionsLabel')}</label>
              {conditions.length > 1 && (
                <select
                  value={logic}
                  onChange={(e) => setLogic(e.target.value as 'AND' | 'OR')}
                  className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground dark:bg-background dark:text-foreground dark:border-border"
                >
                  <option value="AND">{t('matchAll')}</option>
                  <option value="OR">{t('matchAny')}</option>
                </select>
              )}
            </div>

            {conditions.map((condition) => (
              <div key={condition.key} className="flex items-center gap-2 p-2 border rounded">
                <select
                  value={condition.field}
                  onChange={(e) => handleConditionChange(condition.key, { field: e.target.value as FilterField })}
                  className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground dark:bg-background dark:text-foreground dark:border-border"
                >
                  {TEXT_FIELDS.map((field) => (
                    <option key={field} value={field}>{t(`field.${field}`)}</option>
                  ))}
                  <option value="size">{t('field.size')}</option>
                </select>

                <select
                  value={condition.operator}
                  onChange={(e) => handleConditionChange(condition.key, { operator: e.target.value as FilterOperator })}
                  className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground dark:bg-background dark:text-foreground dark:border-border"
                >
                  {operatorsForField(condition.field).map((op) => (
                    <option key={op} value={op}>{t(`operator.${op}`)}</option>
                  ))}
                </select>

                <Input
                  value={condition.value}
                  onChange={(e) => handleConditionChange(condition.key, { value: e.target.value })}
                  placeholder={condition.field === 'size' ? t('sizePlaceholder') : t('valuePlaceholder')}
                  type={condition.field === 'size' ? 'number' : 'text'}
                  className="flex-1"
                />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCondition(condition.key)}
                  disabled={conditions.length === 1}
                  className="h-8 w-8 p-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleAddCondition} className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                {t('addCondition')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCheckMatches} disabled={isStartingPreview}>
                <Search className="h-4 w-4 mr-2" />
                {isStartingPreview ? t('checkingMatches') : t('checkMatches')}
              </Button>
            </div>

            {previewJobId && (
              <p className="text-xs text-muted-foreground">
                {!previewJob || previewJob.status === 'pending' || previewJob.status === 'processing'
                  ? t('previewRunning')
                  : previewJob.status === 'failed'
                  ? t('previewFailed', { error: previewJob.error || '' })
                  : t('previewResult', { count: previewJob.matchedCount ?? 0, total: previewJob.progress?.total ?? 0 })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('actions')}</label>
            {actions.map((action, index) => (
              <div key={index} className="flex items-center gap-2 p-2 border rounded">
                <select
                  value={action.type}
                  onChange={(e) => {
                    const newAction: AutoSortRule['actions'][0] =
                      e.target.value === 'moveToFolder'
                        ? { type: 'moveToFolder', folderId: folders[0]?.id || '' }
                        : e.target.value === 'label'
                        ? { type: 'label', payload: { labelIds: [] } }
                        : e.target.value === 'markRead'
                        ? { type: 'markRead' }
                        : e.target.value === 'markImportant'
                        ? { type: 'markImportant' }
                        : e.target.value === 'autoArchive'
                        ? { type: 'autoArchive', payload: { days: 30 } }
                        : e.target.value === 'autoDelete'
                        ? { type: 'autoDelete', payload: { days: 30 } }
                        : e.target.value === 'forward'
                        ? { type: 'forward', payload: { email: '' } }
                        : { type: 'delete' };
                    handleActionChange(index, newAction);
                  }}
                  className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground dark:bg-background dark:text-foreground dark:border-border"
                >
                  <option value="moveToFolder">{t('moveToFolder')}</option>
                  <option value="label">{t('addLabel')}</option>
                  <option value="markRead">{t('markRead')}</option>
                  <option value="markImportant">{t('markImportant')}</option>
                  <option value="autoArchive">{t('autoArchive')}</option>
                  <option value="autoDelete">{t('autoDelete')}</option>
                  <option value="forward">{t('forward')}</option>
                </select>

                {action.type === 'moveToFolder' && (
                  <select
                    value={action.folderId}
                    onChange={(e) =>
                      handleActionChange(index, { ...action, folderId: e.target.value })
                    }
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground dark:bg-background dark:text-foreground dark:border-border"
                  >
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                )}

                {action.type === 'label' && (
                  <Input
                    value={action.payload?.labelIds?.[0] || ''}
                    onChange={(e) => handleActionChange(index, { ...action, payload: { labelIds: e.target.value ? [e.target.value] : [] } })}
                    placeholder={t('labelPlaceholder')}
                    className="flex-1"
                  />
                )}

                {(action.type === 'autoArchive' || action.type === 'autoDelete') && (
                  <Input
                    type="number"
                    value={action.payload?.days || 30}
                    onChange={(e) =>
                      handleActionChange(index, { ...action, payload: { days: parseInt(e.target.value, 10) || 30 } })
                    }
                    placeholder={t('daysPlaceholder')}
                    className="w-24"
                  />
                )}

                {action.type === 'forward' && (
                  <Input
                    type="email"
                    value={action.payload?.email || ''}
                    onChange={(e) => handleActionChange(index, { ...action, payload: { email: e.target.value } })}
                    placeholder="email@example.com"
                    className="flex-1"
                  />
                )}


                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAction(index)}
                  className="h-8 w-8 p-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={handleAddAction} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              {t('addAction')}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="enabled" className="text-sm">
              {t('enabled')}
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="applyToExisting"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="applyToExisting" className="text-sm">
              {t('applyExisting')}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? common('saving') : common('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
