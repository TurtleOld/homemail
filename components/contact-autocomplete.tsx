'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Contact, ContactGroup } from '@/lib/types';
import { User, Mail, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface ContactAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (contact: Contact) => void;
  placeholder?: string;
  className?: string;
  multiple?: boolean;
}

async function searchContacts(query: string): Promise<Contact[]> {
  if (!query || query.length < 1) {
    return [];
  }
  const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    return [];
  }
  return res.json();
}

async function getContactGroups(): Promise<ContactGroup[]> {
  const res = await fetch('/api/contacts/groups');
  if (!res.ok) {
    return [];
  }
  return res.json();
}

export function ContactAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Email',
  className,
  multiple = false,
}: ContactAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ['contacts-search', value],
    queryFn: () => searchContacts(value),
    enabled: value.length > 0 && isOpen,
    staleTime: 5000,
  });

  const { data: groups = [] } = useQuery<ContactGroup[]>({
    queryKey: ['contact-groups'],
    queryFn: getContactGroups,
    staleTime: 60000,
  });

  const groupContacts = useMemo(() => {
    if (!value.startsWith('@')) return [];
    const groupName = value.substring(1).toLowerCase();
    const group = groups.find((g) => g.name.toLowerCase().startsWith(groupName));
    if (!group) return [];
    return contacts.filter((c) => c.groups?.includes(group.id));
  }, [value, groups, contacts]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    if (newValue.length > 0) {
      setIsOpen(true);
      setHighlightedIndex(-1);
    } else {
      setIsOpen(false);
    }
  };

  const handleInputFocus = () => {
    if (value.length > 0 && contacts.length > 0) {
      setIsOpen(true);
    }
  };

  const handleSelect = useCallback((contact: Contact) => {
    if (multiple) {
      const emails = value.split(',').map((e) => e.trim()).filter(Boolean);
      const emailToAdd = contact.name ? `${contact.name} <${contact.email}>` : contact.email;
      if (!emails.includes(contact.email) && !emails.some((e) => e.includes(contact.email))) {
        emails.push(emailToAdd);
        onChange(emails.join(', '));
      }
    } else {
      const emailToSet = contact.name ? `${contact.name} <${contact.email}>` : contact.email;
      onChange(emailToSet);
    }
    onSelect?.(contact);
    setIsOpen(false);
    inputRef.current?.focus();
  }, [value, onChange, onSelect, multiple]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || contacts.length === 0) {
      if (e.key === 'ArrowDown' && value.length > 0) {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < contacts.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < contacts.length) {
          handleSelect(contacts[highlightedIndex]!);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  const handleGroupSelect = useCallback((group: ContactGroup) => {
    const groupContacts = contacts.filter((c) => c.groups?.includes(group.id));
    if (groupContacts.length === 0) {
      return;
    }
    
    if (multiple) {
      const emails = value.split(',').map((e) => e.trim()).filter(Boolean);
      const groupEmails = groupContacts.map((c) => c.name ? `${c.name} <${c.email}>` : c.email);
      const newEmails = groupEmails.filter((e) => !emails.some((existing) => existing.includes(e.split('<')[1]?.split('>')[0] || e)));
      onChange([...emails, ...newEmails].join(', '));
    } else {
      const firstContact = groupContacts[0];
      if (firstContact) {
        const emailToSet = firstContact.name ? `${firstContact.name} <${firstContact.email}>` : firstContact.email;
        onChange(emailToSet);
      }
    }
    setIsOpen(false);
    inputRef.current?.focus();
  }, [value, onChange, multiple, contacts]);

  const displayContacts = value.startsWith('@') ? groupContacts : contacts;
  const showGroupSuggestions = value.startsWith('@') && groups.some((g) => g.name.toLowerCase().startsWith(value.substring(1).toLowerCase()));
  const showSuggestions = isOpen && (displayContacts.length > 0 || showGroupSuggestions) && !isLoading;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {showSuggestions && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {value.startsWith('@') && showGroupSuggestions && (
            <>
              {groups
                .filter((g) => g.name.toLowerCase().startsWith(value.substring(1).toLowerCase()))
                .map((group) => {
                  const groupContactCount = contacts.filter((c) => c.groups?.includes(group.id)).length;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => handleGroupSelect(group)}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted transition-colors"
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{group.name}</div>
                        <div className="text-sm text-muted-foreground">{groupContactCount} контактов</div>
                      </div>
                    </button>
                  );
                })}
              {displayContacts.length > 0 && <div className="border-t my-1" />}
            </>
          )}
          {displayContacts.map((contact, index) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => handleSelect(contact)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted transition-colors',
                highlightedIndex === index && 'bg-muted'
              )}
            >
              <div className="flex-shrink-0">
                {contact.name ? (
                  <User className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Mail className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {contact.name ? (
                  <>
                    <div className="font-medium truncate">{contact.name}</div>
                    <div className="text-sm text-muted-foreground truncate">{contact.email}</div>
                  </>
                ) : (
                  <div className="truncate">{contact.email}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
