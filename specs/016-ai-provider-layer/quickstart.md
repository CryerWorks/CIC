# Quickstart: AI Provider Layer (live `tauri dev`)

Live walkthrough — the learner's manual verification. The Vitest suite covers spine types, router routing/fallback/lockdown, adapter contract conformance, secret redaction, and the settings UI; this confirms the real **OS keychain** round-trip + the real **HTTP** path against at least one live provider + the real **settings UI** under Tauri's webview.

Run `npm run tauri dev`. You'll need at least one of:
- A local **Ollama** running (`ollama serve` + `ollama pull llama3.2:3b` or similar). For Scenarios A / D / E / F / I.
- An **OpenAI-compatible** endpoint URL + API key (e.g., your own OpenAI key, or a free OpenRouter key). For Scenarios B / C / G / J.
- An **Anthropic** API key. For B / C / G / J (interchangeable with OpenAI-compatible).

The settings live at `/settings` → "AI Providers".

---

## A. Add a local provider (Ollama) — US1

1. With Ollama running on `localhost:11434`, open `/settings`. Scroll past Notifications to the **AI Providers** section.
2. Click **+ Add provider**. Select type **ollama**. Label it "Local Ollama". Leave baseUrl at the default `http://localhost:11434`. Save.
3. **Expect**: a new tile in the list labeled "Local Ollama", tagged **ollama** and **local** (green).
4. Click **Test connection** on the tile.
5. **Expect**: within a few seconds, the tile renders the round-trip latency + the capability tags (chat / embeddings / streaming) + confirmation it's **local**.
6. Stop Ollama (`pkill ollama` or close the app). Click **Test connection** again.
7. **Expect**: an error within seconds reading something like "couldn't reach Ollama at http://localhost:11434 — is it running?" with the error kind shown (`offline`). No app crash; no orphaned spinner.

## B. Add a remote provider with a real API key — US2

8. Restart Ollama (so A continues to work). Click **+ Add provider**, pick **openai-compatible** (or **anthropic**). For OpenAI-compatible, enter the vendor's baseUrl (`https://api.openai.com` for OpenAI, `https://openrouter.ai/api/v1` for OpenRouter, etc.). Paste your API key. Label it. Save.
9. **Expect**: a new tile, tagged with the type and **remote**. The form's API key field shows `••••••••` if you re-open Edit (the key is fetched from the keychain — never stored back in the form).
10. Open your OS keychain app:
    - **Windows**: Credential Manager → Windows Credentials → look for `cic.ai.providers/<provider id>`.
    - **macOS**: Keychain Access → search `cic.ai.providers`.
    - **Linux** (with libsecret): `secret-tool search service cic.ai.providers`.
11. **Expect**: an entry exists with the right `username` (your provider id). The password is hidden but present.
12. Click **Test connection** on the remote tile.
13. **Expect**: success with latency + capability tags + **remote** classification.

## C. Inspect the on-disk config — no raw key — US2 / Constitution II

14. Open your DevTools (Tauri webview supports them), or open the SQLite file directly:
    - **Find the file**: `appConfigDir()/cic.db` (Tauri convention). On Windows: `%APPDATA%/com.cic.app/cic.db` (or wherever your Tauri identifier resolves).
    - Open it with `sqlite3` or DB Browser for SQLite.
15. Run: `SELECT value FROM settings WHERE key = 'ai.config';`.
16. **Expect**: a JSON blob containing your providers + routing + lockdown. Inside the OpenAI-compatible / Anthropic entry, **`apiKeyRef` is present** (== the provider id) but the **API key itself is NOT** anywhere in the value. Confirms FR-015.

## D. LAN endpoint shows "remote (LAN)" — US2 / Constitution II edge

17. (Optional, if you have a second machine on your LAN running Ollama at e.g. `http://192.168.1.50:11434`.)
18. Add it as a new ollama provider with that baseUrl. Save.
19. **Expect**: the tile shows **remote (LAN)** with an amber tag. Hover the tag.
20. **Expect**: a tooltip explaining "lockdown will still treat this as non-local — we can't verify a LAN box's egress posture".

## E. Assign roles — US1

21. Scroll to **Role routing**. For **reasoning**, pick "Local Ollama" + a model you have pulled (e.g. `llama3.2:3b`). Repeat for **drafting** and **embeddings** (use `nomic-embed-text` or similar embeddings model if you have one).
22. Save.
23. **Expect**: the rows show the assignment. No visible side effect yet (no AI consumer ships in this feature) — but a `SELECT … WHERE key='ai.config'` shows the routing committed.

## F. Toggle lockdown — US2

24. Scroll to **Local-only lockdown**. Toggle it **ON**.
25. **Expect**: every role row that points at a remote provider gains a "vault content blocked by lockdown" badge. Local-only rows are unaffected.
26. Toggle **OFF**. Badges disappear.

## G. Fallback chain — US3

27. With both a local and a remote provider configured, scroll to **Role routing** → **reasoning**. Click **+ Add fallback** on the row. Pick the *other* provider. Save.
28. **Expect**: the row now shows an ordered chain: primary → fallback. Inspect the config (Scenario C) — `routing.reasoning.fallback.providerId` is the second one.
29. **Reorder by removing + re-adding** (v1 ships add/remove, not drag-reorder). Each step renders cleanly.

## H. Remove a provider — keychain reclaimed — US2

30. Remove the remote provider from Scenario B via its tile's **Remove** button. Confirm.
31. **Expect**: the warning surfaces ("removing this will unassign role(s): reasoning, drafting"). Confirm anyway.
32. Re-open your OS keychain app (Scenario C step 10).
33. **Expect**: the `cic.ai.providers/<that provider id>` entry is **gone**. Confirms FR-018 / S3 (delete is idempotent + cascades from removeProvider).

## I. Fully offline — US1 / FR-027

34. Disconnect from the network (turn off Wi-Fi, unplug Ethernet — whatever's quickest).
35. Open `/settings`. Add a new ollama provider. Test it.
36. **Expect**: the entire UI continues to work. The Ollama tile probes successfully (it's localhost). No network-dependent code path errors. No spinner stuck.
37. Reconnect.

## J. Invalid key — clear auth error — US2

38. (If you removed the remote provider, re-add it.) Edit the tile and replace the API key with an obviously wrong string (e.g., `sk-invalid-key`). Save.
39. Click **Test connection**.
40. **Expect**: within seconds, an inline error: "authentication failed" (or similar — the specific message comes from the adapter's `auth` mapping). Offered a "re-enter key" affordance via the Edit button.

---

**Done when** A–J all behave as described, the OS keychain entries exist where expected and only where expected, no API key appears in `SELECT value FROM settings`, and the lockdown badges show up correctly under the toggle. The Vitest suite (spine zod, router routing/fallback/lockdown, adapter contract conformance for all three adapters, secret redaction at 100 simulated calls, settings UI behavior, keyboard navigation) must also be green, plus `tsc` + ESLint + `vite build` + `cargo check`.
