import { AlertTriangle, Ban, Inbox, LockKeyhole, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type WorkspaceStateKind = 'empty' | 'unauthorized' | 'forbidden' | 'error';

const iconByKind = {
  empty: Inbox,
  unauthorized: LockKeyhole,
  forbidden: Ban,
  error: AlertTriangle,
} as const;

export function WorkspaceState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  kind: WorkspaceStateKind;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  const Icon = iconByKind[kind];
  const role = kind === 'error' ? 'alert' : 'status';

  return (
    <section
      role={role}
      className={cn('mx-auto flex min-h-[20rem] max-w-lg flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <Icon className="mb-5 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-[48ch] text-sm leading-6 text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-6" onClick={onAction}>{actionLabel}</Button>
      )}
    </section>
  );
}

export function WorkspaceOfflineBar({ message }: { message: string }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-b border-border bg-surface-subtle px-workspace-gutter text-sm" role="status" aria-live="polite">
      <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="space-y-3 p-workspace-gutter" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-52" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="pt-5">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex min-h-message-row items-center gap-4 border-b border-border">
            <Skeleton className="h-4 w-4 shrink-0 rounded-small" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 min-w-0 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
