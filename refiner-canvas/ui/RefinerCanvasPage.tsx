// ─── Kollektiv Refiner Canvas — page ─────────────────────────────────────────
// xyflow in controlled mode over the framework-free store (refiner-canvas/core). The store is module-scoped
// and deliberately NOT reset on unmount, so switching tabs keeps the graph and its run states; IndexedDB is
// only read on the first mount of the session. One autosaved working graph (id 'working').

import '@xyflow/react/dist/style.css';
import './canvas.css';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type EdgeChange, type NodeChange, type Viewport,
} from '@xyflow/react';
import { useSettings } from '../../contexts/SettingsContext';
import { createEdge, createNode } from '../core/graph';
import { runGraph } from '../core/executor';
import { intakeToAction, takeIntakes } from '../core/intake';
import { listGraphs, loadGraph, saveGraph, type GraphSummary } from '../core/persistence';
import { isTemplateId, makeTemplate, TEMPLATE_PREFIX, templateToAction } from '../core/templates';
import {
  canRedo, canUndo, dispatch, getRunStates, getSnapshot, load, redo, setRunState, subscribe, undo,
} from '../core/store';
import { SCHEMA_VERSION, type EditAction, type Graph, type GraphNode, type NodeDataPatch, type XY } from '../core/types';
import { applySelection, connectAction, deleteAction, fromNodeChanges, toFlow, type CanvasFlowNode, type Size } from './flow';
import { Inspector } from './Inspector';
import { nodeTypes } from './nodes';
import { applyRunState, createRunners } from './runners';
import { completeWithSystem } from '../../services/llmService';
import { refineBeat } from '../../utils/refineBeat';
import { buildStoryboardPrompt, parseBriefs, storyboardToAction } from '../core/storyboard';

const WORKING_ID = 'working';
const WORKING_NAME = 'Working canvas';
const SAVE_DEBOUNCE_MS = 800;
const NOTICE_MS = 5000;
const NODE_HALF = { x: 104, y: 36 };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

let hydrated = false;
/** Set when the stored graph could not be read (corrupt or newer schema): autosave must not overwrite it. */
let autosaveBlocked = false;

function starterGraph(): Graph {
  const concept = createNode('concept', { x: 0, y: 40 });
  const shot = createNode('shot', { x: 320, y: 0 });
  return { schemaVersion: SCHEMA_VERSION, nodes: [concept, shot], edges: [createEdge(concept.id, shot.id)], viewport: { x: 60, y: 60, zoom: 1 } };
}

const ADDABLE: { label: string; make: (position: XY) => GraphNode }[] = [
  { label: 'Concept', make: p => createNode('concept', p) },
  { label: 'Preset', make: p => createNode('preset', p) },
  { label: 'Shot', make: p => createNode('shot', p) },
  { label: 'Audio', make: p => createNode('audio', p) },
  { label: 'Generate', make: p => createNode('generate', p) },
  { label: 'Result', make: p => createNode('result', p) },
];

const EMPTY_SET: ReadonlySet<string> = new Set();
const DELETE_KEYS = ['Backspace', 'Delete'];

function CanvasBody() {
  const { settings } = useSettings();
  const { screenToFlowPosition } = useReactFlow();
  const graph = useSyncExternalStore(subscribe, getSnapshot);
  const runStates = useSyncExternalStore(subscribe, getRunStates);

  const [ready, setReady] = useState(hydrated);
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [measured, setMeasured] = useState<Record<string, Size>>({});
  const [resizing, setResizing] = useState<Record<string, Size>>({});
  const dragRef = useRef(dragPositions);
  dragRef.current = dragPositions;
  const [running, setRunning] = useState(false);
  const [templates, setTemplates] = useState<GraphSummary[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const say = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  // Hydrate once per session. Missing graph -> starter; unreadable graph -> starter in memory, autosave off.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    loadGraph(WORKING_ID)
      .then(record => load(record ? record.graph : starterGraph()))
      .catch((err: unknown) => {
        autosaveBlocked = true;
        load(starterGraph());
        if (!cancelled) say(`Saved canvas could not be loaded (${message(err)}). Autosave is off so it is not overwritten.`, true);
      })
      .finally(() => {
        if (cancelled) return;
        hydrated = true;
        setReady(true);
      });
    return () => { cancelled = true; };
  }, [say]);

  // Results sent from the Refiner while this page was closed (or not yet loaded) arrive here once, after hydration.
  useEffect(() => {
    if (!ready) return;
    const action = intakeToAction(getSnapshot(), takeIntakes());
    if (action) dispatch(action);
  }, [ready]);

  // Debounced autosave on every graph change (not on run-state changes); flushed on unmount.
  useEffect(() => {
    if (!ready) return;
    let last = getSnapshot();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      timer = undefined;
      if (autosaveBlocked) return;
      saveGraph(WORKING_ID, WORKING_NAME, getSnapshot()).catch((err: unknown) => say(`Autosave failed: ${message(err)}`, true));
    };
    const unsubscribe = subscribe(() => {
      const next = getSnapshot();
      if (next === last) return;
      last = next;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(save, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) {
        clearTimeout(timer);
        save();
      }
    };
  }, [ready, say]);

  const refreshTemplates = useCallback(() => {
    listGraphs().then(all => setTemplates(all.filter(g => isTemplateId(g.id)))).catch(() => setTemplates([]));
  }, []);
  useEffect(() => { if (ready) refreshTemplates(); }, [ready, refreshTemplates]);

  const saveTemplate = useCallback(() => {
    const name = templateName.trim();
    if (!name) { say('Name the template first.', true); return; }
    saveGraph(`${TEMPLATE_PREFIX}${crypto.randomUUID()}`, name, makeTemplate(getSnapshot()))
      .then(() => { setTemplateName(''); refreshTemplates(); say(`Saved template "${name}".`); })
      .catch((err: unknown) => say(`Could not save template: ${message(err)}`, true));
  }, [templateName, say, refreshTemplates]);

  const addTemplate = useCallback((id: string) => {
    if (!id) return;
    loadGraph(id)
      .then(record => {
        if (record) dispatch(templateToAction(getSnapshot(), record.graph));
        else say('Template not found.', true);
      })
      .catch((err: unknown) => say(`Could not load template: ${message(err)}`, true));
  }, [say]);

  const flow = useMemo(
    () => toFlow(graph, runStates, { selected, positions: dragPositions, measured, resizing }),
    [graph, runStates, selected, dragPositions, measured, resizing],
  );

  const selectedNode = useMemo(() => {
    const picked = graph.nodes.filter(n => selected.has(n.id));
    return picked.length === 1 ? picked[0] : null;
  }, [graph, selected]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    setSelected(prev => applySelection(prev, changes));
    const { positions, measured: sizes, resizing: live, resized } = fromNodeChanges(changes);
    if (Object.keys(positions).length) setDragPositions(prev => ({ ...prev, ...positions }));
    if (Object.keys(sizes).length) setMeasured(prev => ({ ...prev, ...sizes }));
    if (Object.keys(live).length) setResizing(prev => ({ ...prev, ...live }));
    const ended = Object.keys(resized);
    if (ended.length) {
      // One undo step per resize: the new size plus the position change a top / left handle causes.
      const moved: Record<string, { x: number; y: number }> = {};
      for (const id of ended) {
        const at = positions[id] ?? dragRef.current[id];
        if (at) moved[id] = at;
      }
      dispatch({
        type: 'batch',
        label: 'resize',
        actions: [
          ...ended.map((nodeId): EditAction => ({ type: 'resizeNode', nodeId, size: resized[nodeId] })),
          ...(Object.keys(moved).length ? [{ type: 'moveNodes' as const, positions: moved }] : []),
        ],
      });
      setResizing(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !resized[id])));
      setDragPositions(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !resized[id])));
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setSelected(prev => applySelection(prev, changes));
  }, []);

  const onNodeDragStop = useCallback((_e: unknown, _node: unknown, dragged: CanvasFlowNode[]) => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of dragged) positions[n.id] = { x: n.position.x, y: n.position.y };
    dispatch({ type: 'moveNodes', positions });
    setDragPositions({});
  }, []);

  const onConnect = useCallback((conn: Connection) => {
    const action = connectAction(conn);
    if (!action) return;
    const before = getSnapshot();
    dispatch(action);
    if (getSnapshot() === before) say('Connection rejected: it would create a cycle or duplicate an existing link.', true);
  }, [say]);

  const onDelete = useCallback(({ nodes, edges }: { nodes: CanvasFlowNode[]; edges: { id: string }[] }) => {
    dispatch(deleteAction(nodes.map(n => n.id), edges.map(e => e.id)));
  }, []);

  const onMoveEnd = useCallback((_e: unknown, viewport: Viewport) => {
    dispatch({ type: 'setViewport', viewport });
  }, []);

  const addNode = useCallback((make: (typeof ADDABLE)[number]['make']) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const centre = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    const node = make({ x: centre.x - NODE_HALF.x, y: centre.y - NODE_HALF.y });
    dispatch({ type: 'addNode', node });
    setSelected(new Set([node.id]));
  }, [screenToFlowPosition]);

  const run = useCallback(async (only?: string[]) => {
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    try {
      await runGraph(getSnapshot(), {
        runners: createRunners(settings),
        only,
        states: getRunStates(),
        signal: controller.signal,
        onState: (id, state) => applyRunState(getSnapshot(), id, state, dispatch, setRunState),
      });
    } catch (err) {
      say(`Run failed: ${message(err)}`, true);
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, [settings, say]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    dispatch({ type: 'batch', label: 'clear', actions: getSnapshot().nodes.map(n => ({ type: 'removeNode', nodeId: n.id })) });
    setSelected(EMPTY_SET);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const t = e.target;
    // Native text undo wins inside fields.
    if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    } else if (key === 'y') {
      e.preventDefault();
      redo();
    }
  }, []);

  if (!ready) {
    return <div className="flex h-full w-full items-center justify-center text-sm text-base-content/60">Loading canvas…</div>;
  }

  const btn = 'btn btn-xs rounded-none';
  return (
    <div className="flex h-full w-full min-h-0 bg-base-100 text-base-content" onKeyDown={onKeyDown}>
      <div ref={wrapRef} className="relative min-w-0 flex-1" tabIndex={-1}>
        <div className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-1 border border-base-content/20 bg-base-100 p-1">
          {ADDABLE.map(a => (
            <button key={a.label} type="button" className={`${btn} btn-ghost`} onClick={() => addNode(a.make)}>+ {a.label}</button>
          ))}
          <span className="mx-1 h-4 w-px bg-base-content/20" />
          <button type="button" className={`${btn} btn-ghost`} disabled={!canUndo()} onClick={() => undo()}>Undo</button>
          <button type="button" className={`${btn} btn-ghost`} disabled={!canRedo()} onClick={() => redo()}>Redo</button>
          <span className="mx-1 h-4 w-px bg-base-content/20" />
          <button type="button" className={`${btn} btn-primary`} disabled={running || graph.nodes.length === 0} onClick={() => void run()}>Run</button>
          <button type="button" className={`${btn} btn-ghost`} disabled={!running} onClick={stop}>Stop</button>
          <button type="button" className={`${btn} btn-ghost`} disabled={graph.nodes.length === 0} onClick={clear}>Clear</button>
          <span className="mx-1 h-4 w-px bg-base-content/20" />
          <input
            type="text"
            aria-label="Template name"
            placeholder="Template name"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            className="nodrag h-6 w-28 rounded-none border border-base-content/25 bg-base-100 px-1 text-xs"
          />
          <button type="button" className={`${btn} btn-ghost`} disabled={graph.nodes.length === 0} onClick={saveTemplate}>Save template</button>
          <select
            aria-label="Add template"
            className="h-6 rounded-none border border-base-content/25 bg-base-100 px-1 text-xs"
            value=""
            onChange={e => addTemplate(e.target.value)}
          >
            <option value="">Add template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {notice && (
          <div role="status" className={`absolute bottom-3 left-1/2 z-10 max-w-md -translate-x-1/2 border bg-base-100 px-3 py-1.5 text-xs ${notice.error ? 'border-error text-error' : 'border-primary text-base-content'}`}>
            {notice.text}
          </div>
        )}
        <ReactFlow
          className="rf-canvas"
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onDelete={onDelete}
          onMoveEnd={onMoveEnd}
          defaultViewport={graph.viewport}
          deleteKeyCode={DELETE_KEYS}
          onlyRenderVisibleElements
          minZoom={0.2}
          maxZoom={2}
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {selectedNode && (
        <Inspector
          key={selectedNode.id}
          node={selectedNode}
          run={runStates.get(selectedNode.id) ?? { status: 'idle' }}
          running={running}
          onUpdate={(patch: NodeDataPatch) => dispatch({ type: 'updateNodeData', nodeId: selectedNode.id, patch })}
          onRun={() => void run([selectedNode.id])}
          onStoryboard={selectedNode.kind === 'concept' ? async count => {
            const { system, user } = buildStoryboardPrompt(selectedNode.data.text, count);
            const briefs = parseBriefs(await completeWithSystem(system, user, settings), count);
            const g = getSnapshot();
            const sibling = g.nodes.find(n => n.kind === 'shot' && g.edges.some(e => e.source === selectedNode.id && e.target === n.id));
            const action = storyboardToAction(g, selectedNode.id, briefs, {
              model: sibling?.kind === 'shot' ? sibling.data.model : '',
              durationSec: sibling?.kind === 'shot' ? sibling.data.durationSec : 5,
            });
            if (!action) throw new Error('The model returned no shots. Try again.');
            dispatch(action);
          } : undefined}
          onRefineBeat={selectedNode.kind === 'shot' ? async (index, instruction) => {
            const text = await refineBeat(selectedNode.data.text, index, instruction, (sys, user) => completeWithSystem(sys, user, settings));
            dispatch({ type: 'updateNodeData', nodeId: selectedNode.id, patch: { text, edited: true } });
          } : undefined}
        />
      )}
    </div>
  );
}

const RefinerCanvasPage: React.FC = () => (
  <ReactFlowProvider>
    <CanvasBody />
  </ReactFlowProvider>
);

export default RefinerCanvasPage;
