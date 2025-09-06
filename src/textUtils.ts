/**
 * Text utilities shared across modules.
 *
 * normalizeAltText: sanitize alt text values by removing control characters and
 * normalizing whitespace, including various Unicode separators. Collapses runs
 * of whitespace into a single space and trims the result.
 */
export function normalizeAltText(raw: string): string {
    if (raw == null) return '';
    return (
        String(raw)
            // ASCII control characters (including CR/LF/TAB) and DEL
            .replace(/[\u0000-\u001F\u007F]/g, ' ')
            // Common Unicode separators (NBSP and general separators)
            .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
            // Collapse runs of whitespace
            .replace(/\s+/g, ' ')
            .trim()
    );
}
