import { unwrapElement } from '../shared/dom';

const LIST_TAGS = new Set(['UL', 'OL']);

const LI_TAG = 'LI';
const P_TAG = 'P';
const CHECKBOX_SELECTOR = 'input[type="checkbox"]';
const DEFAULT_ORPHAN_LIST_TAG = 'ul';
const ORDERED_LIST_START_ATTRIBUTE = 'start';

function getPrecedingListItem(list: HTMLElement): HTMLElement | null {
    const parent = list.parentElement;
    if (!parent) return null;

    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(list);
    if (index === -1) return null;

    for (let i = index - 1; i >= 0; i -= 1) {
        const candidate = siblings[i] as HTMLElement;
        if (candidate.tagName === LI_TAG) return candidate;
    }
    return null;
}

/**
 * Outlook and other editors sometimes emit sub-lists as siblings of the parent
 * list instead of children of the preceding <li>. Turndown interprets this as a
 * new top-level list, breaking ordered numbering. This helper re-nests those
 * orphaned lists under the nearest preceding list item before conversion.
 */
export function fixOrphanNestedLists(body: HTMLElement): void {
    const lists = body.querySelectorAll<HTMLElement>('ul, ol');
    lists.forEach((list) => {
        const parent = list.parentElement;
        if (!parent) return;
        if (parent.tagName === LI_TAG) return;
        if (!LIST_TAGS.has(parent.tagName)) return;

        const previousElement = list.previousElementSibling as HTMLElement | null;
        const targetLi =
            (previousElement && previousElement.tagName === LI_TAG && previousElement) || getPrecedingListItem(list);

        if (targetLi) {
            targetLi.appendChild(list);
            return;
        }

        const ownerDocument = list.ownerDocument;
        if (!ownerDocument) return;
        const wrapper = ownerDocument.createElement('li');
        parent.insertBefore(wrapper, list);
        wrapper.appendChild(list);
    });
}

/**
 * Some editors wrap task list checkboxes in a paragraph inside the list item:
 * <li><p><input type="checkbox"> Text</p></li>
 * Turndown's GFM task list rule expects the checkbox to be a direct child of the <li>.
 * This helper unwraps those paragraphs so the checkbox sits directly under the list item.
 */
export function unwrapCheckboxParagraphs(body: HTMLElement): void {
    const paragraphs = body.querySelectorAll<HTMLParagraphElement>('li > p');
    paragraphs.forEach((paragraph) => {
        const listItem = paragraph.parentElement;
        if (!listItem || listItem.tagName !== LI_TAG) return;

        const checkbox = paragraph.querySelector<HTMLInputElement>(CHECKBOX_SELECTOR);
        if (!checkbox) return;
        if (checkbox.closest('li') !== listItem) return;

        unwrapElement(paragraph);
    });
}

function isIgnorableNode(node: ChildNode): boolean {
    if (node.nodeType === Node.COMMENT_NODE) return true;
    return node.nodeType === Node.TEXT_NODE && (node.textContent?.trim() ?? '') === '';
}

/**
 * Rich text editors commonly wrap list item content in a paragraph
 * (`<li><p>Item</p></li>`). Turndown's paragraph rule pads its output with blank
 * lines, which the list item rule then indents into a whitespace-only line between
 * items, i.e. a loose list. Removing the wrapper makes the item's content inline
 * and the list renders tight without any Markdown post-processing.
 *
 * Only items holding a single paragraph are unwrapped: an item with two or more
 * paragraphs is genuinely multi-block content whose internal blank lines must
 * survive. Items with loose text alongside the paragraph are skipped as well,
 * since unwrapping would run that text into the paragraph's text.
 */
export function unwrapTightListItemParagraphs(body: HTMLElement): void {
    const listItems = body.querySelectorAll<HTMLElement>('li');
    listItems.forEach((listItem) => {
        const paragraphs = Array.from(listItem.children).filter((child) => child.tagName === P_TAG);
        if (paragraphs.length !== 1) return;

        const hasLooseText = Array.from(listItem.childNodes).some(
            (node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.trim() ?? '') !== ''
        );
        if (hasLooseText) return;

        unwrapElement(paragraphs[0] as HTMLElement);
    });
}

/**
 * Returns the immediately following sibling of `list` when it is a list of the same
 * type that can absorb `list`'s items, or null when the lists must stay separate.
 * Whitespace and comments between the two are ignored, but any other content means
 * the lists are not adjacent.
 */
function getMergeableSiblingList(list: HTMLElement): HTMLElement | null {
    let candidate: ChildNode | null = list.nextSibling;
    while (candidate && isIgnorableNode(candidate)) {
        candidate = candidate.nextSibling;
    }

    if (!candidate || candidate.nodeType !== Node.ELEMENT_NODE) return null;

    const sibling = candidate as HTMLElement;
    if (sibling.tagName !== list.tagName) return null;
    // A `start` attribute means the author asked for a distinct numbering sequence; merging would
    // renumber the items and discard it. Mirrors the ordinal handling in the Turndown list item rule.
    if (sibling.hasAttribute(ORDERED_LIST_START_ATTRIBUTE)) return null;

    return sibling;
}

/**
 * Word and Outlook frequently emit a run of single-item lists instead of one list
 * with several items. Turndown separates sibling lists with a blank line, so the
 * paste reads as a loose list even though each item is tight. Merging the runs into
 * a single list restores the intended structure.
 *
 * Only applied when tight lists are forced: without that setting the sibling lists
 * are preserved as authored.
 */
export function mergeAdjacentLists(body: HTMLElement): void {
    const lists = Array.from(body.querySelectorAll<HTMLElement>('ul, ol'));
    const absorbed = new WeakSet<HTMLElement>();

    lists.forEach((list) => {
        if (absorbed.has(list)) return;

        let sibling = getMergeableSiblingList(list);
        while (sibling) {
            while (sibling.firstChild) {
                list.appendChild(sibling.firstChild);
            }
            absorbed.add(sibling);
            sibling.remove();
            sibling = getMergeableSiblingList(list);
        }
    });
}

/**
 * Some editors (e.g., OneNote) wrap ordered lists inside unordered list tags, producing
 * invalid HTML like: <ul><p>...</p><ol>...</ol></ul>
 *
 * According to the HTML spec, <ul> and <ol> elements can only contain <li> elements
 * as direct children. When Turndown encounters these invalid wrappers, it produces
 * incorrect Markdown like "- 1. item" (both UL and OL markers).
 *
 * This helper detects and unwraps such invalid list wrappers by promoting their
 * children to siblings, allowing proper conversion. It also wraps any orphaned
 * <li> elements that end up outside of a list after unwrapping.
 */
export function unwrapInvalidListWrappers(body: HTMLElement): void {
    // Convert to array to avoid live collection issues during DOM modification
    const lists = Array.from(body.querySelectorAll<HTMLElement>('ul, ol'));

    lists.forEach((list) => {
        const children = Array.from(list.children);

        // Check if any direct children are not <li> elements (which is invalid HTML)
        const hasInvalidChildren = children.some((child) => child.tagName !== LI_TAG);

        // Check if this list has ANY valid <li> children
        const hasAnyValidChildren = children.some((child) => child.tagName === LI_TAG);

        // Only unwrap if the list has invalid children AND no valid children.
        // This means it's a pure wrapper (e.g., <ul><p>...</p><ol>...</ol></ul>).
        // If it has BOTH valid and invalid children, it's a real list with orphaned sublists,
        // and those cases are handled by fixOrphanNestedLists (not here).
        if (hasInvalidChildren && !hasAnyValidChildren) {
            unwrapElement(list);
        }
    });

    // After unwrapping invalid lists, we may have orphaned <li> elements that are no longer
    // inside a list. Preserve their list semantics by wrapping consecutive orphaned items.
    const orphanedListItems = Array.from(body.querySelectorAll<HTMLElement>('li'));
    orphanedListItems.forEach((li) => {
        const parent = li.parentElement;
        if (!parent) return;

        // If the <li> is inside a <ul> or <ol>, it's not orphaned
        if (LIST_TAGS.has(parent.tagName)) return;

        const ownerDocument = li.ownerDocument;
        if (!ownerDocument) return;

        const wrapper = ownerDocument.createElement(DEFAULT_ORPHAN_LIST_TAG);
        parent.insertBefore(wrapper, li);

        let current: ChildNode | null = li;
        while (current) {
            const next: ChildNode | null = current.nextSibling;
            const isIgnorableWhitespace =
                current.nodeType === Node.TEXT_NODE && (current.textContent?.trim() ?? '') === '';
            const isComment = current.nodeType === Node.COMMENT_NODE;

            if (isIgnorableWhitespace || isComment) {
                current = next;
                continue;
            }

            if (current.nodeType === Node.ELEMENT_NODE) {
                const element = current as HTMLElement;
                if (element.tagName === LI_TAG && element.parentElement === parent) {
                    wrapper.appendChild(element);
                    current = next;
                    continue;
                }
            }

            break;
        }
    });
}
