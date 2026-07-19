'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, XCircle, Mail, MailOpen } from 'lucide-react';
import type { DeliveryTracking } from '@/lib/types';
import { useLocale, useTranslations } from 'next-intl';

async function getDeliveryTracking(messageId: string): Promise<DeliveryTracking | null> {
  const res = await fetch(`/api/mail/delivery?messageId=${messageId}`);
  if (!res.ok) {
    if (res.status === 404) {
      return null;
    }
    throw new Error('Failed to load delivery tracking');
  }
  return res.json();
}

interface DeliveryTrackingProps {
  messageId: string;
}

export function DeliveryTracking({ messageId }: DeliveryTrackingProps) {
  const locale = useLocale();
  const t = useTranslations('messageViewer.delivery');
  const { data: tracking, isLoading } = useQuery({
    queryKey: ['delivery-tracking', messageId],
    queryFn: () => getDeliveryTracking(messageId),
    enabled: !!messageId,
    refetchInterval: (query) => (query.state.data ? 30000 : false),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4 animate-spin" />
        <span>{t('loading')}</span>
      </div>
    );
  }

  if (!tracking) {
    return null;
  }

  const getStatusIcon = (status: DeliveryTracking['status']) => {
    switch (status) {
      case 'read':
        return <MailOpen className="h-4 w-4 text-green-500" />;
      case 'delivered':
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
      case 'sent':
        return <Mail className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: DeliveryTracking['status']) => {
    switch (status) {
      case 'read':
        return t('read');
      case 'delivered':
        return t('delivered');
      case 'sent':
        return t('sent');
      case 'failed':
        return t('failed');
      default:
        return t('pending');
    }
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        {getStatusIcon(tracking.status)}
        <span className="text-sm">{getStatusText(tracking.status)}</span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('sentAt')}:</span>
          <span>{new Date(tracking.sentAt).toLocaleString(locale)}</span>
        </div>
        {tracking.deliveredAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('deliveredAt')}:</span>
            <span>{new Date(tracking.deliveredAt).toLocaleString(locale)}</span>
          </div>
        )}
        {tracking.readAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('readAt')}:</span>
            <span>{new Date(tracking.readAt).toLocaleString(locale)}</span>
          </div>
        )}
      </div>

      {tracking.recipients.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground">{t('recipients')}:</h4>
          {tracking.recipients.map((recipient) => (
            <div key={recipient.email} className="flex items-center justify-between text-sm">
              <span className="truncate flex-1">{recipient.email}</span>
              <div className="flex items-center gap-2">
                {getStatusIcon(recipient.status)}
                <span className="text-xs text-muted-foreground">
                  {getStatusText(recipient.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
