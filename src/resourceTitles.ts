/** Prefix of the filename stem used when an image source has no usable filename. */
const FALLBACK_STEM_PREFIX = 'pasted';
const TIMESTAMP_FIELD_WIDTH = 2;

function pad(value: number): string {
    return String(value).padStart(TIMESTAMP_FIELD_WIDTH, '0');
}

/**
 * Format a date in local time as a filename-safe, sortable timestamp (no colons, which Windows forbids).
 *  - e.g. 2026-10-03 14:30:25 -> "2026-10-03-143025"
 */
export function formatFilenameTimestamp(date: Date): string {
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `${day}-${time}`;
}

/**
 * Fallback stem for the nth (1-based) image of a paste that has no usable filename. All stems share the
 * paste's timestamp, so images from the same paste group together; later stems get an OS-style numeric
 * suffix (the second image is "-2", as in "file (2)") to stay unique.
 *  - e.g. index 1, 2, 3 -> "pasted-2026-10-03-143025", "pasted-2026-10-03-143025-2", "pasted-2026-10-03-143025-3"
 */
export function formatFallbackStem(pastedAt: Date, index: number): string {
    const base = `${FALLBACK_STEM_PREFIX}-${formatFilenameTimestamp(pastedAt)}`;
    return index === 1 ? base : `${base}-${index}`;
}
