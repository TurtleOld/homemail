'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ArrowLeft, ExternalLink, ServerCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface StalwartUnavailableState {
  message: string;
  adminUrl: string | null;
}

export default function StalwartSettingsPage() {
  const router = useRouter();
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<StalwartUnavailableState | null>(null);

  useEffect(() => {
    const loadStalwart = async () => {
      try {
        const response = await fetch('/api/settings/stalwart');

        if (response.status === 401) {
          router.push('/login');
          return;
        }

        if (response.status === 404) {
          setError('Учетные данные не найдены');
          setLoading(false);
          return;
        }

        const contentType = response.headers.get('Content-Type') || '';

        if (contentType.includes('application/json')) {
          const data = await response.json();
          if (data.code === 'STALWART_ADMIN_REQUIRES_DIRECT_LOGIN') {
            setUnavailable({
              message: data.message || 'Stalwart requires a separate administrator login',
              adminUrl: typeof data.adminUrl === 'string' ? data.adminUrl : null,
            });
            setLoading(false);
            return;
          }
          if (data.error) {
            setError(data.error);
            setLoading(false);
            return;
          }
        }

        if (!response.ok) {
          setError(`Ошибка загрузки: ${response.status}`);
          setLoading(false);
          return;
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const container = document.getElementById('stalwart-container');

        if (container) {
          container.innerHTML = doc.body.innerHTML;

          const headElements = doc.head.querySelectorAll('link, script, meta, title');
          headElements.forEach((el) => {
            if (el.tagName === 'LINK') {
              const link = el as HTMLLinkElement;
              const href = link.getAttribute('href');
              if (
                href &&
                !href.startsWith('http') &&
                !document.querySelector(`link[href="/api/settings/stalwart${href}"]`)
              ) {
                const newLink = link.cloneNode(true) as HTMLLinkElement;
                if (href.startsWith('/')) {
                  newLink.href = `/api/settings/stalwart${href}`;
                } else {
                  newLink.href = `/api/settings/stalwart/${href}`;
                }
                document.head.appendChild(newLink);
              }
            } else if (el.tagName === 'SCRIPT') {
              const script = el as HTMLScriptElement;
              const src = script.getAttribute('src');
              const type = script.getAttribute('type');

              if (type === 'module') {
                const newScript = document.createElement('script');
                newScript.type = 'module';
                if (src) {
                  if (src.startsWith('/')) {
                    newScript.textContent = `import init, * as bindings from '/api/settings/stalwart${src}';`;
                  } else if (!src.startsWith('http')) {
                    newScript.textContent = `import init, * as bindings from '/api/settings/stalwart/${src}';`;
                  } else {
                    newScript.textContent = script.textContent || '';
                  }
                } else {
                  const originalText = script.textContent || '';
                  newScript.textContent = originalText.replace(
                    /from\s+['"]([^'"]+)['"]/g,
                    (match, path) => {
                      if (path.startsWith('http')) return match;
                      if (path.startsWith('/')) return `from '/api/settings/stalwart${path}'`;
                      return `from '/api/settings/stalwart/${path}'`;
                    }
                  );
                }
                document.head.appendChild(newScript);
              } else {
                const newScript = document.createElement('script');
                if (src) {
                  if (src.startsWith('/')) {
                    newScript.src = `/api/settings/stalwart${src}`;
                  } else if (!src.startsWith('http')) {
                    newScript.src = `/api/settings/stalwart/${src}`;
                  } else {
                    newScript.src = src;
                  }
                } else {
                  newScript.textContent = script.textContent || '';
                }
                document.head.appendChild(newScript);
              }
            }
          });
        }
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
        setLoading(false);
      }
    };

    loadStalwart();
  }, [router]);

  if (loading) {
    return (
      <div className="mail-app-shell min-h-dvh p-6" aria-busy="true">
        <div className="mx-auto max-w-2xl space-y-5 pt-16">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (unavailable) {
    return (
      <main className="mail-app-shell min-h-dvh px-4 py-12">
        <section className="mail-panel-surface mx-auto max-w-2xl rounded-xl border border-border p-6 shadow-[0_18px_40px_-28px_hsl(var(--shadow-soft)/0.35)]">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]">
              <ServerCog className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">
                {locale === 'ru'
                  ? 'Для управления Stalwart нужен отдельный вход'
                  : 'Stalwart management requires a separate login'}
              </h1>
              <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
                {locale === 'ru'
                  ? 'Почтовый клиент использует OAuth-сеанс пользователя и не получает административные учётные данные. Войдите в панель Stalwart под администратором.'
                  : unavailable.message}
              </p>
              {!unavailable.adminUrl && (
                <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {locale === 'ru'
                    ? 'Публичный адрес панели не настроен. Укажите STALWART_MANAGEMENT_PUBLIC_URL на сервере приложения.'
                    : 'The public management address is not configured. Set STALWART_MANAGEMENT_PUBLIC_URL on the application server.'}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => router.push(`/${locale}/settings`)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {locale === 'ru' ? 'К настройкам' : 'Back to settings'}
            </Button>
            {unavailable.adminUrl && (
              <Button onClick={() => window.location.assign(unavailable.adminUrl!)}>
                {locale === 'ru' ? 'Открыть панель Stalwart' : 'Open Stalwart management'}
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={() => router.push(`/${locale}/mail`)}
            className="text-primary hover:underline"
          >
            Вернуться в почту
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full overflow-auto">
      <div id="stalwart-container" className="h-full w-full" />
    </div>
  );
}
