'use client';

import { useState, Suspense, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { LoaderCircle, Mail, ShieldCheck } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'basic' | 'oauth'>('oauth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isAddingAccount = searchParams.get('addAccount') === 'true';
  const redirect = searchParams.get('redirect') || `/${locale}/mail`;
  const t = useTranslations('login');

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
      toast.error(t('oauthError'));
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
        throw new Error(payload.error || t('basicError'));
      }

      router.push(redirect);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('basicError'));
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-app px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-overlay border border-border bg-surface-raised p-6 shadow-overlay sm:p-8 md:p-10">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-overlay bg-primary text-primary-foreground">
            <Mail className="h-7 w-7" aria-hidden="true" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isAddingAccount ? t('addAccount') : t('welcomeBack')}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {isAddingAccount ? t('addAccountDesc') : t('signInDesc')}
          </p>
        </div>

        <div className="space-y-6">
          {authMode === 'basic' ? (
            <form className="space-y-4" onSubmit={handleBasicLogin}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  {t('email')}
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
                  className="h-control bg-surface-raised"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="password">
                  {t('password')}
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  required
                  className="h-control bg-surface-raised"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="h-control w-full font-semibold shadow-none hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? t('signingIn') : t('signInBasic')}
              </Button>
            </form>
          ) : (
            <Button
              onClick={handleOAuthLogin}
              disabled={loading}
              className="h-control w-full font-semibold shadow-none hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span>{t('redirecting')}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  <span>{t('signInOAuth')}</span>
                </div>
              )}
            </Button>
          )}

          <div className="rounded-control border border-border bg-surface-subtle p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  {authMode === 'basic' ? t('basicInfo') : t('oauthInfo')}
                </p>
                <p>{authMode === 'basic' ? t('basicInfoDesc') : t('oauthInfoDesc')}</p>
              </div>
            </div>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="text-center text-xs text-muted-foreground">
              {t('authMode')} <code className="rounded bg-gray-100 px-2 py-1">{authMode}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const t = useTranslations('login');

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-surface-app text-muted-foreground">
          <div role="status">{t('loading')}</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
