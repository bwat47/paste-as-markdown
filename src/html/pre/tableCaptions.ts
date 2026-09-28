import { onlyContains } from '../shared/dom';

/** Captions that belong to a table; parsers drop <caption> tags found anywhere else. */
const TABLE_CAPTION_SELECTOR = 'table > caption';
/** Block element that carries caption content; a <div> can hold any flow content a caption can. */
const CAPTION_BLOCK_TAG = 'div';
const PRE_TAG_NAME = 'PRE';

/**
 * Element the caption block is inserted before. Some sources wrap a table in a <pre>, which the
 * code block pass unwraps only while the table is its sole content, so the caption must go before
 * that <pre> rather than inside it; otherwise the whole wrapper would become a fenced code block.
 */
function captionInsertionPoint(table: Element): Element {
    const parent = table.parentElement;
    if (parent?.tagName === PRE_TAG_NAME && onlyContains(parent, table)) return parent;
    return table;
}

/**
 * Lift table captions out of their tables into a block placed before the table.
 * GFM has no caption syntax and the GFM plugin discards <caption>, while stripping the tag in the
 * sanitizer would leave its text as a stray node directly inside <table>, where Turndown merges it
 * into the table output (e.g. a single-cell table collapses to "CapOnly"). A separate block before
 * the table keeps the text as its own paragraph, matching where browsers render captions.
 */
export function liftTableCaptions(body: HTMLElement): void {
    for (const caption of Array.from(body.querySelectorAll(TABLE_CAPTION_SELECTOR))) {
        const table = caption.parentElement;
        if (!table) continue;
        const block = body.ownerDocument.createElement(CAPTION_BLOCK_TAG);
        block.append(...Array.from(caption.childNodes));
        captionInsertionPoint(table).before(block);
        caption.remove();
    }
}
