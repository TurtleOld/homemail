import { notFound, redirect } from 'next/navigation';
import { ContactRound, Users } from 'lucide-react';
import { ContactsManager } from '@/components/contacts-manager';
import { WorkspaceFrame } from '@/components/product-shell/workspace-frame';
import { getRedesignFeatureFlags } from '@/lib/feature-flags';
import { getSession } from '@/lib/session';

const copy = {
  en: {
    title: 'Contacts',
    description: 'Personal address book',
    navigation: 'Contacts sections',
    all: 'All contacts',
    groups: 'Contact groups',
    back: 'Back to mail',
    open: 'Open navigation',
    close: 'Close navigation',
  },
  ru: {
    title: 'Контакты',
    description: 'Личная адресная книга',
    navigation: 'Разделы контактов',
    all: 'Все контакты',
    groups: 'Группы контактов',
    back: 'Вернуться к почте',
    open: 'Открыть навигацию',
    close: 'Закрыть навигацию',
  },
} as const;

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (!getRedesignFeatureFlags().productShell) notFound();

  const { locale } = await params;
  const language = locale === 'en' ? 'en' : 'ru';
  const session = await getSession();
  if (!session) redirect(`/${language}/login?redirect=/${language}/contacts`);

  const t = copy[language];
  const prefix = `/${language}`;

  return (
    <WorkspaceFrame
      workspace="contacts"
      title={t.title}
      description={t.description}
      navigationLabel={t.navigation}
      backHref={`${prefix}/mail`}
      backLabel={t.back}
      menuLabel={t.open}
      closeMenuLabel={t.close}
      navigation={[
        { href: `${prefix}/contacts`, label: t.all, current: true, icon: <ContactRound className="h-4 w-4" /> },
        { href: `${prefix}/contacts#groups`, label: t.groups, icon: <Users className="h-4 w-4" /> },
      ]}
    >
      <div className="px-workspace-gutter py-6 max-sm:px-mobile-gutter">
        <ContactsManager />
      </div>
    </WorkspaceFrame>
  );
}
