'use client';

import { useState, Suspense, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { routing } from '@/i18n/routing';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'basic' | 'oauth'>('oauth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isAddingAccount = searchParams.get('addAccount') === 'true';
  const redirect = searchParams.get('redirect') || `/${routing.defaultLocale}/mail`;

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/config', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (!config) return;
        setAuthMode(config.authMode);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const handleOAuthLogin = async () => {
    if (loading) return;

    setLoading(true);

    try {
      window.location.href = '/api/auth/oauth/authorize';
    } catch (error) {
      console.error('OAuth login error:', error);
      toast.error('Ошибка запуска OAuth авторизации');
      setLoading(false);
    }
  };

  const handleBasicLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          addAccount: isAddingAccount,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось войти по логину и паролю');
      }

      router.push(redirect);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось войти по логину и паролю');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-blue-200/50 bg-white/90 p-6 shadow-2xl backdrop-blur-sm sm:p-8 md:p-10">
        <div className="text-center">
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
              ? 'Авторизуйтесь, чтобы добавить новый аккаунт'
              : 'Войдите в свой почтовый ящик'}
          </p>
        </div>

        <div className="space-y-6">
          {authMode === 'basic' ? (
            <form className="space-y-4" onSubmit={handleBasicLogin}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="email">
                  Логин
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  placeholder="user@example.com"
                  disabled={loading}
                  required
                  className="h-12 border-blue-200/70 bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="password">
                  Пароль
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  required
                  className="h-12 border-blue-200/70 bg-white"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:text-lg"
              >
                {loading ? 'Вход...' : 'Войти по логину и паролю'}
              </Button>
            </form>
          ) : (
            <Button
              onClick={handleOAuthLogin}
              disabled={loading}
              className="h-12 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:text-lg"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>Перенаправление...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          )}

          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600"
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
              <div className="space-y-1 text-sm text-gray-700">
                {authMode === 'basic' ? (
                  <>
                    <p className="font-medium text-gray-900">Вход по логину и паролю</p>
                    <p>
                      Клиент сохранит учётные данные локально и будет использовать basic auth для
                      JMAP-запросов.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-gray-900">Безопасная OAuth авторизация</p>
                    <p>
                      Вы будете перенаправлены на сервер Stalwart для безопасного входа. После
                      авторизации вы автоматически вернётесь в почтовый клиент.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

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
