import React, { createContext, useContext, type ReactNode } from 'react';

/** DaisyUI theme (tailwind.config.js) for the light "paper" surface. Not in THEMES, so no picker offers it. */
export const PAPER_THEME = 'paper';

const PaperContext = createContext(false);

/** True under a <PaperScope>. React context crosses portals, so `Modal` uses this to keep its own
 *  `document.body` portal inside the scope without every dialog (or shared child dialog) passing a prop. */
export const useInPaperScope = (): boolean => useContext(PaperContext);

/** Page-scoped light look for the Web Design Library: `data-theme="paper"` re-points the DaisyUI
 *  variables for this subtree only; the `.paper-*` classes in index.css add the shared look.
 *  The sheet floats inside a transparent gutter (padding keeps the h-full chain intact, so nothing scrolls
 *  at page level). `<main>` in App.tsx pads the page by px-7: below `md` the gutter cancels that with
 *  -mx-7 so a phone gets the width back. */
export const PaperScope: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PaperContext.Provider value>
    <div className="h-full -mx-7 px-1 py-2 md:mx-0 md:p-2">
      <div data-theme={PAPER_THEME} className="paper-sheet h-full w-full overflow-hidden rounded-2xl shadow-xl">{children}</div>
    </div>
  </PaperContext.Provider>
);
