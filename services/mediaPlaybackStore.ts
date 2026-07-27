/**
 * Minimal module-level store for the current media playback status.
 *
 * Allows assistant tools (which have no React tree access) to read
 * what's currently playing without needing a context or prop chain.
 * MediaPanel writes to this store whenever its internal state changes.
 */

export type PlaybackTab = 'video' | 'music' | 'files';

export interface PlaybackStatus {
  playing: boolean;
  tab: PlaybackTab;
  videoId: string | null;
  spotifyType: string | null;
  spotifyId: string | null;
  title: string;
}

const EMPTY: PlaybackStatus = {
  playing: false,
  tab: 'video',
  videoId: null,
  spotifyType: null,
  spotifyId: null,
  title: '',
};

let _state: PlaybackStatus = { ...EMPTY };

export function setMediaPlaybackStatus(s: Partial<PlaybackStatus>): void {
  _state = { ..._state, ...s };
}

export function getMediaPlaybackStatus(): PlaybackStatus {
  return _state;
}

export function resetMediaPlaybackStatus(): void {
  _state = { ...EMPTY };
}
