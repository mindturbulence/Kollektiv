// ─── Kollektiv Image Editor — Autosave Service ─────────────────────────────
// Persists the current EditorDocument to IndexedDB (via idb) so an
// interrupted session can be recovered on next load. Pure engine module —
// zero React imports. ImageBitmap pixel data cannot be structured-cloned
// into IDB, so each ImageLayer's bitmap is re-encoded to a JPEG ArrayBuffer
// on save and decoded back to an ImageBitmap on restore.

import { openDB, type IDBPDatabase } from 'idb';
import type {
  AdjustmentDef,
  BlendMode,
  EditorDocument,
  ImageLayer,
  GroupLayer,
  AdjustmentLayer,
  ShapeLayer,
  TextLayer,
  Layer,
  LayerTransform,
} from '../types';
import { getSnapshot, subscribe } from '../store';

const DB_NAME = 'kollektiv-editor-autosave';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const AUTOSAVE_KEY = 'current';
const AUTOSAVE_DEBOUNCE_MS = 2000;
const AUTOSAVE_JPEG_QUALITY = 0.85;

// ─── Serialized layer shapes ────────────────────────────────────────────────
// Mirrors `Layer` minus non-serializable `ImageBitmap` fields (layer.bitmap,
// layer.mask.bitmap). Masks are a V2 stub with no current producer, so they
// are dropped rather than serialized.

interface SerializedLayerBase {
  id: string;
  name: string;
  transform: LayerTransform;
  opacity: number;
  blendMode: BlendMode;
  visible: boolean;
  locked?: boolean;
}

interface SerializedImageLayer extends SerializedLayerBase {
  type: 'image';
  intrinsicWidth: number;
  intrinsicHeight: number;
}

interface SerializedGroupLayer extends SerializedLayerBase {
  type: 'group';
  children: SerializedLayer[];
}

interface SerializedAdjustmentLayer extends SerializedLayerBase {
  type: 'adjustment';
  adjustment: AdjustmentDef;
}

interface SerializedShapeLayer extends SerializedLayerBase {
  type: 'shape';
  shape: 'rect' | 'ellipse';
  fill: string;
  stroke?: { color: string; width: number };
}

interface SerializedTextLayer extends SerializedLayerBase {
  type: 'text';
  text: string;
  font: { family: string; size: number; weight: number };
  color: string;
}

type SerializedLayer =
  | SerializedImageLayer
  | SerializedGroupLayer
  | SerializedAdjustmentLayer
  | SerializedShapeLayer
  | SerializedTextLayer;

type AutosaveMetadata = Omit<EditorDocument, 'layers'>;

interface AutosaveRecord {
  metadata: AutosaveMetadata;
  layerTree: SerializedLayer[];
  /** layerId → JPEG-encoded ArrayBuffer, for 'image' layers only. */
  layerBlobs: Record<string, ArrayBuffer>;
}

function serializedBase(layer: Layer): SerializedLayerBase {
  const base: SerializedLayerBase = {
    id: layer.id,
    name: layer.name,
    transform: layer.transform,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    visible: layer.visible,
  };
  if (layer.locked !== undefined) base.locked = layer.locked;
  return base;
}

function deserializedBase(meta: SerializedLayer): SerializedLayerBase {
  const base: SerializedLayerBase = {
    id: meta.id,
    name: meta.name,
    transform: meta.transform,
    opacity: meta.opacity,
    blendMode: meta.blendMode,
    visible: meta.visible,
  };
  if (meta.locked !== undefined) base.locked = meta.locked;
  return base;
}

async function bitmapToJpegBuffer(bitmap: ImageBitmap): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for autosave encoding');
  ctx.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: AUTOSAVE_JPEG_QUALITY });
  return blob.arrayBuffer();
}

async function serializeLayer(layer: Layer, blobs: Record<string, ArrayBuffer>): Promise<SerializedLayer> {
  const base = serializedBase(layer);
  switch (layer.type) {
    case 'image':
      blobs[layer.id] = await bitmapToJpegBuffer(layer.bitmap);
      return { ...base, type: 'image', intrinsicWidth: layer.intrinsicWidth, intrinsicHeight: layer.intrinsicHeight };
    case 'group':
      return { ...base, type: 'group', children: await Promise.all(layer.children.map((child) => serializeLayer(child, blobs))) };
    case 'adjustment':
      return { ...base, type: 'adjustment', adjustment: layer.adjustment };
    case 'shape':
      return {
        ...base,
        type: 'shape',
        shape: layer.shape,
        fill: layer.fill,
        ...(layer.stroke ? { stroke: layer.stroke } : {}),
      };
    case 'text':
      return { ...base, type: 'text', text: layer.text, font: layer.font, color: layer.color };
  }
}

async function deserializeLayer(meta: SerializedLayer, blobs: Record<string, ArrayBuffer>): Promise<Layer> {
  const base = deserializedBase(meta);
  switch (meta.type) {
    case 'image': {
      const buf = blobs[meta.id];
      if (!buf) throw new Error(`Autosave record missing blob for image layer ${meta.id}`);
      const bitmap = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' }));
      const layer: ImageLayer = {
        ...base,
        type: 'image',
        bitmap,
        intrinsicWidth: meta.intrinsicWidth,
        intrinsicHeight: meta.intrinsicHeight,
      };
      return layer;
    }
    case 'group': {
      const layer: GroupLayer = {
        ...base,
        type: 'group',
        children: await Promise.all(meta.children.map((child) => deserializeLayer(child, blobs))),
      };
      return layer;
    }
    case 'adjustment': {
      const layer: AdjustmentLayer = { ...base, type: 'adjustment', adjustment: meta.adjustment };
      return layer;
    }
    case 'shape': {
      const layer: ShapeLayer = {
        ...base,
        type: 'shape',
        shape: meta.shape,
        fill: meta.fill,
        ...(meta.stroke ? { stroke: meta.stroke } : {}),
      };
      return layer;
    }
    case 'text': {
      const layer: TextLayer = { ...base, type: 'text', text: meta.text, font: meta.font, color: meta.color };
      return layer;
    }
  }
}

// ─── IDB access ──────────────────────────────────────────────────────────────

function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME);
    },
  });
}

async function saveDocument(doc: EditorDocument): Promise<void> {
  const { layers, ...metadata } = doc;
  const layerBlobs: Record<string, ArrayBuffer> = {};
  const layerTree = await Promise.all(layers.map((layer) => serializeLayer(layer, layerBlobs)));
  const record: AutosaveRecord = { metadata, layerTree, layerBlobs };
  const db = await getDB();
  await db.put(STORE_NAME, record, AUTOSAVE_KEY);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Subscribes to EditorStore mutations and debounce-saves the current document
 * to IDB 2s after the last change, whenever the document is dirty.
 * Returns an unsubscribe/cleanup function.
 */
export function startAutosave(): () => void {
  let saveHandle: number | undefined;

  const schedSave = () => {
    clearTimeout(saveHandle);
    saveHandle = window.setTimeout(() => {
      const { document: doc, isDirty } = getSnapshot();
      if (!doc || !isDirty) return;
      saveDocument(doc).catch(console.error);
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const unsub = subscribe(schedSave);
  return () => {
    unsub();
    clearTimeout(saveHandle);
  };
}

/** Whether an autosaved document currently exists in IDB. */
export async function hasSavedDocument(): Promise<boolean> {
  try {
    const db = await getDB();
    const key = await db.getKey(STORE_NAME, AUTOSAVE_KEY);
    return key !== undefined;
  } catch {
    return false;
  }
}

/**
 * Reads and decodes the autosaved document, reassembling ImageBitmaps from
 * their stored JPEG bytes. Returns null on any error (corrupt/missing
 * autosave is dropped silently rather than surfaced as a hard failure).
 */
export async function restoreSavedDocument(): Promise<EditorDocument | null> {
  try {
    const db = await getDB();
    const record = (await db.get(STORE_NAME, AUTOSAVE_KEY)) as AutosaveRecord | undefined;
    if (!record) return null;
    const layers = await Promise.all(record.layerTree.map((meta) => deserializeLayer(meta, record.layerBlobs)));
    return { ...record.metadata, layers };
  } catch (err) {
    console.error('Failed to restore autosaved document:', err);
    return null;
  }
}

/** Deletes the autosaved document, e.g. after an explicit save or discard. */
export async function clearSavedDocument(): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, AUTOSAVE_KEY);
}
