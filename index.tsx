import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
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
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("Root Level Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b', color: '#f4f4f5', fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '1rem', letterSpacing: '-0.05em' }}>BOOT_FAILURE</h1>
          <p style={{ opacity: 0.6, fontSize: '0.875rem', marginBottom: '2rem' }}>A kernel-level error occurred during application bootstrap.</p>
          <pre style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.75rem', maxWidth: '800px', overflow: 'auto', textAlign: 'left', color: '#ff4b4b' }}>
            {this.state.error?.stack || String(this.state.error)}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: '2rem', padding: '0.75rem 1.5rem', backgroundColor: '#00ffa3', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
          >
            REBOOT_SYSTEM
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      <RootErrorBoundary>
        <SettingsProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </SettingsProvider>
      </RootErrorBoundary>
    </React.StrictMode>
  );
}

// Wrap bootstrap in a try-catch to log issues if the module graph fails
try {
    startApp();
} catch (err) {
    console.error("Application Boot Failure:", err);
}