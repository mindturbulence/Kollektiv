import { useEffect, useRef, useState } from 'react';
import '../utils/voice-orb.js';
import type { AssistantMode } from '../utils/assistantMode';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

function toOrbState(mode: AssistantMode): OrbState {
    if (mode === 'listening') return 'listening';
    if (mode === 'processing' || mode === 'connecting') return 'thinking';
    if (mode === 'responding') return 'speaking';
    return 'idle';
}

// Extend React.JSX so <voice-orb> is a valid element (react-jsx transform)
declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'voice-orb': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & { state?: OrbState },
                HTMLElement
            >;
        }
    }
}

/** Read the theme primary hue from the raw --p CSS variable (DaisyUI oklch: "l c h"). */
function readPrimaryHue(): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--p').trim();
    const parts = raw.split(/\s+/);
    if (parts.length >= 3) {
        const hue = parseFloat(parts[2]);
        if (Number.isFinite(hue)) return hue;
    }
    return 270;
}

interface Props { mode: AssistantMode }

const VoiceOrbCanvas: React.FC<Props> = ({ mode }) => {
    const ref = useRef<HTMLElement>(null);
    const orbState = toOrbState(mode);
    const [hueRotate, setHueRotate] = useState(0);

    // Sync orb state property on mode change
    useEffect(() => {
        const el = ref.current as (HTMLElement & { state?: string }) | null;
        if (el) el.state = orbState;
    }, [orbState]);

    // Read primary hue on mount + whenever data-theme changes
    useEffect(() => {
        const update = () => setHueRotate(readPrimaryHue() - 270);
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    return (
        <voice-orb
            ref={ref as React.RefObject<HTMLElement>}
            state={orbState}
            role="img"
            aria-label={`Voice assistant: ${orbState}`}
            style={{
                display: 'block',
                width: '100%',
                filter: `hue-rotate(${hueRotate}deg)`,
            }}
        />
    );
};

export default VoiceOrbCanvas;
