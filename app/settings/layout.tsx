import { Providers } from '../providers';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
