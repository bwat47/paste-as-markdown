import type { PasteOptions } from '../../types';
import { LOG_PREFIX } from '../../constants';
import type { PassContext, ProcessingPass } from './types';

export interface RunPassesResult {
    readonly warnings: string[];
}

export function runPasses(
    passes: readonly ProcessingPass[],
    body: HTMLElement,
    options: PasteOptions,
    context: PassContext
): RunPassesResult {
    const warnings: string[] = [];

    passes.forEach((pass) => {
        if (pass.condition && !pass.condition(options, context)) return;
        try {
            pass.execute(body, options, context);
        } catch (err) {
            console.warn(LOG_PREFIX, `${pass.name} failed:`, err);
            const message = err instanceof Error ? err.message : String(err);
            warnings.push(`${pass.name}: ${message}`);
        }
    });

    return { warnings };
}
