import { GFM, parser } from '@lezer/markdown';

const FENCED_CODE_NODE_NAME = 'FencedCode';
const markdownParser = parser.configure(GFM);

interface SourceRange {
    start: number;
    end: number;
}

function lineStartAt(markdown: string, position: number): number {
    return markdown.lastIndexOf('\n', position - 1) + 1;
}

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
