// Mock implementation for tests - returns a valid plugin function
export async function getGfmPlugin() {
    return () => {}; // Return a no-op function that Turndown accepts as a plugin
}
