'use client';

import { createContext, useContext } from 'react';

const ProductShellFeatureContext = createContext(false);

export function ProductShellFeatureProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <ProductShellFeatureContext.Provider value={enabled}>
      {children}
    </ProductShellFeatureContext.Provider>
  );
}

export function useProductShellEnabled(): boolean {
  return useContext(ProductShellFeatureContext);
}
