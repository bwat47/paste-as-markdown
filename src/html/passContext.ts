import type { PassContext } from '../types';

export const DEFAULT_PASS_CONTEXT = {
    source: 'generic',
} as const satisfies PassContext;
