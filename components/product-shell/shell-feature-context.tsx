'use client';

import { createContext, useContext } from 'react';

interface RedesignFeatureContextValue {
  protectedMessageContent: boolean;
}

const RedesignFeatureContext = createContext<RedesignFeatureContextValue>({
  protectedMessageContent: false,
});

export function ProductShellFeatureProvider({
  protectedMessageContentEnabled = false,
  children,
}: {
  protectedMessageContentEnabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <RedesignFeatureContext.Provider value={{
      protectedMessageContent: protectedMessageContentEnabled,
    }}>
      {children}
    </RedesignFeatureContext.Provider>
  );
}

export function useProtectedMessageContentEnabled(): boolean {
  return useContext(RedesignFeatureContext).protectedMessageContent;
}
