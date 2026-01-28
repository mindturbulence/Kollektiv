import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider } from './contexts/AuthContext';

// --- Environment Shims ---
// Ensure 'process' is defined for libraries that expect a Node-like environment
if (typeof (window as any).process === 'undefined') {
  (window as any).process = {
    env: {
      API_KEY: (window as any).API_KEY || '',
      GEMINI_API_KEY: (window as any).API_KEY || ''
    }
  };
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

// Wrap bootstrap in a try-catch to log issues if the module graph fails
try {
    startApp();
} catch (err) {
    console.error("Application Boot Failure:", err);
}