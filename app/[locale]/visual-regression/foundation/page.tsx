import { Accessibility, Bell, Palette, Send, ServerCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkspaceFrame } from '@/components/product-shell/workspace-frame';

const copy = {
  en: {
    title: 'Settings',
    description: 'Preferences for Elena Petrova',
    navigation: 'Settings sections',
    back: 'Back to mail',
    open: 'Open navigation',
    close: 'Close navigation',
    appearance: 'Appearance and language',
    notifications: 'Notifications',
    accessibility: 'Accessibility and shortcuts',
    senders: 'Senders and signatures',
    system: 'System',
    sectionTitle: 'Appearance and language',
    scope: 'Applies to Elena Petrova across all assigned mailboxes.',
    theme: 'Theme',
    themeHelp: 'Use the system theme or choose a fixed appearance.',
    systemTheme: 'System',
    lightTheme: 'Light',
    darkTheme: 'Dark',
    language: 'Language',
    languageHelp: 'Used for navigation, dates, and application messages.',
    save: 'Save changes',
  },
  ru: {
    title: 'Настройки',
    description: 'Предпочтения Елены Петровой',
    navigation: 'Разделы настроек',
    back: 'Вернуться к почте',
    open: 'Открыть навигацию',
    close: 'Закрыть навигацию',
    appearance: 'Внешний вид и язык',
    notifications: 'Уведомления',
    accessibility: 'Доступность и клавиши',
    senders: 'Отправители и подписи',
    system: 'Система',
    sectionTitle: 'Внешний вид и язык',
    scope: 'Действует для Елены Петровой во всех назначенных почтовых ящиках.',
    theme: 'Тема',
    themeHelp: 'Используйте системную тему или выберите постоянное оформление.',
    systemTheme: 'Системная',
    lightTheme: 'Светлая',
    darkTheme: 'Тёмная',
    language: 'Язык',
    languageHelp: 'Используется в навигации, датах и сообщениях приложения.',
    save: 'Сохранить изменения',
  },
} as const;

export default async function FoundationVisualFixture({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const language = locale === 'en' ? 'en' : 'ru';
  const t = copy[language];
  const prefix = `/${language}`;

  return (
    <div className="product-shell" data-testid="foundation-fixture">
      <WorkspaceFrame
        workspace="settings"
        title={t.title}
        description={t.description}
        navigationLabel={t.navigation}
        backHref={`${prefix}/mail`}
        backLabel={t.back}
        menuLabel={t.open}
        closeMenuLabel={t.close}
        navigation={[
          { href: `${prefix}/settings`, label: t.appearance, current: true, icon: <Palette className="h-4 w-4" /> },
          { href: `${prefix}/settings?section=notifications`, label: t.notifications, icon: <Bell className="h-4 w-4" /> },
          { href: `${prefix}/settings?section=accessibility`, label: t.accessibility, icon: <Accessibility className="h-4 w-4" /> },
          { href: `${prefix}/settings?section=senders`, label: t.senders, icon: <Send className="h-4 w-4" /> },
          { href: `${prefix}/settings/stalwart`, label: t.system, icon: <ServerCog className="h-4 w-4" /> },
        ]}
      >
        <div className="mx-auto w-full max-w-3xl px-workspace-gutter py-8 max-sm:px-mobile-gutter">
          <div className="mb-8 flex items-start gap-4 border-b border-border pb-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-selected text-primary">
              <Palette className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t.sectionTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.scope}</p>
            </div>
          </div>

          <div className="space-y-8">
            <fieldset>
              <legend className="text-base font-semibold">{t.theme}</legend>
              <p className="mt-1 text-sm text-muted-foreground">{t.themeHelp}</p>
              <div className="mt-4 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                {[t.systemTheme, t.lightTheme, t.darkTheme].map((label, index) => (
                  <button
                    key={label}
                    className={index === 0
                      ? 'min-h-control rounded-control border border-primary bg-surface-selected px-4 text-sm font-medium text-foreground'
                      : 'min-h-control rounded-control border border-border bg-surface-raised px-4 text-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground'}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2 border-t border-border pt-7">
              <label htmlFor="foundation-language" className="text-base font-semibold">{t.language}</label>
              <p id="foundation-language-help" className="text-sm text-muted-foreground">{t.languageHelp}</p>
              <Input
                id="foundation-language"
                aria-describedby="foundation-language-help"
                value={language === 'ru' ? 'Русский' : 'English'}
                readOnly
                className="mt-3 max-w-sm bg-surface-raised"
              />
            </div>
          </div>

          <div className="sticky bottom-0 mt-10 flex justify-end border-t border-border bg-surface-panel py-4">
            <Button className="shadow-none hover:shadow-none">{t.save}</Button>
          </div>
        </div>
      </WorkspaceFrame>
    </div>
  );
}
