// Codec selection, injected so tests can fake canEncodeVideo/canEncodeAudio
// without a real browser encoder.
import type { ExportContainer } from '../types';

export type VideoCodecId = 'avc' | 'vp9' | 'vp8';
export type AudioCodecId = 'aac' | 'opus';

export type CanEncodeVideo = (codec: VideoCodecId, opts: { width: number; height: number; frameRate: number; bitrate: number }) => Promise<boolean>;
export type CanEncodeAudio = (codec: AudioCodecId, opts: { bitrate: number }) => Promise<boolean>;

const VIDEO_CANDIDATES: Record<ExportContainer, VideoCodecId[]> = {
  mp4: ['avc'],
  webm: ['vp9', 'vp8'],
};

const AUDIO_CANDIDATES: Record<ExportContainer, AudioCodecId[]> = {
  mp4: ['aac'],
  webm: ['opus'],
};

export async function pickVideoCodec(
  container: ExportContainer,
  canEncode: CanEncodeVideo,
  opts: { width: number; height: number; frameRate: number; bitrate: number },
): Promise<VideoCodecId | null> {
  for (const codec of VIDEO_CANDIDATES[container]) {
    if (await canEncode(codec, opts)) return codec;
  }
  return null;
}

export async function pickAudioCodec(
  container: ExportContainer,
  canEncode: CanEncodeAudio,
  opts: { bitrate: number },
): Promise<AudioCodecId | null> {
  for (const codec of AUDIO_CANDIDATES[container]) {
    if (await canEncode(codec, opts)) return codec;
  }
  return null;
}
