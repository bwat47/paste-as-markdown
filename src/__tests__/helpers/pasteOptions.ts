import { DEFAULT_PASTE_OPTIONS } from '../../constants';
import type { PasteOptions } from '../../types';

/**
 * Builds a complete `PasteOptions` from the shared defaults so tests only spell out the flags
 * they actually exercise. Production code resolves these flags once at the paste-handler
 * boundary; every module downstream of it requires a complete object.
 */
export function pasteOptions(overrides: Partial<PasteOptions> = {}): PasteOptions {
    return { ...DEFAULT_PASTE_OPTIONS, ...overrides };
}
