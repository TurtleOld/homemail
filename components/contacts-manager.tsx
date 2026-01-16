'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Contact } from '@/lib/types';
import { UserPlus, Edit2, Trash2, Mail, Phone, FileText, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

async function getContacts(): Promise<Contact[]> {
  const res = await fetch('/api/contacts');
  if (!res.ok) {
    throw new Error('Failed to load contacts');
  }
  return res.json();
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

export function ContactsManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: getContacts,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Контакты</h2>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Добавить контакт
        </Button>
      </div>

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
    </div>
  );
}
