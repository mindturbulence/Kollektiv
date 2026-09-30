// ─── Kollektiv Image Editor — RAW Develop (Looks panel section) ─────────────
// Re-develops a layer opened from a camera RAW (Looks plan §4, Phase 4). The
// file is re-decoded on demand onto the GPU; slider moves re-render the layer
// itself live (Jev: in-panel live, 0.98) and a release commits one undo step.
// After a reload the RAW bytes are gone (not autosaved), so the user re-picks
// the file.

import React, { useEffect, useRef, useState } from 'react';
import * as LayerManager from '../../core/layers/LayerManager';
import { decodeRaw, getRawBytes, isRawFile, RawDevelopSession, setRawBytes, type DevelopSettings } from '../../core/io/rawImport';
import { openFilePicker } from '../../core/io/FileIO';
import type { ImageLayer } from '../../core/types';

/** [field, min, max, step, label] — shared with the look inspector's Develop. */
export const DEVELOP_SLIDERS: [keyof DevelopSettings, number, number, number, string][] = [
  ['exposure', -3, 3, 0.05, 'Exposure'], ['contrast', -1, 1, 0.05, 'Contrast'],
  ['highlights', -1, 1, 0.05, 'Highlights'], ['shadows', -1, 1, 0.05, 'Shadows'],
  ['temp', -1, 1, 0.05, 'Temperature'], ['tint', -1, 1, 0.05, 'Tint'], ['saturation', -1, 1, 0.05, 'Saturation'],
];

type Status = 'idle' | 'loading' | 'ready' | 'need-file' | 'error';

const btn = 'h-6 px-2 text-xs font-mono normal-case tracking-normal font-normal border border-base-content/15 hover:border-primary hover:text-primary';

const RawDevelop: React.FC<{ layer: ImageLayer & { raw: NonNullable<ImageLayer['raw']> } }> = ({ layer }) => {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [params, setParams] = useState<DevelopSettings>(layer.raw.develop);
  const session = useRef<RawDevelopSession | null>(null);
  // Drag state: the bitmap/settings before the drag, the newest settings to
  // render, and whether a release is waiting for the last render.
  const drag = useRef<{ before: ImageBitmap; beforeRaw: ImageLayer['raw']; live: ImageBitmap | null } | null>(null);
  const pending = useRef<DevelopSettings | null>(null);
  const busy = useRef(false);
  const commitWanted = useRef(false);
  const latest = useRef(params);

  const close = () => { session.current?.dispose(); session.current = null; setStatus('idle'); };
  useEffect(() => () => { session.current?.dispose(); session.current = null; }, [layer.id]);
  useEffect(() => { // undo/redo changed the settings under us
    if (!drag.current) { latest.current = layer.raw.develop; setParams(layer.raw.develop); }
  }, [layer.raw.develop]);

  const start = async () => {
    const bytes = getRawBytes(layer.id);
    if (!bytes) { setStatus('need-file'); return; }
    setStatus('loading');
    try {
      const decoded = await decodeRaw(bytes);
      const s = new RawDevelopSession(decoded);
      if (s.width !== layer.intrinsicWidth || s.height !== layer.intrinsicHeight) {
        s.dispose();
        throw new Error('this layer was resized since it was developed');
      }
      session.current = s;
      setStatus('ready');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const reopen = async () => {
    const file = await openFilePicker();
    if (!file) return;
    if (!isRawFile(file)) { setMessage(`${file.name} isn't a RAW file`); setStatus('error'); return; }
    setRawBytes(layer.id, new Uint8Array(await file.arrayBuffer()));
    await start();
  };

  const commit = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    commitWanted.current = false;
    LayerManager.commitRawDevelop(layer.id, d.before, d.beforeRaw, { ...layer.raw, develop: latest.current });
  };

  const pump = async () => {
    if (busy.current || !session.current) return;
    busy.current = true;
    while (pending.current && session.current) {
      const p = pending.current;
      pending.current = null;
      const bmp = await session.current.render(p);
      const d = drag.current;
      if (!d) { bmp.close(); break; }
      LayerManager.setLayerBitmapLive(layer.id, bmp);
      d.live?.close(); // intermediate frames aren't in history
      d.live = bmp;
    }
    busy.current = false;
    if (commitWanted.current) commit();
  };

  const change = (field: keyof DevelopSettings, value: number) => {
    if (!drag.current) drag.current = { before: layer.bitmap, beforeRaw: layer.raw, live: null };
    const next = { ...latest.current, [field]: value };
    latest.current = next;
    setParams(next);
    pending.current = next;
    void pump();
  };

  const release = () => {
    if (!drag.current) return;
    commitWanted.current = true; // after the last render; that frame then belongs to history
    if (!busy.current) commit();
  };

  return (
    <section aria-label="RAW develop" className="flex flex-col gap-2 p-3 border-b border-base-content/5 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-base-content/70 flex-1 truncate" title={layer.raw.fileName}>RAW · {layer.raw.fileName}</span>
        {status === 'ready'
          ? <button type="button" className={btn} onClick={close}>Done</button>
          : <button type="button" className={btn} disabled={status === 'loading'} onClick={() => void start()}>
              {status === 'loading' ? 'Decoding…' : 'Develop'}
            </button>}
      </div>
      {status === 'need-file' && (
        <div className="flex flex-col gap-1.5 text-xs font-mono text-base-content/60">
          <span>The RAW file isn't loaded in this session.</span>
          <button type="button" className={`${btn} self-start`} onClick={() => void reopen()}>Re-open {layer.raw.fileName}…</button>
        </div>
      )}
      {status === 'error' && <p className="text-xs font-mono text-error">Can't develop: {message}</p>}
      {status === 'ready' && (
        <>
          {DEVELOP_SLIDERS.map(([field, min, max, step, label]) => (
            <label key={field} className="flex items-center gap-2 text-xs font-mono text-base-content/60">
              <span className="w-24 shrink-0">{label}</span>
              <input type="range" aria-label={`RAW ${label.toLowerCase()}`} className="range range-xs range-primary flex-1"
                min={min} max={max} step={step} value={params[field] as number}
                onChange={e => change(field, Number(e.target.value))}
                onPointerUp={release} onKeyUp={release} onBlur={release} />
            </label>
          ))}
          <p className="text-[11px] font-mono text-base-content/50">Re-developing replaces any painting on this layer (undoable).</p>
        </>
      )}
    </section>
  );
};

export default RawDevelop;
