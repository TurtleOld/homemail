'use client';

import { usePathname } from 'next/navigation';
import { getProductWorkspace } from '@/lib/product-workspace';
import { useProductShellEnabled } from './shell-feature-context';

export function RouteAwareShell({ children }: { children: React.ReactNode }) {
  const enabled = useProductShellEnabled();
  const pathname = usePathname();

  if (!enabled) return children;

  const workspace = getProductWorkspace(pathname);
  return (
    <div
      className="product-shell min-h-dvh"
      data-product-shell="enabled"
      data-workspace={workspace}
    >
      {children}
    </div>
  );
}
