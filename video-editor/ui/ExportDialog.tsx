// ─── Kollektiv Video Editor — Export Dialog ──────────────────────────────────
// Container / resolution / quality → exporter with an AbortController →
// progress by phase → object-URL download link. Closing aborts a running
// export; the result URL is revoked when the dialog closes or unmounts.

import React, { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { createExporter } from '../core/export';
import { getSnapshot } from '../core/store';
import type { Compositor, ExportContainer, ExportProgress, MediaEngine, ProjectSettings } from '../core/types';
import { useEditorSelector } from './hooks/useEditorState';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Null when the media engine or compositor failed to start. */
  deps: { media: MediaEngine; compositor: Compositor } | null;
  onError: (message: string) => void;
}

const RESOLUTIONS = [
  { id: 'full', label: 'Project', shortSide: null },
  { id: '720', label: '720p', shortSide: 720 },
  { id: '480', label: '480p', shortSide: 480 },
] as const;

/** Bits per pixel per frame. */
const QUALITIES = [
  { id: 'low', label: 'Small', bpp: 0.05 },
  { id: 'standard', label: 'Standard', bpp: 0.1 },
  { id: 'high', label: 'High', bpp: 0.2 },
] as const;

const PHASE_LABEL: Record<ExportProgress['phase'], string> = {
  preparing: 'Preparing',
  rendering: 'Rendering frames',
  'encoding-audio': 'Encoding audio',
  finalizing: 'Finalizing',
  'fallback-ffmpeg': 'Encoding (compatibility mode)',
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output size for a preset; never upscales, always even (H.264 requirement). */
export function outputSize(settings: ProjectSettings, shortSide: number | null): { width: number; height: number } {
  const projectShort = Math.min(settings.width, settings.height);
  const scale = shortSide && shortSide < projectShort ? shortSide / projectShort : 1;
  return { width: even(settings.width * scale), height: even(settings.height * scale) };
}

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ExportProgress }
  | { kind: 'done'; url: string; fileName: string };

const choiceBtn = (active: boolean) =>
  `flex-1 py-1.5 text-2xs font-mono uppercase border ${active ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60 hover:border-base-content/40'}`;

const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose, deps, onError }) => {
  const settings = useEditorSelector(s => s.project?.settings);
  const [container, setContainer] = useState<ExportContainer>('mp4');
  const [resolutionId, setResolutionId] = useState<(typeof RESOLUTIONS)[number]['id']>('full');
  const [qualityId, setQualityId] = useState<(typeof QUALITIES)[number]['id']>('standard');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  useEffect(() => reset, []);

  const close = () => {
    reset();
    setStatus({ kind: 'idle' });
    onClose();
  };

  const size = settings ? outputSize(settings, RESOLUTIONS.find(r => r.id === resolutionId)?.shortSide ?? null) : null;

  const start = async () => {
    const project = getSnapshot().project;
    if (!project || !deps || !size) return;
    reset();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'running', progress: { phase: 'preparing', progress: 0 } });
    const bpp = QUALITIES.find(q => q.id === qualityId)?.bpp ?? 0.1;
    try {
      const exporter = createExporter(deps);
      const blob = await exporter.export(
        project,
        {
          container, ...size, fps: project.settings.fps,
          videoBitrate: Math.round(size.width * size.height * project.settings.fps * bpp),
          audioBitrate: 192_000,
        },
        (progress) => { if (!controller.signal.aborted) setStatus({ kind: 'running', progress }); },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      abortRef.current = null;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setStatus({ kind: 'done', url, fileName: `${project.name || 'export'}.${container}` });
    } catch (err) {
      if (controller.signal.aborted) return; // cancelled by the user; not an error
      abortRef.current = null;
      setStatus({ kind: 'idle' });
      onError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const cancel = () => {
    if (status.kind !== 'running') return close();
    reset();
    setStatus({ kind: 'idle' });
  };

  const running = status.kind === 'running';

  return (
    <Modal isOpen={isOpen} onClose={close} title="Export video" size="sm">
      <div className="p-4 space-y-4">
        <fieldset disabled={running} className="space-y-4">
          <div>
            <p className="text-2xs font-mono text-base-content/60 uppercase tracking-widest mb-2">Format</p>
            <div className="flex gap-2">
              {(['mp4', 'webm'] as const).map(c => (
                <button key={c} type="button" aria-pressed={container === c} className={choiceBtn(container === c)} onClick={() => setContainer(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-2xs font-mono text-base-content/60 uppercase tracking-widest mb-2">Resolution</p>
            <div className="flex gap-2">
              {RESOLUTIONS.map(r => (
                <button key={r.id} type="button" aria-pressed={resolutionId === r.id} className={choiceBtn(resolutionId === r.id)} onClick={() => setResolutionId(r.id)}>{r.label}</button>
              ))}
            </div>
            {size && <p className="mt-1.5 text-2xs font-mono text-base-content/60">{size.width} × {size.height}px · {settings?.fps} fps</p>}
          </div>
          <div>
            <p className="text-2xs font-mono text-base-content/60 uppercase tracking-widest mb-2">Quality</p>
            <div className="flex gap-2">
              {QUALITIES.map(q => (
                <button key={q.id} type="button" aria-pressed={qualityId === q.id} className={choiceBtn(qualityId === q.id)} onClick={() => setQualityId(q.id)}>{q.label}</button>
              ))}
            </div>
          </div>
        </fieldset>

        {running && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex justify-between text-2xs font-mono text-base-content/70">
              <span>{PHASE_LABEL[status.progress.phase]}</span>
              <span>{Math.round(status.progress.progress * 100)}%</span>
            </div>
            <progress className="progress progress-primary w-full rounded-none" max={1} value={status.progress.progress} aria-label="Export progress" />
          </div>
        )}

        {status.kind === 'done' && (
          <p className="text-2xs font-mono text-success" role="status">Export finished — {status.fileName}</p>
        )}
        {!deps && <p className="text-2xs font-mono text-warning" role="alert">Export is unavailable: the media engine did not start.</p>}
      </div>

      <footer className="panel-footer h-11 p-1.5 gap-1.5">
        <button type="button" className="form-btn flex-1 rounded-none text-xs" onClick={cancel}>
          {running ? 'Cancel export' : 'Close'}
        </button>
        {status.kind === 'done' ? (
          <a className="form-btn form-btn-primary flex-1 rounded-none text-xs flex items-center justify-center" href={status.url} download={status.fileName}>
            Download
          </a>
        ) : (
          <button type="button" className="form-btn form-btn-primary flex-1 rounded-none text-xs" disabled={running || !deps || !size} onClick={() => void start()}>
            {running ? 'Exporting…' : 'Start export'}
          </button>
        )}
      </footer>
    </Modal>
  );
};

export default ExportDialog;
