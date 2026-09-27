// ─── Kollektiv Video Editor — Scopes ─────────────────────────────────────────
// Waveform/vectorscope/histogram tabs backed by core/gpu/scopes. Samples the
// preview canvas at ~5fps while active; shows a quiet empty state when WebGPU
// scopes aren't available (createScopes resolves null).

import React, { useEffect, useRef, useState } from 'react';
import { createScopes, type Scopes as ScopesApi } from '../../core/gpu/scopes';

export interface ScopesProps {
  source: HTMLCanvasElement | null;
  active: boolean;
}

type ScopeTab = 'waveform' | 'vectorscope' | 'histogram';

const TABS: ScopeTab[] = ['waveform', 'vectorscope', 'histogram'];
const SAMPLE_INTERVAL_MS = 200; // ~5fps

const Scopes: React.FC<ScopesProps> = ({ source, active }) => {
  const [tab, setTab] = useState<ScopeTab>('waveform');
  const [available, setAvailable] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopesRef = useRef<ScopesApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createScopes().then(scopes => {
      if (cancelled) {
        scopes?.dispose();
        return;
      }
      scopesRef.current = scopes;
      setAvailable(!!scopes);
    });
    return () => {
      cancelled = true;
      scopesRef.current?.dispose();
      scopesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active || !source || !available) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      const scopes = scopesRef.current;
      const canvas = canvasRef.current;
      if (!scopes || !canvas || source.width === 0 || source.height === 0) return;
      createImageBitmap(source)
        .then(bitmap => {
          if (cancelled) {
            bitmap.close();
            return;
          }
          scopes.setSource(bitmap);
          bitmap.close();
          if (tab === 'waveform') scopes.renderWaveform(canvas);
          else if (tab === 'vectorscope') scopes.renderVectorscope(canvas);
          else scopes.renderHistogram(canvas);
        })
        .catch(() => {});
    }, SAMPLE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, source, available, tab]);

  return (
    <section className="border-t border-base-content/5">
      <div className="flex items-center gap-1 px-3 py-1.5" role="tablist" aria-label="Scopes">
        {TABS.map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            className={`px-2 h-6 text-2xs font-mono uppercase tracking-widest border ${tab === t ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60 hover:border-base-content/40'}`}
            onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="px-3 pb-3">
        {available === false ? (
          <p className="text-2xs text-base-content/60">Scopes need WebGPU.</p>
        ) : (
          <canvas ref={canvasRef} width={256} height={144} className="w-full bg-base-100 border border-base-content/10" />
        )}
      </div>
    </section>
  );
};

export default Scopes;
