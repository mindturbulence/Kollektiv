// ─── Kollektiv Video Editor — Page Entry Point ───────────────────────────────
// Owns the engine lifecycle: media engine + compositor on mount (import needs
// them before any canvas exists), renderer + playback once the preview canvas
// mounts. Every factory call is guarded so a failing engine degrades to an
// error state instead of crashing the tab. The store is module-scoped and is
// deliberately NOT reset on unmount, so switching tabs keeps the project.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { dispatch, getSnapshot } from '../core/store';
import { createMediaEngine } from '../core/media';
import { createRenderer } from '../core/render';
import { createCompositor, createPlaybackController } from '../core/playback';
import type { Compositor, MediaEngine, PlaybackController, Renderer, VideoEditorOpenPayload } from '../core/types';
import { useEditorSelector } from './hooks/useEditorState';
import { PROJECT_PRESETS, DEFAULT_FPS, createDefaultProject } from './placement';
import { importMediaFiles } from './importMedia';
import EditorToolbar from './EditorToolbar';
import MediaBin from './MediaBin';
import Preview from './Preview';
import Inspector from './Inspector';
import ExportDialog from './ExportDialog';
import Timeline from './timeline/Timeline';

export interface VideoEditorPageProps {
  openPayload?: VideoEditorOpenPayload;
  showGlobalFeedback?: (message: string, isError?: boolean) => void;
  isExiting?: boolean;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface CoreEngines {
  media: MediaEngine | null;
  compositor: Compositor | null;
  error: string | null;
}

const NewProjectPanel: React.FC<{ onCreate: (name: string, width: number, height: number) => void }> = ({ onCreate }) => {
  const [name, setName] = useState('Untitled project');
  const [presetIndex, setPresetIndex] = useState(0);
  const preset = PROJECT_PRESETS[presetIndex];

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-base-100">
      <form
        className="w-full max-w-md bg-base-200/60 border border-base-content/10"
        aria-label="New project"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name, preset.width, preset.height);
        }}
      >
        <header className="panel-header h-9 px-4 flex items-center">
          <h2 className="text-xs font-display uppercase tracking-widest text-base-content/80">New project</h2>
        </header>
        <div className="p-4 space-y-4">
          <label className="block">
            <span className="text-2xs font-mono text-base-content/60 uppercase tracking-widest">Name</span>
            <input className="mt-1.5 w-full bg-base-100 border border-base-content/10 px-2 h-8 text-sm outline-none focus:border-primary/60"
              value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div>
            <p className="text-2xs font-mono text-base-content/60 uppercase tracking-widest mb-2">Format</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Format">
              {PROJECT_PRESETS.map((p, i) => (
                <button key={p.label} type="button" role="radio" aria-checked={i === presetIndex}
                  className={`flex flex-col items-center gap-2 py-3 border ${i === presetIndex ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60 hover:border-base-content/40'}`}
                  onClick={() => setPresetIndex(i)}>
                  {/* Aspect glyph drawn to the preset's own proportions. */}
                  <span className="border border-current" style={{ width: (p.width / Math.max(p.width, p.height)) * 28, height: (p.height / Math.max(p.width, p.height)) * 28 }} />
                  <span className="text-2xs font-mono uppercase">{p.label}</span>
                  <span className="text-2xs font-mono text-base-content/60">{p.width}×{p.height}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-2xs font-mono text-base-content/60">{DEFAULT_FPS} fps · tracks: Video 1, Video 2, Audio 1, Text 1</p>
        </div>
        <footer className="panel-footer h-11 p-1.5">
          <button type="submit" className="form-btn form-btn-primary flex-1 rounded-none">Create project</button>
        </footer>
      </form>
    </div>
  );
};

const VideoEditorPage: React.FC<VideoEditorPageProps> = ({ openPayload, showGlobalFeedback, isExiting }) => {
  const hasProject = useEditorSelector(s => s.project !== null);
  const width = useEditorSelector(s => s.project?.settings.width);
  const height = useEditorSelector(s => s.project?.settings.height);

  const [core, setCore] = useState<CoreEngines>({ media: null, compositor: null, error: null });
  const [playback, setPlayback] = useState<PlaybackController | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const payloadHandledRef = useRef(false);

  const reportError = useCallback((message: string) => showGlobalFeedback?.(message, true), [showGlobalFeedback]);

  // Media engine + compositor: page lifetime.
  useEffect(() => {
    let media: MediaEngine | null = null;
    try {
      media = createMediaEngine();
      const compositor = createCompositor(media);
      setCore({ media, compositor, error: null });
    } catch (err) {
      setCore({ media, compositor: null, error: errorMessage(err) });
    }
    return () => {
      media?.dispose();
      setCore({ media: null, compositor: null, error: null });
    };
  }, []);

  // Renderer + playback: lifetime of the preview canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!hasProject || !canvas) return;
    if (!core.media || !core.compositor) {
      setPreviewError(core.error ?? 'media engine unavailable');
      return;
    }
    let renderer: Renderer | null = null;
    let controller: PlaybackController | null = null;
    try {
      renderer = createRenderer(canvas);
      controller = createPlaybackController({ media: core.media, renderer, compositor: core.compositor });
      rendererRef.current = renderer;
      setPlayback(controller);
      setPreviewError(null);
    } catch (err) {
      renderer?.dispose();
      renderer = null;
      setPreviewError(errorMessage(err));
    }
    return () => {
      controller?.dispose();
      renderer?.dispose();
      rendererRef.current = null;
      setPlayback(null);
    };
  }, [hasProject, core]);

  // Keep the canvas backing store at project resolution.
  useEffect(() => {
    if (!width || !height || !rendererRef.current) return;
    rendererRef.current.resize(width, height);
    playback?.refresh();
  }, [width, height, playback]);

  const importFiles = useCallback(async (files: Array<{ blob: Blob; name: string }>) => {
    if (!core.media) return;
    const { failed } = await importMediaFiles(core.media, files);
    for (const f of failed) reportError(`Couldn't import ${f.name}: ${f.error}`);
  }, [core.media, reportError]);

  // One-shot open instruction from elsewhere in Kollektiv.
  useEffect(() => {
    if (!openPayload || payloadHandledRef.current) return;
    if (openPayload.kind === 'project') {
      payloadHandledRef.current = true;
      reportError('Opening saved video projects is not available yet.');
      return;
    }
    if (!core.media) {
      if (core.error) {
        payloadHandledRef.current = true;
        reportError(`Couldn't import files: ${core.error}`);
      }
      return;
    }
    payloadHandledRef.current = true;
    // Edits are dropped without a project, so make one before importing.
    if (!getSnapshot().project) {
      const first = openPayload.files[0]?.name.replace(/\.[^.]+$/, '');
      const preset = PROJECT_PRESETS[0];
      dispatch({ type: 'loadProject', project: createDefaultProject(first || 'Untitled project', preset.width, preset.height) });
    }
    void importFiles(openPayload.files);
  }, [openPayload, core, importFiles, reportError]);

  // Space toggles playback unless focus is in a control that uses Space itself.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !playback) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName))) return;
      e.preventDefault();
      if (getSnapshot().isPlaying) playback.pause(); else playback.play();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playback]);

  const createProject = (name: string, w: number, h: number) =>
    dispatch({ type: 'loadProject', project: createDefaultProject(name, w, h) });

  return (
    <div className={`w-full h-full flex flex-col bg-base-100 overflow-hidden ${isExiting ? 'pointer-events-none opacity-0 transition-opacity duration-200' : ''}`}
      data-testid="ve-page">
      <EditorToolbar onExport={() => setIsExportOpen(true)} />

      {!hasProject ? (
        <NewProjectPanel onCreate={createProject} />
      ) : (
        <>
          <div className="flex-1 flex flex-row min-h-0">
            <MediaBin
              onImport={core.media ? (files) => void importFiles(files.map(f => ({ blob: f, name: f.name }))) : null}
              onError={reportError}
            />
            <Preview canvasRef={canvasRef} playback={playback} error={previewError} />
            <Inspector onError={reportError} />
          </div>
          <div className="h-64 flex-shrink-0 border-t border-base-content/5 min-h-0">
            <Timeline />
          </div>
        </>
      )}

      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        deps={core.media && core.compositor ? { media: core.media, compositor: core.compositor } : null}
        onError={reportError}
      />
    </div>
  );
};

export default VideoEditorPage;
