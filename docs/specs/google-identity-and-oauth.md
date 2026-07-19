# Technical Spec — Google Identity, Silent Refresh & OAuth Flows

> Status: **describes the intended design** of the auth work landed in commits
> `731302b`, `82f3897`, `a8387b4`, `c6b9602`, plus the Spotify client-side flow
> (`7e64a80` cluster). Written after a code review that found two defects
> (ISSUE-1, ISSUE-2). This is the reference the fixes must conform to.
> Verified against the tree, not assumed.

## 1. Problem

The stored `googleIdentity.isConnected` boolean was set once at auth time and
never invalidated, while the underlying Google OAuth access token expires after
~1 hour. Every consumer (Footer, Welcome, AppSection, fileUtils, assistant Gmail
tools) checked the stale boolean and then made API calls with a dead token.
Additionally, the two Google-adjacent settings pages ("Cloud Identity" and
"YouTube") duplicated the same OAuth config UI, and the Spotify OAuth flow relied
on a server-side token exchange requiring `SPOTIFY_CLIENT_SECRET` on the host.

## 2. Design

### 2.1 Single source of truth — `utils/googleAuth.ts`

The module is the only place that decides token validity.

| Export | Contract |
|---|---|
| `GOOGLE_TOKEN_EXPIRY_MS` | `55 * 60 * 1000` — safe margin under the 60-min limit, used only when `expiresAt` is absent. |
| `buildGoogleIdentity(payload, userInfo)` | **The only sanctioned constructor** for `GoogleIdentityConnection`. Captures `expiresAt = Date.now() + (expires_in ?? 3600) * 1000`. All auth entry points must use it. |
| `isGoogleAuthValid(identity)` | Type-guard. True iff `isConnected` && `accessToken` present && `!isTokenExpired`. This replaces every inline `Date.now() - connectedAt > …` check. |
| `isTokenExpired(identity)` | Uses `expiresAt` if present, else `connectedAt + GOOGLE_TOKEN_EXPIRY_MS`, else treats as expired. |
| `msUntilExpiry(identity)` | ms remaining; negative if expired. |
| `requestSilentTokenRefresh(identity)` | Fire-and-forget: emits `googleTokenRefreshRequested` if the identity is connected-but-invalid. Returns whether a refresh was requested. |
| `trySilentRefreshWithWait(identity, timeoutMs, pollInterval)` | Awaitable: emits the refresh event, also pokes `window.__GOOGLE_TOKEN_CLIENT` directly, then polls `loadLLMSettings()` up to `timeoutMs` for a fresh valid token. Returns `{ accessToken, expiresAt }` or `null`. |

### 2.2 Silent refresh mechanism

- `SetupPage` owns the GSI token client (`tokenClientRef`) and, when mounted,
  listens for `googleTokenRefreshRequested` and calls
  `requestAccessToken({ prompt: '' })` (no consent UI).
- The client is also published to `window.__GOOGLE_TOKEN_CLIENT` so a caller can
  trigger a refresh when `SetupPage` isn't mounted.
- The GSI `callback` writes the new token via `buildGoogleIdentity` semantics
  (must include `expires_in`) → `updateSettings` → `localStorage`, which the
  poller in `trySilentRefreshWithWait` observes.

**Invariant (ISSUE-2):** the GSI client is configured with an OAuth **client_id**
only. The client_id resolves as
`settings.youtube?.customClientId || process.env.YOUTUBE_CLIENT_ID`. The developer
**API key** (`settings.googleApiKey`, `AIza…`) is a different credential and MUST
NOT appear in any client_id resolution chain. The refresh-effect at
`SetupPage.tsx:248` currently includes `|| settings.googleApiKey` — that is a bug
and must be removed to match the three other GSI call sites.

### 2.3 Assistant tool integration

Gmail tools (`send_gmail`, `read`/list, delete) call `ensureGoogleToken(identity)`
in `services/assistantTools.ts`:

1. If `isGoogleAuthValid` → return the token.
2. Else if not connected → return a user-facing "authorize in Settings" string.
3. Else (expired) → `await trySilentRefreshWithWait(...)`; on success return the
   refreshed token, else return a "session expired, re-authenticate" string.

Sensitive actions (send/delete) remain gated behind `confirmSensitiveAction`.

### 2.4 Settings top-level API key

`googleApiKey` is a **top-level** `LLMSettings` field (not nested under `youtube`)
so services outside the YouTube feature can read it robustly. Required plumbing,
all of which must be present:

- `types.ts`: `googleApiKey?: string` on `LLMSettings`.
- `settingsStorage.ts`: default `''` + hydration `parsed.googleApiKey ?? ''`.
- `SetupPage.handleSettingsChange`: `'googleApiKey'` in the persistence allow-list,
  and synced to `window.__YOUTUBE_API_KEY` for assistant tools.
- `appControlService.getYouTubeApiKey()`: window var → `localStorage` fallback
  (`googleApiKey`, then legacy `youtube.customApiKey`).

### 2.5 Merged settings page

"Cloud Identity" + "YouTube" collapse into one **"Google Cloud"** sub-tab
(`config.tsx`). One authentication drives Drive, YouTube, and Gmail. The connected
card shows the Google account (with an `ACTIVE` badge) and nests the YouTube
channel; "Link YouTube Channel" remains a secondary `handleAuthConnect('youtube')`
action. **Regression bar:** every credential/control reachable before the merge
(Client ID, API key, connect, disconnect, YouTube link/unlink) must remain
reachable after it.

### 2.6 Footer indicators

`Footer.tsx` shows live integration status: `GOOGLE` (via `isGoogleAuthValid`),
`SPOTIFY`, `TENSORART`, and `MCP: <enabled-count>`. Indicators are presentational
(non-interactive) and theme-aware.

## 3. Spotify OAuth (client-side PKCE)

Replaces the previous server-side exchange (which needed `SPOTIFY_CLIENT_SECRET`).

Flow:

1. `SetupPage` pre-computes PKCE `{verifier, challenge}` into `spotifyPkceRef`
   (in an effect) so `window.open` is synchronous and not popup-blocked.
2. On connect, `verifier`/`clientId` are stashed in `localStorage`
   (`spotify_code_verifier_temp`, `spotify_client_id_temp`) and a popup opens
   `accounts.spotify.com/authorize`.
3. `server.ts` `/auth/spotify/callback` redirects (preserving the query string) to
   the **static** `/spotify-callback.html`.
4. `spotify-callback.html` performs the PKCE token exchange client-side, writes
   `spotify_access_token` / `spotify_refresh_token` / `spotify_expires_at` and a
   `spotify_just_connected` flag to `localStorage`, then closes.
5. `SetupPage` detects the tokens via a `storage` event + a 2s fallback poll,
   fetches the profile, and persists a `SpotifyConnection`.

**Hard dependency (ISSUE-1):** step 3 redirects to `/spotify-callback.html`, so
that file **must be committed and present in the build output**. It is currently
untracked (`git cat-file -e HEAD:public/spotify-callback.html` → not in HEAD),
which breaks Spotify auth in every clean clone / CI / `gh-pages` deploy.

## 4. Acceptance criteria

- [ ] No inline token-expiry math anywhere; all validity checks go through
      `isGoogleAuthValid`.
- [ ] All `GoogleIdentityConnection` construction goes through `buildGoogleIdentity`.
- [ ] No credential-type crossover: `googleApiKey` never used as an OAuth client_id.
- [ ] `public/spotify-callback.html` is committed and lands in `dist/`.
- [ ] A fresh `git clone` + `pnpm build` yields a working Spotify connect flow.
- [ ] Every pre-merge Google/YouTube setting is still reachable on the merged page.
- [ ] Expired Gmail-tool calls trigger a silent refresh and succeed without a full
      re-consent when a valid GSI session can be re-obtained silently.
