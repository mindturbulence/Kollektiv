import { useEffect } from 'react';

/**
 * Syncs the active DaisyUI theme and font size to the document root.
 * Reads from settings (darkTheme, fontSize) — the caller passes them
 * explicitly so this hook has no dependencies on the settings context.
 */
export const useAppTheme = (
  darkTheme: string,
  fontSize: number,
): void => {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkTheme);
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [darkTheme, fontSize]);
};
