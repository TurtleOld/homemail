'use client';

import { createContext, useContext } from 'react';

interface RedesignFeatureContextValue {
  productShell: boolean;
  listFirstMail: boolean;
  protectedMessageContent: boolean;
}

const RedesignFeatureContext = createContext<RedesignFeatureContextValue>({
  productShell: false,
  listFirstMail: false,
  protectedMessageContent: false,
});

export function ProductShellFeatureProvider({
  enabled,
  listFirstMailEnabled = false,
  protectedMessageContentEnabled = false,
  children,
}: {
  enabled: boolean;
  listFirstMailEnabled?: boolean;
  protectedMessageContentEnabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <RedesignFeatureContext.Provider value={{
      productShell: enabled,
      listFirstMail: listFirstMailEnabled,
      protectedMessageContent: protectedMessageContentEnabled,
    }}>
      {children}
    </RedesignFeatureContext.Provider>
  );
}

export function useProductShellEnabled(): boolean {
  return useContext(RedesignFeatureContext).productShell;
}

export function useListFirstMailEnabled(): boolean {
  return useContext(RedesignFeatureContext).listFirstMail;
}

export function useProtectedMessageContentEnabled(): boolean {
  return useContext(RedesignFeatureContext).protectedMessageContent;
}
