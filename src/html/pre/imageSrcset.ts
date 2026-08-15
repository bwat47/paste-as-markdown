/**
 * Recover images that rely exclusively on srcset before DOMPurify removes that attribute.
 *
 * Candidate parsing follows the relevant shape of the HTML srcset parsing algorithm rather
 * than splitting on commas, since URLs such as data URLs can contain commas themselves.
 */

// HTML ASCII whitespace: tab, newline, form feed, carriage return, or space.
const ASCII_WHITESPACE = /[\t\n\f\r ]/;
const ASCII_WHITESPACE_RUN = /[\t\n\f\r ]+/;
// Positive integer width descriptors, for example "320w".
const WIDTH_DESCRIPTOR = /^(\d+)w$/;
// Positive floating-point density descriptors, for example "1x", "1.5x", or ".5x".
const DENSITY_DESCRIPTOR = /^((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)x$/i;
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

function findCandidateSeparator(input: string, startPosition: number): number {
    let parenthesesDepth = 0;

    for (let position = startPosition; position < input.length; position++) {
        const character = input[position];
        if (character === '(') parenthesesDepth++;
        else if (character === ')' && parenthesesDepth > 0) parenthesesDepth--;
        else if (character === ',' && parenthesesDepth === 0) return position;
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

function selectLargestComparableCandidate(srcset: string): SrcsetCandidate | null {
    const candidates = parseSrcsetCandidates(srcset);
    if (candidates.length === 0) return null;

    const kind = candidates[0].kind;
    if (candidates.some((candidate) => candidate.kind !== kind)) return null;

    return candidates.reduce((largest, candidate) => (candidate.value > largest.value ? candidate : largest));
}

/**
 * Set src to the highest-resolution comparable srcset candidate when src is missing or blank.
 * Existing src values remain authoritative, and DOMPurify validates every promoted URL later.
 */
export function promoteLargestSrcsetCandidateToSrc(body: HTMLElement): void {
    const images = Array.from(body.querySelectorAll('img[srcset]')) as HTMLImageElement[];

    images.forEach((image) => {
        if (image.getAttribute('src')?.trim()) return;

        const candidate = selectLargestComparableCandidate(image.getAttribute('srcset') || '');
        if (candidate) image.setAttribute('src', candidate.url);
    });
}
