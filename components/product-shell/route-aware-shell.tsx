'use client';

import { usePathname } from 'next/navigation';
import { getProductWorkspace } from '@/lib/product-workspace';

export function RouteAwareShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
