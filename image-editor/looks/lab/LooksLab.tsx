// ─── Looks Lab (#looks-lab) — Phase 0 diagnostics page ──────────────────────
// Runs the Phase 0 measurements of docs/plans/2026-09-28-image-editor-looks.md
// on the user's real GPU and browser (headless test browsers use a software
// GPU, so their numbers don't count). Standalone route: no app shell, no vault.

import React, { useState } from 'react';
import { gpuCaps, lutAccuracy, fusedPassTiming, repaintCost, type ProbeRow } from './gpuProbe';
import { rawDecode } from './rawProbe';

const nextFrame = () => new Promise(r => setTimeout(r, 30)); // let the table paint between probes

const Rows: React.FC<{ rows: ProbeRow[] }> = ({ rows }) => (
  <table className="w-full text-sm font-mono">
    <tbody>
      {rows.map((r, i) => (
        <tr key={i} className="border-b border-base-content/10">
          <td className="py-1.5 pr-4 text-base-content/70 align-top whitespace-nowrap">{r.name}</td>
          <td className={`py-1.5 ${r.ok === false ? 'text-error' : r.ok ? 'text-success' : ''}`}>{r.value}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const LooksLab: React.FC = () => {
  const [gpu, setGpu] = useState<ProbeRow[]>([]);
  const [raw, setRaw] = useState<ProbeRow[]>([]);
  const [busy, setBusy] = useState(false);

  const runGpu = async () => {
    setBusy(true);
    const rows: ProbeRow[] = [];
    const add = async (r: ProbeRow | ProbeRow[]) => { rows.push(...([] as ProbeRow[]).concat(r)); setGpu([...rows]); await nextFrame(); };
    await add(gpuCaps());
    await add(lutAccuracy());
    await add(fusedPassTiming(2048));
    await add(fusedPassTiming(4096));
    await add(repaintCost());
    setBusy(false);
  };

  const runRaw = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setRaw([{ name: 'Decoding…', value: file.name }]);
    setRaw(await rawDecode(file));
    setBusy(false);
  };

  const copy = () => void navigator.clipboard.writeText(
    [...gpu, ...raw].map(r => `${r.name}: ${r.value}${r.ok === false ? ' ✗' : r.ok ? ' ✓' : ''}`).join('\n'),
  );

  return (
    <div className="min-h-screen bg-base-100 text-base-content p-8 overflow-auto">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-display">Looks Lab — Phase 0 measurements</h1>
          <p className="text-sm text-base-content/70 mt-2">
            Checks whether this GPU and browser can run the planned film-look pipeline. Run it in your normal browser, then copy the results into the chat.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-display flex-1">GPU pipeline</h2>
            <button type="button" className="form-btn form-btn-primary h-9 px-4 text-xs" disabled={busy} onClick={() => void runGpu()}>Run GPU tests</button>
          </div>
          {gpu.length > 0 && <Rows rows={gpu} />}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-display flex-1">RAW decode</h2>
            <label className={`form-btn h-9 px-4 text-xs cursor-pointer ${busy ? 'pointer-events-none opacity-40' : ''}`}>
              Pick a RAW file…
              <input type="file" className="hidden" accept=".dng,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2" onChange={e => void runRaw(e.target.files?.[0])} />
            </label>
          </div>
          <p className="text-xs text-base-content/60">DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2. The file stays on this machine.</p>
          {raw.length > 0 && <Rows rows={raw} />}
        </section>

        {(gpu.length > 0 || raw.length > 0) && (
          <button type="button" className="form-btn h-9 px-4 text-xs self-start" onClick={copy}>Copy results</button>
        )}
      </div>
    </div>
  );
};

export default LooksLab;
