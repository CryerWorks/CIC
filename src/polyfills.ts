/**
 * Browser polyfills for the Tauri webview. Must be imported before any module that needs them.
 *
 * `gray-matter` (the vault layer's frontmatter serializer) references Node's `Buffer` global,
 * which the webview does not provide. Vite does not polyfill Node globals automatically, so a
 * vault write (`matter.stringify`) throws "Buffer is not defined" at runtime. Node-based tests
 * never hit this (Node has `Buffer`), so it only surfaces in `tauri dev`/build. We assign the
 * pure-JS `buffer` polyfill to `globalThis` at startup — before any save runs.
 */
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
