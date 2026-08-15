import { DEFAULT_PASTE_OPTIONS } from '../../settings';
import { LIST_INDENTATION } from '../../types';
import type { PasteOptions } from '../../types';

/**
 * Builds a complete `PasteOptions` from the shared defaults so tests only spell out the flags
 * they actually exercise. Production code resolves these flags once at the paste-handler
 * boundary; every module downstream of it requires a complete object.
 */
export function pasteOptions(overrides: Partial<PasteOptions> = {}): PasteOptions {
    return { ...DEFAULT_PASTE_OPTIONS, ...overrides };
}

/** Every optional pass disabled, spelled out so it stays inert if a product default changes. */
const INERT_PASTE_OPTIONS: PasteOptions = {
    includeImages: false,
    convertImagesToResources: false,
    normalizeQuotes: false,
    forceTightLists: false,
    listIndentation: LIST_INDENTATION.SPACES,
};

/**
 * Builds a complete `PasteOptions` with every optional pass off, so a test opts into only the
 * flags whose passes it asserts on. Prefer this over `pasteOptions` when the assertions target a
 * single pass and unrelated passes would only add noise.
 */
export function inertPasteOptions(overrides: Partial<PasteOptions> = {}): PasteOptions {
    return { ...INERT_PASTE_OPTIONS, ...overrides };
}
