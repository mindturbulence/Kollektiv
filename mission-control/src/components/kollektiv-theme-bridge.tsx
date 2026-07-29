'use client'

import { useEffect } from 'react'
import {
  isKollektivThemeMessage,
  mapDaisyTokensToMcVars,
} from '@/lib/kollektiv-theme-map'

/**
 * Applies Kollektiv's active theme to this app when embedded in its shell.
 *
 * Renders nothing. When this app is opened directly (not framed), no messages
 * arrive and the app keeps its own default theme.
 */
export function KollektivThemeBridge() {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Kollektiv proxies this app at /mission-control on its own origin, so a
      // legitimate theme message is always same-origin. Reject anything else.
      if (event.origin !== window.location.origin) return
      if (!isKollektivThemeMessage(event.data)) return

      const vars = mapDaisyTokensToMcVars(event.data.tokens)
      const root = document.documentElement
      for (const [name, value] of Object.entries(vars)) {
        root.style.setProperty(name, value)
      }
      root.setAttribute('data-kollektiv-theme', event.data.theme)
    }

    window.addEventListener('message', onMessage)
    // Tell the parent we are ready. The iframe usually mounts after the parent
    // has already published its theme, so without this the first paint keeps
    // Mission Control's default palette until the next theme change.
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'kollektiv:theme-request' }, window.location.origin)
    }
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return null
}
