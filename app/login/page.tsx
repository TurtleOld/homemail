'use client';

import { useState, Suspense, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { validateEmail } from '@/lib/email-validator';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [needsOAuth, setNeedsOAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'basic' | 'bearer' | 'oauth'>('basic');
  const [passwordLoginEnabled, setPasswordLoginEnabled] = useState(true);
  const [oauthUserCode, setOauthUserCode] = useState('');
  const [oauthVerificationUri, setOauthVerificationUri] = useState('');
  const [oauthPolling, setOauthPolling] = useState(false);
  const [oauthWindow, setOauthWindow] = useState<Window | null>(null);
  const [emailError, setEmailError] = useState<string>('');
  const isAddingAccount = searchParams.get('addAccount') === 'true';

  // One requestId per logical login flow (used in server logs).
  const flowIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  );

  // Mutex/lock to prevent multiple concurrent login/oauth flows.
  const inFlightRef = useRef(false);
  const activeAbortRef = useRef<AbortController | null>(null);

  const abortActiveFlow = useCallback(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
  }, []);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (value.trim()) {
      const validation = validateEmail(value);
      if (!validation.valid) {
        setEmailError(validation.errors[0] || 'Неверный формат email');
      } else {
        setEmailError('');
      }
    } else {
      setEmailError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (inFlightRef.current) {
      return;
    }

    // Lock now (prevents double click / enter spamming)
    inFlightRef.current = true;

    if (email.trim()) {
      const validation = validateEmail(email);
      if (!validation.valid) {
        setEmailError(validation.errors[0] || 'Неверный формат email');
        inFlightRef.current = false;
        return;
      }
    }

    setLoading(true);

    abortActiveFlow();
    const abortController = new AbortController();
    activeAbortRef.current = abortController;

    try {
      if (isAddingAccount) {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || 'Ошибка добавления аккаунта');
          return;
        }

        toast.success('Аккаунт добавлен');
        router.push('/mail');
        router.refresh();
      } else {
        // In oauth-mode we should not attempt password login implicitly.
        if (authMode === 'oauth' && !passwordLoginEnabled) {
          await startOAuthFlow(email, abortController);
          return;
        }

        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-auth-flow-id': flowIdRef.current },
          body: JSON.stringify({ email, password, totpCode: totpCode || undefined }),
          signal: abortController.signal,
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.requiresTotp) {
            setNeedsTotp(true);
            toast.error(data.error || 'Требуется код TOTP');
          } else if (data.requiresOAuth) {
            await startOAuthFlow(email, abortController);
          } else {
            toast.error(data.error || 'Ошибка входа');
          }
          return;
        }

        toast.success('Вход выполнен');
        const redirectTo = searchParams.get('redirect') || '/mail';
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error) {
      if ((error as any)?.name !== 'AbortError') {
        toast.error('Ошибка соединения');
      }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  const startOAuthFlow = useCallback(async (accountId: string, parentAbort: AbortController) => {
    if (oauthPolling) {
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isCompleted = false;
    let authWindow: Window | null = null;

    const closeAuthWindow = () => {
      if (authWindow && !authWindow.closed) {
        try {
          authWindow.close();
        } catch (e) {
          console.warn('Не удалось закрыть окно авторизации:', e);
        }
      }
      authWindow = null;
      setOauthWindow(null);
    };

    const cleanup = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      setOauthPolling(false);
      closeAuthWindow();
    };

    try {
      setNeedsOAuth(true);
      setOauthPolling(true);
      
      const deviceCodeRes = await fetch('/api/auth/oauth/device-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-flow-id': flowIdRef.current },
        body: JSON.stringify({ accountId }),
        signal: parentAbort.signal,
      });

      if (!deviceCodeRes.ok) {
        const errorData = await deviceCodeRes.json();
        toast.error(errorData.error || 'Ошибка запроса OAuth кода');
        setOauthPolling(false);
        return;
      }

      const deviceData = await deviceCodeRes.json();
      setOauthUserCode(deviceData.userCode);
      setOauthVerificationUri(deviceData.verificationUri || deviceData.verificationUriComplete);

      if (deviceData.verificationUriComplete) {
        authWindow = window.open(deviceData.verificationUriComplete, '_blank');
        setOauthWindow(authWindow);
      }

      // IMPORTANT: never use setInterval(async ...) here.
      // The callback is not awaited -> parallel requests accumulate.
      // We instead do a sequential polling loop with explicit delays.
      const poll = async () => {
        while (!isCompleted && !parentAbort.signal.aborted) {
          try {
            const pollRes = await fetch('/api/auth/oauth/poll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-auth-flow-id': flowIdRef.current },
              body: JSON.stringify({
                deviceCode: deviceData.deviceCode,
                accountId,
                interval: deviceData.interval || 5,
                expiresIn: deviceData.expiresIn || 600,
              }),
              signal: parentAbort.signal,
            });

            const pollData = await pollRes.json();

            if (pollData.success) {
              isCompleted = true;
              closeAuthWindow();
              cleanup();

              const loginRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-flow-id': flowIdRef.current },
                body: JSON.stringify({ email, password: '', totpCode: undefined, useOAuth: true }),
                signal: parentAbort.signal,
              });

              const loginData = await loginRes.json();

              if (loginRes.ok && loginData.success) {
                toast.success('Вход выполнен');
                const redirectTo = searchParams.get('redirect') || '/mail';
                router.push(redirectTo);
                router.refresh();
              } else {
                toast.error(loginData.error || 'Ошибка входа после авторизации');
              }
              return;
            }

            if (pollRes.status === 429) {
              // Backoff on rate limit.
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }

            if (pollData.error === 'expired_token' || pollData.error === 'access_denied') {
              isCompleted = true;
              cleanup();
              toast.error(pollData.errorDescription || 'Авторизация отменена или истекла');
              setNeedsOAuth(false);
              return;
            }

            // authorization_pending / slow_down => keep waiting
            if (pollData.error !== 'authorization_pending' && pollData.error !== 'slow_down') {
              isCompleted = true;
              cleanup();
              toast.error(pollData.errorDescription || 'Ошибка авторизации');
              return;
            }

            const delayMs = (deviceData.interval || 5) * 1000;
            await new Promise((r) => setTimeout(r, delayMs));
          } catch (pollError) {
            if ((pollError as any)?.name === 'AbortError') {
              isCompleted = true;
              cleanup();
              return;
            }
            // transient network error: backoff, but don't spin
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      };

      poll();

      timeoutId = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          cleanup();
          toast.error('Время ожидания авторизации истекло');
        }
      }, (deviceData.expiresIn || 600) * 1000);
    } catch (error) {
      isCompleted = true;
      cleanup();
      console.error('OAuth flow error:', error);
      if ((error as any)?.name !== 'AbortError') {
        toast.error('Ошибка запуска OAuth авторизации');
      }
    }
  }, [abortActiveFlow, email, oauthPolling, router, searchParams]);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/config', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg) return;
        setAuthMode(cfg.authMode);
        setPasswordLoginEnabled(cfg.passwordLoginEnabled);

        // In oauth-mode + password disabled: start OAuth flow immediately.
        if (cfg.authMode === 'oauth' && !cfg.passwordLoginEnabled) {
          setNeedsOAuth(true);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-50 px-4 py-8 sm:px-6 lg:px-8 dark:bg-blue-50">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-blue-200 bg-white p-6 shadow-xl sm:p-8 md:p-10">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {isAddingAccount ? 'Добавить аккаунт' : 'Вход в почту'}
          </h1>
          <p className="mt-2 text-sm text-gray-600 sm:text-base">
            {isAddingAccount
              ? 'Введите данные нового аккаунта'
              : authMode === 'oauth' && !passwordLoginEnabled
                ? 'Требуется OAuth авторизация'
                : 'Введите логин и пароль для входа'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 sm:text-base">
              Логин
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              required
              className={`h-11 border-blue-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:ring-blue-500 sm:h-12 ${emailError ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500' : ''
                }`}
              placeholder="например: example@example.com"
              autoComplete="email"
            />
            {emailError && (
              <p className="text-sm text-red-600">{emailError}</p>
            )}
          </div>
          {passwordLoginEnabled && (
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 sm:text-base">
                Пароль
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 border-blue-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:ring-blue-500 sm:h-12"
                placeholder="••••••••"
              />
            </div>
          )}
          {(needsTotp || totpCode) && (
            <div className="space-y-2">
              <label htmlFor="totpCode" className="block text-sm font-medium text-gray-700 sm:text-base">
                Код TOTP (6 цифр)
              </label>
              <Input
                id="totpCode"
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="h-11 border-blue-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:ring-blue-500 sm:h-12"
                placeholder="000000"
                autoComplete="one-time-code"
              />
              <p className="text-xs text-gray-500">
                Введите 6-значный код из приложения-аутентификатора
              </p>
            </div>
          )}
          {needsOAuth && (
            <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="text-sm font-medium text-gray-900">
                Требуется OAuth авторизация
              </div>
              <div className="space-y-2 text-sm text-gray-700">
                <p>1. Перейдите по ссылке ниже и введите код:</p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-white px-3 py-2 text-lg font-mono font-bold text-blue-600">
                    {oauthUserCode}
                  </code>
                </div>
                {oauthVerificationUri && (
                  <div className="pt-2">
                    <a
                      href={oauthVerificationUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Открыть страницу авторизации
                    </a>
                  </div>
                )}
                {oauthPolling && (
                  <p className="text-xs text-gray-600">
                    Ожидание авторизации...
                  </p>
                )}
              </div>
            </div>
          )}
          <Button
            type="submit"
            className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 disabled:opacity-50 sm:h-12 sm:text-base"
            disabled={loading}
          >
            {loading ? (isAddingAccount ? 'Добавление...' : 'Вход...') : (isAddingAccount ? 'Добавить' : 'Войти')}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-blue-50 text-gray-600">Загрузка...</div>}>
      <LoginForm />
    </Suspense>
  );
}
