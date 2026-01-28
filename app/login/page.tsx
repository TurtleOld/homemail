'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'basic' | 'bearer' | 'oauth'>('oauth');
  const isAddingAccount = searchParams.get('addAccount') === 'true';

  useEffect(() => {
    // Remove dark mode on login page
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    // Load auth configuration
    const controller = new AbortController();
    fetch('/api/auth/config', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg) return;
        setAuthMode(cfg.authMode);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const handleOAuthLogin = async () => {
    if (loading) return;

    setLoading(true);

    try {
      // Call authorize endpoint which will redirect to Stalwart OAuth
      const redirectTo = searchParams.get('redirect') || '/mail';
      window.location.href = `/api/auth/oauth/authorize?redirect=${encodeURIComponent(redirectTo)}`;
    } catch (error) {
      console.error('OAuth login error:', error);
      toast.error('Ошибка запуска OAuth авторизации');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-blue-200/50 bg-white/90 backdrop-blur-sm p-6 shadow-2xl sm:p-8 md:p-10">
        <div className="text-center">
          {/* Mail Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            {isAddingAccount ? 'Добавить аккаунт' : 'Добро пожаловать'}
          </h1>
          <p className="mt-3 text-base text-gray-600 sm:text-lg">
            {isAddingAccount
              ? 'Войдите через OAuth для добавления нового аккаунта'
              : 'Войдите в свой почтовый ящик'}
          </p>
        </div>

        <div className="space-y-6">
          {/* OAuth Login Button */}
          <Button
            onClick={handleOAuthLogin}
            disabled={loading}
            className="h-12 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:from-blue-700 hover:to-indigo-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl sm:h-14 sm:text-lg"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Перенаправление...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span>Войти через OAuth</span>
              </div>
            )}
          </Button>

          {/* Info Box */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 flex-shrink-0 text-blue-600 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-gray-700 space-y-1">
                <p className="font-medium text-gray-900">Безопасная OAuth авторизация</p>
                <p>
                  Вы будете перенаправлены на сервер Stalwart для безопасного входа.
                  После авторизации вы автоматически вернётесь в почтовый клиент.
                </p>
              </div>
            </div>
          </div>

          {/* Auth Mode Info (for debugging) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-center text-xs text-gray-500">
              Режим авторизации: <code className="rounded bg-gray-100 px-2 py-1">{authMode}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="text-gray-600">Загрузка...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
