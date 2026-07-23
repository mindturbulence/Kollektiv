/** The kind of media being played/viewed. */
export type MediaType = 'image' | 'video' | 'music' | 'playlist';

/** Describes where the media file comes from. */
export type MediaSourceKind = 'url' | 'gallery-id' | 'vault-path' | 'youtube' | 'spotify';

export interface MediaSource {
  kind: MediaSourceKind;
  value: string;
}

/** A single playable/viewable media item. */
export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  subtitle?: string;
  source: MediaSource;
  thumbnail?: string;
  urls?: string[];           // for multi-image gallery items
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    artist?: string;
    album?: string;
    trackCount?: number;
  };
}

/** A playlist (Spotify or multi-track). */
export interface MediaPlaylist {
  id: string;
  title: string;
  description?: string;
  items: MediaItem[];
  currentIndex: number;
}

/** The full state held by the media panel. */
export interface MediaPanelState {
  isOpen: boolean;
  mediaItem: MediaItem | null;
  playlist: MediaPlaylist | null;
}
