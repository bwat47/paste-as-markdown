import { GFM, parser } from '@lezer/markdown';

const FENCED_CODE_NODE_NAME = 'FencedCode';
const markdownParser = parser.configure(GFM);

interface SourceRange {
    start: number;
    end: number;
}

/** Offset of the first character on the line containing `position` (0 when on the first line). */
function lineStartAt(markdown: string, position: number): number {
    return markdown.lastIndexOf('\n', position - 1) + 1;
}

/**
 * Collects the source ranges of every top-level fenced code block, in document order.
 *
 * Ranges are widened backwards to the start of the opening line so the container prefix
 * (list indentation, blockquote markers) stays inside the protected range. Turndown emits
 * fences whose opening line is nothing but indentation - `- foo\n\n\t```\n\ta\n\t``` `
 * for a `<pre>` after a paragraph in a list item - and leaving that indentation in the
 * preceding segment lets a whitespace-only line strip delete it and unnest the fence.
 * The indent is tabs or spaces per the list indentation setting; either way it is
 * whitespace that the strip would otherwise remove.
 */
function findFencedCodeRanges(markdown: string): SourceRange[] {
    const ranges: SourceRange[] = [];

    markdownParser.parse(markdown).iterate({
        enter: (node) => {
            if (node.name !== FENCED_CODE_NODE_NAME) return;

            ranges.push({ start: lineStartAt(markdown, node.from), end: node.to });
            return false;
        },
    });

    return ranges;
}

/** Applies a transformation only to Markdown outside fenced code blocks. */
export function transformMarkdownOutsideFencedCode(markdown: string, transform: (segment: string) => string): string {
    const ranges = findFencedCodeRanges(markdown);
    if (ranges.length === 0) return transform(markdown);

    const parts: string[] = [];
    let cursor = 0;

    for (const range of ranges) {
        parts.push(transform(markdown.slice(cursor, range.start)));
        parts.push(markdown.slice(range.start, range.end));
        cursor = range.end;
    }

    parts.push(transform(markdown.slice(cursor)));
    return parts.join('');
}
