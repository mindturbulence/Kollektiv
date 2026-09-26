export const THEMES = [
  "Kollektiv", "abyss", "Arc", "arwes", "black", "business",
  "coffee", "cyberpunk", "dark", "dim", "dracula",
  "forest", "Hiigara", "isac",
  "luxury", "MindTurbulence", "night", "nord",
  "orange", "pipboy", "starfield", "Stellar", "sunset", "synthwave",
  "Vanguard"
];

/** Shared by the header's Next Theme button and the command palette's cycleTheme event. */
export const getNextTheme = (current: string): string => {
  const currentIndex = THEMES.indexOf(current);
  return THEMES[(currentIndex + 1) % THEMES.length];
};
