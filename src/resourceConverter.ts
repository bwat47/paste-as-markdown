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
 *  - Stores raster images only when their binary signature matches a supported format, whatever type is declared
 *  - Accepts SVG only when declared (content type or data URL) and parsed as well-formed XML with an SVG root
 *  - Enforces strict base64 and size limits
 */

import * as path from 'path';
import type Joplin from '../api/Joplin';
import type { ParsedImageData } from './types';
import logger from './logger';
import { resolveImageType } from './imageMime';
import { parseImageSource } from './html/shared/imageSource';
import type { DataImageSource, ImageSource, RemoteImageSource } from './html/shared/imageSource';

export interface ResourceConversionLimits {
    readonly maxImageBytes: number;
    readonly downloadTimeoutMs: number;
}

const DEFAULT_RESOURCE_CONVERSION_LIMITS: ResourceConversionLimits = {
    // Hard cap for image resource conversion to avoid excessive memory/disk usage (approximately 25 MB).
    maxImageBytes: 25 * 1024 * 1024,
    // Total deadline per remote image, including retries and the full body download.
    downloadTimeoutMs: 30000,
};

// Global joplin API (available at runtime in Joplin plugin environment)
declare const joplin: Joplin;
// Minimal interface for the fs-extra module methods we use
interface FileSystem {
    writeFileSync(path: string, data: Uint8Array): void;
    unlink(path: string, cb: (err: NodeJS.ErrnoException | null) => void): void;
}
/**
 * Standard base64 alphabet with at most two trailing `=` padding characters.
 * Buffer's decoder silently skips invalid characters and stops at the first `=`,
 * so input must be validated strictly before decoding. Padding length is checked separately.
 *  - accepts: "iVBORw0KGgo=", "QUJD"
 *  - rejects: "QQ==QQ==" (padding mid-string), "QQ!!" (invalid characters), "a-b_" (base64url)
 */
const STRICT_BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
/**
 * Non-image content types that are still downloaded because they carry no type information:
 * a missing header (normalized to '') or a generic binary type. The signature decides.
 */
const UNTYPED_CONTENT_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);
/** Filename stem used when the source URL has no usable filename. */
const DEFAULT_FILENAME_STEM = 'pasted';

function isConvertibleSource(source: ImageSource): source is DataImageSource | RemoteImageSource {
    return source.kind !== 'resource';
}

function isDataSource(source: ImageSource): source is DataImageSource {
    return source.kind === 'data';
}

function isRemoteSource(source: ImageSource): source is RemoteImageSource {
    return source.kind === 'remote';
}

/**
 * Convert eligible <img> tags to Joplin resources.
 *
 * Eligibility:
 *  - src starts with data: (base64) OR http/https URL
 *  - src does NOT already start with :/ (already a resource)
 *
 * @param body Root element whose descendant <img> nodes are inspected/modified.
 * @param limitOverrides Resource limits to apply instead of {@link DEFAULT_RESOURCE_CONVERSION_LIMITS}.
 * @returns ids (resource IDs created), attempted (count of images we tried to convert), failed (conversion failures).
 */
export async function convertImagesToResources(
    body: HTMLElement,
    limitOverrides: Partial<ResourceConversionLimits> = {}
): Promise<{ ids: string[]; attempted: number; failed: number }> {
    const limits = { ...DEFAULT_RESOURCE_CONVERSION_LIMITS, ...limitOverrides };
    let fs: FileSystem;
    try {
        fs = joplin.require('fs-extra');
    } catch (err) {
        logger.info('fs-extra unavailable; skipping resource conversion', (err as Error)?.message);
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
            if (isDataSource(source)) data = await parseBase64Image(source.url, limits.maxImageBytes);
            else if (isRemoteSource(source)) data = await downloadExternalImage(source.url, limits);
            if (!data) continue;
            const id = await createJoplinResource(fs, data);
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
async function parseBase64Image(dataUrl: string, maxImageBytes: number): Promise<ParsedImageData> {
    const match = dataUrl.match(/^data:([^;]+)(?:;charset=[^;]+)?;base64,(.+)$/i);
    if (!match) throw new Error('Invalid data URL');
    const declaredMime = match[1].toLowerCase();
    if (!declaredMime.startsWith('image/')) throw new Error('Not image');
    let b64 = match[2];
    b64 = b64.replace(/\s+/g, '');
    if (!STRICT_BASE64_PATTERN.test(b64)) throw new Error('Invalid base64 characters');
    // Mirror atob's rules: Buffer would silently drop a dangling data character (e.g. "QUJDA==")
    // (STRICT_BASE64_PATTERN guarantees '=' only appears as trailing padding)
    const paddingStart = b64.indexOf('=');
    const dataLength = paddingStart === -1 ? b64.length : paddingStart;
    if (dataLength % 4 === 1) throw new Error('Malformed base64 length');
    if (dataLength !== b64.length && b64.length % 4 !== 0) throw new Error('Malformed base64 padding');
    const estimatedBytes = Math.floor((b64.length * 3) / 4);
    if (estimatedBytes > maxImageBytes) throw new Error('Image exceeds maximum size');
    const decoded = Buffer.from(b64, 'base64');
    if (decoded.byteLength === 0) throw new Error('Base64 decode failed');
    if (decoded.byteLength > maxImageBytes) throw new Error('Image exceeds maximum size');
    // Plain Uint8Array view: signature detection rejects Buffers from another realm (e.g. under JSDOM).
    const bytes = new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength);
    return toParsedImage(bytes, declaredMime, DEFAULT_FILENAME_STEM);
}

/**
 * Download an external image with streaming size enforcement.
 * The timeout is a total deadline covering retries, headers and the full body stream.
 * Aborts if the deadline passes or cumulative bytes exceed the configured maximum.
 */
async function downloadExternalImage(url: string, limits: ResourceConversionLimits): Promise<ParsedImageData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), limits.downloadTimeoutMs);
    try {
        const resp = await fetchWithRetry(url, { signal: controller.signal }, 2, 200);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!contentType.startsWith('image/') && !UNTYPED_CONTENT_TYPES.has(contentType)) throw new Error('Not image');
        const contentLengthHeader = resp.headers.get('content-length');
        if (contentLengthHeader) {
            const asInt = parseInt(contentLengthHeader, 10);
            if (!isNaN(asInt) && asInt > limits.maxImageBytes) throw new Error('Image exceeds maximum size');
        }
        const reader = resp.body!.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                received += value.length;
                if (received > limits.maxImageBytes) throw new Error('Image exceeds maximum size');
            }
        }
        const merged = concatChunks(chunks, received);
        return await toParsedImage(merged, contentType, deriveFilenameStem(url));
    } finally {
        clearTimeout(timeout);
        // No-op after a completed download; releases the connection when exiting early.
        controller.abort();
    }
}

/**
 * Build resource metadata from image content. The resolved type supplies the MIME type and file extension,
 * so unsupported or mislabeled content is rejected regardless of its declared type.
 */
async function toParsedImage(bytes: Uint8Array, declaredMime: string, filenameStem: string): Promise<ParsedImageData> {
    const type = await resolveImageType(bytes, declaredMime);
    if (!type) throw new Error('Unsupported image type');
    return { bytes, mime: type.mime, filename: `${filenameStem}.${type.extension}`, size: bytes.byteLength };
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
 * Filename stem from the URL's last path segment when it looks like a filename, else `DEFAULT_FILENAME_STEM`.
 * The detected image type always supplies the extension, which the URL may contradict.
 */
function deriveFilenameStem(url: string): string {
    try {
        const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
        if (!/\.[a-z0-9]{2,5}$/i.test(last)) return DEFAULT_FILENAME_STEM;
        // Sanitize: remove path traversal and dangerous characters
        const sanitized = last.replace(/[^a-zA-Z0-9._-]/g, '');
        return path.parse(sanitized).name || DEFAULT_FILENAME_STEM;
    } catch (err) {
        // Expected: malformed URLs will fail to parse, use fallback filename
        logger.debug('Failed to parse URL for filename extraction:', truncateForLog(url), (err as Error)?.message);
        return DEFAULT_FILENAME_STEM;
    }
}

/**
 * Concatenate streamed byte chunks into a single byte array of known total length.
 */
function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

/**
 * Truncate very long strings for log output to avoid flooding the console (e.g., giant data URLs).
 * Shows beginning and end with a count of omitted characters.
 */
function truncateForLog(input: string, keep = 80): string {
    if (input.length <= keep * 2 + 20) return input; // small enough
    const omitted = input.length - keep * 2;
    return `${input.slice(0, keep)}...[${omitted} chars omitted]...${input.slice(-keep)}`;
}

/**
 * Monotonic counter used (with a timestamp) to build unique temp filenames.
 * A counter is preferred over Math.random(): uniqueness within the process is
 * guaranteed rather than probabilistic, and there is no pseudorandomness to
 * mistake for a security property (the temp file lives in the plugin's own
 * dataDir and is deleted immediately after the resource is created).
 */
let tempFileCounter = 0;
function nextTempFileId(): string {
    tempFileCounter = (tempFileCounter + 1) % Number.MAX_SAFE_INTEGER;
    return tempFileCounter.toString(36);
}

/**
 * Persist image bytes to a temporary file and create a Joplin resource from it.
 * Notes:
 *  - Joplin's data API expects a file path instead of raw bytes in this context.
 *  - Uses synchronous write when available for simplicity (files are small & sequential).
 *  - Best-effort cleanup of temp file (errors during cleanup are logged but not rethrown).
 */
async function createJoplinResource(fs: FileSystem, img: ParsedImageData): Promise<string> {
    const dataDir: string = await joplin.plugins.dataDir();
    // The extension always comes from the resolved image type, never from the source URL.
    const tmpName = `pam-${Date.now()}-${nextTempFileId()}${path.extname(img.filename)}`;
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
    try {
        fs.writeFileSync(tmpPath, img.bytes);
        const resource = await joplin.data.post(['resources'], null, { title: img.filename, mime: img.mime }, [
            { path: tmpPath },
        ]);
        return resource.id;
    } catch (e) {
        logger.warn('Failed to create resource from temp file', e);
        throw e;
    } finally {
        await new Promise<void>((resolve) => {
            try {
                fs.unlink(tmpPath, (err: NodeJS.ErrnoException | null) => {
                    if (err && err.code !== 'ENOENT') {
                        logger.warn('Temp file cleanup failed', err);
                    }
                    resolve();
                });
            } catch (e) {
                logger.warn('Temp file cleanup failed', e);
                resolve();
            }
        });
    }
}
