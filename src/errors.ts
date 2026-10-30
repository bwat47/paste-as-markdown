/** Describes a caught value, which may be any type since JavaScript can throw non-Error values. */
export function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
