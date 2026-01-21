'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Label } from '@/lib/types';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

async function getLabels(): Promise<Label[]> {
  const res = await fetch('/api/mail/labels');
  if (!res.ok) {
    throw new Error('Failed to load labels');
  }
  return res.json();
}

async function createLabel(label: { name: string; color?: string }): Promise<Label> {
  const res = await fetch('/api/mail/labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(label),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create label');
  }
  return res.json();
}

async function updateLabel(id: string, label: { name?: string; color?: string }): Promise<Label> {
  const res = await fetch(`/api/mail/labels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(label),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update label');
  }
  return res.json();
}

async function deleteLabel(id: string): Promise<void> {
  const res = await fetch(`/api/mail/labels/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete label');
  }
}

const DEFAULT_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
];

export function LabelsManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState('#3b82f6');

  const queryClient = useQueryClient();

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ['labels'],
    queryFn: getLabels,
  });

  const createMutation = useMutation({
    mutationFn: createLabel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Метка создана');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка создания метки');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: { name?: string; color?: string } }) =>
      updateLabel(id, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Метка обновлена');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка обновления метки');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLabel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      toast.success('Метка удалена');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка удаления метки');
    },
  });

  const resetForm = () => {
    setLabelName('');
    setLabelColor('#3b82f6');
    setEditingLabel(null);
  };

  const handleOpenDialog = (label?: Label) => {
    if (label) {
      setEditingLabel(label);
      setLabelName(label.name);
      setLabelColor(label.color || '#3b82f6');
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
    if (!labelName.trim()) {
      toast.error('Введите название метки');
      return;
    }

    if (editingLabel) {
      updateMutation.mutate({
        id: editingLabel.id,
        label: { name: labelName.trim(), color: labelColor },
      });
    } else {
      createMutation.mutate({ name: labelName.trim(), color: labelColor });
    }
  };

  const handleDelete = (label: Label) => {
    if (confirm(`Вы уверены, что хотите удалить метку "${label.name}"?`)) {
      deleteMutation.mutate(label.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Метки</h2>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Добавить метку
        </Button>
      </div>

      <div className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Загрузка меток...</p>}

        {!isLoading && labels.length === 0 && (
          <p className="text-sm text-muted-foreground">Нет меток. Создайте первую метку для организации писем.</p>
        )}

        {!isLoading && labels.length > 0 && (
          <div className="space-y-2">
            {labels.map((label) => (
              <div
                key={label.id}
                className="flex items-center justify-between rounded-md border bg-card p-3"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: label.color || '#3b82f6' }}
                  />
                  <span className="font-medium truncate">{label.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenDialog(label)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(label)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLabel ? 'Редактировать метку' : 'Новая метка'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Название метки *</label>
              <Input
                value={labelName}
                onChange={(e) => setLabelName(e.target.value)}
                placeholder="Например: Важное, Работа"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Цвет</label>
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={labelColor}
                    onChange={(e) => setLabelColor(e.target.value)}
                    className="h-10 w-20 rounded border cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={labelColor}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                        setLabelColor(value);
                      }
                    }}
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setLabelColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        labelColor === color ? 'border-primary scale-110' : 'border-border hover:border-primary/50'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Отмена
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Сохранение...'
                : editingLabel
                  ? 'Сохранить'
                  : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
