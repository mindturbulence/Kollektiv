import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { loadLLMSettings } from './utils/settingsStorage';
import App from './components/App';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider } from './contexts/AuthContext';

// --- API Key Polyfill ---
if (typeof window !== 'undefined') {
  (window as any).process = (window as any).process || {};
  (window as any).process.env = (window as any).process.env || {};
  const settings = loadLLMSettings();
  if (settings.apiKeyOverride) {
    (window as any).process.env.API_KEY = settings.apiKeyOverride;
  }
}

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
  (window as any).addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(error => {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

// --- App Bootstrap ---
function startApp() {
  if (typeof (window as any).document === 'undefined') {
    return;
  }
  
  const rootElement = (window as any).document.getElementById('root');
  if (!rootElement) {
    throw new Error("Fatal: Could not find the root element to mount the application.");
  }
  
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <SettingsProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </SettingsProvider>
    </React.StrictMode>
  );
}

startApp();