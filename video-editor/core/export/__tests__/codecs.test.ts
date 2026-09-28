import { describe, it, expect, vi } from 'vitest';
import { pickAudioCodec, pickVideoCodec } from '../codecs';

describe('pickVideoCodec', () => {
  it('tries avc first for mp4', async () => {
    const canEncode = vi.fn().mockResolvedValue(true);
    const codec = await pickVideoCodec('mp4', canEncode, { width: 1920, height: 1080, frameRate: 30, bitrate: 8_000_000 });
    expect(codec).toBe('avc');
    expect(canEncode).toHaveBeenCalledWith('avc', expect.anything());
  });

  it('falls back from vp9 to vp8 for webm when vp9 is not encodable', async () => {
    const canEncode = vi.fn(async (codec: string) => codec === 'vp8');
    const codec = await pickVideoCodec('webm', canEncode, { width: 1280, height: 720, frameRate: 30, bitrate: 4_000_000 });
    expect(codec).toBe('vp8');
  });

  it('returns null when no candidate is encodable', async () => {
    const canEncode = vi.fn().mockResolvedValue(false);
    const codec = await pickVideoCodec('mp4', canEncode, { width: 1920, height: 1080, frameRate: 30, bitrate: 8_000_000 });
    expect(codec).toBeNull();
  });
});

describe('pickAudioCodec', () => {
  it('picks aac for mp4 and opus for webm', async () => {
    const canEncode = vi.fn().mockResolvedValue(true);
    expect(await pickAudioCodec('mp4', canEncode, { bitrate: 128_000 })).toBe('aac');
    expect(await pickAudioCodec('webm', canEncode, { bitrate: 128_000 })).toBe('opus');
  });

  it('returns null when audio is not encodable', async () => {
    const canEncode = vi.fn().mockResolvedValue(false);
    expect(await pickAudioCodec('mp4', canEncode, { bitrate: 128_000 })).toBeNull();
  });
});
