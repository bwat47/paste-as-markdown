import { isInCode } from '../shared/dom';

// Desktop Word: `mso-list:l0 level2 lfo1`; lfo identifies a particular list instance.
const LIST_METADATA = /(?:^|;)\s*mso-list\s*:\s*(l\d+)\s+level([1-9])\s+(lfo\d+)\s*(?:;|$)/i;
const IGNORE_MARKER = /(?:^|;)\s*mso-list\s*:\s*ignore\s*(?:;|$)/i;
// Word numbered markers: `1.`, `3)`, `(4)`, `a.`, `ii.`. Any other ignored marker is a bullet glyph.
const NUMBERED_MARKER = /^(?:\((\d+|[a-z]+)\)|(\d+|[a-z]+)[.)])$/i;
// Legal numbering such as `1.1.` or `2.3.1`; the last segment numbers the item within its level.
const LEGAL_MARKER = /^(?:\d+\.)+(\d+)\.?$/;
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
    listId: string;
    level: number;
    list: HTMLElement;
    ordered: boolean;
    nextNumber?: number;
}

/** Returns the marker's numbering text, or null when the marker is a bullet. */
function readNumberText(marker: string): string | null {
    const legal = LEGAL_MARKER.exec(marker);
    if (legal) return legal[1];
    const numbered = NUMBERED_MARKER.exec(marker);
    return numbered ? (numbered[1] ?? numbered[2]).toLowerCase() : null;
}

function readListItem(paragraph: HTMLParagraphElement): WordListItem | null {
    if (isInCode(paragraph) || paragraph.closest('li')) return null;
    const metadata = LIST_METADATA.exec(paragraph.getAttribute('style') ?? '');
    if (!metadata) return null;
    // Word flags the literal marker as presentation; without it this is not a pasted list item.
    const marker = Array.from(paragraph.querySelectorAll<HTMLSpanElement>('span[style]')).find((span) =>
        IGNORE_MARKER.test(span.getAttribute('style') ?? '')
    );
    if (!marker) return null;
    return {
        paragraph,
        marker,
        listId: `${metadata[1]}:${metadata[3]}`.toLowerCase(),
        level: Number(metadata[2]),
        numberText: readNumberText((marker.textContent ?? '').trim()),
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

/** Markdown uses decimal numbering; infer Roman vs alphabetic once per level of each Word list. */
function readNumbers(run: WordListItem[]): Map<WordListItem, number> {
    const numbers = new Map<WordListItem, number>();
    const levelKey = (item: WordListItem) => `${item.listId}/${item.level}`;
    for (const key of new Set(run.map(levelKey))) {
        const items = run.filter((item) => levelKey(item) === key && item.numberText !== null);
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
    const frame = { listId: item.listId, level: item.level, list, ordered: item.numberText !== null };
    stack.push(frame);
    return frame;
}

/**
 * Close lists deeper than `level`. A list whose parent is shallower than `level` is kept and takes
 * that level instead, so a selection that starts on a nested item, or an item that skips a level,
 * stays one list when it reaches a shallower item.
 */
function unwindToLevel(stack: ListFrame[], level: number): void {
    while (stack.length && stack[stack.length - 1].level > level) {
        const parentLevel = stack[stack.length - 2]?.level ?? 0;
        if (parentLevel < level) {
            stack[stack.length - 1].level = level;
            return;
        }
        stack.pop();
    }
}

/**
 * Reconstruct a sibling run, compressing missing levels without inventing empty parent items.
 * Nesting follows levels alone; the Word list ID only decides whether items at the same level
 * share a list.
 */
function rebuildRun(run: WordListItem[]): void {
    const stack: ListFrame[] = [];
    const numbers = readNumbers(run);
    for (const item of run) {
        unwindToLevel(stack, item.level);
        const ordered = item.numberText !== null;
        const number = numbers.get(item);
        let frame = stack[stack.length - 1];
        const continuesFrame =
            frame?.listId === item.listId && frame.ordered === ordered && (!ordered || frame.nextNumber === number);
        if (frame?.level === item.level && !continuesFrame) {
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
            if (!item) break;
            run.push(item);
            sibling = nextContentSibling(sibling);
        }
        run.forEach((item) => processed.add(item.paragraph));
        rebuildRun(run);
    }
}
