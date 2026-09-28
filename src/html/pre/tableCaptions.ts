/** Captions that belong to a table; parsers drop <caption> tags found anywhere else. */
const TABLE_CAPTION_SELECTOR = 'table > caption';
/** Block element that carries caption content; a <div> can hold any flow content a caption can. */
const CAPTION_BLOCK_TAG = 'div';

/**
 * Lift table captions out of their tables into a block placed before the table.
 * GFM has no caption syntax and the GFM plugin discards <caption>, while stripping the tag in the
 * sanitizer would leave its text as a stray node directly inside <table>, where Turndown merges it
 * into the table output (e.g. a single-cell table collapses to "CapOnly"). A separate block before
 * the table keeps the text as its own paragraph, matching where browsers render captions.
 */
export function liftTableCaptions(body: HTMLElement): void {
    for (const caption of Array.from(body.querySelectorAll(TABLE_CAPTION_SELECTOR))) {
        const block = body.ownerDocument.createElement(CAPTION_BLOCK_TAG);
        block.append(...Array.from(caption.childNodes));
        caption.parentElement?.before(block);
        caption.remove();
    }
}
