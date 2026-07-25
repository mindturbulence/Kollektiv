/**
 * Spotify integration tools for the assistant.
 *
 * All tools require Spotify to be connected
 * (Settings > Integrations > Spotify).
 */
import type { AssistantTool } from './types';

// ── Helpers ──

async function refreshSpotifyToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  const expiresAt = parseInt(localStorage.getItem('spotify_expires_at') || '0', 10);
  const clientId = (window as any).__SPOTIFY_CLIENT_ID || localStorage.getItem('spotify_client_id') || '';

  if (!refreshToken || !clientId) return null;

  if (Date.now() < expiresAt - 30_000) {
    return localStorage.getItem('spotify_access_token');
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!res.ok) {
      console.error('Spotify token refresh failed:', await res.text());
      return null;
    }

    const data = await res.json();
    localStorage.setItem('spotify_access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
    localStorage.setItem('spotify_expires_at', String(Date.now() + data.expires_in * 1000));

    return data.access_token;
  } catch (err) {
    console.error('Spotify token refresh error:', err);
    return null;
  }
}

async function getSpotifyAccessToken(): Promise<string | null> {
  const token = localStorage.getItem('spotify_access_token');
  const expiresAt = parseInt(localStorage.getItem('spotify_expires_at') || '0', 10);

  if (token && Date.now() < expiresAt - 30_000) {
    return token;
  }

  return refreshSpotifyToken();
}

// ── Tools ──

export const spotifyTools: AssistantTool[] = [
  {
    name: 'spotify_list_playlists',
    description: 'List the authenticated user\'s Spotify playlists. Requires Spotify to be connected in Settings > Integrations > Spotify.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of playlists to return (default 20).' },
      },
    },
    execute: async ({ limit = 20 }) => {
      if (typeof window === 'undefined') return 'Error: This tool requires a browser environment.';
      const token = await getSpotifyAccessToken();
      if (!token) return 'Error: Spotify not connected. Go to Settings > Integrations > Spotify and link your account.';
      const max = Math.min(Math.max(1, Math.floor(limit)), 50);
      const res = await fetch(`https://api.spotify.com/v1/me/playlists?limit=${max}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) return 'Error: Spotify token expired. Please reconnect in Settings.';
        return `Error: Failed to fetch playlists (${res.status}).`;
      }
      const data = await res.json();
      const items = data.items || [];
      return JSON.stringify(items.map((pl: any) => ({
        id: pl.id,
        name: pl.name,
        description: pl.description,
        trackCount: pl.tracks?.total,
        url: pl.external_urls?.spotify,
      })));
    },
  },
  {
    name: 'spotify_get_playlist_tracks',
    description: 'Get tracks from a Spotify playlist. Requires Spotify connected in Settings.',
    parameters: {
      type: 'object',
      properties: {
        playlistId: { type: 'string', description: 'Spotify playlist ID.' },
        limit: { type: 'number', description: 'Maximum tracks to return (default 50).' },
      },
      required: ['playlistId'],
    },
    execute: async ({ playlistId, limit = 50 }) => {
      if (typeof window === 'undefined') return 'Error: This tool requires a browser environment.';
      const token = await getSpotifyAccessToken();
      if (!token) return 'Error: Spotify not connected. Go to Settings > Integrations > Spotify and link your account.';
      const max = Math.min(Math.max(1, Math.floor(limit)), 100);
      const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${max}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) return 'Error: Spotify token expired. Please reconnect in Settings.';
        return `Error: Failed to fetch tracks (${res.status}).`;
      }
      const data = await res.json();
      const items = data.items || [];
      return JSON.stringify(items.map((item: any) => ({
        trackId: item.track?.id,
        name: item.track?.name,
        artists: item.track?.artists?.map((a: any) => a.name).join(', '),
        album: item.track?.album?.name,
        durationMs: item.track?.duration_ms,
        url: item.track?.external_urls?.spotify,
      })));
    },
  },
  {
    name: 'spotify_play',
    description: 'Play a Spotify track, album, or playlist in the Media Panel. Requires Spotify connected in Settings.',
    parameters: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Spotify URI (e.g., spotify:track:..., spotify:album:..., spotify:playlist:...) or track/album/playlist ID.' },
      },
      required: ['uri'],
    },
    execute: async ({ uri }) => {
      if (typeof window === 'undefined') return 'Error: This tool requires a browser environment.';
      const token = localStorage.getItem('spotify_access_token');
      if (!token) return 'Error: Spotify not connected. Go to Settings > Integrations > Spotify and link your account.';
      let spotifyUri = String(uri).trim();
      if (!spotifyUri.startsWith('spotify:')) {
        if (spotifyUri.includes(':')) spotifyUri = `spotify:track:${spotifyUri}`;
        else spotifyUri = `spotify:track:${spotifyUri}`;
      }
      // Import appEventBus dynamically to avoid circular dep
      const { appEventBus } = await import('../../utils/eventBus');
      appEventBus.emit('openMediaPanel', { url: spotifyUri, isSpotifyUri: true });
      return `Playing ${spotifyUri} in the media panel.`;
    },
  },
];
