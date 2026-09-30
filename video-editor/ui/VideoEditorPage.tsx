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
import { listProjects, loadProject, startAutosave, type ProjectSummary } from '../core/autosave';
import EditorToolbar from './EditorToolbar';
import MediaBin from './MediaBin';
import Preview from './Preview';
import Inspector from './Inspector';
import ExportDialog from './ExportDialog';
import ProjectList from './projects/ProjectList';
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

interface NewProjectPanelProps {
  onCreate: (name: string, width: number, height: number) => void;
  recent: ProjectSummary | null;
  onResume: (id: string) => void;
  onError: (message: string) => void;
}

// Same layout contract as the image editor's NewDocumentModal: one 16px gutter (matches the header)
// for every section, standard 40px controls (form-input / form-btn, no h-/px-
// overrides — those classes are unlayered and beat utilities), equal-height cards.
const FIELD_LABEL = 'text-2xs font-mono uppercase tracking-widest text-base-content/60';
const GLYPH_BOX = 28;

const NewProjectPanel: React.FC<NewProjectPanelProps> = ({ onCreate, recent, onResume, onError }) => {
  const [name, setName] = useState('Untitled project');
  const [presetIndex, setPresetIndex] = useState(0);
  const preset = PROJECT_PRESETS[presetIndex];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 bg-base-100 overflow-y-auto">
      <form
        className="w-full max-w-md bg-base-200/60 border border-base-content/10"
        aria-label="New project"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name, preset.width, preset.height);
        }}
      >
        <header className="panel-header flex items-center h-9 px-4">
          <h2 className="flex items-center text-xs font-display uppercase tracking-widest text-base-content/80">New project</h2>
        </header>

        <div className="p-4 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-project-name" className={FIELD_LABEL}>Name</label>
            <input id="new-project-name" className="form-input w-full" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <span id="new-project-format" className={FIELD_LABEL}>Format</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="new-project-format">
              {PROJECT_PRESETS.map((p, i) => (
                <button key={p.label} type="button" role="radio" aria-checked={i === presetIndex}
                  className={`h-28 px-1 py-0 flex flex-col items-center justify-center gap-2 border transition-colors ${i === presetIndex ? 'border-primary text-primary bg-primary/10' : 'border-base-content/15 text-base-content/70 hover:border-base-content/40 hover:text-base-content'}`}
                  onClick={() => setPresetIndex(i)}>
                  {/* Fixed glyph box keeps the labels on one line across cards; the glyph is drawn to the preset's proportions. */}
                  <span className="flex items-center justify-center" style={{ width: GLYPH_BOX, height: GLYPH_BOX }}>
                    <span className="border border-current" style={{ width: (p.width / Math.max(p.width, p.height)) * GLYPH_BOX, height: (p.height / Math.max(p.width, p.height)) * GLYPH_BOX }} />
                  </span>
                  <span className="text-2xs font-mono tracking-wider uppercase whitespace-nowrap">{p.label}</span>
                  <span className="text-2xs font-mono tracking-wider text-base-content/60">{p.width}×{p.height}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-2xs font-mono text-base-content/60">{DEFAULT_FPS} fps · tracks: Video 1, Video 2, Audio 1, Text 1</p>
        </div>

        <div className="flex gap-3 px-4 py-4 border-t border-base-content/10">
          {recent && (
            <button type="button" className="form-btn flex-1 min-w-0" onClick={() => onResume(recent.id)}>
              <span className="truncate">Resume {recent.name}</span>
            </button>
          )}
          <button type="submit" className="form-btn form-btn-primary flex-1">Create project</button>
        </div>
      </form>
      {recent && (
        <div className="w-full max-w-md">
          <ProjectList onOpen={onResume} onError={onError} />
        </div>
      )}
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
  const [recent, setRecent] = useState<ProjectSummary | null>(null);

  // Autosave while the editor is open; stopping flushes any pending save.
  useEffect(() => startAutosave({ onError: (err) => reportError(`Autosave failed: ${errorMessage(err)}`) }), [reportError]);

  // Most recently saved project, offered on the New Project panel.
  useEffect(() => {
    if (hasProject) return;
    let cancelled = false;
    listProjects()
      .then(list => { if (!cancelled) setRecent(list[0] ?? null); })
      .catch(() => { /* IDB unavailable: just no resume option */ });
    return () => { cancelled = true; };
  }, [hasProject]);

  const openSaved = useCallback(async (id: string) => {
    try {
      const project = await loadProject(id);
      if (project) dispatch({ type: 'loadProject', project });
      else reportError('That video project no longer exists.');
    } catch (err) {
      reportError(`Couldn't open project: ${errorMessage(err)}`);
    }
  }, [reportError]);

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
      void openSaved(openPayload.projectId);
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
  }, [openPayload, core, importFiles, reportError, openSaved]);

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
      <EditorToolbar onExport={() => setIsExportOpen(true)} onError={reportError} />

      {!hasProject ? (
        <NewProjectPanel onCreate={createProject} recent={recent} onResume={(id) => void openSaved(id)} onError={reportError} />
      ) : (
        <>
          <div className="flex-1 flex flex-row min-h-0">
            <MediaBin
              onImport={core.media ? (files) => void importFiles(files.map(f => ({ blob: f, name: f.name }))) : null}
              onError={reportError}
            />
            <Preview canvasRef={canvasRef} playback={playback} error={previewError} />
            <Inspector onError={reportError} scopeSource={canvasRef} />
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
