// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, posix } from "node:path";

/**
 * Architectural-boundary assertion (Feature 016 / FR-024 / FR-025 / Constitution II).
 *
 * Walks `src/` and asserts that NO source file outside `src/ai/adapters/**` or `src/ai/testing/**`
 * imports an adapter class (`OllamaAdapter` / `OpenAICompatibleAdapter` / `AnthropicAdapter` /
 * `TauriKeychainSecretStore`) OR from a path under `src/ai/adapters/`. Features depend on the
 * spine (`provider`, `errors`, `config`, `secrets`, `router`) and on the composition root's
 * `useAIRouter()` — never on a concrete adapter class.
 *
 * Exceptions: `src/app/providers/AIProvider.tsx` is the composition root and is allowed to import
 * `createProvider` from `src/ai/adapters/index.ts` + `TauriKeychainSecretStore` from
 * `src/ai/adapters/secrets/tauri.ts`. `src/app/test-support.tsx` mirrors that for test fixtures.
 */

const SRC_ROOT = join(__dirname, "..");
const FORBIDDEN_SYMBOLS = [
  "OllamaAdapter",
  "OpenAICompatibleAdapter",
  "AnthropicAdapter",
];

const ADAPTER_PATH_RE = /from\s+["'].*\/ai\/adapters\/[^"']+["']/;
// `createProvider` from `../ai/adapters` (or `../../ai/adapters`, etc.) is the composition-root
// integration point; we allow the AIProvider + test-support to import it, NOT feature code.
const CREATE_PROVIDER_PATH_RE = /from\s+["'].*\/ai\/adapters["']/;

const EXEMPT_FILES = new Set<string>([
  // Adapter directory itself — internal imports are fine.
  // We exempt via path-prefix, not file list.
]);

const EXEMPT_PREFIXES = [
  "ai/adapters/",
  "ai/testing/",
];

const COMPOSITION_ROOT_EXEMPTIONS = [
  "app/providers/AIProvider.tsx",
  "app/test-support.tsx",
];

function* walkTsFiles(dir: string): Iterable<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (
      st.isFile() &&
      /\.(ts|tsx)$/.test(entry) &&
      !/\.d\.ts$/.test(entry) &&
      // Production source only — test files (which legitimately import adapter classes for
      // their fakes and contract harnesses) are not subject to the boundary rule.
      !/\.test\.(ts|tsx)$/.test(entry)
    ) {
      yield full;
    }
  }
}

function isExempt(srcRelative: string): boolean {
  const normalized = srcRelative.split("\\").join("/");
  if (COMPOSITION_ROOT_EXEMPTIONS.includes(normalized)) return true;
  for (const prefix of EXEMPT_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  if (EXEMPT_FILES.has(normalized)) return true;
  return false;
}

describe("FR-024 / FR-025 — architectural boundary (no feature imports an adapter class)", () => {
  it("no source file outside src/ai/adapters/** or src/ai/testing/** imports a concrete adapter class", () => {
    const offenders: Array<{ file: string; reason: string }> = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      const srcRelative = relative(SRC_ROOT, file).split("\\").join("/");
      if (isExempt(srcRelative)) continue;
      const text = readFileSync(file, "utf8");

      // Skip test files that don't import adapter classes directly (router tests etc are fine).
      if (ADAPTER_PATH_RE.test(text)) {
        offenders.push({
          file: srcRelative,
          reason: "imports from a path under src/ai/adapters/",
        });
        continue;
      }
      if (CREATE_PROVIDER_PATH_RE.test(text)) {
        offenders.push({
          file: srcRelative,
          reason: "imports from src/ai/adapters (the createProvider barrel) — only the composition root may",
        });
        continue;
      }
      for (const sym of FORBIDDEN_SYMBOLS) {
        const importRe = new RegExp(`import[^;]*\\b${sym}\\b`);
        if (importRe.test(text)) {
          offenders.push({ file: srcRelative, reason: `imports forbidden class ${sym}` });
          break;
        }
      }
    }
    if (offenders.length > 0) {
      const msg = offenders.map((o) => `  - ${o.file}: ${o.reason}`).join("\n");
      throw new Error(`Architectural boundary violations:\n${msg}`);
    }
    expect(offenders).toHaveLength(0);
  });

  it("composition-root exemptions exist and ARE allowed to import adapters", () => {
    // Sanity: the exempt files actually do use the imports we're exempting them for, otherwise
    // the test above would falsely pass forever even if the AIProvider stopped wiring adapters.
    for (const exempt of COMPOSITION_ROOT_EXEMPTIONS) {
      const path = join(SRC_ROOT, exempt);
      const text = readFileSync(path, "utf8");
      const importsAdapterStuff =
        CREATE_PROVIDER_PATH_RE.test(text) || ADAPTER_PATH_RE.test(text) ||
        FORBIDDEN_SYMBOLS.some((s) => new RegExp(`import[^;]*\\b${s}\\b`).test(text));
      expect(importsAdapterStuff).toBe(true);
    }
  });
});

void posix; // keep the posix import in case the join helper ever needs it
