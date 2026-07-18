'use client';

import { createContext, useContext } from 'react';

interface RedesignFeatureContextValue {
  productShell: boolean;
  listFirstMail: boolean;
}

const RedesignFeatureContext = createContext<RedesignFeatureContextValue>({
  productShell: false,
  listFirstMail: false,
});

export function ProductShellFeatureProvider({
  enabled,
  listFirstMailEnabled = false,
  children,
}: {
  enabled: boolean;
  listFirstMailEnabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <RedesignFeatureContext.Provider value={{ productShell: enabled, listFirstMail: listFirstMailEnabled }}>
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
