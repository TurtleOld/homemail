'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export default function StalwartSettingsPage() {
  const router = useRouter();
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        if (!response.ok) {
          setError(`Ошибка загрузки: ${response.status}`);
          setLoading(false);
          return;
        }

        const contentType = response.headers.get('Content-Type') || '';
        
        if (contentType.includes('application/json')) {
          const data = await response.json();
          if (data.error) {
            setError(data.error);
            setLoading(false);
            return;
          }
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
              if (href && !href.startsWith('http') && !document.querySelector(`link[href="/api/settings/stalwart${href}"]`)) {
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
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Загрузка настроек Stalwart...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
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
    <div className="h-screen w-screen overflow-auto">
      <div id="stalwart-container" className="h-full w-full" />
    </div>
  );
}
