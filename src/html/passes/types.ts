import type { PasteOptions } from '../../types';

export type PassPhase = 'pre-sanitize' | 'post-sanitize';

export interface PassContext {
    readonly isGoogleDocs: boolean;
}

export interface ProcessingPass {
    /** Human-readable name for logging and debugging */
    readonly name: string;
    /** Processing phase - determines when this pass runs */
    readonly phase: PassPhase;
    /** Execution priority within phase (lower numbers run first) */
    readonly priority: number;
    /** Optional condition to determine if pass should run */
    readonly condition?: (options: PasteOptions, context: PassContext) => boolean;
    /**
     * Execute the processing pass.
     * @param body DOM body element to mutate.
     * @param options Current paste options.
     * @param context Additional context about the current conversion session.
     */
    readonly execute: (body: HTMLElement, options: PasteOptions, context: PassContext) => void;
}
