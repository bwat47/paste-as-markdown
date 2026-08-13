import type { PasteOptions } from '../../types';

export interface PassContext {
    readonly isGoogleDocs: boolean;
}

export interface ProcessingPass {
    /** Human-readable name for logging and debugging */
    readonly name: string;
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
