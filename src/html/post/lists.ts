const LIST_TAGS = new Set(['UL', 'OL']);

const LI_TAG = 'LI';

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
