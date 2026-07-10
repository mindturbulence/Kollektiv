# Phase 3 — Polish & Tighten

**Goal:** Resolve remaining code-review flags and inconsistency gaps from Phase 1/2, tighten provider-specific JSX in Integrations, and normalize the last outlier labels.

## Items

### Step 11 — Normalize App/Data sub-tab label
- **File:** `components/settings/config.tsx`
- **Change:** App data sub-tab label from `"Backup & Restore"` to `"Import & Export"`
- **Why:** Phase 2 normalized Prompt and Gallery data tabs to `"Import & Export"` but missed the App/Data tab. This makes all three consistent.

### Step 12 — Fix `handleIntegrityCheck` to use committed `globalSettings`
- **File:** `components/settings/AppSection.tsx`
- **Change:** Import `useSettings` from `../../contexts/SettingsContext` and use `settings` from context (the committed value) instead of the draft `settings` prop for the `verifyAndRepairFiles` call.
- **Why:** Code reviewer flagged this in Phase 1/2. The original code passed the canonical context value to the integrity check. Using the working draft could validate against unsaved changes.

### Step 13 — Convert inline Anthropic Connection Mode toggles to `ProviderTab`
- **File:** `components/settings/IntegrationsSection.tsx`
- **Change:** Replace the two inline `<button>` elements for API Key Mode / Subscription Mode with `<ProviderTab>` components, matching the pattern already used for the 6-provider switcher in the same function.
- **Why:** Eliminates duplicated inline conditional-class patterns. ProviderTab handles audio click internally.

### Step 14 — Wrap provider-specific config blocks in `SettingsGroup` cards
- **File:** `components/settings/IntegrationsSection.tsx`
- **Change:** Add `SettingsGroup title="Anthropic Configuration"`, `SettingsGroup title="Gemini Configuration"`, etc. around each conditionally-rendered provider block inside `renderLLM()`.
- **Why:** These blocks are visually "floating" in Phase 2. SettingsGroup headers separate each provider's config section clearly when switching providers, matching the card pattern used everywhere else.
- **Note:** The CORS guide info cards within Ollama and Llama.cpp blocks stay inside their respective SettingsGroup (they're contextual to the provider).

### Step 15 — Validation
- `pnpm lint` green (zero TypeScript errors)
- Code review pass

## Out of scope
- Any behavior change to settings persistence
- Renaming/migrating persisted settings keys
- Touching non-settings components
