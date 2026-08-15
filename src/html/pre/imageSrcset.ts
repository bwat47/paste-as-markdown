/**
 * Recover images that rely exclusively on srcset before DOMPurify removes that attribute.
 *
 * Candidate parsing follows the relevant shape of the HTML srcset parsing algorithm rather
 * than splitting on commas, since URLs such as data URLs can contain commas themselves.
 */

// HTML ASCII whitespace: tab, newline, form feed, carriage return, or space.
const ASCII_WHITESPACE = /[\t\n\f\r ]/;
const ASCII_WHITESPACE_RUN = /[\t\n\f\r ]+/;
// Positive integer width descriptors, for example "320w". The unit is lowercase-only per spec,
// so "320W" is not a width descriptor.
const WIDTH_DESCRIPTOR = /^(\d+)w$/;
// Positive floating-point density descriptors, for example "1x", "1.5x", ".5x", or "1e2x".
// The unit is lowercase-only per spec ("2X" is not a density descriptor), but the exponent
// marker of a valid floating-point number accepts either case. A decimal point must be followed
// by at least one digit, so "2.x" is not a density descriptor either.
const DENSITY_DESCRIPTOR = /^((?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)x$/;
const DEFAULT_DENSITY = 1;

type CandidateKind = 'width' | 'density';

interface SrcsetCandidate {
    readonly url: string;
    readonly kind: CandidateKind;
    readonly value: number;
}

interface DescriptorResult {
    readonly descriptors: readonly string[];
    readonly nextPosition: number;
}

function isAsciiWhitespace(character: string): boolean {
    return ASCII_WHITESPACE.test(character);
}

/**
 * Find the comma that ends the current candidate's descriptors, or the end of the input.
 *
 * The descriptor tokenizer's in-parens state is a flag rather than a depth counter: it starts at
 * "(" and ends at the first ")", so a nested "(" does not stack and cannot keep the state open
 * past that first ")". Modelling it as a depth counter would let "(x(y)" swallow every later
 * candidate instead of only its own.
 */
function findCandidateSeparator(input: string, startPosition: number): number {
    let inParentheses = false;

    for (let position = startPosition; position < input.length; position++) {
        const character = input[position];
        if (inParentheses) {
            if (character === ')') inParentheses = false;
        } else if (character === '(') inParentheses = true;
        else if (character === ',') return position;
    }

    return input.length;
}

function collectDescriptors(input: string, startPosition: number): DescriptorResult {
    const separatorPosition = findCandidateSeparator(input, startPosition);
    const descriptorText = input.slice(startPosition, separatorPosition).trim();
    const descriptors = descriptorText ? descriptorText.split(ASCII_WHITESPACE_RUN) : [];
    const nextPosition = separatorPosition < input.length ? separatorPosition + 1 : separatorPosition;
    return { descriptors, nextPosition };
}

function parseCandidate(url: string, descriptors: readonly string[]): SrcsetCandidate | null {
    if (!url) return null;

    if (descriptors.length === 0) {
        return { url, kind: 'density', value: DEFAULT_DENSITY };
    }
    if (descriptors.length !== 1) return null;

    const widthMatch = descriptors[0].match(WIDTH_DESCRIPTOR);
    if (widthMatch) {
        const width = Number(widthMatch[1]);
        return Number.isFinite(width) && width > 0 ? { url, kind: 'width', value: width } : null;
    }

    const densityMatch = descriptors[0].match(DENSITY_DESCRIPTOR);
    if (!densityMatch) return null;

    const density = Number(densityMatch[1]);
    return Number.isFinite(density) && density > 0 ? { url, kind: 'density', value: density } : null;
}

function skipCandidateSeparators(input: string, startPosition: number): number {
    let position = startPosition;
    while (position < input.length && (isAsciiWhitespace(input[position]) || input[position] === ',')) position++;
    return position;
}

function findUrlEnd(input: string, startPosition: number): number {
    let position = startPosition;
    while (position < input.length && !isAsciiWhitespace(input[position])) position++;
    return position;
}

function removeTrailingCommas(value: string): string {
    let end = value.length;
    while (end > 0 && value[end - 1] === ',') end--;
    return value.slice(0, end);
}

function parseSrcsetCandidates(input: string): SrcsetCandidate[] {
    const candidates: SrcsetCandidate[] = [];
    let position = 0;

    while (position < input.length) {
        position = skipCandidateSeparators(input, position);
        if (position >= input.length) break;

        const urlEnd = findUrlEnd(input, position);
        let url = input.slice(position, urlEnd);
        position = urlEnd;

        if (url.endsWith(',')) {
            url = removeTrailingCommas(url);
            const candidate = parseCandidate(url, []);
            if (candidate) candidates.push(candidate);
            continue;
        }

        const result = collectDescriptors(input, position);
        position = result.nextPosition;
        const candidate = parseCandidate(url, result.descriptors);
        if (candidate) candidates.push(candidate);
    }

    return candidates;
}

/**
 * Select the largest candidate from a single descriptor family.
 *
 * Width and density values are not comparable, so only one family can be ranked. When both are
 * present the uncomparable candidates are ignored rather than the whole set, since discarding
 * everything would lose the image entirely. Width wins the tie-break because descriptorless
 * candidates default to 1x, so a bare fallback URL would otherwise suppress an explicitly sized
 * set such as "fallback.jpg, small.jpg 320w, large.jpg 1600w".
 */
function selectLargestComparableCandidate(srcset: string): SrcsetCandidate | null {
    const candidates = parseSrcsetCandidates(srcset);
    if (candidates.length === 0) return null;

    const preferredKind: CandidateKind = candidates.some((candidate) => candidate.kind === 'width')
        ? 'width'
        : 'density';
    const comparable = candidates.filter((candidate) => candidate.kind === preferredKind);

    return comparable.reduce((largest, candidate) => (candidate.value > largest.value ? candidate : largest));
}

/**
 * Collect the srcset values that may supply a src for one image, in preference order.
 *
 * The image's own srcset comes first because it is the author's declared fallback and needs no
 * media-query or type evaluation to be a safe choice. A <picture> ancestor's <source> elements
 * follow in document order, which is the order a browser would test them.
 */
function collectSrcsetCandidatePool(image: HTMLImageElement): string[] {
    const pool: string[] = [];

    const ownSrcset = image.getAttribute('srcset');
    if (ownSrcset) pool.push(ownSrcset);

    const picture = image.closest('picture');
    if (picture) {
        picture.querySelectorAll('source[srcset]').forEach((source) => {
            const sourceSrcset = source.getAttribute('srcset');
            if (sourceSrcset) pool.push(sourceSrcset);
        });
    }

    return pool;
}

/**
 * Set src to the highest-resolution comparable srcset candidate when src is missing or blank.
 *
 * Covers both a bare <img srcset> and an <img> inside a <picture>, since the sanitizer keeps
 * <source> elements but strips their srcset, which would otherwise leave the image with no source
 * at all. Existing src values remain authoritative, and DOMPurify validates every promoted URL.
 */
export function promoteLargestSrcsetCandidateToSrc(body: HTMLElement): void {
    const images = Array.from(body.querySelectorAll('img')) as HTMLImageElement[];

    images.forEach((image) => {
        if (image.getAttribute('src')?.trim()) return;

        for (const srcset of collectSrcsetCandidatePool(image)) {
            const candidate = selectLargestComparableCandidate(srcset);
            if (candidate) {
                image.setAttribute('src', candidate.url);
                return;
            }
        }
    });
}
