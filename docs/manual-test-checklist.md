# Manual Test Checklist

Run these with a **production build** (`pnpm build && pnpm preview`) or **dev server** (`pnpm dev`), using a real browser (Chrome recommended).

Legend: `[ ]` not run · `[x]` passed · `[~]` failed (note the failure)

---

## Quick Wins (no external accounts)

### ISSUE-9 — Research chat flow
**Prerequisites:** A vault folder connected, at least one research project with sources added.

- [ ] 1. Open the app and navigate to the Assistant panel
- [ ] 2. Open an existing research project (or create one and add a source)
- [ ] 3. Type a message in the middle-column chat input and send it
- [ ] 4. Confirm you get a real assistant reply (not "placeholder" or error text)
- [ ] 5. If the source has content, confirm citations render in the reply footer
- [ ] 6. **Pass if:** Research chat works end-to-end with no placeholder text

---

### ISSUE-10 — Findings dedup
**Prerequisites:** A research project with at least one finding saved.

- [ ] 1. Open a research project's Findings panel
- [ ] 2. Edit the findings text, click Save
- [ ] 3. Repeat step 2 two more times (3 saves total)
- [ ] 4. Reopen the findings file (or refresh the panel)
- [ ] 5. Confirm the file contains exactly **one** copy of the final text, not three
- [ ] 6. **Pass if:** No content duplication after multiple saves

---

### ISSUE-12 — Assistant append_findings
**Prerequisites:** A research project active with a vault folder connected.

- [ ] 1. Open a research project
- [ ] 2. In the research chat, ask the assistant: *"Note down that the key finding is X"*
- [ ] 3. Confirm the assistant replies that it appended the finding
- [ ] 4. Open the Findings panel — confirm the new finding text appears
- [ ] 5. **Pass if:** The assistant can append findings mid-conversation without a UI save click

---

### ISSUE-20 — Rapid mic toggle (ghost session)
**Prerequisites:** A Gemini API key configured (or other live-voice backend).

- [ ] 1. Open the app and start a live voice session (click the mic icon)
- [ ] 2. **While the status shows "connecting"**, click the mic icon again to stop
- [ ] 3. Wait 5 seconds
- [ ] 4. Confirm the UI shows the mic as **off/idle** (no pulsing, no status indicator)
- [ ] 5. Confirm no audio is being captured (browser tab's mic indicator is off)
- [ ] 6. Try toggling on again — confirm a fresh session starts correctly
- [ ] 7. Repeat steps 1-3 three times to be sure
- [ ] 8. **Pass if:** No ghost session lingers after rapid on/off clicking

---

### ISSUE-21 — e2e headed smoke test
**Prerequisites:** Node.js, Playwright browsers installed (`npx playwright install chromium`).

- [ ] 1. `pnpm build && pnpm preview` (or `pnpm dev`)
- [ ] 2. In a separate terminal: `npx playwright test e2e/smoke.spec.ts --headed`
- [ ] 3. Watch the headed browser — it should:
     - Boot the app (wait for the vault folder selector or reconnect button)
     - Click to proceed through setup
     - Click the Web Viewer button in the header
     - Confirm the Close button becomes visible
- [ ] 4. Both tests should pass (exit code 0)
- [ ] 5. **Pass if:** Both e2e tests pass without timeout or manual intervention

---

## External-Service Tests (need live accounts)

### ISSUE-1 — Spotify connect E2E
**Prerequisites:** A Spotify Developer app with Client ID, `pnpm build && pnpm preview` running on a public URL (or localhost works for the callback flow).

- [ ] 1. Start the app from a **clean checkout** (`git clone`, `pnpm install`)
- [ ] 2. Navigate to Settings > Integrations > Spotify
- [ ] 3. Enter your Spotify Client ID and click Connect
- [ ] 4. Complete the Spotify OAuth consent screen in the popup
- [ ] 5. After the popup closes, confirm the Spotify status shows "Connected"
- [ ] 6. Use a Spotify tool or feature to confirm the token works
- [ ] 7. **Pass if:** Spotify connects end-to-end from a clean checkout

### ISSUE-2 — Google silent refresh
**Prerequisites:** A Google OAuth Client ID configured, Gmail API enabled, an expired (or about-to-expire) token.

- [ ] 1. Connect a Google account with Gmail scope
- [ ] 2. Wait for the token to expire (or manually revoke it)
- [ ] 3. Trigger a Gmail assistant tool (`send_gmail`, `search_gmail`, etc.)
- [ ] 4. Confirm the tool succeeds **without** showing a full Google re-consent popup
- [ ] 5. **Pass if:** Silent refresh works — no full re-consent for Gmail tools

### ISSUE-11 — Source-aware answers
**Prerequisites:** A research project with at least one source file added and readable.

- [ ] 1. Add a source file to a research project (e.g., a markdown note with specific content)
- [ ] 2. Open the research chat
- [ ] 3. Ask a question about the source's content: *"What does the source say about X?"*
- [ ] 4. Confirm the answer references the source content specifically
- [ ] 5. Confirm citation footers appear in the reply (e.g., `[1]`, `[2]`)
- [ ] 6. **Pass if:** Answers demonstrably use added source content with citations

### ISSUE-13 — Noise cancellation
**Prerequisites:** A Gemini API key configured for live voice, a moderately noisy environment.

- [ ] 1. Start a live voice session
- [ ] 2. While speaking, introduce background noise (fan, music at low volume, etc.)
- [ ] 3. Confirm the assistant's speech-to-text is still accurate
- [ ] 4. Confirm the VAD (voice activity detection) isn't tripping on background noise
- [ ] 5. **Pass if:** Noise cancellation is perceptibly active — cleaner VAD than without

---

## User-Only Tasks

### ISSUE-6 — Rotate Obsidian API key
- [ ] 1. Open Obsidian's Local REST API plugin settings
- [ ] 2. Generate a new API key
- [ ] 3. Update `OBSIDIAN_API_KEY` in your `.env` file
- [ ] 4. Restart the dev server
- [ ] 5. Confirm Obsidian tools still work with the new key

### ISSUE-15 — Obsidian Settings UI (deferred)
- [ ] Revisit once ISSUE-14 migration is fully stable
- [ ] Add UI following the `PredefinedMcpSection.tsx` pattern
- [ ] Update `WORKSPACE_CAPABILITIES` text to point at the new UI
