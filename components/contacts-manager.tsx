'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Contact, ContactGroup } from '@/lib/types';
import { UserPlus, Edit2, Trash2, Mail, Phone, FileText, X, Download, Upload, Users, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

async function getContacts(): Promise<Contact[]> {
  const res = await fetch('/api/contacts');
  if (!res.ok) {
    throw new Error('Failed to load contacts');
  }
  return res.json();
}

async function getContactGroups(): Promise<ContactGroup[]> {
  const res = await fetch('/api/contacts/groups');
  if (!res.ok) {
    throw new Error('Failed to load contact groups');
  }
  return res.json();
}

async function createContactGroup(group: { name: string; color?: string }): Promise<ContactGroup> {
  const res = await fetch('/api/contacts/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create group');
  }
  return res.json();
}

async function updateContactGroup(id: string, group: { name?: string; color?: string; contactIds?: string[] }): Promise<ContactGroup> {
  const res = await fetch(`/api/contacts/groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update group');
  }
  return res.json();
}

async function deleteContactGroup(id: string): Promise<void> {
  const res = await fetch(`/api/contacts/groups/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete group');
  }
}

async function createContact(contact: { email: string; name?: string; phone?: string; notes?: string }): Promise<Contact> {
  const res = await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create contact');
  }
  return res.json();
}

async function updateContact(id: string, contact: { email?: string; name?: string; phone?: string; notes?: string }): Promise<Contact> {
  const res = await fetch(`/api/contacts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update contact');
  }
  return res.json();
}

async function deleteContact(id: string): Promise<void> {
  const res = await fetch(`/api/contacts/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete contact');
  }
}

async function exportContacts(format: 'vcard' | 'csv'): Promise<void> {
  const res = await fetch(`/api/contacts/export?format=${format}`);
  if (!res.ok) {
    throw new Error('Failed to export contacts');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `contacts_${Date.now()}.${format === 'vcard' ? 'vcf' : 'csv'}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

async function importContacts(content: string, format: 'vcard' | 'csv'): Promise<{ imported: number; skipped: number; total: number }> {
  const res = await fetch('/api/contacts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, format }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to import contacts');
  }
  return res.json();
}

export function ContactsManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFormat, setImportFormat] = useState<'vcard' | 'csv'>('vcard');
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState('#3b82f6');
  const [selectedGroupContactIds, setSelectedGroupContactIds] = useState<string[]>([]);

  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: getContacts,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: getContactGroups,
  });

  const createMutation = useMutation({
    mutationFn: createContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Контакт создан');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка создания контакта');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, contact }: { id: string; contact: { email?: string; name?: string; phone?: string; notes?: string } }) =>
      updateContact(id, contact),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Контакт обновлён');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка обновления контакта');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Контакт удалён');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка удаления контакта');
    },
  });

  const exportMutation = useMutation({
    mutationFn: exportContacts,
    onSuccess: (_, format) => {
      toast.success(`Контакты экспортированы в ${format === 'vcard' ? 'vCard' : 'CSV'}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка экспорта контактов');
    },
  });

  const importMutation = useMutation({
    mutationFn: ({ content, format }: { content: string; format: 'vcard' | 'csv' }) =>
      importContacts(content, format),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      if (result.skipped > 0) {
        toast.success(`Импортировано ${result.imported} контактов, пропущено ${result.skipped} (уже существуют)`);
      } else {
        toast.success(`Импортировано ${result.imported} контактов`);
      }
      setIsImportDialogOpen(false);
      setImportFile(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка импорта контактов');
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: createContactGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      setIsGroupDialogOpen(false);
      resetGroupForm();
      toast.success('Группа создана');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка создания группы');
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, group }: { id: string; group: { name?: string; color?: string; contactIds?: string[] } }) =>
      updateContactGroup(id, group),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setIsGroupDialogOpen(false);
      resetGroupForm();
      toast.success('Группа обновлена');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка обновления группы');
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: deleteContactGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Группа удалена');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка удаления группы');
    },
  });

  const resetGroupForm = () => {
    setGroupName('');
    setGroupColor('#3b82f6');
    setSelectedGroupContactIds([]);
    setEditingGroup(null);
  };

  const handleOpenGroupDialog = (group?: ContactGroup) => {
    if (group) {
      setEditingGroup(group);
      setGroupName(group.name);
      setGroupColor(group.color || '#3b82f6');
      const groupContacts = contacts.filter((c) => c.groups?.includes(group.id));
      setSelectedGroupContactIds(groupContacts.map((c) => c.id));
    } else {
      resetGroupForm();
    }
    setIsGroupDialogOpen(true);
  };

  const handleGroupSubmit = () => {
    if (!groupName.trim()) {
      toast.error('Введите название группы');
      return;
    }

    if (editingGroup) {
      updateGroupMutation.mutate({
        id: editingGroup.id,
        group: {
          name: groupName.trim(),
          color: groupColor,
          contactIds: selectedGroupContactIds,
        },
      });
    } else {
      createGroupMutation.mutate({
        name: groupName.trim(),
        color: groupColor,
      });
    }
  };

  const resetForm = () => {
    setEmail('');
    setName('');
    setPhone('');
    setNotes('');
    setEditingContact(null);
  };

  const handleOpenDialog = (contact?: Contact) => {
    if (contact) {
      setEditingContact(contact);
      setEmail(contact.email);
      setName(contact.name || '');
      setPhone(contact.phone || '');
      setNotes(contact.notes || '');
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
    if (!email.trim()) {
      toast.error('Введите email');
      return;
    }

    const contactData = {
      email: email.trim(),
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, contact: contactData });
    } else {
      createMutation.mutate(contactData);
    }
  };

  const filteredContacts = contacts.filter((contact) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      contact.email.toLowerCase().includes(query) ||
      contact.name?.toLowerCase().includes(query) ||
      contact.phone?.toLowerCase().includes(query)
    );
  });

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.vcf')) {
      setImportFormat('vcard');
    } else if (fileName.endsWith('.csv')) {
      setImportFormat('csv');
    } else {
      toast.error('Поддерживаются только .vcf и .csv файлы');
      return;
    }
    
    setImportFile(file);
  };

  const handleImport = () => {
    if (!importFile) {
      toast.error('Выберите файл для импорта');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      importMutation.mutate({ content, format: importFormat });
    };
    reader.onerror = () => {
      toast.error('Ошибка чтения файла');
    };
    reader.readAsText(importFile);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Контакты</h2>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Экспорт
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => exportMutation.mutate('vcard')}
                disabled={exportMutation.isPending}
              >
                Экспорт в vCard (.vcf)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportMutation.mutate('csv')}
                disabled={exportMutation.isPending}
              >
                Экспорт в CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Импорт
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleOpenGroupDialog()}>
            <Users className="h-4 w-4 mr-2" />
            Группы
          </Button>
          <Button onClick={() => handleOpenDialog()} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Добавить контакт
          </Button>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Группы контактов</h3>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const groupContacts = contacts.filter((c) => c.groups?.includes(group.id));
              return (
                <div
                  key={group.id}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: group.color || '#3b82f6' }}
                  />
                  <span className="text-sm font-medium">{group.name}</span>
                  <span className="text-xs text-muted-foreground">({groupContacts.length})</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenGroupDialog(group)}
                    className="h-6 w-6 p-0"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Удалить группу "${group.name}"?`)) {
                        deleteGroupMutation.mutate(group.id);
                      }
                    }}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Input
          placeholder="Поиск контактов..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {isLoading && <p className="text-sm text-muted-foreground">Загрузка контактов...</p>}

        {!isLoading && filteredContacts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'Контакты не найдены' : 'Нет контактов'}
          </p>
        )}

        {!isLoading && filteredContacts.length > 0 && (
          <div className="space-y-2">
            {filteredContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between rounded-md border bg-card p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {contact.name ? (
                      <div className="font-medium truncate">{contact.name}</div>
                    ) : null}
                    <div className="text-sm text-muted-foreground truncate flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </div>
                  </div>
                  {contact.phone && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </div>
                  )}
                  {contact.notes && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <FileText className="h-3 w-3" />
                      <span className="truncate">{contact.notes}</span>
                    </div>
                  )}
                  {contact.groups && contact.groups.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {contact.groups.map((groupId) => {
                        const group = groups.find((g) => g.id === groupId);
                        if (!group) return null;
                        return (
                          <span
                            key={groupId}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: `${group.color || '#3b82f6'}20`,
                              color: group.color || '#3b82f6',
                            }}
                          >
                            {group.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenDialog(contact)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Удалить контакт ${contact.email}?`)) {
                        deleteMutation.mutate(contact.id);
                      }
                    }}
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
            <DialogTitle>{editingContact ? 'Редактировать контакт' : 'Новый контакт'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email *</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Имя</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя контакта"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Телефон</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 (999) 123-45-67"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Заметки</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Дополнительная информация"
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
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
                : editingContact
                  ? 'Сохранить'
                  : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Импорт контактов</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Файл для импорта</label>
              <input
                type="file"
                accept=".vcf,.csv"
                onChange={handleImportFile}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Поддерживаются файлы vCard (.vcf) и CSV (.csv)
              </p>
            </div>
            {importFile && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{importFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(importFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending || !importFile}
            >
              {importMutation.isPending ? 'Импорт...' : 'Импортировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Редактировать группу' : 'Новая группа'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Название группы *</label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Например: Коллеги, Друзья"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Цвет</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={groupColor}
                  onChange={(e) => setGroupColor(e.target.value)}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  type="text"
                  value={groupColor}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                      setGroupColor(value);
                    }
                  }}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
              </div>
            </div>
            {editingGroup && (
              <div>
                <label className="text-sm font-medium mb-2 block">Контакты в группе</label>
                <div className="border rounded-md p-3 max-h-[300px] overflow-y-auto">
                  {contacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет контактов</p>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((contact) => (
                        <div key={contact.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedGroupContactIds.includes(contact.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedGroupContactIds([...selectedGroupContactIds, contact.id]);
                              } else {
                                setSelectedGroupContactIds(selectedGroupContactIds.filter((id) => id !== contact.id));
                              }
                            }}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">
                            {contact.name || contact.email}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGroupDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleGroupSubmit}
              disabled={createGroupMutation.isPending || updateGroupMutation.isPending}
            >
              {createGroupMutation.isPending || updateGroupMutation.isPending
                ? 'Сохранение...'
                : editingGroup
                  ? 'Сохранить'
                  : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
