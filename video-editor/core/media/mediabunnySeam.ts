// OWNED BY: media agent.
// Thin seam around mediabunny so tests can fake decode without WebCodecs
// (jsdom has neither WebCodecs nor createImageBitmap). Only the calls the
// media engine actually needs are exposed — see mediabunny.d.ts for the full
// surface (Input, BlobSource, ALL_FORMATS, CanvasSink, AudioBufferSink).

export interface CanvasSinkFrame {
  canvas: CanvasImageSource;
  timestamp: number;
}

export interface AudioSinkBuffer {
  buffer: AudioBuffer;
  timestamp: number;
}

export interface MediabunnyCanvasSink {
  getCanvas(timestamp: number): Promise<CanvasSinkFrame | null>;
  canvases(startTimestamp: number): AsyncGenerator<CanvasSinkFrame, void, unknown>;
}

export interface MediabunnyAudioBufferSink {
  buffers(startTimestamp: number, endTimestamp: number): AsyncGenerator<AudioSinkBuffer, void, unknown>;
}

export interface MediabunnyVideoTrack {
  displayWidth: number;
  displayHeight: number;
  canDecode(): Promise<boolean>;
  computePacketStats(sampleCount: number): Promise<{ averagePacketRate: number }>;
  createCanvasSink(options?: { width?: number; fit?: 'contain' | 'cover' | 'fill' }): MediabunnyCanvasSink;
}

export interface MediabunnyAudioTrack {
  numberOfChannels: number;
  sampleRate: number;
  computeDuration(): Promise<number>;
  canDecode(): Promise<boolean>;
  createAudioBufferSink(): MediabunnyAudioBufferSink;
}

export interface MediabunnyInput {
  computeDuration(): Promise<number>;
  getPrimaryVideoTrack(): Promise<MediabunnyVideoTrack | null>;
  getPrimaryAudioTrack(): Promise<MediabunnyAudioTrack | null>;
  dispose(): void;
}

export interface MediabunnySeam {
  createInput(file: Blob): MediabunnyInput;
}

/** Real seam backed by the installed `mediabunny` package. Dynamically
 *  imported so the (large) WebCodecs-dependent module only loads when a
 *  video/audio file actually needs decoding. */
export async function loadRealMediabunnySeam(): Promise<MediabunnySeam> {
  const mb = await import('mediabunny');

  function wrapVideoTrack(track: import('mediabunny').InputVideoTrack): MediabunnyVideoTrack {
    return {
      displayWidth: track.displayWidth,
      displayHeight: track.displayHeight,
      canDecode: () => track.canDecode(),
      computePacketStats: (n) => track.computePacketStats(n),
      createCanvasSink: (options) => {
        const sink = new mb.CanvasSink(track, { poolSize: 2, ...options });
        return {
          getCanvas: (t) => sink.getCanvas(t),
          canvases: (start) => sink.canvases(start),
        };
      },
    };
  }

  function wrapAudioTrack(track: import('mediabunny').InputAudioTrack): MediabunnyAudioTrack {
    return {
      numberOfChannels: track.numberOfChannels,
      sampleRate: track.sampleRate,
      computeDuration: () => track.computeDuration(),
      canDecode: () => track.canDecode(),
      createAudioBufferSink: () => {
        const sink = new mb.AudioBufferSink(track);
        return { buffers: (start, end) => sink.buffers(start, end) };
      },
    };
  }

  return {
    createInput(file: Blob): MediabunnyInput {
      const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
      return {
        computeDuration: () => input.computeDuration(),
        getPrimaryVideoTrack: async () => {
          const track = await input.getPrimaryVideoTrack();
          return track ? wrapVideoTrack(track) : null;
        },
        getPrimaryAudioTrack: async () => {
          const track = await input.getPrimaryAudioTrack();
          return track ? wrapAudioTrack(track) : null;
        },
        dispose: () => input[Symbol.dispose]?.(),
      };
    },
  };
}
