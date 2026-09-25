// ─── Kollektiv Image Editor — Autosave Service ─────────────────────────────
// Persists the current EditorDocument to IndexedDB (via idb) so an
// interrupted session can be recovered on next load. Pure engine module —
// zero React imports. ImageBitmap pixel data cannot be structured-cloned
// into IDB, so each ImageLayer's bitmap is re-encoded losslessly (PNG) on
// save and decoded back to an ImageBitmap on restore (review C3: JPEG
// destroyed alpha — transparent pixels came back opaque black).

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
  LayerMask,
  LayerTransform,
} from '../types';
import { getSnapshot, subscribe } from '../store';

const DB_NAME = 'kollektiv-editor-autosave';
const DB_VERSION = 2; // v2: PNG blobs + serialized masks (was JPEG, no masks)
const STORE_NAME = 'documents';
const AUTOSAVE_KEY = 'current';
const AUTOSAVE_DEBOUNCE_MS = 2000;

/** Bump whenever SerializedLayer/AutosaveRecord changes shape. Records with a
 *  lower version are discarded on restore instead of misdecoded — a restore
 *  from an incompatible format must never hand the user corrupt pixels. */
const AUTOSAVE_FORMAT_VERSION = 2;

// ─── Serialized layer shapes ────────────────────────────────────────────────
// Mirrors `Layer` minus non-serializable `ImageBitmap` fields (layer.bitmap,
// layer.mask.bitmap). Layer masks ARE serialized (review C3: they were dropped
// because the old comment predated the mask producer that now exists).

interface SerializedLayerBase {
  id: string;
  name: string;
  transform: LayerTransform;
  opacity: number;
  blendMode: BlendMode;
  visible: boolean;
  locked?: boolean;
}

/** A mask minus its bitmap — the bitmap rides in layerBlobs under `${id}::mask`. */
interface SerializedMask {
  enabled: boolean;
  invert: boolean;
  feather: number;
}

interface SerializedImageLayer extends SerializedLayerBase {
  type: 'image';
  intrinsicWidth: number;
  intrinsicHeight: number;
  mask?: SerializedMask;
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
  formatVersion: number;
  metadata: AutosaveMetadata;
  layerTree: SerializedLayer[];
  /** layerId → PNG-encoded ArrayBuffer ('image' layers), `${layerId}::mask` →
   *  mask bitmap buffers. Lossless on purpose: transparent pixels must survive
   *  the round trip (review C3). */
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

async function bitmapToLosslessBuffer(bitmap: ImageBitmap): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for autosave encoding');
  ctx.drawImage(bitmap, 0, 0);
  // PNG, not JPEG: JPEG has no alpha channel, so transparent pixels round-trip
  // as opaque black — silent data loss inside the data-loss-prevention feature
  // (review C3). PNG is lossless; the extra bytes are the cost of correctness.
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

async function serializeLayer(layer: Layer, blobs: Record<string, ArrayBuffer>): Promise<SerializedLayer> {
  const base = serializedBase(layer);
  switch (layer.type) {
    case 'image': {
      blobs[layer.id] = await bitmapToLosslessBuffer(layer.bitmap);
      const meta: SerializedImageLayer = {
        ...base,
        type: 'image',
        intrinsicWidth: layer.intrinsicWidth,
        intrinsicHeight: layer.intrinsicHeight,
      };
      if (layer.mask) {
        // Serialize the mask bitmap alongside the layer bitmap (review C3 —
        // masks were silently dropped). Flags travel on the layer meta.
        blobs[`${layer.id}::mask`] = await bitmapToLosslessBuffer(layer.mask.bitmap);
        meta.mask = { enabled: layer.mask.enabled, invert: layer.mask.invert, feather: layer.mask.feather };
      }
      return meta;
    }
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
      const bitmap = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
      const layer: ImageLayer = {
        ...base,
        type: 'image',
        bitmap,
        intrinsicWidth: meta.intrinsicWidth,
        intrinsicHeight: meta.intrinsicHeight,
      };
      if (meta.mask) {
        const maskBuf = blobs[`${meta.id}::mask`];
        if (maskBuf) {
          const maskBitmap = await createImageBitmap(new Blob([maskBuf], { type: 'image/png' }));
          layer.mask = {
            bitmap: maskBitmap,
            enabled: meta.mask.enabled,
            invert: meta.mask.invert,
            feather: meta.mask.feather,
          } as ImageLayer['mask'] as LayerMask;
        }
        // A missing mask blob for a masked layer is corrupt — drop the mask
        // rather than restoring a fully-opaque (visually mask-removed) layer.
      }
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
  const record: AutosaveRecord = { formatVersion: AUTOSAVE_FORMAT_VERSION, metadata, layerTree, layerBlobs };
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
 * their stored lossless (PNG) bytes. Returns null on any error, including a
 * record written by an older format version (review C3: old JPEG-alpha-losing
 * records are discarded, not misdecoded — restoring them would hand the user
 * black transparent pixels; the debounce immediately writes a fresh record).
 */
export async function restoreSavedDocument(): Promise<EditorDocument | null> {
  try {
    const db = await getDB();
    const record = (await db.get(STORE_NAME, AUTOSAVE_KEY)) as AutosaveRecord | undefined;
    if (!record) return null;
    if (record.formatVersion !== AUTOSAVE_FORMAT_VERSION) {
      console.warn(`Discarding autosave with format version ${record.formatVersion} (expected ${AUTOSAVE_FORMAT_VERSION})`);
      await clearSavedDocument();
      return null;
    }
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
