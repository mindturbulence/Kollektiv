
import React, { createContext, useState, useContext, ReactNode, useMemo } from 'react';

interface BusyContextType {
  isBusy: boolean;
  setIsBusy: (busy: boolean) => void;
}

const BusyContext = createContext<BusyContextType | undefined>(undefined);

export const BusyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isBusy, setIsBusy] = useState(false);

  const value = useMemo(() => ({ isBusy, setIsBusy }), [isBusy]);

  return (
    <BusyContext.Provider value={value}>
      {children}
    </BusyContext.Provider>
  );
};

export const useBusy = (): BusyContextType => {
  const context = useContext(BusyContext);
  if (context === undefined) {
    throw new Error('useBusy must be used within a BusyProvider');
  }
  return context;
};
