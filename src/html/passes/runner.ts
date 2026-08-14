import type { PassContext, PasteOptions } from '../../types';
import type { ProcessingPass } from './types';

const describeCause = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** Identifies the pass that made the HTML pipeline unsafe to continue. */
export class PassExecutionError extends Error {
    readonly passName: string;

    constructor(passName: string, cause: unknown) {
        // `cause` is the native ES2022 Error option. Do not redeclare it as a class field:
        // under `useDefineForClassFields` that would shadow the native property with undefined.
        super(`${passName} failed: ${describeCause(cause)}`, { cause });
        this.name = 'PassExecutionError';
        this.passName = passName;
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
