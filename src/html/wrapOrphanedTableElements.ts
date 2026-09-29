// Tags that are only valid inside <table>, matched against raw clipboard HTML before sanitization,
// so this list is independent of the sanitizer allowlist. 'caption' is excluded on purpose: a
// caption never appears without rows in a real fragment, and wrapping a caption-only fragment in a
// <table> would feed it to a table rule that drops cell-less tables, losing the text.
const ORPHANABLE_TABLE_TAGS = ['colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'] as const;

// Matches an opening tag for any table-only element, e.g. `<tr>`, `<td class="x">`, `<col/>`.
// The trailing character class keeps `th` from matching `<thead>` as a prefix (alternation
// backtracks to the longer tag name instead).
const ORPHANED_TABLE_TAG_PATTERN = new RegExp(`<(?:${ORPHANABLE_TABLE_TAGS.join('|')})[\\s>/]`, 'i');
const TABLE_WRAPPER_PATTERN = /<table[\s>]/i;

/**
 * Wraps orphaned table elements (col, tr, td, etc.) in a proper table structure.
 * This fixes Excel clipboard data that often contains table fragments without the <table> wrapper.
 *
 * @internal Exposed for unit testing.
 */
export function wrapOrphanedTableElements(html: string): string {
    const trimmed = html.trim();

    // Check if we have table-related elements but no table wrapper
    const hasTableElements = ORPHANED_TABLE_TAG_PATTERN.test(trimmed);
    const hasTableWrapper = TABLE_WRAPPER_PATTERN.test(trimmed);

    if (hasTableElements && !hasTableWrapper) {
        return `<table>${trimmed}</table>`;
    }

    return html;
}
