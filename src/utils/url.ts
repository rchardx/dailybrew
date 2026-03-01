import { createHash } from 'node:crypto';

// List of tracking parameters to strip from URLs
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'ref',
  'source',
  'mc_cid',
  'mc_eid',
];

/**
 * Normalize a URL by:
 * - Lowercasing scheme and host
 * - Removing fragments
 * - Removing tracking parameters
 * - Removing trailing slashes from paths
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Lowercase scheme and host
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.protocol = parsed.protocol.toLowerCase();

    // Remove tracking parameters
    const searchParams = new URLSearchParams(parsed.search);
    for (const param of TRACKING_PARAMS) {
      searchParams.delete(param);
    }

    // Remove fragments
    parsed.hash = '';

    // Manually reconstruct search string to preserve encoding
    // URLSearchParams.toString() converts %20 to +, so we rebuild it
    let search = '';
    const entries = Array.from(searchParams.entries());
    if (entries.length > 0) {
      const encoded = entries.map(([key, value]) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      }).join('&');
      search = `?${encoded}`;
    }

    // Build normalized URL
    let normalized = `${parsed.origin}${parsed.pathname}${search}`;

    // Remove trailing slash from path (but keep it if path is just "/")
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch (_error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Generate a SHA-256 hash of a normalized URL.
 * Two URLs with different tracking parameters will produce the same hash.
 */
export function hashUrl(url: string): string {
  const normalized = normalizeUrl(url);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Resolve a relative URL against a base URL.
 * Uses the native URL constructor which handles relative URL resolution.
 */
export function resolveUrl(relative: string, base: string): string {
  try {
    const resolved = new URL(relative, base);
    return resolved.href;
  } catch (_error) {
    throw new Error(`Could not resolve URL: ${relative} relative to ${base}`);
  }
}
