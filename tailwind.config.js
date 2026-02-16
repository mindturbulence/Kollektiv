import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./constants/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./types.ts",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Hind', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Pilcrow Rounded', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-in-from-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-to-left': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(-100%)', opacity: '0' },
        },
        'slide-in-from-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-to-right': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'fade-out': 'fade-out 0.3s ease-out forwards',
        'slide-in-from-right': 'slide-in-from-right 0.3s ease-out forwards',
        'slide-out-to-left': 'slide-out-to-left 0.3s ease-out forwards',
        'slide-in-from-left': 'slide-in-from-left 0.3s ease-out forwards',
        'slide-out-to-right': 'slide-out-to-right 0.3s ease-out forwards',
      },
    },
  },
  plugins: [
    daisyui,
  ],
  daisyui: {
    themes: [
      "light", "cupcake", "bumblebee", "emerald", "corporate", "retro", "cyberpunk", 
      "valentine", "garden", "aqua", "lofi", "pastel", "fantasy", "wireframe", 
      "cmyk", "autumn", "acid", "lemonade", "winter", "dark", "synthwave", 
      "halloween", "forest", "black", "luxury", "dracula", "business", "night", 
      "coffee", "dim", "sunset", "abyss",
      {
        pipboy: {
          "primary": "#1aff1a",
          "primary-content": "#002200",
          "secondary": "#0a2e0a",
          "accent": "#3df23d",
          "neutral": "#051105",
          "base-100": "#020502",
          "base-200": "#051105",
          "base-300": "#081a08",
          "base-content": "#1aff1a",
          "info": "#1aff1a",
          "success": "#1aff1a",
          "warning": "#ffff00",
          "error": "#ff0000",
          "--rounded-box": "0rem",
          "--rounded-btn": "0rem",
          "--rounded-badge": "0rem",
          "--tab-radius": "0rem",
        },
        explorer: {
          "primary": "#8ab4f8",
          "primary-content": "#131314",
          "secondary": "#3c4043",
          "accent": "#c2e7ff",
          "neutral": "#202124",
          "base-100": "#131314",
          "base-200": "#1e1e1f",
          "base-300": "#2b2d31",
          "base-content": "#e3e3e3",
          "info": "#8ab4f8",
          "success": "#34a853",
          "warning": "#fbbc04",
          "error": "#ea4335",
          "--rounded-box": "0.5rem",
          "--rounded-btn": "0.25rem",
          "--rounded-badge": "0.5rem",
          "--tab-radius": "0.25rem",
        },
        prompt: {
          "primary": "#00ffa3",
          "primary-content": "#000000",
          "secondary": "#111827",
          "accent": "#00d1ff",
          "neutral": "#1f2937",
          "base-100": "#030712",
          "base-200": "#0f172a",
          "base-300": "#1e293b",
          "base-content": "#f9fafb",
          "info": "#00ffa3",
          "success": "#10b981",
          "warning": "#f59e0b",
          "error": "#ef4444",
          "--rounded-box": "2rem",
          "--rounded-btn": "9999px",
          "--rounded-badge": "9999px",
          "--tab-radius": "9999px",
        }
      }
    ],
  },
};