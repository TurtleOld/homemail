import { Archive, Mail, Paperclip, Search, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const copy = {
  en: {
    eyebrow: 'HomeMail foundation',
    title: 'Mail stays clear in every language',
    description:
      'Semantic surfaces, consistent controls, and stable typography for daily mail work.',
    search: 'Search all mail',
    compose: 'Compose',
    inbox: 'Inbox',
    unread: 'Unread',
    selected: 'Selected message',
    subject: 'Updated contract and delivery schedule',
    sender: 'Elena Petrova',
    snippet: 'The signed copy is attached. Please check the revised dates before Friday.',
    date: 'Jul 14',
    archive: 'Archive',
  },
  ru: {
    eyebrow: 'Основа HomeMail',
    title: 'Почта остаётся ясной на любом языке',
    description:
      'Семантические поверхности, единые элементы управления и стабильная типографика для ежедневной работы с почтой.',
    search: 'Поиск по всей почте',
    compose: 'Написать',
    inbox: 'Входящие',
    unread: 'Непрочитанные',
    selected: 'Выбранное письмо',
    subject: 'Обновлённый договор и график поставки',
    sender: 'Елена Петрова',
    snippet: 'Подписанная копия во вложении. Проверьте новые даты до пятницы.',
    date: '14 июл.',
    archive: 'В архив',
  },
} as const;

export default async function FoundationVisualFixture({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = copy[locale === 'en' ? 'en' : 'ru'];

  return (
    <main className="min-h-dvh bg-surface-app p-8 text-foreground" data-testid="foundation-fixture">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-border bg-surface-panel shadow-sm">
        <header className="flex items-start justify-between gap-8 border-b border-border px-8 pb-7 pt-8">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-medium text-primary">{t.eyebrow}</p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight">{t.title}</h1>
            <p className="mt-3 max-w-[65ch] text-pretty leading-7 text-muted-foreground">
              {t.description}
            </p>
          </div>
          <div className="rounded-md bg-surface-navigation p-3 text-primary" aria-hidden="true">
            <Mail className="h-6 w-6" />
          </div>
        </header>

        <div className="grid grid-cols-[14rem_1fr]">
          <aside className="border-r border-border bg-surface-navigation p-5">
            <Button className="mb-6 w-full">{t.compose}</Button>
            <nav aria-label={t.inbox} className="space-y-1">
              <button className="flex w-full items-center justify-between rounded-md bg-surface-selected px-3 py-2 text-left text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {t.inbox}
                </span>
                <span className="font-mono text-xs tabular-nums">12</span>
              </button>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-surface-hover">
                <Star className="h-4 w-4" />
                {t.unread}
              </button>
            </nav>
          </aside>

          <div className="p-6">
            <div className="relative mb-5">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="bg-surface-raised pl-9"
                aria-label={t.search}
                placeholder={t.search}
              />
            </div>

            <article className="rounded-md border border-primary/30 bg-surface-selected p-4 outline outline-2 outline-offset-2 outline-ring/70">
              <div className="mb-2 flex items-center justify-between gap-6">
                <p className="font-semibold">{t.sender}</p>
                <time className="shrink-0 font-mono text-xs text-muted-foreground">{t.date}</time>
              </div>
              <h2 className="font-medium">{t.subject}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.snippet}</p>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Paperclip className="h-4 w-4" />
                  {t.selected}
                </span>
                <Button variant="ghost" size="sm">
                  <Archive className="mr-2 h-4 w-4" />
                  {t.archive}
                </Button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
