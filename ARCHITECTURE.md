# paste-as-markdown – Architecture Overview

## Goal

Deterministic, maintainable HTML → Markdown conversion for Joplin pastes with minimal heuristics, centralized sanitation, and predictable formatting.

## High-Level Flow

User paste command →

1. Raw HTML (and setting includeImages) retrieved.
2. HTML preprocessing (`processHtml`)
    - Raw DOM parse.
    - Pre-sanitize code block neutralization (flatten highlight spans, convert `<br>` → `\n`, escape literal `<script>/<style>` so examples survive sanitization).
    - DOMPurify sanitize (single authority for safety; runs after neutralization).
    - Post-sanitize structural normalization (code blocks, anchors, whitespace, images per settings).
3. Turndown conversion (fresh instance per invocation; no singleton).
4. Post-conversion Markdown cleanup (`cleanupMarkdown`).
5. Result inserted.

## Key Modules

- `constants.ts`  
  Turndown base options, regex/strings, settings keys, sanitizer config import.
- `sanitizerConfig.ts`  
  Central DOMPurify configuration (allowed tags/attrs). Images allowed only if user setting permits.
- `htmlProcessor.ts`  
   DOM-based preprocessing pipeline: - Safety wrapper (feature-detect `DOMParser`, guarded try/catch). - Pre-sanitize neutralization of `<pre>/<code>` blocks (drops styling spans, preserves literal tag text as plain text, converts line breaks). - DOMPurify sanitize (scripts/styles/event attrs stripped once). - Post-sanitize normalization: - Code blocks: ensure canonical `<pre><code>` structure, remove toolbars, delete empty blocks, infer language from class names only (no shebang / content heuristics), alias mapping. - Anchor cleanup (permalink removal, heading link unwrap, empty image-only anchors pruned when images excluded). - Whitespace normalization (NBSP variants → space outside code). - Image handling: optional conversion to Joplin resources + attribute normalization. - Table fragments not handled here (see `markdownConverter.ts`).
- `resourceConverter.ts`  
   Image <img> processing & optional conversion to Joplin resources (base64 validation, size limits, streaming download with early abort, timeout, link unwrap, attribute normalization, metrics).
- `markdownConverter.ts`
    - `wrapOrphanedTableElements` – Wraps bare `<tr>/<td>/<col>` fragments with `<table>` (Excel clipboard quirk).
    - `createTurndownServiceSync` – Builds per-call Turndown with dynamic `preserveImageTagsWithSize` flag (disabled when images excluded).
    - `convertHtmlToMarkdown` – Orchestrates preprocessing → Turndown → cleanup.
    - `cleanupMarkdown` – Leading blank line trim, `<br>` normalization (single = hard break, 2+ = paragraph), whitespace-only line removal, newline collapse outside fenced code via `withFencedCodeProtection`.
    - `withFencedCodeProtection` – Extract/restore fenced code blocks using hard-to-collide sentinels (`__PAM_FENCE_n__`).
- `types.ts`  
  Shared type definitions (e.g., `PasteOptions`).
- `utils.ts`  
  (After refactor) Only genuinely reusable helpers; removed “meaningful HTML” gating.
- `pasteHandler.ts`  
  Command implementation: always attempts HTML pipeline unless no `<` present → fallback to plain text.

## Removed / Deprecated Logic

- Turndown custom rules for heading anchors, underline `<ins>` workaround, permalink stripping – superseded by DOM preprocessing + sanitizer.
- Inline style semantic inference (bold/italic) – Joplin rich text paste doesn’t preserve styles; simplified for consistency.
- “Meaningful HTML” detection – Removed; explicit user action implies intent.
- NBSP + `<br>` handling in pre-DOM regex passes – Centralized final-phase Markdown cleanup + DOM sanitizer.

## Architectural Decisions (ADR Summaries)

1. **DOMPurify + Single Preprocessing Stage**  
   Replaces scattered regex & rule hacks. Centralizes security (scripts/styles/events stripped once).
2. **Per-Paste Turndown Instance**  
   Simplicity > micro-optimization. Avoids stale rule/option state.
3. **Always Convert If HTML-ish**  
   User explicitly chose command; avoid second-guessing content value.
4. **Keep Post-Processing Minimal**  
   Only tasks difficult pre-DOM (fenced block protection, `<br>` semantic mapping, newline collapsing).
5. **No Style-Based Semantics**  
   Reduces fragility, matches Joplin’s own editor behavior, simplifies sanitization ordering.
6. **Selective Heuristics**  
   Only retain table fragment wrapping (cheap, high impact). Dropped complex spacing/empty-node pruning.
7. **Safety Over Fidelity for Exotic Cases**  
   Sanitizer may drop unusual attributes; priority is stable paste, not pixel fidelity.

## Security & Sanitization

- DOMPurify configured to:
    - Allow core structural + formatting tags (headings, lists, code, tables, images optionally).
    - Strip scripts, styles, event attributes, dangerous URL schemes.
- All downstream logic assumes sanitized tree (no second-pass stripping needed).
- No dynamic execution / eval paths.

## Code Block Strategy

- Neutralize BEFORE sanitization to preserve literal `<script>/<style>` examples while still stripping live elements.
- Neutralization flattens highlight/token spans and converts `<br>` to newlines; no further span flattening required later.
- Post-sanitize normalization enforces `<pre><code>` shape, removes toolbars, drops empty blocks, infers language from class name patterns only (no shebang / content heuristics).
- Alias mapping (js→javascript, yml→yaml, c++/cxx→cpp, etc.).
- Fenced code blocks are later protected during Markdown cleanup to avoid accidental edits.

## Image Handling

- If `includeImages=false`, sanitizer excludes `<img>` entirely (no post-rule blank link cleanup required).
- If `includeImages=true`, images pass through; sizing preserved only if present as attributes (not extracted from inline styles—intentional simplification).

## Line Break & Spacing Rules

- Single `<br>` → Markdown hard break (`"  \n"`).
- Multi `<br>` run → paragraph break (blank line).
- Triple+ blank lines collapsed to a single blank line (outside fenced code).
- Leading blank lines removed to prevent extra vertical gap at insertion point.

## Table Support

- Pre-Turndown string heuristic wraps orphaned row/col fragments.
- `<br>` normalization skips table rows to avoid unintended paragraph breaks within table cells.

## Testing Strategy

- Unit tests: table wrapping, `<br>` normalization, code block language inference (class-based), image include/exclude, resource conversion edge cases.
- Dedicated oversize base64 test with mocked small size (avoids multi‑MB fixture) + streaming oversize + timeout abort.
- Regression: literal `<script>` example preservation, anchor/permalink stripping, link unwrap for converted images, empty code block removal.
- Snapshot/integration: composite documents (NBSP artifacts, mixed elements) to detect pipeline regressions.

## Performance Notes

- DOMPurify + single DOM pass is O(n) for typical paste sizes.
- No caching by design (paste frequency low).
- Minimal regex passes post-conversion; fenced code extraction prevents pathological regex inside code blocks.

## Extension Points

- `sanitizerConfig.ts` – Adjust allowed tags/attrs centrally.
- `normalizeCodeBlocks` – Extend language inference map.
- `cleanupMarkdown` – Add formatting policies (e.g., trailing space trimming) with fenced protection.

## Trade-Offs

| Area               | Choice                                | Trade-Off                            |
| ------------------ | ------------------------------------- | ------------------------------------ |
| Semantics          | Drop style-based bold/italic          | Less recovery for raw styled spans   |
| Images             | Attribute-only sizing preservation    | Inline style-based size lost         |
| Perf vs Simplicity | Always rebuild Turndown instance      | Minor overhead accepted              |
| Heuristics         | Limited (tables, code)                | Some edge formatting not “polished”  |
| Safety             | DOMPurify strict config               | Potential loss of niche markup       |
| Language Inference | Class-based only (no shebang/content) | Fewer auto-detections for plain code |

## Potential Future Enhancements

- Alias expansion for more languages (dockerfile, yml, proto).
- User setting for hard-break vs paragraph `<br>` policy.

## Conventions

- Single responsibility functions; minimal shared mutable state.
- No `any` in critical paths; explicit typing in public helpers.
- Console logging minimal; one-time warnings guarded (previous pattern retained conceptually).
- Tokens for protected segments prefixed (`__PAM_FENCE_`) to minimize collision risk.

## Summary

Refactor consolidates all structural & security concerns into a deterministic DOM preprocessing layer, drastically simplifying Turndown customization and post-processing. Current codebase favors clarity and stability over aggressive fidelity to original styling.
