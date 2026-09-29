import { describe, expect, it } from 'vitest';
import { audioKbps, CONVERTER_PRESETS, getFormatById } from '../../constants/converterFormats';

describe('converter presets', () => {
  it('every preset targets a real format with a valid quality', () => {
    for (const p of CONVERTER_PRESETS) {
      expect(getFormatById(p.targetId), p.id).toBeDefined();
      expect(p.quality).toBeGreaterThanOrEqual(1);
      expect(p.quality).toBeLessThanOrEqual(100);
    }
  });

  it('maps the quality slider to a sane audio bitrate (was capped at 100 kbps)', () => {
    expect(audioKbps(40)).toBe(128);
    expect(audioKbps(100)).toBe(320);
    expect(audioKbps(1)).toBe(32);
    expect(audioKbps(80)).toBe(256);
  });
});
