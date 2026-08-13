const MINIMUM_FENCE_LENGTH = 3;
const MAX_ORDERED_LIST_MARKER_DIGITS = 9;

type FenceCharacter = '`' | '~';

interface Fence {
    character: FenceCharacter;
    length: number;
    blockquoteDepth: number;
    indentation: number;
}

interface OpenFence extends Fence {
    start: number;
}

interface SourceRange {
    start: number;
    end: number;
}

interface MarkdownLine {
    content: string;
    end: number;
    nextStart: number;
}

interface ListMarker {
    end: number;
    continuationIndent: number;
}

function skipHorizontalWhitespace(line: string, start: number): number {
    let offset = start;
    while (offset < line.length && (line[offset] === ' ' || line[offset] === '\t')) {
        offset++;
    }
    return offset;
}

function indentationWidth(line: string, start: number, end: number): number {
    let width = 0;
    for (let offset = start; offset < end; offset++) {
        width += line[offset] === '\t' ? 4 - (width % 4) : 1;
    }
    return width;
}

function consumeListMarker(line: string, start: number): ListMarker | null {
    const marker = line[start];
    if ((marker === '-' || marker === '+' || marker === '*') && /[ \t]/.test(line[start + 1] ?? '')) {
        const end = skipHorizontalWhitespace(line, start + 2);
        return { end, continuationIndent: Math.max(indentationWidth(line, start, end), 4) };
    }

    let offset = start;
    while (
        offset < line.length &&
        offset - start < MAX_ORDERED_LIST_MARKER_DIGITS &&
        line[offset] >= '0' &&
        line[offset] <= '9'
    ) {
        offset++;
    }

    const digitCount = offset - start;
    const delimiter = line[offset];
    if (digitCount > 0 && (delimiter === '.' || delimiter === ')') && /[ \t]/.test(line[offset + 1] ?? '')) {
        const end = skipHorizontalWhitespace(line, offset + 2);
        return { end, continuationIndent: Math.max(indentationWidth(line, start, end), 4) };
    }

    return null;
}

/**
 * Locates a fence marker after indentation and Markdown container prefixes.
 *
 * Examples: `` ``` ``, ``    ``` ``, ``- ``` ``, and ``> 1. ``` ``.
 */
function parseOpeningFence(line: string): Fence | null {
    let offset = 0;
    let blockquoteDepth = 0;
    let indentation = 0;

    while (offset < line.length) {
        const contentStart = skipHorizontalWhitespace(line, offset);
        indentation += indentationWidth(line, offset, contentStart);
        offset = contentStart;

        if (line[offset] === '>') {
            blockquoteDepth++;
            offset++;
            if (line[offset] === ' ' || line[offset] === '\t') offset++;
            continue;
        }

        const afterListMarker = consumeListMarker(line, offset);
        if (afterListMarker !== null) {
            indentation += afterListMarker.continuationIndent;
            offset = afterListMarker.end;
            continue;
        }

        break;
    }

    offset = skipHorizontalWhitespace(line, offset);
    const character = line[offset];
    if (character !== '`' && character !== '~') return null;

    let fenceEnd = offset;
    while (line[fenceEnd] === character) fenceEnd++;

    const length = fenceEnd - offset;
    if (length < MINIMUM_FENCE_LENGTH) return null;

    const infoString = line.slice(fenceEnd);
    if (character === '`' && infoString.includes('`')) return null;

    return { character, length, blockquoteDepth, indentation };
}

function isClosingFence(line: string, fence: Fence): boolean {
    let offset = 0;
    let indentation = 0;

    for (let depth = 0; depth < fence.blockquoteDepth; depth++) {
        const blockquoteStart = skipHorizontalWhitespace(line, offset);
        indentation += indentationWidth(line, offset, blockquoteStart);
        offset = blockquoteStart;
        if (line[offset] !== '>') return false;

        offset++;
        if (line[offset] === ' ' || line[offset] === '\t') offset++;
    }

    const fenceStart = skipHorizontalWhitespace(line, offset);
    indentation += indentationWidth(line, offset, fenceStart);
    offset = fenceStart;

    // Markdown permits up to three spaces between a container boundary and its closing fence.
    if (indentation < fence.indentation || indentation > fence.indentation + 3) return false;

    const delimiterStart = offset;
    while (line[offset] === fence.character) offset++;

    if (offset - delimiterStart < fence.length) return false;
    return skipHorizontalWhitespace(line, offset) === line.length;
}

function readMarkdownLine(markdown: string, start: number): MarkdownLine {
    const newline = markdown.indexOf('\n', start);
    const end = newline === -1 ? markdown.length : newline;
    const contentEnd = end > start && markdown[end - 1] === '\r' ? end - 1 : end;

    return {
        content: markdown.slice(start, contentEnd),
        end,
        nextStart: newline === -1 ? markdown.length : newline + 1,
    };
}

function findFencedCodeRanges(markdown: string): SourceRange[] {
    const ranges: SourceRange[] = [];
    let openFence: OpenFence | null = null;
    let lineStart = 0;

    while (lineStart < markdown.length) {
        const line = readMarkdownLine(markdown, lineStart);

        if (!openFence) {
            const fence = parseOpeningFence(line.content);
            if (fence) openFence = { ...fence, start: lineStart };
            lineStart = line.nextStart;
            continue;
        }

        if (isClosingFence(line.content, openFence)) {
            ranges.push({ start: openFence.start, end: line.end });
            openFence = null;
        }

        lineStart = line.nextStart;
    }

    // An unclosed fenced code block extends through the end of the document.
    if (openFence) ranges.push({ start: openFence.start, end: markdown.length });

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
