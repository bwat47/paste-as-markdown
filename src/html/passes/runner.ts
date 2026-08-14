import type { PasteOptions } from '../../types';
import type { PassContext, ProcessingPass } from './types';

/** Identifies the pass that made the HTML pipeline unsafe to continue. */
export class PassExecutionError extends Error {
    readonly passName: string;
    readonly cause: unknown;

    constructor(passName: string, cause: unknown) {
        const message = cause instanceof Error ? cause.message : String(cause);
        super(`${passName} failed: ${message}`);
        this.name = 'PassExecutionError';
        this.passName = passName;
        this.cause = cause;
    }
}

export function runPasses(
    passes: readonly ProcessingPass[],
    body: HTMLElement,
    options: PasteOptions,
    context: PassContext
): void {
    for (const pass of passes) {
        try {
            if (pass.condition && !pass.condition(options, context)) continue;
            pass.execute(body, options, context);
        } catch (cause) {
            throw new PassExecutionError(pass.name, cause);
        }
    }
}
