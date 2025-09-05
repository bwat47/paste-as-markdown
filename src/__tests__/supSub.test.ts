import { convertHtmlToMarkdown } from '../markdownConverter';

describe('sup/sub preservation', () => {
    async function run(input: string) {
        const { markdown } = await convertHtmlToMarkdown(input, true, false);
        return markdown.trim();
    }

    test('simple sup', async () => {
        expect(await run('E=mc<sup>2</sup>')).toBe('E=mc<sup>2</sup>');
    });

    test('simple sub', async () => {
        expect(await run('H<sub>2</sub>O')).toBe('H<sub>2</sub>O');
    });

    test('nested emphasis inside sup/sub', async () => {
        expect(await run('m<sup><em>2</em></sup> & CO<sub><strong>2</strong></sub>')).toBe(
            'm<sup>*2*</sup> & CO<sub>**2**</sub>'
        );
    });

    test('sup/sub inside code unchanged', async () => {
        // When inside code, Turndown will emit code span; our rules still run because the DOM node matches, which is acceptable
        // Example: <code>E=mc<sup>2</sup></code> becomes `E=mc<sup>2</sup>` (HTML retained inside code span)
        expect(await run('<code>E=mc<sup>2</sup></code>')).toBe('`E=mc<sup>2</sup>`');
    });
});
