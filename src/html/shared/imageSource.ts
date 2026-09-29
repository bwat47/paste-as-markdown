/**
 * Classification of image `src` values that Joplin can render or convert into resources.
 *
 * Recognized forms:
 * - `:/0123abcd...` existing Joplin resource
 * - `data:image/png;base64,...` inline data
 * - `https://example.com/a.png` / `http://...` remote URL
 *
 * Anything else (relative paths such as `_images/a.png`, `file:`, `blob:`, `cid:`) is unrenderable.
 */
type ResourceImageSource = { kind: 'resource'; url: string };
export type DataImageSource = { kind: 'data'; url: string };
export type RemoteImageSource = { kind: 'remote'; url: string; protocol: 'http' | 'https' };
export type ImageSource = ResourceImageSource | DataImageSource | RemoteImageSource;

const RESOURCE_PREFIX = ':/';
const DATA_PREFIX = 'data:';
const HTTPS_PREFIX = 'https://';
const HTTP_PREFIX = 'http://';

/** Classify an image `src`, returning `null` when Joplin cannot render it. */
export function parseImageSource(raw: string | null): ImageSource | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith(RESOURCE_PREFIX)) return { kind: 'resource', url: trimmed };
    const lower = trimmed.toLowerCase();
    if (lower.startsWith(DATA_PREFIX)) return { kind: 'data', url: trimmed };
    if (lower.startsWith(HTTPS_PREFIX)) return { kind: 'remote', url: trimmed, protocol: 'https' };
    if (lower.startsWith(HTTP_PREFIX)) return { kind: 'remote', url: trimmed, protocol: 'http' };
    return null;
}
