'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductWorkspace } from '@/lib/product-workspace';
import { Button } from '@/components/ui/button';

export interface WorkspaceNavigationItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
  current?: boolean;
}

export interface WorkspaceFrameProps {
  workspace: Exclude<ProductWorkspace, 'authentication'>;
  title: string;
  description?: string;
  navigationLabel: string;
  navigation: readonly WorkspaceNavigationItem[];
  backHref: string;
  backLabel: string;
  menuLabel: string;
  closeMenuLabel: string;
  children: React.ReactNode;
}

export function WorkspaceFrame({
  workspace,
  title,
  description,
  navigationLabel,
  navigation,
  backHref,
  backLabel,
  menuLabel,
  closeMenuLabel,
  children,
}: WorkspaceFrameProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigationContent = (
    <>
      <Link
        href={backHref}
        className="product-shell-back flex min-h-control items-center gap-2 rounded-control px-3 text-sm font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>
      <nav aria-label={navigationLabel} className="mt-6 space-y-1">
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.current ? 'page' : undefined}
            onClick={() => setDrawerOpen(false)}
            className={cn(
              'flex min-h-control items-center gap-3 rounded-control px-3 text-sm',
              item.current
                ? 'bg-surface-selected font-medium text-foreground'
                : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-surface-app" data-workspace-frame={workspace}>
      <aside className="hidden w-workspace-nav shrink-0 border-r border-border bg-surface-navigation p-4 lg:block">
        {navigationContent}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-overlay lg:hidden">
          <button
            className="absolute inset-0 bg-overlay"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative z-drawer h-full w-[min(20rem,88vw)] border-r border-border bg-surface-navigation p-4 shadow-overlay">
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)} aria-label={closeMenuLabel}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            {navigationContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-workspace-header items-center gap-3 border-b border-border bg-surface-panel px-workspace-gutter max-sm:px-mobile-gutter">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label={menuLabel}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 py-2">
            <h1 className="truncate text-workspace-title font-semibold tracking-tight">{title}</h1>
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          </div>
        </header>
        <main id="main-content" className="min-w-0 flex-1 bg-surface-panel">
          {children}
        </main>
      </div>
    </div>
  );
}
