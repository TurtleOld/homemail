'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Settings, LogOut, User, ServerCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';
import type { Account } from '@/lib/types';

interface AccountMenuProps {
  account: Account | null;
}

export function AccountMenu({ account }: AccountMenuProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('sidebar');
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery<{
    accounts: Array<{ id: string; email: string; displayName?: string; isActive?: boolean }>;
  }>({
    queryKey: ['user-accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) {
        throw new Error('Failed to load accounts');
      }
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const switchAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch('/api/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to switch account');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account'] });
      queryClient.invalidateQueries({ queryKey: ['user-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success(t('accountSwitched'));
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('accountSwitchError'));
    },
  });

  const handleSwitchAccount = (accountId: string) => {
    if (accountId === account?.id) {
      return;
    }
    switchAccountMutation.mutate(accountId);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push(`/${locale}/login`);
    router.refresh();
  };

  const handleSettings = () => {
    router.push(`/${locale}/settings`);
  };

  const handleStalwartManagement = () => {
    router.push(`/${locale}/settings/stalwart`);
  };

  const otherAccounts = (accountsData?.accounts || []).filter(
    (availableAccount) => availableAccount.id !== account?.id
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 flex-shrink-0 rounded-control"
          aria-label={t('accountMenu')}
          title={t('accountMenu')}
        >
          <Settings className="h-5 w-5" strokeWidth={1.8} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-xl border-border p-1.5 shadow-[0_18px_44px_-24px_hsl(var(--shadow-soft)/0.55)]"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="block truncate text-sm font-medium text-foreground">
            {account?.displayName || account?.email || t('defaultAccount')}
          </span>
          <span className="block truncate text-[11px] leading-4 text-muted-foreground">
            {account?.displayName && account.displayName !== account.email
              ? account.email
              : t('currentMailbox')}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {otherAccounts.length > 0 && (
          <>
            <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
              {t('switchMailbox')}
            </DropdownMenuLabel>
            {otherAccounts.map((availableAccount) => (
              <DropdownMenuItem
                key={availableAccount.id}
                onClick={() => handleSwitchAccount(availableAccount.id)}
                disabled={switchAccountMutation.isPending}
                className="min-h-10 rounded-lg px-2"
              >
                <User className="mr-2 h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                <span className="truncate">
                  {availableAccount.displayName || availableAccount.email}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleSettings} className="min-h-10 rounded-lg px-2">
          <Settings className="mr-2 h-4 w-4" strokeWidth={1.8} />
          {t('mailSettings')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleStalwartManagement} className="min-h-10 rounded-lg px-2">
          <ServerCog className="mr-2 h-4 w-4" strokeWidth={1.8} />
          {t('manageInStalwart')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="min-h-10 rounded-lg px-2">
          <LogOut className="mr-2 h-4 w-4" strokeWidth={1.8} />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
