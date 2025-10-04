import { LOG_PREFIX, MAX_IMAGE_BYTES, DOWNLOAD_TIMEOUT_MS, MAX_ALT_TEXT_LENGTH } from './constants';
import { normalizeAltText } from './textUtils';
import * as path from 'path';
import type Joplin from '../api/Joplin';
import type { ParsedImageData } from './types';

// Global joplin API (available at runtime in Joplin plugin environment)
declare const joplin: Joplin;

interface FsExtraLike {
    writeFileSync?: (path: string, data: Uint8Array | Buffer) => void;
    writeFile?: (path: string, data: Uint8Array | Buffer, cb: (err?: Error | null) => void) => void;
    existsSync?: (path: string) => boolean;
    unlink?: (path: string, cb: (err?: Error | null) => void) => void;
}

async function writeFileSafe(fsLike: FsExtraLike, filePath: string, data: Uint8Array | Buffer): Promise<void> {
    if (typeof fsLike.writeFileSync === 'function') {
        fsLike.writeFileSync(filePath, data);
        return;
    }
    if (typeof fsLike.writeFile === 'function') {
        await new Promise<void>((resolve, reject) => {
            fsLike.writeFile!(filePath, data, (err) => (err ? reject(err) : resolve()));
        });
        return;
    }
    throw new Error('fs write unavailable');
}

/**
 * Image Resource Conversion Module
 * ---------------------------------
 * Responsibilities:
 *  - Identify eligible <img> elements (data: URLs or http/https sources not already Joplin resources)
 *  - Safely obtain binary data (base64 decode or streamed network download with size enforcement)
 *  - Create Joplin resources using a temporary file (sandbox requires a filepath for resource creation)
 *  - Sanitize & normalize resulting <img> tags (attribute whitelist + ordering + alt text fallback)
 *  - Provide metrics (attempted / failed counts) for user feedback
 *  - Unwrap remote hyperlink wrappers around images once converted to local resources to avoid leaving
 *    now-misleading outbound links (anchor is removed if it only wraps the image and no other content)
 *
 * Design Choices / Rationale:
 *  - fs-extra capability check: Some environments may not expose fs-extra; in that case we bail out silently
 *    and leave original <img> sources intact instead of throwing.
 *  - Temporary file approach: Joplin core expects a file path when creating resources. We write the decoded
 *    bytes to the plugin data directory, POST the resource, then attempt best‑effort cleanup.
 *  - Size limits: Enforced early both for base64 (pre‑decode estimate + post‑decode) and streaming downloads to
 *    prevent excessive memory usage. MAX_IMAGE_BYTES is centralized in constants.
 *  - Streaming download: Uses ReadableStream reader with incremental size guard so very large images are cut off
 *    before full allocation.
 *  - Timeouts: Network fetch guarded with AbortController (15s) so conversions don't hang indefinitely.
 *  - Base64 validation: Rejects malformed or suspicious base64 before decode (character set + padding + length check).
 *  - Alt text sanitization: Ensures reasonable alt text (no control chars, length capped, fallback to 'image').
 *  - Attribute normalization: Reduces variance in downstream markdown by only keeping src|alt|width|height in a
 *    deterministic order.
 *  - Failure Isolation: Each image conversion is wrapped so one failure does not abort the whole batch; failures
 *    increment a counter and processing continues.
 *
 * Security Considerations:
 *  - Only processes image MIME types (content-type or data: prefix)
 *  - Enforces strict base64 and size limits
 */

// ParsedImageData exported from types.ts for reuse

/**
 * Convert eligible <img> tags to Joplin resources.
 *
 * Eligibility:
 *  - src starts with data: (base64) OR http/https URL
 *  - src does NOT already start with :/ (already a resource)
 *
 * @param body Root element whose descendant <img> nodes are inspected/modified.
 * @returns ids (resource IDs created), attempted (count of images we tried to convert), failed (conversion failures).
 */
export async function convertImagesToResources(
    body: HTMLElement
): Promise<{ ids: string[]; attempted: number; failed: number }> {
    let fsExtraAvailable = true;
    try {
        joplin.require('fs-extra');
    } catch (err) {
        // Expected: fs-extra module may not be available in some Joplin environments
        fsExtraAvailable = false;
        console.debug(LOG_PREFIX, 'fs-extra not available:', (err as Error)?.message || 'unknown error');
    }
    if (!fsExtraAvailable) {
        console.info(LOG_PREFIX, 'fs-extra unavailable; skipping resource conversion (leaving image sources intact)');
        return { ids: [], attempted: 0, failed: 0 };
    }
    const imgs = Array.from(body.querySelectorAll('img[src]')).filter((img) => {
        const src = img.getAttribute('src') || '';
        return src && !src.startsWith(':/') && (src.startsWith('data:') || /^https?:\/\//i.test(src));
    });
    const ids: string[] = [];
    let attempted = 0;
    let failed = 0;
    for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        try {
            attempted++;
            let data: ParsedImageData | null = null;
            if (src.startsWith('data:')) data = await parseBase64Image(src);
            else if (/^https?:\/\//i.test(src)) data = await downloadExternalImage(src);
            if (!data) continue;
            const id = await createJoplinResource(data);
            img.setAttribute('src', `:/${id}`);
            standardizeImageElement(img as HTMLImageElement, data.filename);
            unwrapConvertedImageLink(img as HTMLImageElement);
            ids.push(id);
        } catch (e) {
            failed++;
            const error = e as Error;
            console.warn(LOG_PREFIX, 'Failed to convert image to resource:', {
                src: truncateForLog(src),
                error: error?.message || 'Unknown error',
                type: error?.name || 'Error',
            });
        }
    }
    return { ids, attempted, failed };
}

/**
 * Standardize every <img> element regardless of conversion outcome so output HTML is uniform.
 * - Ensures only whitelisted attributes remain
 * - Applies canonical ordering (src, alt, title, width, height)
 * - Fills missing alt from an inferred filename
 */
export function standardizeRemainingImages(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img[src]')) as HTMLImageElement[];
    imgs.forEach((img) => {
        const src = img.getAttribute('src') || '';
        const filename = deriveOriginalFilename(src) || 'image';
        standardizeImageElement(img, filename);
    });
}

/**
 * Apply normalization rules to a single <img> element.
 * Internal helper – not exported to keep surface minimal.
 */
function standardizeImageElement(img: HTMLImageElement, originalFilename: string): void {
    // Normalize any existing alt to ensure consistent whitespace/control handling
    const existingAltRaw = img.getAttribute('alt');
    const existingAlt = existingAltRaw ? normalizeAltText(existingAltRaw) : '';
    if (!existingAlt) {
        const base = originalFilename.replace(/\.[a-z0-9]{2,5}$/i, '');
        img.setAttribute('alt', sanitizeAltText(base));
    } else if (existingAlt !== existingAltRaw) {
        // If normalization changed the value, write it back
        img.setAttribute('alt', existingAlt);
    }
    const allowed = new Set(['src', 'alt', 'title', 'width', 'height']);
    for (const attr of Array.from(img.attributes)) {
        if (!allowed.has(attr.name.toLowerCase())) img.removeAttribute(attr.name);
    }
    const srcVal = img.getAttribute('src') || '';
    const altVal = img.getAttribute('alt');
    const titleVal = img.getAttribute('title');
    const widthVal = img.getAttribute('width');
    const heightVal = img.getAttribute('height');
    ['src', 'alt', 'title', 'width', 'height'].forEach((a) => img.removeAttribute(a));
    if (srcVal) img.setAttribute('src', srcVal);
    if (altVal) img.setAttribute('alt', altVal);
    if (titleVal) img.setAttribute('title', titleVal);
    if (widthVal) img.setAttribute('width', widthVal);
    if (heightVal) img.setAttribute('height', heightVal);
}

/**
 * Infer a stable pseudo filename from a source URL or data URI for alt text fallback.
 */
function deriveOriginalFilename(src: string): string {
    if (src.startsWith('data:')) return 'pasted';
    if (src.startsWith(':/')) return 'resource';
    try {
        const u = new URL(src, 'https://placeholder.local');
        const last = u.pathname.split('/').filter(Boolean).pop() || 'image';
        const cleaned = last.split('?')[0].split('#')[0];
        // Sanitize: remove path traversal and dangerous characters
        const sanitized = cleaned.replace(/[^a-zA-Z0-9._-]/g, '');
        return sanitized || 'image';
    } catch (err) {
        // Expected: malformed URLs will fail to parse, fallback to generic name
        console.debug(
            LOG_PREFIX,
            'Failed to parse URL for filename derivation:',
            truncateForLog(src),
            (err as Error)?.message
        );
        return 'image';
    }
}

/**
 * Sanitize derived alt text: strip control chars, collapse whitespace, cap length.
 */
function sanitizeAltText(raw: string): string {
    // Reuse shared normalization and then apply length cap and fallback
    let out = normalizeAltText(raw);
    if (!out) out = 'image';
    if (out.length > MAX_ALT_TEXT_LENGTH) out = out.slice(0, MAX_ALT_TEXT_LENGTH - 3) + '...';
    return out;
}

/**
 * Decode and validate a base64 data URL image.
 * Performs early size estimation before allocating full decoded buffer.
 */
async function parseBase64Image(dataUrl: string): Promise<ParsedImageData> {
    const match = dataUrl.match(/^data:([^;]+)(?:;charset=[^;]+)?;base64,(.+)$/i);
    if (!match) throw new Error('Invalid data URL');
    const mime = match[1].toLowerCase();
    if (!mime.startsWith('image/')) throw new Error('Not image');
    let b64 = match[2];
    b64 = b64.replace(/\s+/g, '');
    if (/[^A-Za-z0-9+/=]/.test(b64)) throw new Error('Invalid base64 characters');
    if (b64.length % 4 === 1) throw new Error('Malformed base64 length');
    const estimatedBytes = Math.floor((b64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    let binary: string;
    try {
        binary = atob(b64);
    } catch {
        throw new Error('Base64 decode failed');
    }
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    return { buffer: bytes.buffer, mime, filename: `pasted.${extensionForMime(mime)}`, size: bytes.byteLength };
}

/**
 * Download an external image with streaming size enforcement.
 * Aborts if cumulative bytes exceed MAX_IMAGE_BYTES.
 */
async function downloadExternalImage(url: string): Promise<ParsedImageData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    const resp = await fetchWithRetry(url, { signal: controller.signal }, 2, 200);
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('Not image');
    const contentLengthHeader = resp.headers.get('content-length');
    if (contentLengthHeader) {
        const asInt = parseInt(contentLengthHeader, 10);
        if (!isNaN(asInt) && asInt > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    }
    const reader = resp.body?.getReader();
    if (!reader) {
        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
        const filenameImmediate = deriveFilenameFromUrl(url, extensionForMime(contentType));
        return { buffer, mime: contentType, filename: filenameImmediate, size: buffer.byteLength };
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            received += value.length;
            if (received > MAX_IMAGE_BYTES) {
                controller.abort();
                throw new Error('Image exceeds maximum size');
            }
        }
    }
    const merged = concatChunks(chunks, received);
    const filename = deriveFilenameFromUrl(url, extensionForMime(contentType));
    return { buffer: merged, mime: contentType, filename, size: merged.byteLength };
}

/**
 * Lightweight retry wrapper around fetch for transient errors.
 * Retries on network errors and HTTP 408/429/5xx with exponential backoff.
 */
async function fetchWithRetry(url: string, init: RequestInit, retries: number, baseDelayMs: number): Promise<Response> {
    let attempt = 0;
    while (true) {
        const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
        if (signal?.aborted) throw new Error('abort');
        try {
            const resp = await fetch(url, init);
            if (resp.ok) return resp;
            const status = resp.status;
            const retryable = status === 408 || status === 429 || (status >= 500 && status < 600);
            if (!retryable || attempt >= retries) return resp; // return last response; caller will handle !ok
        } catch (e) {
            // Network or abort errors: retry if not exceeded
            if (signal?.aborted || attempt >= retries) throw e;
        }
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
    }
}

/**
 * Extract filename (if present) from URL path or synthesize one with provided fallback extension.
 */
function deriveFilenameFromUrl(url: string, fallbackExt: string): string {
    try {
        const u = new URL(url);
        const last = u.pathname.split('/').filter(Boolean).pop() || '';
        if (last && /\.[a-z0-9]{2,5}$/i.test(last)) {
            // Sanitize: remove path traversal and dangerous characters
            const sanitized = last.replace(/[^a-zA-Z0-9._-]/g, '');
            return sanitized || `pasted.${fallbackExt}`;
        }
        return `pasted.${fallbackExt}`;
    } catch (err) {
        // Expected: malformed URLs will fail to parse, use fallback filename
        console.debug(
            LOG_PREFIX,
            'Failed to parse URL for filename extraction:',
            truncateForLog(url),
            (err as Error)?.message
        );
        return `pasted.${fallbackExt}`;
    }
}

/**
 * Map common image MIME types to file extensions; fallback to 'bin' for unknown types.
 */
function extensionForMime(mime: string): string {
    const map: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/bmp': 'bmp',
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico',
    };
    return map[mime] || 'bin';
}

/**
 * Concatenate streamed byte chunks into a single ArrayBuffer of known total length.
 */
function concatChunks(chunks: Uint8Array[], totalBytes: number): ArrayBuffer {
    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out.buffer;
}

/**
 * Truncate very long strings for log output to avoid flooding the console (e.g., giant data URLs).
 * Shows beginning and end with a count of omitted characters.
 */
function truncateForLog(input: string, keep: number = 80): string {
    if (input.length <= keep * 2 + 20) return input; // small enough
    const omitted = input.length - keep * 2;
    return `${input.slice(0, keep)}...[${omitted} chars omitted]...${input.slice(-keep)}`;
}

/**
 * If the converted <img> is wrapped in a simple remote <a href="http(s)://..."> whose only child is the image,
 * unwrap it (remove the anchor) so the local resource image is not a clickable external link (and prevent issues with Rich Markdown plugin).
 * We purposefully do NOT reinsert the original link elsewhere to keep output minimal.
 */
function unwrapConvertedImageLink(img: HTMLImageElement): void {
    // Find ancestor anchor if present
    let anchor: HTMLElement | null = null;
    let cur: HTMLElement | null = img.parentElement;
    while (cur) {
        if (cur.tagName.toLowerCase() === 'a') {
            anchor = cur;
            break;
        }
        cur = cur.parentElement;
    }
    if (!anchor) return;

    // Only unwrap remote anchors, and only after conversion to a Joplin resource
    const href = (anchor as HTMLAnchorElement).getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    if (!img.getAttribute('src')?.startsWith(':/')) return;

    const isWhitespace = (n: Node) => n.nodeType === Node.TEXT_NODE && !(n.textContent || '').trim();
    const childrenWithoutWs = (el: Element) => Array.from(el.childNodes).filter((n) => !isWhitespace(n));

    // Validate that the path from anchor → ... → img forms a single chain with no siblings at each level.
    // Starting from the image, walk up until the anchor; each parent along the way must only contain the current node.
    let node: Node = img;
    while (node.parentElement && node.parentElement !== anchor) {
        const p = node.parentElement;
        const kids = childrenWithoutWs(p);
        if (!(kids.length === 1 && kids[0] === node)) return; // has siblings; don't unwrap
        node = p;
    }
    // Now ensure the anchor itself only contains the top node in the chain
    const topNode = node; // either img or a wrapper whose only descendant chain leads to img
    const anchorKids = childrenWithoutWs(anchor);
    if (!(anchorKids.length === 1 && anchorKids[0] === topNode)) return;

    // Safe to unwrap: move the image out and drop the anchor
    const grand = anchor.parentNode;
    if (!grand) return;
    grand.insertBefore(img, anchor);
    grand.removeChild(anchor);
}

/**
 * Persist image bytes to a temporary file and create a Joplin resource from it.
 * Notes:
 *  - Joplin's data API expects a file path instead of raw bytes in this context.
 *  - Uses synchronous write when available for simplicity (files are small & sequential).
 *  - Best-effort cleanup of temp file (errors during cleanup are logged but not rethrown).
 */
async function createJoplinResource(img: ParsedImageData): Promise<string> {
    const dataDir: string = await joplin.plugins.dataDir();
    let fs: FsExtraLike;
    try {
        fs = joplin.require('fs-extra');
    } catch (e) {
        console.warn(LOG_PREFIX, 'fs-extra unavailable; skipping image resource conversion');
        throw e;
    }
    const rawExt = img.filename.split('.').pop() || extensionForMime(img.mime);
    const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
    const tmpName = `pam-${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
    const tmpPath = path.join(dataDir, tmpName);

    // Validate the resolved path is still within dataDir to prevent path traversal
    const resolvedPath = path.resolve(tmpPath);
    const resolvedDataDir = path.resolve(dataDir);
    const relative = path.relative(resolvedDataDir, resolvedPath);
    const traversesUp =
        relative !== '' && (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative));
    if (traversesUp) {
        throw new Error('Invalid file path: potential path traversal detected');
    }
    const fsLike: FsExtraLike = fs;
    try {
        const buffer =
            typeof Buffer !== 'undefined' ? Buffer.from(new Uint8Array(img.buffer)) : new Uint8Array(img.buffer);
        await writeFileSafe(fsLike, tmpPath, buffer);
        const resource = await joplin.data.post(['resources'], null, { title: img.filename, mime: img.mime }, [
            { path: tmpPath },
        ]);
        return resource.id;
    } catch (e) {
        console.warn(LOG_PREFIX, 'Failed to create resource from temp file', e);
        throw e;
    } finally {
        if (typeof fsLike.unlink === 'function') {
            await new Promise<void>((resolve) => {
                try {
                    // Resolve even on ENOENT so cleanup remains best-effort
                    fsLike.unlink!(tmpPath, (err) => {
                        if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
                            console.warn(LOG_PREFIX, 'Temp file cleanup failed', err);
                        }
                        resolve();
                    });
                } catch (cleanupErr) {
                    console.warn(LOG_PREFIX, 'Temp file cleanup failed', cleanupErr);
                    resolve();
                }
            });
        }
    }
}
