/**
 * Image Resource Conversion Module
 * ---------------------------------
 * Responsibilities:
 *  - Identify eligible <img> elements (data: URLs or http/https sources not already Joplin resources)
 *  - Safely obtain binary data (base64 decode or streamed network download with size enforcement)
 *  - Create Joplin resources using a temporary file (sandbox requires a filepath for resource creation)
 *  - Provide metrics (attempted / failed counts) for user feedback
 *
 * Note: Image attribute normalization is handled by the post-sanitize pass in src/html/post/images.ts
 *
 * Security Considerations:
 *  - Only processes image MIME types (content-type or data: prefix)
 *  - Enforces strict base64 and size limits
 */

import { MAX_IMAGE_BYTES, DOWNLOAD_TIMEOUT_MS } from './constants';
import * as path from 'path';
import type Joplin from '../api/Joplin';
import type { ParsedImageData } from './types';
import logger from './logger';

// Global joplin API (available at runtime in Joplin plugin environment)
declare const joplin: Joplin;

interface FsExtraLike {
    writeFileSync?: (path: string, data: Uint8Array | Buffer) => void;
    writeFile?: (path: string, data: Uint8Array | Buffer, cb: (err?: Error | null) => void) => void;
    existsSync?: (path: string) => boolean;
    unlink?: (path: string, cb: (err?: Error | null) => void) => void;
}

type ResourceImageSource = { kind: 'resource'; url: string };
type DataImageSource = { kind: 'data'; url: string };
type RemoteImageSource = { kind: 'remote'; url: string; protocol: 'http' | 'https' };
type ImageSource = ResourceImageSource | DataImageSource | RemoteImageSource;

function parseImageSource(raw: string | null): ImageSource | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith(':/')) return { kind: 'resource', url: trimmed };
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('data:')) return { kind: 'data', url: trimmed };
    if (lower.startsWith('https://')) return { kind: 'remote', url: trimmed, protocol: 'https' };
    if (lower.startsWith('http://')) return { kind: 'remote', url: trimmed, protocol: 'http' };
    return null;
}

function isConvertibleSource(source: ImageSource): source is DataImageSource | RemoteImageSource {
    return source.kind !== 'resource';
}

function isDataSource(source: ImageSource): source is DataImageSource {
    return source.kind === 'data';
}

function isRemoteSource(source: ImageSource): source is RemoteImageSource {
    return source.kind === 'remote';
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
        logger.debug('fs-extra not available:', (err as Error)?.message || 'unknown error');
    }
    if (!fsExtraAvailable) {
        logger.info('fs-extra unavailable; skipping resource conversion (leaving image sources intact)');
        return { ids: [], attempted: 0, failed: 0 };
    }
    const imgs = Array.from(body.querySelectorAll('img[src]')) as HTMLImageElement[];
    const ids: string[] = [];
    let attempted = 0;
    let failed = 0;
    for (const img of imgs) {
        const source = parseImageSource(img.getAttribute('src'));
        if (!source || !isConvertibleSource(source)) continue;
        try {
            attempted++;
            let data: ParsedImageData | null = null;
            if (isDataSource(source)) data = await parseBase64Image(source.url);
            else if (isRemoteSource(source)) data = await downloadExternalImage(source.url);
            if (!data) continue;
            const id = await createJoplinResource(data);
            img.setAttribute('src', `:/${id}`);
            // data-pam-converted is used by imageLinks post-processing step to unwrap converted images from links
            img.setAttribute('data-pam-converted', 'true');
            ids.push(id);
        } catch (e) {
            failed++;
            const error = e as Error;
            logger.warn('Failed to convert image to resource', {
                src: truncateForLog(source.url),
                error: error?.message || 'Unknown error',
                type: error?.name || 'Error',
            });
        }
    }
    return { ids, attempted, failed };
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
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
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
        logger.debug('Failed to parse URL for filename extraction:', truncateForLog(url), (err as Error)?.message);
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
        logger.warn('fs-extra unavailable; skipping image resource conversion');
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
        logger.warn('Failed to create resource from temp file', e);
        throw e;
    } finally {
        if (typeof fsLike.unlink === 'function') {
            await new Promise<void>((resolve) => {
                try {
                    // Resolve even on ENOENT so cleanup remains best-effort
                    fsLike.unlink!(tmpPath, (err) => {
                        if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
                            logger.warn('Temp file cleanup failed', err);
                        }
                        resolve();
                    });
                } catch (cleanupErr) {
                    logger.warn('Temp file cleanup failed', cleanupErr);
                    resolve();
                }
            });
        }
    }
}
