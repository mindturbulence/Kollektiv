// Global Error Interceptor for diagnosing blank screens
(function() {
  function displayFatalBootError(title, subtitle, detail) {
    try {
      const div = document.createElement('div');
      div.id = 'fatal-boot-error-overlay';
      Object.assign(div.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'oklch(var(--b1))',
        color: 'oklch(var(--bc))',
        fontFamily: '"Space Grotesk", sans-serif',
        padding: '2rem',
        zIndex: '999999',
        overflow: 'auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      });
      div.innerHTML = `
        <div style="max-width: 500px; width: 90%; padding: 2rem; border-radius: 6px; background: oklch(var(--b2)); border: 1px solid oklch(var(--p) / 0.2); box-shadow: 0 0 30px oklch(var(--p) / 0.3);">
          <div class="font-logo" style="font-size: 3rem; font-weight: bold; letter-spacing: 0.04em; margin-bottom: 1.5rem; color: oklch(var(--p));">KOLLEKTIV</div>
          <h1 style="font-size: 1.75rem; font-weight: 900; margin: 0 0 1rem 0; letter-spacing: -0.02em; color: oklch(var(--bc));">⚠️ ${title}</h1>
          <p style="color: oklch(var(--bc) / 0.8); font-size: 1.125rem; line-height: 1.6; margin-bottom: 1.5rem; max-width: 400px;">${subtitle}</p>
          <div style="background: oklch(var(--b3)); border-radius: 4px; padding: 1.5rem; margin-bottom: 2rem; max-height: 40vh; overflow: auto; text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; line-height: 1.5; color: oklch(var(--bc) / 0.7); border: 1px solid oklch(var(--p) / 0.15);">
${detail}
          </div>
          <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; max-width: 400px;">
            <button onclick="window.location.reload()" style="background: oklch(var(--p)); color: oklch(var(--pc)); border: none; padding: 0.875rem 1.5rem; font-family: 'JetBrains Mono', monospace; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; border-radius: 3px; cursor: pointer; transition: all 0.16s ease;">REBOOT_SYSTEM</button>
            <button onclick="try { localStorage.clear(); sessionStorage.clear(); window.location.reload(); } catch(e) {}" style="background: transparent; color: oklch(var(--bc) / 0.7); border: 1px solid oklch(var(--bc) / 0.2); padding: 0.875rem 1.5rem; font-family: 'JetBrains Mono', monospace; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; border-radius: 3px; cursor: pointer; transition: all 0.16s ease;">RESET_ALL_STORAGE</button>
          </div>
          <div style="margin-top: 2rem; font-size: 0.875rem; color: oklch(var(--bc) / 0.5); max-width: 400px;">
            💡 Tip: Check your server connection or try <code>sessionStorage.clear(); location.reload()</code> in console
          </div>
        </div>
      `;
      if (document.body) {
        document.body.appendChild(div);
      } else {
        document.documentElement.appendChild(div);
      }
    } catch(e) {
      console.error("Secondary error rendering boot crash ui:", e);
    }
  }

  window.addEventListener('error', function(event) {
    console.error('Captured Global Error:', event.error);
    const filename = (event.filename || '').toLowerCase();
    const message = (event.message || (event.error && event.error.message) || '').toLowerCase();
    const errorStr = event.error ? String(event.error).toLowerCase() : '';

    // Ignore cross-origin, extension, GSI, browser, or silent script errors
    if (
      message.includes('script error') ||
      errorStr.includes('script error') ||
      !filename ||
      event.lineno === 0 ||
      filename.includes('gsi/client') ||
      filename.includes('chrome-extension') ||
      filename.includes('extensions') ||
      filename.includes('google') ||
      filename.includes('firefox')
    ) {
      console.warn('Ignored cross-origin or non-critical script error:', event);
      return;
    }
    displayFatalBootError(
      'Application Error',
      `An error occurred in <strong>${event.filename || 'unknown script'}</strong> at line <strong>${event.lineno}:${event.colno}</strong>.`,
      event.error ? (event.error.stack || String(event.error)) : (event.message || 'No details available')
    );
  });

  window.addEventListener('unhandledrejection', function(event) {
    console.error('Captured Unhandled Rejection:', event.reason);
    const reasonStr = event.reason ? (event.reason.message || String(event.reason)).toLowerCase() : '';
    if (
      reasonStr.includes('gsi') ||
      reasonStr.includes('google') ||
      reasonStr.includes('script error') ||
      reasonStr.includes('extension')
    ) {
      console.warn('Ignored external unhandled promise rejection:', event.reason);
      return;
    }
    displayFatalBootError(
      'Async Task Failed',
      'An asynchronous operation failed without being caught.',
      event.reason ? (event.reason.stack || String(event.reason)) : 'No details available'
    );
  });
})();

// ── Session-storage diagnostic: persists LAST init step across reloads ──
(function() {
  // On page load, check if the PREVIOUS page left a trace
  try {
    const lastStep = sessionStorage.getItem('_init_last_step');
    const reloadCount = parseInt(sessionStorage.getItem('_init_reload_count') || '0', 10);
    if (lastStep) {
      sessionStorage.setItem('_init_reload_count', String(reloadCount + 1));
      // Show diagnostic overlay
      const div = document.createElement('div');
      div.id = '_init_diag';
      Object.assign(div.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'oklch(var(--b1))',
        color: 'oklch(var(--bc))',
        fontFamily: '"Space Grotesk", sans-serif',
        padding: '2rem',
        zIndex: '999999',
        overflow: 'auto',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      });
      div.innerHTML = `
        <div style="max-width: 500px; width: 90%; padding: 2rem; border-radius: 6px; background: oklch(var(--b2)); border: 1px solid oklch(var(--p) / 0.2); box-shadow: 0 0 30px oklch(var(--p) / 0.3); text-align: center;">
          <div class="font-logo" style="font-size: 2.5rem; font-weight: bold; letter-spacing: 0.04em; margin-bottom: 1.5rem; color: oklch(var(--p));">KOLLEKTIV</div>
          <h1 style="font-size: 1.75rem; font-weight: 900; margin: 0 0 1rem 0; letter-spacing: -0.02em; color: oklch(var(--p));">⚠️ PAGE RELOAD DETECTED</h1>
          <p style="color: oklch(var(--bc) / 0.8); font-size: 1.125rem; line-height: 1.6; margin-bottom: 1.5rem; max-width: 400px;">
            The page was reloaded <strong>${reloadCount + 1}</strong> time${reloadCount === 0 ? '' : 's'}. The last initialization step before the previous reload was:
          </p>
          <div style="background: oklch(var(--b3)); border-radius: 4px; padding: 1.5rem; margin-bottom: 2rem; max-height: 40vh; overflow: auto; text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; line-height: 1.5; color: oklch(var(--bc) / 0.7); border: 1px solid oklch(var(--p) / 0.15);">
${lastStep}
          </div>
          <div style="margin-top: 1.5rem; font-size: 0.875rem; color: oklch(var(--bc) / 0.5); max-width: 400px;">
            💡 To reset, type <code>sessionStorage.clear(); location.reload()</code> in the console
          </div>
          <button onclick="sessionStorage.clear(); location.reload()" 
                  style="background: oklch(var(--p)); color: oklch(var(--pc)); border: none; padding: 0.875rem 1.5rem; font-family: 'JetBrains Mono', monospace; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; border-radius: 3px; cursor: pointer; transition: all 0.16s ease;">
            CLEAR AND RELOAD
          </button>
        </div>
      `;
      if (document.body) {
        document.body.appendChild(div);
      } else {
        document.documentElement.appendChild(div);
      }
    }
  } catch(e) { console.warn('[DIAG] Error:', e); }

  // Clear the step marker on a fresh successful page load (will be re-set by init code)
  try { sessionStorage.removeItem('_init_last_step'); } catch(e) {}
  window.__initLog = function(step) {
    try { sessionStorage.setItem('_init_last_step', step); } catch(e) {}
  };
  window.__initLog('INDEX_HTML_LOADED');
  console.log('[INIT] Diagnostic active — steps will be logged to sessionStorage.');
})();

// Critical: Ensure process global is defined before any module import starts
window.process = {
  env: {
    NODE_ENV: 'development',
    API_KEY: '',
    GEMINI_API_KEY: ''
  }
};

// Clean up: unregister any stale service workers left over from previous builds
// Refrain from calling location.reload() here — that creates a refresh loop.
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (var i = 0; i < registrations.length; i++) {
        registrations[i].unregister();
      }
      if (registrations.length > 0) {
        console.log('Stale service worker(s) unregistered.');
      }
    }).catch(function (err) {
      console.error('Failed to unregister service worker:', err);
    });
  }
}

// Critical: Load theme immediately to support "use current themes" during integrity check
(function () {
  try {
    const settings = JSON.parse(localStorage.getItem('kollektivSettingsV4'));
    if (settings) {
      let theme = settings.activeThemeMode === 'light' ? settings.lightTheme : settings.darkTheme;
      if (theme === 'lofi') theme = 'arwes';
      if (theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Simple heuristic for light/dark
        const isLight = ['light', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'retro', 'cyberpunk', 'valentine', 'garden', 'pastel', 'fantasy', 'wireframe', 'cmyk', 'autumn', 'acid', 'lemonade', 'winter', 'nord'].includes(theme);
        if (isLight) {
          document.documentElement.classList.add('is-light-theme');
        }

        // Update theme-color meta
        const meta = document.getElementById('theme-color-meta');
        if (meta) {
          if (theme === 'pipboy') meta.setAttribute('content', '#051105');
          else if (theme === 'MindTurbulence') meta.setAttribute('content', '#0a0a0a');
          else if (theme === 'abyss') meta.setAttribute('content', '#020617');
          else if (isLight) meta.setAttribute('content', '#ffffff');
        }
      }
    }
  } catch (e) { }
})();