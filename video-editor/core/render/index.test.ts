import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFilter, createRenderer, createPreferredRenderer } from './index';
import type { ComposedFrame, Effect, RenderLayer, Transform } from '../types';
import { DEFAULT_TRANSFORM } from '../types';
import { COLOR_GRADE, CHROMA_KEY, encodeColorGrading, encodeChromaKey } from '../effect-params';

/** Records every method call and property assignment made on the fake 2D
 *  context, so tests can assert draw-call sequences without a real Canvas2D
 *  implementation (jsdom has none). */
function createRecordingContext() {
  const calls: string[] = [];
  const target: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.map((a) => JSON.stringify(a)).join(',')})`);
      };
    },
    set(obj, prop: string, value) {
      obj[prop] = value;
      calls.push(`set:${prop}=${JSON.stringify(value)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function fakeCanvas(ctx: CanvasRenderingContext2D, width = 1920, height = 1080) {
  return {
    width,
    height,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

function bitmapLayer(overrides: Partial<Transform> = {}, effects: Effect[] = []): RenderLayer {
  return {
    source: { width: 100, height: 50, close: () => {} },
    transform: { ...DEFAULT_TRANSFORM, ...overrides },
    effects,
  };
}

/** Stubs the global OffscreenCanvas constructor (undefined in jsdom) with a
 *  fake whose 2D context is seeded with `pixel` and pushes its own calls into
 *  the same `calls` array as the main recording context, so tests can assert
 *  ordering across both. */
function stubFakeOffscreenCanvas(pixel: [number, number, number, number], calls: string[]) {
  class FakeOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      calls.push('scratch:new');
    }
    getContext() {
      return {
        clearRect: () => calls.push('scratch:clearRect'),
        drawImage: () => calls.push('scratch:drawImage'),
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          calls.push(`scratch:getImageData(${w},${h})`);
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < data.length; i += 4) {
            data[i] = pixel[0];
            data[i + 1] = pixel[1];
            data[i + 2] = pixel[2];
            data[i + 3] = pixel[3];
          }
          return { data, width: w, height: h } as ImageData;
        },
        putImageData: (imageData: ImageData) => calls.push(`scratch:putImageData(alpha=${imageData.data[3]})`),
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
}

describe('buildFilter', () => {
  it('joins enabled Canvas2D-expressible effects into a filter string', () => {
    const effects: Effect[] = [
      { id: '1', type: 'brightness', params: { amount: 1.2 }, enabled: true },
      { id: '2', type: 'blur', params: { amount: 4 }, enabled: true },
      { id: '3', type: 'contrast', params: { amount: 1 }, enabled: false },
    ];
    expect(buildFilter(effects)).toBe('brightness(1.2) blur(4px)');
  });

  it('skips unknown effect types and falls back to none when nothing applies', () => {
    const effects: Effect[] = [{ id: '1', type: 'lut', params: {}, enabled: true }];
    expect(buildFilter(effects)).toBe('none');
  });
});

describe('createRenderer / drawFrame', () => {
  it('fills the background then draws layers bottom-up', () => {
    const { ctx, calls } = createRecordingContext();
    const canvas = fakeCanvas(ctx);
    const renderer = createRenderer(canvas);

    const frame: ComposedFrame = {
      background: '#111111',
      layers: [bitmapLayer(), bitmapLayer({ x: 10 })],
      transitions: [],
    };
    renderer.drawFrame(frame);

    const bgIndex = calls.findIndex((c) => c.startsWith('set:fillStyle=') && c.includes('#111111'));
    const fillRectIndex = calls.findIndex((c) => c.startsWith('fillRect('));
    const drawImageIndices = calls.map((c, i) => (c.startsWith('drawImage(') ? i : -1)).filter((i) => i >= 0);
    expect(bgIndex).toBeGreaterThanOrEqual(0);
    expect(fillRectIndex).toBeGreaterThan(bgIndex);
    expect(drawImageIndices).toHaveLength(2);
    expect(drawImageIndices[0]).toBeLessThan(drawImageIndices[1]);
  });

  it('applies contain fit math when drawing a bitmap layer', () => {
    const { ctx, calls } = createRecordingContext();
    const canvas = fakeCanvas(ctx, 200, 100); // 2:1 box
    const renderer = createRenderer(canvas);
    // bitmap is 100x50 (2:1) — same aspect as box, contain fills exactly.
    renderer.drawFrame({ background: '#000', layers: [bitmapLayer()], transitions: [] });

    const drawImageCall = calls.find((c) => c.startsWith('drawImage('));
    expect(drawImageCall).toBe('drawImage({"width":100,"height":50},-100,-50,200,100)');
  });

  it('applies transform x/y/scale/rotation/opacity around the canvas centre', () => {
    const { ctx, calls } = createRecordingContext();
    const canvas = fakeCanvas(ctx, 200, 100);
    const renderer = createRenderer(canvas);
    renderer.drawFrame({
      background: '#000',
      layers: [bitmapLayer({ x: 5, y: -5, scale: 2, rotation: 90, opacity: 0.5 })],
      transitions: [],
    });

    expect(calls).toContain('translate(105,45)');
    expect(calls).toContain(`rotate(${Math.PI / 2})`);
    expect(calls).toContain('scale(2,2)');
    expect(calls).toContain('set:globalAlpha=0.5');
  });

  it('draws multi-line text with the given style', () => {
    const { ctx, calls } = createRecordingContext();
    const canvas = fakeCanvas(ctx, 200, 100);
    const renderer = createRenderer(canvas);
    const layer: RenderLayer = {
      source: { text: 'line one\nline two', style: { fontFamily: 'Nunito', fontSize: 20, color: '#fff', bold: false, italic: false, align: 'center' } },
      transform: { ...DEFAULT_TRANSFORM },
      effects: [],
    };
    renderer.drawFrame({ background: '#000', layers: [layer], transitions: [] });

    const fillTextCalls = calls.filter((c) => c.startsWith('fillText('));
    expect(fillTextCalls).toHaveLength(2);
    expect(calls).toContain('set:font="20px Nunito"');
  });

  it('crossfades from/to layers by progress', () => {
    const { ctx, calls } = createRecordingContext();
    const canvas = fakeCanvas(ctx, 200, 100);
    const renderer = createRenderer(canvas);
    renderer.drawFrame({
      background: '#000',
      layers: [],
      transitions: [{ type: 'crossfade', progress: 0.25, from: bitmapLayer(), to: bitmapLayer() }],
    });

    const alphaCalls = calls.filter((c) => c.startsWith('set:globalAlpha='));
    expect(alphaCalls).toContain('set:globalAlpha=0.75');
    expect(alphaCalls).toContain('set:globalAlpha=0.25');
  });

  it('clips the incoming layer for wipe-left', () => {
    const { ctx, calls } = createRecordingContext();
    const canvas = fakeCanvas(ctx, 200, 100);
    const renderer = createRenderer(canvas);
    renderer.drawFrame({
      background: '#000',
      layers: [],
      transitions: [{ type: 'wipe-left', progress: 0.3, from: bitmapLayer(), to: bitmapLayer() }],
    });

    expect(calls).toContain('rect(0,0,60,100)');
    expect(calls).toContain('clip()');
  });

  it('translates the incoming layer for slide-left', () => {
    const { ctx, calls } = createRecordingContext();
    const canvas = fakeCanvas(ctx, 200, 100);
    const renderer = createRenderer(canvas);
    renderer.drawFrame({
      background: '#000',
      layers: [],
      transitions: [{ type: 'slide-left', progress: 0.4, from: bitmapLayer(), to: bitmapLayer() }],
    });

    // dx = w * (1 - progress) = 200 * 0.6 = 120
    expect(calls).toContain('translate(120,0)');
  });

  it('resizes the underlying canvas', () => {
    const { ctx } = createRecordingContext();
    const canvas = fakeCanvas(ctx);
    const renderer = createRenderer(canvas);
    renderer.resize(640, 480);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });

  it('reports kind canvas2d and exposes the passed canvas', () => {
    const { ctx } = createRecordingContext();
    const canvas = fakeCanvas(ctx);
    const renderer = createRenderer(canvas);
    expect(renderer.kind).toBe('canvas2d');
    expect(renderer.canvas).toBe(canvas);
  });

  it('throws when no 2d context is available', () => {
    const badCanvas = { width: 10, height: 10, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => createRenderer(badCanvas)).toThrow();
  });
});

describe('colorGrade / chromaKey pixel path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips the scratch canvas entirely for a neutral colorGrade and a disabled chromaKey', () => {
    const { ctx, calls } = createRecordingContext();
    stubFakeOffscreenCanvas([0, 255, 0, 255], calls);
    const canvas = fakeCanvas(ctx, 200, 100);
    const renderer = createRenderer(canvas);

    const effects: Effect[] = [
      { id: '1', type: COLOR_GRADE, params: encodeColorGrading({}), enabled: true },
      {
        id: '2',
        type: CHROMA_KEY,
        params: encodeChromaKey({ keyColor: { r: 0, g: 1, b: 0 }, tolerance: 0.3, edgeSoftness: 0.1, spillSuppression: 0.5 }),
        enabled: false,
      },
    ];
    renderer.drawFrame({ background: '#000', layers: [bitmapLayer({}, effects)], transitions: [] });

    expect(calls.some((c) => c.startsWith('scratch:'))).toBe(false);
    expect(calls.some((c) => c.startsWith('drawImage('))).toBe(true);
  });

  it('keys a green bitmap to transparent and draws the processed scratch canvas, not the raw bitmap', () => {
    const { ctx, calls } = createRecordingContext();
    stubFakeOffscreenCanvas([0, 255, 0, 255], calls);
    const canvas = fakeCanvas(ctx, 200, 100);
    const renderer = createRenderer(canvas);

    const effects: Effect[] = [
      {
        id: '1',
        type: CHROMA_KEY,
        params: encodeChromaKey({ keyColor: { r: 0, g: 1, b: 0 }, tolerance: 0.3, edgeSoftness: 0.1, spillSuppression: 0.5 }),
        enabled: true,
      },
    ];
    renderer.drawFrame({ background: '#000', layers: [bitmapLayer({}, effects)], transitions: [] });

    const putCall = calls.find((c) => c.startsWith('scratch:putImageData('));
    expect(putCall).toBe('scratch:putImageData(alpha=0)');

    // The final drawImage on the main context draws the scratch canvas
    // (a FakeOffscreenCanvas instance, serialized with numeric width/height
    // fields), not the plain {width,height,close} bitmap fixture.
    const mainDrawImage = calls.filter((c) => c.startsWith('drawImage('));
    expect(mainDrawImage).toHaveLength(1);
    expect(mainDrawImage[0]).not.toContain('"close":null');
  });

  it('applies ctx.filter and the pixel effect together — filter set before the scratch is processed and drawn', () => {
    const { ctx, calls } = createRecordingContext();
    stubFakeOffscreenCanvas([0, 255, 0, 255], calls);
    const canvas = fakeCanvas(ctx, 200, 100);
    const renderer = createRenderer(canvas);

    const effects: Effect[] = [
      { id: '1', type: 'brightness', params: { amount: 1.2 }, enabled: true },
      {
        id: '2',
        type: CHROMA_KEY,
        params: encodeChromaKey({ keyColor: { r: 0, g: 1, b: 0 }, tolerance: 0.3, edgeSoftness: 0.1, spillSuppression: 0.5 }),
        enabled: true,
      },
    ];
    renderer.drawFrame({ background: '#000', layers: [bitmapLayer({}, effects)], transitions: [] });

    const filterIndex = calls.indexOf('set:filter="brightness(1.2)"');
    const getImageDataIndex = calls.findIndex((c) => c.startsWith('scratch:getImageData('));
    const putImageDataIndex = calls.findIndex((c) => c.startsWith('scratch:putImageData('));
    const drawImageIndex = calls.findIndex((c) => c.startsWith('drawImage('));

    expect(filterIndex).toBeGreaterThanOrEqual(0);
    expect(filterIndex).toBeLessThan(getImageDataIndex);
    expect(getImageDataIndex).toBeLessThan(putImageDataIndex);
    expect(putImageDataIndex).toBeLessThan(drawImageIndex);
  });
});

describe('createPreferredRenderer', () => {
  it('falls back to Canvas2D when WebGPU is unavailable (jsdom has no navigator.gpu)', async () => {
    const { ctx } = createRecordingContext();
    const canvas = fakeCanvas(ctx);
    const renderer = await createPreferredRenderer(canvas);
    expect(renderer.kind).toBe('canvas2d');
    expect(renderer.canvas).toBe(canvas);
  }, 20000); // first dynamic import of the gpu/ module tree is slow to transform under vitest

  it('goes straight to Canvas2D when preferWebGpu is false', async () => {
    const { ctx } = createRecordingContext();
    const canvas = fakeCanvas(ctx);
    const renderer = await createPreferredRenderer(canvas, { preferWebGpu: false });
    expect(renderer.kind).toBe('canvas2d');
  });
});
