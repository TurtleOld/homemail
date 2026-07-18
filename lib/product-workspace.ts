export type ProductWorkspace = 'mail' | 'contacts' | 'settings' | 'system' | 'authentication';

const LOCALE_PREFIX = /^\/(?:ru|en)(?=\/|$)/;

export function stripLocalePrefix(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PREFIX, '');
  return stripped || '/';
}

export function getProductWorkspace(pathname: string): ProductWorkspace {
  const route = stripLocalePrefix(pathname);

  if (route === '/login' || route.startsWith('/auth/')) return 'authentication';
  if (route === '/contacts' || route.startsWith('/contacts/')) return 'contacts';
  if (route === '/system' || route.startsWith('/system/') || route.startsWith('/settings/stalwart')) {
    return 'system';
  }
  if (route === '/settings' || route.startsWith('/settings/')) return 'settings';
  return 'mail';
}
