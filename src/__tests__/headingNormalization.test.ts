import { normalizeHeadingLevels } from '../html/post/headings';

describe('normalizeHeadingLevels', () => {
    const parse = (html: string): HTMLElement => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.body;
    };

    it('should normalize skipped levels (h2 -> h5 => h2 -> h3)', () => {
        const body = parse(`
            <h2>Title</h2>
            <p>Text</p>
            <h5>Subtitle</h5>
            <p>More text</p>
        `);

        normalizeHeadingLevels(body);

        expect(body.innerHTML).toContain('<h2>Title</h2>');
        expect(body.innerHTML).toContain('<h3>Subtitle</h3>');
        expect(body.innerHTML).not.toContain('<h5>');
    });

    it('should preserve sequential levels', () => {
        const body = parse(`
            <h1>Title</h1>
            <h2>Subtitle</h2>
            <h3>Sub-subtitle</h3>
        `);

        normalizeHeadingLevels(body);

        expect(body.innerHTML).toContain('<h1>Title</h1>');
        expect(body.innerHTML).toContain('<h2>Subtitle</h2>');
        expect(body.innerHTML).toContain('<h3>Sub-subtitle</h3>');
    });

    it('should preserve deep start levels (h4 -> h6 => h4 -> h5)', () => {
        const body = parse(`
            <h4>Deep Title</h4>
            <h6>Deep Subtitle</h6>
        `);

        normalizeHeadingLevels(body);

        expect(body.innerHTML).toContain('<h4>Deep Title</h4>');
        expect(body.innerHTML).toContain('<h5>Deep Subtitle</h5>');
        expect(body.innerHTML).not.toContain('<h6>');
    });

    it('should preserve attributes when replacing tags', () => {
        const body = parse(`
            <h2 id="main" class="title">Main</h2>
            <h5 id="sub" data-test="value">Sub</h5>
        `);

        normalizeHeadingLevels(body);

        const h2 = body.querySelector('h2');
        const h3 = body.querySelector('h3');

        expect(h2).not.toBeNull();
        expect(h2?.getAttribute('id')).toBe('main');
        expect(h2?.getAttribute('class')).toBe('title');

        expect(h3).not.toBeNull();
        expect(h3?.getAttribute('id')).toBe('sub');
        expect(h3?.getAttribute('data-test')).toBe('value');
    });

    it('should handle mixed levels correctly (context-aware)', () => {
        const body = parse(`
            <h2>1</h2>
            <h5>2</h5>
            <h2>3</h2>
            <h6>4</h6>
        `);

        // Context-aware normalization:
        // h2 (first) -> h2, previousLevel=2
        // h5 (jumps from 2) -> h3, previousLevel=3
        // h2 (goes back down) -> h2, previousLevel=2
        // h6 (jumps from 2) -> h3, previousLevel=3

        normalizeHeadingLevels(body);

        const headings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
        expect(headings.length).toBe(4);
        expect(headings[0].tagName).toBe('H2');
        expect(headings[1].tagName).toBe('H3');
        expect(headings[2].tagName).toBe('H2');
        expect(headings[3].tagName).toBe('H3');
    });

    it('should do nothing if no headings present', () => {
        const body = parse('<p>Just text</p>');
        normalizeHeadingLevels(body);
        expect(body.innerHTML).toBe('<p>Just text</p>');
    });

    it('should handle ChatGPT-style conversation with h2, h4, h5 pattern', () => {
        const body = parse(`
            <h2>Example Unit Tests</h2>
            <p>Some content</p>
            <h4>You said:</h4>
            <p>User message</p>
            <h5>ChatGPT said:</h5>
            <p>Assistant response</p>
            <h2>What You Did Well</h2>
            <h3>Structure</h3>
        `);

        // Context-aware normalization:
        // h2 (first) -> h2, previousLevel=2
        // h4 (jumps from 2) -> h3, previousLevel=3
        // h5 (jumps from 3) -> h4, previousLevel=4
        // h2 (goes back down) -> h2, previousLevel=2
        // h3 (valid step from 2) -> h3, previousLevel=3

        normalizeHeadingLevels(body);

        const headings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
        expect(headings.length).toBe(5);
        expect(headings[0].tagName).toBe('H2'); // Example Unit Tests
        expect(headings[1].tagName).toBe('H3'); // You said: (was h4)
        expect(headings[2].tagName).toBe('H4'); // ChatGPT said: (was h5)
        expect(headings[3].tagName).toBe('H2'); // What You Did Well
        expect(headings[4].tagName).toBe('H3'); // Structure

        expect(body.innerHTML).not.toContain('<h5>');
    });
});
