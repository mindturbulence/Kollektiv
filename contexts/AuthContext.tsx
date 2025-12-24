
import React, { createContext, useContext, ReactNode, useMemo } from 'react';

// This is a stub context. It can be expanded with authentication logic in the future.
// For now, it simply provides a context to prevent import errors in other files.
export interface AuthContextType {}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const value = useMemo(() => ({}), []);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
