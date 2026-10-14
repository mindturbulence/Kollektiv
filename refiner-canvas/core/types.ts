// ─── Kollektiv Refiner Canvas — core types ───────────────────────────────────
// Framework-free graph model for the node canvas (docs/plans/2026-10-14-video-canvas.md § 10).
// Same split as video-editor/core: pure data here, pure edits in apply.ts,
// a module-scoped store in store.ts, IDB persistence in persistence.ts.

export const SCHEMA_VERSION = 2;

export type NodeKind = 'concept' | 'preset' | 'shot' | 'audio' | 'generate' | 'result' | 'assemble';
export type PresetKind = 'character' | 'world' | 'style';
export type AudioMode = 'off' | 'auto' | 'direct';

export interface NodeDataMap {
  concept: { text: string };
  preset: { presetKind: PresetKind; text: string };
  shot: { model: string; durationSec: number; text: string; edited: boolean };
  audio: { mode: AudioMode; dialogue: string; sfx: string };
  generate: { model: string };
  result: Record<string, never>;
  assemble: Record<string, never>;
}

export interface XY { x: number; y: number }

/** Card size in canvas units. Width is always set once resized; height is optional (absent = fit the content). */
export interface NodeSize { width: number; height?: number }

/** Default, minimum and maximum card sizes. A new node is DEFAULT wide and as tall as its content. */
export const NODE_SIZE = { defaultWidth: 280, minWidth: 200, maxWidth: 720, minHeight: 96, maxHeight: 900 } as const;

export type GraphNodeOf<K extends NodeKind> = { id: string; kind: K; position: XY; data: NodeDataMap[K]; size?: NodeSize };
export type GraphNode = { [K in NodeKind]: GraphNodeOf<K> }[NodeKind];

/** Field names are disjoint or share a type across kinds, so one patch type covers all. apply.ts rejects
 *  a patch that adds a key the node's kind does not have. */
export type NodeDataPatch = Partial<NodeDataMap['concept'] & NodeDataMap['preset'] & NodeDataMap['shot'] & NodeDataMap['audio'] & NodeDataMap['generate']>;

/** source's output feeds target's input. No ports in v1. */
export interface GraphEdge { id: string; source: string; target: string }

export interface Viewport { x: number; y: number; zoom: number }

export interface Graph {
  schemaVersion: number;
  nodes: GraphNode[];
  /** Order matters: it is the input order a node's runner sees. */
  edges: GraphEdge[];
  viewport: Viewport;
}

export type EditAction =
  | { type: 'addNode'; node: GraphNode; index?: number }
  | { type: 'removeNode'; nodeId: string }
  | { type: 'moveNodes'; positions: Record<string, XY> }
  /** size null clears a manual size (back to default width, content height). */
  | { type: 'resizeNode'; nodeId: string; size: NodeSize | null }
  | { type: 'updateNodeData'; nodeId: string; patch: NodeDataPatch }
  | { type: 'connect'; edge: GraphEdge; index?: number }
  | { type: 'disconnect'; edgeId: string }
  | { type: 'setViewport'; viewport: Viewport }
  | { type: 'batch'; actions: EditAction[]; label: string };

export type NodeRunStatus = 'idle' | 'dirty' | 'running' | 'done' | 'error' | 'blocked';

export interface ClipRef { assetKey: string; durationSec?: number }

export interface NodeOutput {
  text?: string;
  clip?: ClipRef;
  /** Assemble's ordered clip list. */
  clips?: ClipRef[];
}

export interface NodeRunState { status: NodeRunStatus; output?: NodeOutput; error?: string }
