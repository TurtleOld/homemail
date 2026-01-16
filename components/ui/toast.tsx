'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      className="toaster group"
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-2xl group-[.toaster]:border-2 group-[.toaster]:rounded-lg group-[.toaster]:px-5 group-[.toaster]:py-4 group-[.toaster]:min-w-[360px] group-[.toaster]:max-w-[600px] group-[.toaster]:font-semibold group-[.toaster]:text-base group-[.toaster]:backdrop-blur-sm',
          description: 'group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:mt-1.5 group-[.toast]:font-normal',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:font-medium',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:font-medium',
          success: 'group-[.toaster]:bg-emerald-500 group-[.toaster]:text-white group-[.toaster]:border-emerald-600 dark:group-[.toaster]:bg-emerald-600 dark:group-[.toaster]:text-white dark:group-[.toaster]:border-emerald-700',
          error: 'group-[.toaster]:bg-red-500 group-[.toaster]:text-white group-[.toaster]:border-red-600 dark:group-[.toaster]:bg-red-600 dark:group-[.toaster]:text-white dark:group-[.toaster]:border-red-700 group-[.toaster]:shadow-red-500/30',
          info: 'group-[.toaster]:bg-blue-500 group-[.toaster]:text-white group-[.toaster]:border-blue-600 dark:group-[.toaster]:bg-blue-600 dark:group-[.toaster]:text-white dark:group-[.toaster]:border-blue-700',
          warning: 'group-[.toaster]:bg-amber-500 group-[.toaster]:text-white group-[.toaster]:border-amber-600 dark:group-[.toaster]:bg-amber-600 dark:group-[.toaster]:text-white dark:group-[.toaster]:border-amber-700',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
