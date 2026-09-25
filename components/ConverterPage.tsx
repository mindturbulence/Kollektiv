import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { TerminalText, PanelLine, ScanLine, panelVariants, sectionWipeVariants, contentVariants } from './AnimatedPanels';
import { evaluateConversion, isKnownSourceExt, getTargetsForSource, type RegistryRejectReason } from '../services/convert/convertRegistry';
import { IMAGE_TARGET_FORMATS, AUDIO_TARGET_FORMATS, VIDEO_TARGET_FORMATS, CONVERTER_LIMITS, getFormatById, type ConverterFormatDef } from '../constants/converterFormats';
import { sanitizeBaseName } from '../utils/converterNaming';
import { downloadZip } from '../utils/zipDownload';
import { useObjectUrls } from '../utils/useObjectUrls';
import { ConvertWorkerManager } from '../services/convert/convertManager';
import { audioVideoConverter, type AVELoadState } from '../services/convert/audioVideoConverter';
import { fileSystemManager } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import LoadingSpinner from './LoadingSpinner';

// ── Queue model ───────────────────────────────────────────────────────

type RowStatus = 'pending' | 'converting' | 'done' | 'error' | 'cancelled';

interface QueueRow {
  id: string;
  file: File;
  base: string; // sanitized base name
  ext: string; // lowercased source extension
  status: RowStatus;
  targetId: string; // '' = use global target
  error?: string;
  outputUrl?: string;
  outputName?: string;
  outputSize?: number;
  outputBlob?: Blob;
  durationMs?: number;
}

const REJECT_COPY: Record<RegistryRejectReason, string> = {
  'unsupported-source': 'Unsupported format',
  'unsupported-target': 'Target not valid for this source',
  'same-format': 'Already this format',
  'video-too-large': 'Video exceeds 500MB limit',
  'video-too-long': 'Video exceeds 10min limit',
};

let rowSeq = 0;
function nextRowId(): string {
  rowSeq += 1;
  return `cv_${Date.now()}_${rowSeq}`;
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

// ── Component ─────────────────────────────────────────────────────────

interface ConverterPageProps {
  isExiting?: boolean;
  showGlobalFeedback?: (msg: string) => void;
  /** One-shot handoff (e.g. from Assets Manager's selection toolbar) — queued on mount only. */
  initialFiles?: File[];
}

const ConverterPage: React.FC<ConverterPageProps> = ({ isExiting = false, showGlobalFeedback, initialFiles }) => {
  const { settings, updateSettings } = useSettings();
  const [rows, setRows] = useState<QueueRow[]>([]);
  // Plan W5: defaults persist across sessions via app settings; local state
  // seeds from them once on mount and changes are written back on the fly.
  const [globalTarget, setGlobalTarget] = useState<string>(() => {
    const saved = settings.converterDefaultTargetId;
    return saved && getFormatById(saved) ? saved : 'webp';
  });
  const [quality, setQuality] = useState(() => {
    const saved = settings.converterQuality;
    return typeof saved === 'number' && saved >= 1 && saved <= 100 ? Math.round(saved) : 80;
  });
  const settingsTouchedRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [avState, setAvState] = useState<AVELoadState>(audioVideoConverter.getLoadState());
  const [capWarning, setCapWarning] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runAbortRef = useRef(false);
  const { track, revoke } = useObjectUrls();

  const managerRef = useRef<ConvertWorkerManager | null>(null);
  const getManager = useCallback(() => {
    if (!managerRef.current) {
      managerRef.current = new ConvertWorkerManager(() =>
        new Worker(new URL('../workers/convertWorker.ts', import.meta.url), { type: 'module' }),
      );
    }
    return managerRef.current;
  }, []);

  useEffect(() => {
    const off = audioVideoConverter.onLoadStateChange(setAvState);
    return () => {
      off();
      // Unmount teardown (plan S1): cancel everything + terminate workers.
      runAbortRef.current = true;
      managerRef.current?.dispose();
      managerRef.current = null;
      audioVideoConverter.dispose();
    };
  }, []);

  // Plan W5: write converter defaults back to app settings only after the
  // user changes something — mounting with defaults must not overwrite a
  // previously saved value.
  useEffect(() => {
    if (settingsTouchedRef.current) {
      // Context replaces the whole settings object — spread the current
      // snapshot (SetupPage handleSettingsChange precedent).
      updateSettings({ ...settings, converterDefaultTargetId: globalTarget, converterQuality: quality });
    }
    // `settings` intentionally not a dep: only user edits persist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalTarget, quality, updateSettings]);

  const handleTargetChange = useCallback((id: string) => {
    settingsTouchedRef.current = true;
    setGlobalTarget(id);
  }, []);

  const handleQualityChange = useCallback((q: number) => {
    settingsTouchedRef.current = true;
    setQuality(q);
  }, []);

  // ── Adding files ────────────────────────────────────────────────────

  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    setRows(prev => {
      const room = CONVERTER_LIMITS.BATCH_CAP - prev.length;
      if (incoming.length > room) {
        setCapWarning(
          room <= 0
            ? `Batch cap reached (${CONVERTER_LIMITS.BATCH_CAP} files) — dropped ${incoming.length} file(s).`
            : `Batch cap reached (${CONVERTER_LIMITS.BATCH_CAP}) — added ${room} of ${incoming.length} files.`,
        );
      }
      const accepted = incoming.slice(0, Math.max(0, room));
      const next: QueueRow[] = accepted.map(file => {
        const ext = extOf(file.name);
        const base = sanitizeBaseName(file.name.replace(/\.[^.]+$/, ''));
        return {
          id: nextRowId(),
          file,
          base,
          ext,
          status: isKnownSourceExt(ext) ? 'pending' : 'error',
          targetId: '',
          error: isKnownSourceExt(ext) ? undefined : REJECT_COPY['unsupported-source'],
        };
      });
      return [...prev, ...next];
    });
  }, []);

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) addFiles(initialFiles);
    // Mount-only: initialFiles is a one-shot handoff instruction for how this tab session opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => {
      const row = prev.find(r => r.id === id);
      if (row?.outputUrl) revoke(row.outputUrl);
      return prev.filter(r => r.id !== id);
    });
  }, [revoke]);

  const setRowTarget = useCallback((id: string, targetId: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, targetId } : r)));
  }, []);

  // ── Conversion ──────────────────────────────────────────────────────

  const convertOne = useCallback(
    async (row: QueueRow, targetId: string, verdict: { engine?: 'magick' | 'ffmpeg' }): Promise<Partial<QueueRow>> => {
      const started = performance.now();
      const buffer = await row.file.arrayBuffer();
      const req = { id: row.id, data: buffer, fileName: row.file.name, targetId, quality };
      const result =
        verdict.engine === 'ffmpeg'
          ? await audioVideoConverter.convert(req)
          : await getManager().convert(req);
      return finishOk(row, result, targetId, started);
    },
    [getManager, quality],
  );

  // Output-name collisions within the batch → -2/-3 suffixes (plan failure table).
  const takenNamesRef = useRef(new Set<string>());

  const finishOk = (
    row: QueueRow,
    result: { data: ArrayBuffer; mime: string; byteLength: number },
    targetId: string,
    started: number,
  ): Partial<QueueRow> => {
    const blob = new Blob([result.data], { type: result.mime });
    const url = track(URL.createObjectURL(blob));
    const target = allTargetsById.get(targetId);
    const outExt = target?.ext ?? 'bin';
    // Collision handling against all outputs already produced this session.
    let candidate = `${row.base}.${outExt}`;
    let n = 2;
    while (takenNamesRef.current.has(candidate.toLowerCase())) {
      candidate = `${row.base}-${n}.${outExt}`;
      n++;
    }
    takenNamesRef.current.add(candidate.toLowerCase());
    return {
      status: 'done',
      outputUrl: url,
      outputBlob: blob,
      outputName: candidate,
      outputSize: result.byteLength,
      durationMs: Math.round(performance.now() - started),
    };
  };

  // Effective target: per-row override, else the global target when valid for
  // this source, else the first valid target for the source's category
  // (smart default per design Pass 3, step 3).
  const targetIdFor = useCallback(
    (row: QueueRow): string => {
      if (row.targetId) return row.targetId;
      if (getTargetsForSource(row.ext).some(t => t.id === globalTarget)) return globalTarget;
      return getTargetsForSource(row.ext)[0]?.id ?? '';
    },
    [globalTarget],
  );

  const handleConvertAll = useCallback(async () => {
    if (isRunning) return; // double-click dedupe (plan S4)
    const runnable = rows.filter(r => r.status === 'pending');
    if (runnable.length === 0) return;
    setIsRunning(true);
    runAbortRef.current = false;
    const batchStarted = performance.now();
    const batchStats = { ok: 0, failed: 0, cancelled: 0, bytesIn: 0, bytesOut: 0 };
    console.groupCollapsed(`[converter] batch of ${runnable.length} — start`);

    for (const row of runnable) {
      if (runAbortRef.current) {
        batchStats.cancelled += runnable.length - batchStats.ok - batchStats.failed;
        break;
      }
      const targetId = targetIdFor(row);
      const verdict = evaluateConversion(
        { name: row.file.name, ext: row.ext, size: row.file.size },
        targetId,
      );
      if (!verdict.ok || !targetId) {
        batchStats.failed++;
        console.warn(`[converter] reject ${row.file.name}: ${verdict.rejectReason ?? 'no valid target'}`);
        setRows(prev =>
          prev.map(r => (r.id === row.id ? { ...r, status: 'error', error: REJECT_COPY[verdict.rejectReason ?? 'unsupported-source'] } : r)),
        );
        continue;
      }
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: 'converting' } : r)));
      const jobStarted = performance.now();
      try {
        const patch = await convertOne(row, targetId, verdict);
        batchStats.ok++;
        batchStats.bytesIn += row.file.size;
        batchStats.bytesOut += patch.outputSize ?? 0;
        // S8: structured per-job record (local-first — console only, no remote logging).
        console.info(
          `[converter] ok ${row.file.name} → ${patch.outputName} ` +
            `engine=${verdict.engine} bytesIn=${row.file.size} bytesOut=${patch.outputSize} ` +
            `ms=${Math.round(performance.now() - jobStarted)}`,
        );
        setRows(prev => prev.map(r => (r.id === row.id ? { ...r, ...patch } : r)));
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (aborted) batchStats.cancelled++;
        else batchStats.failed++;
        console[aborted ? 'info' : 'error'](
          `[converter] ${aborted ? 'cancelled' : 'failed'} ${row.file.name} ` +
            `engine=${verdict.engine} ms=${Math.round(performance.now() - jobStarted)} ` +
            `error=${err instanceof Error ? err.message : String(err)}`,
        );
        setRows(prev =>
          prev.map(r =>
            r.id === row.id
              ? { ...r, status: aborted ? 'cancelled' : 'error', error: aborted ? undefined : err instanceof Error ? err.message : String(err) }
              : r,
          ),
        );
      }
    }
    console.groupEnd();
    console.info(
      `[converter] batch done in ${((performance.now() - batchStarted) / 1000).toFixed(1)}s — ` +
        `ok=${batchStats.ok} failed=${batchStats.failed} cancelled=${batchStats.cancelled} ` +
        `bytesIn=${batchStats.bytesIn} bytesOut=${batchStats.bytesOut}`,
    );
    setIsRunning(false);
  }, [rows, isRunning, convertOne, targetIdFor]);

  const handleCancelAll = useCallback(() => {
    runAbortRef.current = true;
    managerRef.current?.cancelAll();
    audioVideoConverter.cancelAll();
    setRows(prev => prev.map(r => (r.status === 'converting' || r.status === 'pending' ? { ...r, status: 'cancelled' } : r)));
    setIsRunning(false);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────

  const allTargetsById = useMemo(() => {
    const map = new Map<string, ConverterFormatDef>();
    [...IMAGE_TARGET_FORMATS, ...AUDIO_TARGET_FORMATS, ...VIDEO_TARGET_FORMATS].forEach(f => map.set(f.id, f));
    return map;
  }, []);

  const doneRows = rows.filter(r => r.status === 'done' && r.outputBlob);
  const doneCount = doneRows.length;
  const totalCount = rows.length;
  // Vault-disconnected → Save to Vault hidden; plain download remains (plan W4).
  const hasVault = (fileSystemManager as unknown as { isInitialized?: boolean }).isInitialized === true;

  const handleDownloadZip = useCallback(async () => {
    if (doneRows.length === 0 || isZipping) return;
    setIsZipping(true);
    try {
      await downloadZip(
        doneRows.map(r => ({ name: r.outputName!, content: r.outputBlob! })),
        `converted_${Date.now()}.zip`,
        { revokeAfterMs: 60_000 },
      );
      showGlobalFeedback?.(`${doneRows.length} converted — ZIP ready.`);
    } finally {
      setIsZipping(false);
    }
  }, [doneRows, isZipping, showGlobalFeedback]);

  const handleSaveToVault = useCallback(async () => {
    if (!hasVault || doneRows.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const row of doneRows) {
      try {
        await fileSystemManager.saveFile(`gallery/converted/${row.outputName}`, row.outputBlob!);
        ok++;
      } catch {
        fail++; // VaultWriteError path — per-file failure, batch continues
      }
    }
    showGlobalFeedback?.(fail === 0 ? `Saved ${ok} file(s) to Vault.` : `Saved ${ok}, failed ${fail} — try plain download.`);
  }, [doneRows, hasVault, showGlobalFeedback]);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div
      className="h-full w-full flex flex-col relative overflow-hidden"
      onDragOver={e => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDragging(false);
        addFiles(e.dataTransfer?.files ?? null);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* ① DROP STRIP */}
      <motion.button
        variants={panelVariants}
        initial="hidden"
        animate={isExiting ? 'exit' : 'visible'}
        onClick={() => fileInputRef.current?.click()}
        className={`mx-6 mt-4 flex-shrink-0 border border-dashed px-6 py-5 text-left transition-colors ${isDragging ? 'border-primary bg-primary/10' : 'border-base-content/20 hover:border-primary/50'}`}
      >
        <TerminalText text="DROP FILES OR CLICK TO BROWSE — IMAGES · AUDIO · VIDEO" delay={0.3} className="text-2xs font-black uppercase tracking-widest text-primary" centered />
        <p className="text-2xs font-mono uppercase tracking-[0.3em] text-base-content/60 mt-2 text-center">nothing leaves this machine</p>
      </motion.button>

      {capWarning && (
        <div className="mx-6 mt-2 text-2xs font-mono uppercase tracking-widest text-warning" role="alert">
          ⚠ {capWarning}
        </div>
      )}

      <div className="flex-grow flex min-h-0 px-6 py-4 gap-4">
        {/* ② BATCH QUEUE */}
        <motion.section
          variants={panelVariants}
          initial="hidden"
          animate={isExiting ? 'exit' : 'visible'}
          className="flex-grow min-w-0 flex flex-col relative corner-frame"
        >
          <PanelLine position="top" delay={0.4} />
          <PanelLine position="bottom" delay={0.5} />
          <PanelLine position="left" delay={0.6} />
          <PanelLine position="right" delay={0.7} />
          <ScanLine delay={3.5} />
          <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
            <motion.header
              variants={sectionWipeVariants}
              custom={1.2}
              initial="hidden"
              animate="visible"
              className="p-4 bg-base-100/10 flex justify-between items-center"
            >
              <TerminalText text="BATCH QUEUE" delay={1.0} className="text-2xs font-black uppercase text-primary" />
              <span className="text-2xs font-mono font-bold text-base-content/60 uppercase">{rows.length} FILES</span>
            </motion.header>
            <motion.div variants={contentVariants} custom={2.2} initial="hidden" animate="visible" className="flex-grow overflow-y-auto p-3" aria-live="polite">
              {rows.length === 0 ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center opacity-30">
                  <p className="text-xs font-black uppercase tracking-[0.4em]">Queue is Empty</p>
                  <p className="text-2xs font-mono uppercase tracking-widest mt-2">Drop media above to begin</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-px">
                  {rows.map(row => (
                    <QueueRowItem
                      key={row.id}
                      row={row}
                      targets={getTargetsForSource(row.ext)}
                      globalTargetId={globalTarget}
                      onRemove={() => removeRow(row.id)}
                      onTargetChange={id => setRowTarget(row.id, id)}
                    />
                  ))}
                </ul>
              )}
            </motion.div>
          </div>
        </motion.section>

        {/* ③ SETTINGS */}
        <motion.aside
          variants={panelVariants}
          initial="hidden"
          animate={isExiting ? 'exit' : 'visible'}
          className="w-[320px] flex-shrink-0 flex flex-col relative corner-frame"
        >
          <PanelLine position="top" delay={0.5} />
          <PanelLine position="bottom" delay={0.6} />
          <div className="flex flex-col h-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
            <div className="p-4 bg-base-100/10">
              <TerminalText text="CONVERSION SETTINGS" delay={1.4} className="text-2xs font-black uppercase text-primary" />
            </div>
            <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-5">
              {/* Target format */}
              <div>
                <p className="text-2xs font-mono uppercase tracking-[0.25em] text-base-content/60 mb-2">Target Format</p>
                <FormatGroup label="IMAGE" formats={IMAGE_TARGET_FORMATS} selected={globalTarget} onSelect={handleTargetChange} />
                <div className="mt-2">
                  <FormatGroup label="AUDIO" formats={AUDIO_TARGET_FORMATS} selected={globalTarget} onSelect={handleTargetChange} />
                </div>
                <div className="mt-2">
                  <FormatGroup label="VIDEO" formats={VIDEO_TARGET_FORMATS} selected={globalTarget} onSelect={handleTargetChange} />
                </div>
              </div>

              {/* Quality */}
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-2xs font-mono uppercase tracking-[0.25em] text-base-content/60">Quality</p>
                  <span className="text-2xs font-mono text-primary">{quality}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={quality}
                  onChange={e => handleQualityChange(Number(e.target.value))}
                  className="range range-xs w-full"
                  aria-label="Conversion quality"
                />
              </div>

              {/* AV engine state */}
              <div className="text-2xs font-mono uppercase tracking-widest">
                <p className="text-base-content/60 mb-1 tracking-[0.25em]">Audio/Video Engine</p>
                {avState === 'ready' && <span className="text-success">● CORE READY</span>}
                {avState === 'loading' && (
                  <span className="text-warning inline-flex items-center gap-2">
                    <LoadingSpinner className="w-3 h-3" /> LOADING ENGINE (~32MB, one time)
                  </span>
                )}
                {avState === 'failed' && (
                  <span className="text-error flex flex-col gap-1">
                    <span>✕ ENGINE LOAD FAILED</span>
                    <button className="form-btn h-7" onClick={() => audioVideoConverter.preload()}>
                      RETRY
                    </button>
                  </span>
                )}
                {avState === 'idle' && <span className="text-base-content/60">○ NOT LOADED (loads on first A/V job)</span>}
              </div>

              <p className="text-2xs font-mono text-base-content/60 leading-relaxed uppercase tracking-wider">
                Video targets short clips (&le;60s, &le;1080p). Longer sources are rejected before queueing.
              </p>
            </div>

            {/* Actions */}
            <div className="p-4 flex flex-col gap-2 border-t border-base-content/10">
              <button className="form-btn h-10 btn-primary" disabled={isRunning || rows.length === 0} onClick={() => void handleConvertAll()}>
                {isRunning ? 'CONVERTING…' : 'CONVERT ALL'}
              </button>
              {isRunning && (
                <button className="form-btn h-9 text-error" onClick={handleCancelAll}>
                  CANCEL
                </button>
              )}
              <button className="form-btn h-9" disabled={doneCount === 0 || isZipping} onClick={() => void handleDownloadZip()}>
                {isZipping ? 'PACKING…' : `DOWNLOAD ZIP${doneCount ? ` (${doneCount})` : ''}`}
              </button>
              {hasVault && (
                <button className="form-btn h-9" disabled={doneCount === 0} onClick={() => void handleSaveToVault()}>
                  SAVE TO VAULT
                </button>
              )}
            </div>
          </div>
        </motion.aside>
      </div>

      {/* ④ STATUS BAR */}
      <div className="flex-shrink-0 px-6 py-2 border-t border-base-content/10 flex items-center justify-between text-2xs font-mono uppercase tracking-widest">
        <span className="text-base-content/60">
          {doneCount}/{totalCount} converted
          {isRunning && <span className="text-primary animate-pulse"> · RUNNING</span>}
        </span>
        <span className="text-base-content/60">{doneCount > 0 ? `${doneCount} artifact${doneCount === 1 ? '' : 's'} ready` : 'NO ARTIFACTS YET'}</span>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────

const FormatGroup: React.FC<{
  label: string;
  formats: ConverterFormatDef[];
  selected: string;
  onSelect: (id: string) => void;
}> = ({ label, formats, selected, onSelect }) => (
  <div>
    <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-base-content/60 mb-1">{label}</p>
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`${label} target formats`}>
      {formats.map(f => (
        <button
          key={f.id}
          role="radio"
          aria-checked={selected === f.id}
          onClick={() => onSelect(f.id)}
          className={`px-2 h-7 text-2xs font-mono uppercase tracking-wider border transition-colors ${
            selected === f.id ? 'border-primary text-primary bg-primary/10' : 'border-base-content/15 text-base-content/60 hover:border-primary/40'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  </div>
);

const STATUS_META: Record<RowStatus, { led: string; label: string }> = {
  pending: { led: 'bg-base-content/30', label: 'queued' },
  converting: { led: 'bg-warning animate-pulse', label: 'converting' },
  done: { led: 'bg-success', label: 'done' },
  error: { led: 'bg-error', label: 'error' },
  cancelled: { led: 'bg-base-content/40', label: 'cancelled' },
};

const QueueRowItem: React.FC<{
  row: QueueRow;
  targets: ConverterFormatDef[];
  globalTargetId: string;
  onRemove: () => void;
  onTargetChange: (id: string) => void;
}> = ({ row, targets, globalTargetId, onRemove, onTargetChange }) => {
  const meta = STATUS_META[row.status];
  const effectiveTarget = row.targetId || globalTargetId;
  return (
    <li
      className="group flex items-center gap-3 px-3 py-2 bg-base-200/30 hover:bg-base-200/50 transition-colors"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Delete') onRemove();
      }}
    >
      {/* status LED with text equivalent */}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.led}`} aria-label={meta.label} title={meta.label} />
      <div className="min-w-0 flex-grow">
        <p className="text-2xs font-mono truncate" title={row.file.name}>
          {row.file.name}
        </p>
        {row.status === 'done' ? (
          <p className="text-2xs font-mono text-base-content/60 uppercase tracking-wider">
            → {row.outputName} · {(row.outputSize! / 1024).toFixed(0)} KB
            {row.durationMs !== undefined && ` · ${(row.durationMs / 1000).toFixed(1)}s`}
          </p>
        ) : row.status === 'error' ? (
          <p className="text-2xs font-mono text-error uppercase tracking-wider">{row.error}</p>
        ) : (
          <p className="text-2xs font-mono text-base-content/60 uppercase tracking-wider">
            {row.ext.toUpperCase()} → {effectiveTarget.toUpperCase()}
          </p>
        )}
      </div>
      {targets.length > 0 && row.status !== 'done' && (
        <select
          className="bg-transparent border border-base-content/15 text-2xs font-mono uppercase px-1 py-0.5 hover:border-primary/40"
          value={row.targetId}
          onChange={e => onTargetChange(e.target.value)}
          aria-label={`Override target for ${row.file.name}`}
        >
          <option value="">default ({globalTargetId})</option>
          {targets.map(t => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      {row.status === 'done' && row.outputUrl && (
        <a href={row.outputUrl} download={row.outputName} className="text-2xs font-mono uppercase tracking-wider text-primary hover:no-underline">
          SAVE
        </a>
      )}
      <button onClick={onRemove} className="w-6 h-6 text-base-content/60 hover:text-error text-sm leading-none" aria-label={`Remove ${row.file.name}`}>
        ✕
      </button>
    </li>
  );
};

export default ConverterPage;
