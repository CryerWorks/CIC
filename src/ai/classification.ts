/**
 * Endpoint classification (Feature 016, FR-009 / FR-010). Spine-adjacent: a pure helper with no
 * dependencies, used by adapters to compute `ProviderCapabilities.isLocal` and by the settings UI
 * to render the local / remote / remote (LAN) tag.
 *
 * Deliberate narrowing: ONLY loopback hosts (`localhost` / `127.0.0.1` / `::1`) are local. LAN
 * ranges are deliberately treated as remote — the app cannot verify a LAN box's egress posture,
 * and silently treating LAN as local would surprise users in a privacy-bad way.
 */

function parseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True iff the URL's host is `localhost`, `127.0.0.1`, or `::1`. THE flag the lockdown gate reads. */
export function isLocalHost(url: string): boolean {
  const host = parseHost(url);
  if (host === null) return false;
  // Bracketed IPv6: new URL("http://[::1]/").hostname === "[::1]"
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/** True iff the URL's host is an RFC1918 private-network address. Used for the UI tag
 *  "remote (LAN)" — these MUST still be treated as remote by the lockdown gate (FR-010). */
export function isLanHost(url: string): boolean {
  const host = parseHost(url);
  if (host === null) return false;
  // 10.0.0.0/8
  if (/^10\./.test(host)) return true;
  // 172.16.0.0/12
  const m = host.match(/^172\.(\d{1,3})\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  // 192.168.0.0/16
  if (/^192\.168\./.test(host)) return true;
  return false;
}
