const LIST_TAGS = new Set(['UL', 'OL']);

const LI_TAG = 'LI';
const CHECKBOX_SELECTOR = 'input[type="checkbox"]';

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

        while (paragraph.firstChild) {
            listItem.insertBefore(paragraph.firstChild, paragraph);
        }
        listItem.removeChild(paragraph);
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
 * children to siblings, allowing proper conversion. It also unwraps any orphaned
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
        // If it has SOME valid children, it's a real list with orphaned sublists,
        // which should be handled by fixOrphanNestedLists instead.
        if (!hasInvalidChildren || hasAnyValidChildren) return;

        const parent = list.parentElement;
        if (!parent) return;

        // Unwrap: move all children to be siblings of the invalid list wrapper
        while (list.firstChild) {
            parent.insertBefore(list.firstChild, list);
        }

        // Remove the now-empty invalid wrapper
        parent.removeChild(list);
    });

    // After unwrapping invalid lists, we may have orphaned <li> elements that are no longer
    // inside a list. These should also be unwrapped to avoid incorrect Markdown conversion.
    const orphanedListItems = Array.from(body.querySelectorAll<HTMLElement>('li'));
    orphanedListItems.forEach((li) => {
        const parent = li.parentElement;
        if (!parent) return;

        // If the <li> is inside a <ul> or <ol>, it's not orphaned
        if (LIST_TAGS.has(parent.tagName)) return;

        // This <li> is orphaned - unwrap it
        while (li.firstChild) {
            parent.insertBefore(li.firstChild, li);
        }
        parent.removeChild(li);
    });
}
