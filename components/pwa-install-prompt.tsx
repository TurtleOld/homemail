'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  };

  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50">
      <div className="bg-card border rounded-lg shadow-lg p-4 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium">Установить приложение?</p>
          <p className="text-xs text-muted-foreground mt-1">
            Установите Mail Client для быстрого доступа и работы офлайн
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleInstall}>
            <Download className="h-4 w-4 mr-2" />
            Установить
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPrompt(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
