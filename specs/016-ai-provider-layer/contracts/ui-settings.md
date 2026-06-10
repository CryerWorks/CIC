# Contract: Settings UI — AI Providers / Role Routing / Lockdown

**Files**:
- `src/features/settings/ai/AISection.tsx` — host section mounted in [SettingsRoute.tsx](../../../src/app/routes/settings/SettingsRoute.tsx).
- `src/features/settings/ai/ProviderList.tsx` — list + "Add provider" + per-provider Edit / Remove / Test connection.
- `src/features/settings/ai/ProviderForm.tsx` — add/edit form (fields driven by `type`).
- `src/features/settings/ai/RoleRoutingEditor.tsx` — three role rows × provider/model + add/remove fallback.
- `src/features/settings/ai/LockdownToggle.tsx` — single switch with explainer.
- `src/features/settings/ai/useAIConfig.ts` — the state hook (wraps load/save/probe + SecretStore + AIProvider).

Existing settings host: [SettingsRoute.tsx](../../../src/app/routes/settings/SettingsRoute.tsx) (014) — currently mounts `<NotificationsSettings />`. The AI section is added after it.

## UX layout

```
/settings  (page title: "Settings")
├── Notifications          (existing, 014)
└── AI Providers           (NEW)
    ├── List of configured providers
    │   ├── (provider tile) [label] [type] [local|remote|remote (LAN)] [Edit] [Test connection] [Remove]
    │   └── (provider tile) ...
    └── [+ Add provider]
└── Role routing            (NEW)
    ├── reasoning  → [provider/model select] [+ fallback]
    ├── drafting   → [provider/model select] [+ fallback]
    └── embeddings → [provider/model select] [+ fallback]
└── Local-only lockdown     (NEW)
    [toggle]  Block vault content from reaching remote providers.
              When on, RAG indexing, AI tutoring, and any feature embedding
              vault note text refuses to use a remote provider.
```

## `useAIConfig` — the hook

```ts
import type { AIConfig, ProviderConfig, RoleTarget, AIRole } from '../../../ai/config';
import type { ProviderCapabilities } from '../../../ai/provider';

export interface UseAIConfigResult {
  loading: boolean;
  config: AIConfig;
  /** Non-null when `loadAIConfig` threw `AIConfigError`. AISection surfaces the
   *  "Your AI configuration could not be loaded — Reset?" callout (FR-003). A
   *  successful `refresh` (e.g., after a "Reset to defaults" save) clears it. */
  loadError: import('../../../ai/config').AIConfigError | null;
  /** Probe results, keyed by providerId. Fresh on "Test connection". */
  probes: Record<string, ProviderCapabilities | { error: string }>;

  // Provider CRUD
  addProvider(input: ProviderFormInput): Promise<{ ok: boolean; error?: string }>;
  editProvider(id: string, input: ProviderFormInput): Promise<{ ok: boolean; error?: string }>;
  removeProvider(id: string): Promise<{ ok: boolean; error?: string }>;
  testConnection(id: string): Promise<ProviderCapabilities | { error: string }>;

  // Routing
  setRoleTarget(role: AIRole, target: RoleTarget | null): Promise<void>;
  addFallback(role: AIRole, providerId: string, model: string): Promise<void>;
  removeFallback(role: AIRole, index: number): Promise<void>;

  // Lockdown
  setLockdown(on: boolean): Promise<void>;

  refresh(): Promise<void>;
}

export interface ProviderFormInput {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl?: string;
  apiKey?: string;         // present iff type requires auth; stored to keychain, NOT to config
  defaultModel?: string;
  embedModel?: string;
}

export function useAIConfig(): UseAIConfigResult;
```

`useAIConfig` reads/writes via the `AIProvider` composition root (which itself uses `loadAIConfig` / `saveAIConfig` and the injected `SecretStore`). It does NOT touch SQLite or the keychain directly — the seam is the React provider.

## Component contracts

### `ProviderList.tsx`

- Renders `config.providers` as tiles.
- Each tile:
  - Label (truncated, ≤80 chars rendered).
  - Type tag: "ollama" / "openai-compatible" / "anthropic".
  - Local/remote tag:
    - `local` (green/neutral) — `isLocalHost(baseUrl)` true.
    - `remote (LAN)` — `isLanHost(baseUrl)` true; tooltip explaining lockdown still fires.
    - `remote` — neither.
    - For Anthropic: always `remote`.
  - "Test connection" button → `testConnection(id)`. On result, renders latency + capabilities (chat / embeddings / streaming as small tags). On error, renders the kind + message inline.
  - "Edit" button → opens `<ProviderForm />` in edit mode.
  - "Remove" button → confirmation dialog (mirrors 014 / 015 confirmation patterns) → `removeProvider(id)`. Warning if the provider serves a role: "Removing X will unassign role(s): reasoning, drafting".
- `[+ Add provider]` opens `<ProviderForm />` in new mode.

### `ProviderForm.tsx`

- Single component used for both add + edit.
- Fields:
  - **id**: shown only in add mode. Validated (1–64 chars, kebab-case allowed). In edit mode, immutable (the id is the keychain ref).
  - **type**: select. Changes the rest of the form's field set.
  - **label**: text. Always shown.
  - **baseUrl**: text. Shown for ollama (default `http://localhost:11434`) and openai-compatible (no default; user pastes their endpoint).
  - **API key**: password input with show/hide toggle. Shown for openai-compatible and anthropic. Pasted whitespace is trimmed. In edit mode, the field shows `••••••••` (the existing key from keychain — fetched once on form open) and the user can replace it. Leaving it as `••••••••` means "don't change the secret".
  - **defaultModel**: optional text.
  - **embedModel**: optional text. Shown for ollama and openai-compatible only.
- Save button is disabled until required fields are present (per zod refine).
- On save:
  1. If API key changed → `secrets.set(id, apiKey)` first.
  2. Then `saveAIConfig(db, newConfig)`.
  3. On either error, surface inline; nothing persisted.

### `RoleRoutingEditor.tsx`

- Three rows (reasoning / drafting / embeddings).
- Each row:
  - Two selects: provider + model.
    - Provider select: lists `config.providers` by label.
    - Model select: free text input (the model is vendor-specific; we don't enumerate). Defaults to the provider's `defaultModel` / `embedModel` if applicable.
  - "+ Add fallback" — appends a `RoleTarget` to the chain. Visually nested under the primary.
  - Each fallback row: same provider/model + "Remove" button.
- Lockdown badge per row: if the primary or any fallback is remote AND lockdown is ON, render a small "vault content blocked by lockdown" badge with a tooltip linking to the spec FR.

### `LockdownToggle.tsx`

- One Segmented or Switch: on / off.
- Explainer text below: "When on, vault note text and RAG context can never reach a remote AI provider. Local providers (Ollama, LM Studio, llama.cpp on this machine) still work normally."
- Side effects: setting calls `setLockdown(on)`, which saves config + emits the change event to the composition root.

### `AISection.tsx`

- Composes the three sub-components.
- Reads `useAIConfig()`.
- Shows a loading state on first mount.
- On critical errors (e.g., AIConfigError from `loadAIConfig`), shows a top-level `<Callout variant="warn">` with "Your AI configuration could not be loaded. Reset?" + a "Reset to defaults" action that calls `saveAIConfig(db, emptyAIConfig())`.

## Test surface (`*.test.tsx`)

All UI tests run under jsdom. Component tests use `renderApp` / `renderWithVault` from existing test-support files. The `AIProvider` accepts a fake config + fake SecretStore + fake router for deterministic tests.

**Provider CRUD**:
- New provider form blocks save until required fields are present.
- Adding a provider appends to the list; "Test connection" calls the fake router's `probe`.
- Editing a provider preserves the keychain ref unless the key field is changed.
- Removing a provider that serves a role surfaces a warning + clears the role.
- The keychain entry is removed when the provider is removed (verified via the fake SecretStore).

**Routing**:
- Assigning a role updates the saved config.
- Adding a fallback appends to the chain (verified by inspecting the saved config).
- Removing a fallback step deletes that node.
- A fallback step pointing at a removed provider surfaces a warning + the chain is auto-truncated to the previous step on save.

**Lockdown**:
- Toggling lockdown ON renders the "vault content blocked by lockdown" badge on every remote-targeted role row.
- Toggling lockdown OFF removes the badges.
- The toggle's saved value is observed by the fake router (via the config version bump).

**Keyboard navigation (SC-008)**:
- Tab/Shift+Tab cycles through the AISection's interactive elements in document order.
- Enter on "Add provider" opens the form.
- Tab traverses the form's fields without skipping.
- Enter on Save submits.
- Escape on the form (where appropriate) cancels.

**Vault content gating UI**:
- A test scenario asserts that a role row with a remote provider + lockdown ON renders a specific element with text "vault content blocked by lockdown" — surfaces FR-013's user-facing message at the right time.

**Error surfacing**:
- A `loadAIConfig` failure shows the "Reset?" callout, not a crash.
- A `secrets.set` failure (simulated via fake) surfaces inline on the form, no partial save.

## Design system notes

- Mirrors the 014 NotificationsSettings layout: a `<Panel title>` per section.
- Use the existing `Button`, `Tag`, `Segmented`, `Callout` primitives (no new UI library).
- Tag colors:
  - `local`: brand purple (the privacy-positive default).
  - `remote (LAN)`: warn amber.
  - `remote`: neutral gray with a tooltip on hover.
- The "vault content blocked by lockdown" badge: warn amber. Hover surfaces the FR-013 message.

## Accessibility

- Every form input has an `aria-label` (matches the 014/015 convention).
- The password input's show/hide toggle is keyboard-reachable.
- The role routing rows' "+ Add fallback" buttons have `aria-label="Add fallback to <role>"`.
- The lockdown switch is a real `<input type="checkbox">` or a Segmented (existing primitive) so screen readers announce state changes.
- Color is never the only signal — every status that uses a tag color also uses the label text.
