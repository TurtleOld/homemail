'use client';

import { createContext, useContext } from 'react';

interface RedesignFeatureContextValue {
  listFirstMail: boolean;
  protectedMessageContent: boolean;
}

const RedesignFeatureContext = createContext<RedesignFeatureContextValue>({
  listFirstMail: false,
  protectedMessageContent: false,
});

export function ProductShellFeatureProvider({
  listFirstMailEnabled = false,
  protectedMessageContentEnabled = false,
  children,
}: {
  listFirstMailEnabled?: boolean;
  protectedMessageContentEnabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <RedesignFeatureContext.Provider value={{
      listFirstMail: listFirstMailEnabled,
      protectedMessageContent: protectedMessageContentEnabled,
    }}>
      {children}
    </RedesignFeatureContext.Provider>
  );
}

export function useListFirstMailEnabled(): boolean {
  return useContext(RedesignFeatureContext).listFirstMail;
}

export function useProtectedMessageContentEnabled(): boolean {
  return useContext(RedesignFeatureContext).protectedMessageContent;
}
