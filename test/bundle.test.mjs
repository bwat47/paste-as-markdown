import assert from 'node:assert/strict';
import { createRequire, isBuiltin } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createBuildOptions, createContentScriptBuildOptions } from '@bwat47/joplin-plugin-scripts';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));

/** Builds `options` in memory and returns the bundle text and its runtime imports. */
async function bundle(options) {
    const result = await build({ ...options, write: false, metafile: true, logLevel: 'silent' });
    const imports = Object.values(result.metafile.outputs).flatMap((output) => output.imports);
    return { text: result.outputFiles[0].text, imports };
}

test('editor content scripts export a factory without runtime dependencies', async () => {
    for (const script of ['editor/contentScripts/codeMirror6.ts', 'editor/contentScripts/codeMirror5.ts']) {
        const { text, imports } = await bundle(createContentScriptBuildOptions(root, script));
        assert.deepEqual(imports, [], script);
        const module = { exports: {} };
        // eslint-disable-next-line sonarjs/code-eval -- Executes only the bundle built from this repository, with a controlled host stub.
        runInNewContext(text, { module, exports: module.exports });
        assert.equal(typeof module.exports.default, 'function', script);
    }
});

test('the production bundle registers with Joplin, requiring only Node built-ins', async () => {
    const { text } = await bundle(createBuildOptions(root));
    let registered = false;
    // Desktop's plugin runtime provides Node built-ins; anything else must be bundled.
    // eslint-disable-next-line sonarjs/code-eval -- Executes only the bundle built from this repository, with a controlled host stub.
    runInNewContext(text, {
        joplin: {
            plugins: {
                register: (plugin) => {
                    registered = typeof plugin.onStart === 'function';
                },
            },
        },
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        TextEncoder,
        TextDecoder,
        URL,
        URLSearchParams,
        process,
        require: (name) => {
            if (name.startsWith('node:')) throw new Error(`Unexpected node: prefix: ${name}`);
            if (isBuiltin(name)) return require(name);
            throw new Error(`Unexpected runtime dependency: ${name}`);
        },
    });
    assert.equal(registered, true);
});
