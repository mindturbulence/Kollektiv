import React, { createContext, useContext, type ReactNode } from 'react';

/** Class that scopes the Web Design Library's `.paper-*` component styles (index.css). Colours follow the app theme. */
export const PAPER_SCOPE_CLASS = 'paper-scope';

const PaperContext = createContext(false);

/** True under a <PaperScope>. React context crosses portals, so `Modal` uses this to keep its own
 *  `document.body` portal inside the scope without every dialog (or shared child dialog) passing a prop. */
export const useInPaperScope = (): boolean => useContext(PaperContext);

export const PaperScope: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PaperContext.Provider value>
    <div className={`${PAPER_SCOPE_CLASS} h-full w-full`}>{children}</div>
  </PaperContext.Provider>
);
