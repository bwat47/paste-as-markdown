import { isInCode } from '../shared/dom';

// Desktop Word: `mso-list:l0 level2 lfo1`; lfo identifies a particular list instance.
const LIST_METADATA = /(?:^|;)\s*mso-list\s*:\s*(l\d+)\s+level([1-9])\s+(lfo\d+)\s*(?:;|$)/i;
const IGNORE_MARKER = /(?:^|;)\s*mso-list\s*:\s*ignore\s*(?:;|$)/i;
const BULLET_MARKERS = new Set(['·', '•', 'o', '', '', '▪', '◦', '●', '○', '■']);
// Word numbered markers: `1.`, `3)`, `(4)`, `a.`, `ii.`.
const NUMBERED_MARKER = /^(?:\((\d+|[a-z]+)\)|(\d+|[a-z]+)[.)])$/i;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
const ALPHABET_SIZE = 26;
const FIRST_LETTER_CODE = 'a'.charCodeAt(0);

interface WordListItem {
    paragraph: HTMLParagraphElement;
    marker: HTMLSpanElement;
    listId: string;
    level: number;
    numberText: string | null;
}

interface ListFrame {
    level: number;
    list: HTMLElement;
    ordered: boolean;
    nextNumber?: number;
}

function readListItem(paragraph: HTMLParagraphElement): WordListItem | null {
    if (isInCode(paragraph) || paragraph.closest('li')) return null;
    const metadata = LIST_METADATA.exec(paragraph.getAttribute('style') ?? '');
    if (!metadata) return null;
    const marker = Array.from(paragraph.querySelectorAll<HTMLSpanElement>('span[style]')).find((span) =>
        IGNORE_MARKER.test(span.getAttribute('style') ?? '')
    );
    if (!marker) return null;
    const text = (marker.textContent ?? '').trim();
    const numbered = NUMBERED_MARKER.exec(text);
    if (!numbered && !BULLET_MARKERS.has(text)) return null;
    return {
        paragraph,
        marker,
        listId: `${metadata[1]}:${metadata[3]}`.toLowerCase(),
        level: Number(metadata[2]),
        numberText: numbered ? (numbered[1] ?? numbered[2]).toLowerCase() : null,
    };
}

/** Ignore only whitespace and comments; visible text always interrupts a list run. */
function nextContentSibling(node: ChildNode): ChildNode | null {
    let next = node.nextSibling;
    while (
        next &&
        (next.nodeType === Node.COMMENT_NODE || (next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()))
    ) {
        next = next.nextSibling;
    }
    return next;
}

function romanNumber(text: string): number {
    return Array.from(text).reduce((total, letter, index) => {
        const value = ROMAN_VALUES[letter];
        const next = ROMAN_VALUES[text[index + 1]] ?? 0;
        return total + (value < next ? -value : value);
    }, 0);
}

function startNumber(text: string, roman: boolean): number {
    if (/^\d+$/.test(text)) return Number(text);
    if (roman) return romanNumber(text);
    return Array.from(text).reduce(
        (number, letter) => number * ALPHABET_SIZE + letter.charCodeAt(0) - FIRST_LETTER_CODE + 1,
        0
    );
}

/** Markdown uses decimal numbering; infer Roman vs alphabetic once per Word level. */
function readNumbers(run: WordListItem[]): Map<WordListItem, number> {
    const numbers = new Map<WordListItem, number>();
    for (const level of new Set(run.map((item) => item.level))) {
        const items = run.filter((item) => item.level === level && item.numberText !== null);
        const markers = items.map((item) => item.numberText!);
        const roman =
            markers.every((marker) => /^[ivxlcdm]+$/.test(marker)) &&
            (markers.some((marker) => marker.length > 1) || markers[0] === 'i');
        items.forEach((item) => numbers.set(item, startNumber(item.numberText!, roman)));
    }
    return numbers;
}

function createList(item: WordListItem, number: number | undefined): HTMLElement {
    const list = item.paragraph.ownerDocument.createElement(item.numberText === null ? 'ul' : 'ol');
    if (number !== undefined && Number.isSafeInteger(number) && number >= 0) {
        list.setAttribute('start', String(number));
    }
    return list;
}

function openListFrame(item: WordListItem, number: number | undefined, stack: ListFrame[]): ListFrame {
    const list = createList(item, number);
    const parent = stack[stack.length - 1];
    if (parent) parent.list.lastElementChild!.appendChild(list);
    else item.paragraph.before(list);
    const frame = { level: item.level, list, ordered: item.numberText !== null };
    stack.push(frame);
    return frame;
}

/** Reconstruct a sibling run, compressing missing levels without inventing empty parent items. */
function rebuildRun(run: WordListItem[]): void {
    const stack: ListFrame[] = [];
    const numbers = readNumbers(run);
    for (const item of run) {
        while (stack.length && stack[stack.length - 1].level > item.level) stack.pop();
        const ordered = item.numberText !== null;
        const number = numbers.get(item);
        let frame = stack[stack.length - 1];
        if (frame?.level === item.level && (frame.ordered !== ordered || (ordered && frame.nextNumber !== number))) {
            stack.pop();
            frame = stack[stack.length - 1];
        }
        if (!frame || frame.level !== item.level) {
            frame = openListFrame(item, number, stack);
        }
        item.marker.remove();
        const li = item.paragraph.ownerDocument.createElement('li');
        li.append(...Array.from(item.paragraph.childNodes));
        frame.list.appendChild(li);
        if (ordered) frame.nextNumber = number! + 1;
        item.paragraph.remove();
    }
}

/**
 * Promote desktop Word's explicit list metadata to semantic lists before styles are stripped.
 * Runs inside each original parent (including WordSection wrappers and table cells). Flattened
 * paragraphs without both metadata and a recognized marker are intentionally left unchanged.
 * Only detached DOM nodes are moved; the result still goes through DOMPurify.
 */
export function normalizeWordLists(body: HTMLElement): void {
    const processed = new Set<HTMLParagraphElement>();
    for (const paragraph of body.querySelectorAll<HTMLParagraphElement>('p[style]')) {
        if (processed.has(paragraph)) continue;
        const first = readListItem(paragraph);
        if (!first) continue;
        const run = [first];
        let sibling = nextContentSibling(paragraph);
        while (sibling instanceof Element && sibling.tagName === 'P') {
            const item = readListItem(sibling as HTMLParagraphElement);
            if (!item || item.listId !== first.listId) break;
            run.push(item);
            sibling = nextContentSibling(sibling);
        }
        run.forEach((item) => processed.add(item.paragraph));
        rebuildRun(run);
    }
}
