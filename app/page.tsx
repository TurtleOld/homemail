import { redirect } from 'next/navigation';

// Root redirect: /  →  /ru  (default locale)
// next-intl middleware handles locale detection before this page is reached,
// so this is only a fallback for non-middleware environments.
export default function RootPage() {
  redirect('/ru');
}
