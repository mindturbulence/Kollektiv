import { describe, it, expect } from 'vitest';
import { encodeWav } from '../wav';

function fakeBuffer(channels: number[][], sampleRate = 48000) {
  const data = channels.map(c => Float32Array.from(c));
  return {
    numberOfChannels: data.length,
    sampleRate,
    length: data[0]?.length ?? 0,
    getChannelData: (c: number) => data[c],
  };
}

describe('encodeWav', () => {
  it('writes a valid RIFF/WAVE header', () => {
    const out = encodeWav(fakeBuffer([[0, 0.5, -0.5]]));
    const view = new DataView(out);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it('interleaves multi-channel PCM16 samples in [-1,1] range', () => {
    const out = encodeWav(fakeBuffer([[1, -1], [0.5, -0.5]], 8000));
    const view = new DataView(out);
    expect(view.getInt16(44, true)).toBe(0x7fff); // ch0 frame0
    expect(view.getInt16(46, true)).toBeCloseTo(0x4000, -1); // ch1 frame0 (0.5 * 0x8000)
    expect(view.getInt16(48, true)).toBe(-0x8000); // ch0 frame1
  });

  it('clamps out-of-range samples instead of wrapping', () => {
    const out = encodeWav(fakeBuffer([[2, -2]]));
    const view = new DataView(out);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it('sizes the data chunk from numFrames * blockAlign', () => {
    const out = encodeWav(fakeBuffer([[0, 0, 0, 0], [0, 0, 0, 0]]));
    const view = new DataView(out);
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2); // 4 frames * 2 channels * 2 bytes
    expect(out.byteLength).toBe(44 + 16);
  });
});
