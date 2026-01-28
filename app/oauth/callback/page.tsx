'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Handle OAuth error from Stalwart
      if (error) {
        const message = errorDescription || `Ошибка авторизации: ${error}`;
        setStatus('error');
        setErrorMessage(message);
        toast.error(message);
        
        // Redirect to login after delay
        setTimeout(() => {
          router.push('/login');
        }, 3000);
        return;
      }

      // Validate required parameters
      if (!code || !state) {
        setStatus('error');
        setErrorMessage('Неверные параметры callback (отсутствует code или state)');
        toast.error('Неверные параметры авторизации');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
        return;
      }

      try {
        // Exchange code for token on backend (BFF)
        const response = await fetch('/api/auth/oauth/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, state }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Ошибка обмена кода на токен');
        }

        if (!data.success) {
          throw new Error(data.error || 'Неизвестная ошибка при авторизации');
        }

        // Success!
        setStatus('success');
        toast.success('Вход выполнен успешно');

        // Redirect to mail
        router.push('/mail');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
        setStatus('error');
        setErrorMessage(message);
        toast.error(message);

        // Redirect to login after delay
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-50 px-4 py-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-blue-200 bg-white p-8 text-center shadow-xl">
        {status === 'processing' && (
          <>
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            <h2 className="text-xl font-semibold text-gray-900">
              Завершение авторизации...
            </h2>
            <p className="text-sm text-gray-600">
              Пожалуйста, подождите
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Успешно!
            </h2>
            <p className="text-sm text-gray-600">
              Перенаправление в почтовый ящик...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-8 w-8 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Ошибка авторизации
            </h2>
            <p className="text-sm text-gray-600">
              {errorMessage}
            </p>
            <p className="text-xs text-gray-500">
              Перенаправление на страницу входа...
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-blue-50">
          <div className="text-gray-600">Загрузка...</div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
