import React, { useCallback, useEffect, useRef } from 'react';
import { readDaisyTokens } from '../utils/daisyThemeTokens';

/**
 * Mission Control — the agent-ops department.
 *
 * Rendered in a same-origin iframe: Mission Control is a separate Next.js
 * process reverse-proxied at /mission-control (see routes/missionControlRoutes.ts).
 * Two React apps on different frameworks cannot share one tree, so an iframe
 * is the boundary even though the origin is shared.
 *
 * Kollektiv's active DaisyUI theme is forwarded across that boundary as OKLCH
 * tokens; Mission Control maps them onto its own Tailwind 4 theme variables.
 */
const MissionControlPage: React.FC = () => {
    const frameRef = useRef<HTMLIFrameElement>(null);

    const publishTheme = useCallback(() => {
        const frame = frameRef.current;
        if (!frame?.contentWindow) return;
        frame.contentWindow.postMessage(
            {
                type: 'kollektiv:theme',
                theme: document.documentElement.getAttribute('data-theme') || '',
                tokens: readDaisyTokens(document.documentElement),
            },
            window.location.origin,
        );
    }, []);

    useEffect(() => {
        // The iframe asks for the theme once its bridge has mounted, which is
        // normally after this component's first render.
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if ((event.data as { type?: string })?.type === 'kollektiv:theme-request') {
                publishTheme();
            }
        };
        window.addEventListener('message', onMessage);

        // useAppTheme sets data-theme on documentElement; re-publish when it changes.
        const observer = new MutationObserver(publishTheme);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });

        return () => {
            window.removeEventListener('message', onMessage);
            observer.disconnect();
        };
    }, [publishTheme]);

    return (
        <div className="w-full h-full flex flex-col">
            <iframe
                ref={frameRef}
                src="/mission-control"
                title="Mission Control"
                className="w-full h-full border-0 flex-1"
                onLoad={publishTheme}
            />
        </div>
    );
};

export default MissionControlPage;
