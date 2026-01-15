'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { AutoSortRule, AutoSortAction, FilterGroup, Folder } from '@/lib/types';
import { FilterQueryParser } from '@/lib/filter-parser';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AutoSortRuleEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (rule: Omit<AutoSortRule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  folders: Folder[];
  existingRule?: AutoSortRule;
}

export function AutoSortRuleEditor({
  open,
  onClose,
  onSave,
  folders,
  existingRule,
}: AutoSortRuleEditorProps) {
  const [name, setName] = useState(existingRule?.name || '');
  const [enabled, setEnabled] = useState(existingRule?.enabled ?? true);
  const [filterQuery, setFilterQuery] = useState(
    existingRule?.filterGroup ? FilterQueryParser.buildQuery(existingRule.filterGroup) : ''
  );
  const [actions, setActions] = useState<AutoSortAction[]>(
    existingRule?.actions || [{ type: 'moveToFolder', folderId: folders.find((f) => f.role === 'inbox')?.id || '' }]
  );
  const [applyToExisting, setApplyToExisting] = useState(existingRule?.applyToExisting ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddAction = () => {
    setActions([...actions, { type: 'moveToFolder', folderId: folders[0]?.id || '' }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionChange = (index: number, action: AutoSortAction) => {
    const newActions = [...actions];
    newActions[index] = action;
    setActions(newActions);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Введите название правила');
      return;
    }

    if (!filterQuery.trim()) {
      toast.error('Введите условия фильтра');
      return;
    }

    if (actions.length === 0) {
      toast.error('Добавьте хотя бы одно действие');
      return;
    }

    const parsed = FilterQueryParser.parse(filterQuery);
    if (!parsed.filterGroup) {
      toast.error('Неверный формат условий фильтра');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        enabled,
        filterGroup: parsed.filterGroup,
        actions,
        applyToExisting,
      });
      toast.success('Правило сохранено');
      onClose();
      setName('');
      setFilterQuery('');
      setActions([{ type: 'moveToFolder', folderId: folders.find((f) => f.role === 'inbox')?.id || '' }]);
      setApplyToExisting(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка сохранения правила');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingRule ? 'Редактировать правило' : 'Создать правило авто-сортировки'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Название правила</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Переместить письма от Amazon в папку Покупки"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Условия (запрос фильтра)</label>
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Например: from:amazon OR from:*@amazon.com"
            />
            <p className="text-xs text-muted-foreground">
              Используйте синтаксис фильтров: from:, to:, subject:, has:attachment и т.д.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Действия</label>
            {actions.map((action, index) => (
              <div key={index} className="flex items-center gap-2 p-2 border rounded">
                <select
                  value={action.type}
                  onChange={(e) => {
                    const newAction: AutoSortAction =
                      e.target.value === 'moveToFolder'
                        ? { type: 'moveToFolder', folderId: folders[0]?.id || '' }
                        : e.target.value === 'addLabel'
                        ? { type: 'addLabel', label: '' }
                        : e.target.value === 'markRead'
                        ? { type: 'markRead' }
                        : e.target.value === 'markImportant'
                        ? { type: 'markImportant' }
                        : e.target.value === 'autoArchive'
                        ? { type: 'autoArchive', days: 30 }
                        : e.target.value === 'autoDelete'
                        ? { type: 'autoDelete', days: 30 }
                        : e.target.value === 'forward'
                        ? { type: 'forward', email: '' }
                        : { type: 'notify', service: 'telegram', target: '' };
                    handleActionChange(index, newAction);
                  }}
                  className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground dark:bg-background dark:text-foreground dark:border-border"
                >
                  <option value="moveToFolder">Переместить в папку</option>
                  <option value="addLabel">Добавить метку</option>
                  <option value="markRead">Пометить прочитанным</option>
                  <option value="markImportant">Пометить важным</option>
                  <option value="autoArchive">Авто-архивировать через N дней</option>
                  <option value="autoDelete">Авто-удалить через N дней</option>
                  <option value="forward">Переслать на email</option>
                  <option value="notify">Уведомить (Telegram/Matrix)</option>
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

                {action.type === 'addLabel' && (
                  <Input
                    value={action.label}
                    onChange={(e) => handleActionChange(index, { ...action, label: e.target.value })}
                    placeholder="Название метки"
                    className="flex-1"
                  />
                )}

                {(action.type === 'autoArchive' || action.type === 'autoDelete') && (
                  <Input
                    type="number"
                    value={action.days}
                    onChange={(e) =>
                      handleActionChange(index, { ...action, days: parseInt(e.target.value, 10) || 30 })
                    }
                    placeholder="Дней"
                    className="w-24"
                  />
                )}

                {action.type === 'forward' && (
                  <Input
                    type="email"
                    value={action.email}
                    onChange={(e) => handleActionChange(index, { ...action, email: e.target.value })}
                    placeholder="email@example.com"
                    className="flex-1"
                  />
                )}

                {action.type === 'notify' && (
                  <>
                    <select
                      value={action.service}
                      onChange={(e) =>
                        handleActionChange(index, {
                          ...action,
                          service: e.target.value as 'telegram' | 'matrix',
                        })
                      }
                      className="rounded border border-input bg-background px-2 py-1 text-sm text-foreground dark:bg-background dark:text-foreground dark:border-border"
                    >
                      <option value="telegram">Telegram</option>
                      <option value="matrix">Matrix</option>
                    </select>
                    <Input
                      value={action.target}
                      onChange={(e) => handleActionChange(index, { ...action, target: e.target.value })}
                      placeholder="ID чата/канала"
                      className="flex-1"
                    />
                  </>
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
              Добавить действие
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
              Правило включено
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
              Применить к существующим письмам (при сохранении)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}