import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mail Client',
  description: 'Modern web mail client',
};

// This root layout is minimal — locale-specific layout lives in app/[locale]/layout.tsx
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
