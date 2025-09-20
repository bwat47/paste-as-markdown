// Wrapper to handle dynamic import of ESM-only package
type GfmPlugin = (service: unknown) => void;
let gfmCache: GfmPlugin | null = null;

export async function getGfmPlugin(): Promise<GfmPlugin> {
    if (!gfmCache) {
        try {
            const module = await import('@bwat47/turndown-plugin-gfm');
            gfmCache = module.gfm;
        } catch (error) {
            console.error('Failed to load @bwat47/turndown-plugin-gfm:', error);
            throw error;
        }
    }
    return gfmCache;
}
