/**
 * Centralised Google Identity auth validation.
 *
 * The Google OAuth access token expires ~1 hour after issuance.
 * The `isConnected` flag in settings is only set once at auth time and
 * never invalidated, so every consumer was checking a stale boolean.
 *
 * This module provides a single source of truth for determining
 * whether the stored Google identity is actually usable.
 */

import { appEventBus } from './eventBus';
import type { GoogleIdentityConnection } from '../types';

export const GOOGLE_TOKEN_EXPIRY_MS = 55 * 60 * 1000; // 55 minutes — safe margin under the 60-min limit

/**
 * Extract the fragment/query params from a GSI callback response and
 * return a properly typed connection object.
 * The `expires_in` field is in seconds.
 */
export interface GoogleTokenPayload {
    access_token: string;
    expires_in: number; // seconds until expiry
    scope?: string;
    token_type?: string;
}

export const buildGoogleIdentity = (
    payload: GoogleTokenPayload,
    userInfo: { email: string; name: string; picture: string },
): GoogleIdentityConnection => ({
    isConnected: true,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    connectedAt: Date.now(),
});

/**
 * Is the stored Google identity currently usable?
 * Checks all three: flag is true, token exists, token is not expired.
 */
export const isGoogleAuthValid = (identity?: GoogleIdentityConnection | null): identity is GoogleIdentityConnection & { accessToken: string } => {
    if (!identity) return false;
    if (!identity.isConnected) return false;
    if (!identity.accessToken) return false;
    if (isTokenExpired(identity)) return false;
    return true;
};

/** True if the token has expired (or is within the safety margin of expiring). */
export const isTokenExpired = (identity: GoogleIdentityConnection): boolean => {
    // Use explicit expiresAt if available, else fall back to connectedAt heuristic
    const deadline = identity.expiresAt
        ? identity.expiresAt
        : (identity.connectedAt ? identity.connectedAt + GOOGLE_TOKEN_EXPIRY_MS : 0);
    return Date.now() >= deadline;
};

/** How many ms remain before the token expires. Negative if already expired. */
export const msUntilExpiry = (identity: GoogleIdentityConnection): number => {
    if (identity.expiresAt) return identity.expiresAt - Date.now();
    if (identity.connectedAt) return (identity.connectedAt + GOOGLE_TOKEN_EXPIRY_MS) - Date.now();
    return -1;
};

/** Emit an event so the SetupPage (which owns the GSI token client) can
 *  attempt a silent token refresh. Returns true if a refresh was requested. */
export const requestSilentTokenRefresh = (identity?: GoogleIdentityConnection | null): boolean => {
    if (!isGoogleAuthValid(identity) && identity?.isConnected) {
        appEventBus.emit('googleTokenRefreshRequested', {});
        return true;
    }
    return false;
};
