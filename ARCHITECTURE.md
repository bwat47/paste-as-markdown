# paste-as-markdown – Architecture Overview

## Goal

Deterministic, maintainable HTML → Markdown conversion for Joplin pastes with minimal heuristics, centralized sanitation, and predictable formatting.

## High-Level Flow

User paste command →

1. Raw HTML (and setting includeImages) retrieved.
2. HTML preprocessing (`processHtml`)
    - DOM parse + DOMPurify sanitize (single authority for safety / stripping).
    - Structural normalization (code blocks, tables, anchors, images per settings).
3. Turndown conversion (fresh instance per invocation; no singleton).
4. Post-conversion Markdown cleanup (`cleanupMarkdown`).
5. Result inserted.

## Key Modules

- `constants.ts`  
  Turndown base options, regex/strings, settings keys, sanitizer config import.
- `sanitizerConfig.ts`  
  Central DOMPurify configuration (allowed tags/attrs). Images allowed only if user setting permits.
- `htmlProcessor.ts`  
  DOM-based preprocessing:
    - Safety wrapper (feature-detect `DOMParser`, try/catch).
    - DOMPurify sanitize according to config.
    - Code block normalization:
        - Flattens GitHub-style span‑tokenized blocks to plain text.
        - Reconstructs `<pre><code class="language-xxx">...</code></pre>` if missing.
        - Language inference: class name tokens, shebang, limited HTML heuristic (escaped tags or real `<script|style>`).
    - No inline style → semantic mapping (bold/italic inference intentionally removed).
    - No empty-element / spacing micro-heuristics (simplified for maintainability).
    - Table fragments _not_ handled here (left to lightweight HTML string heuristic pre Turndown).
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

- Normalize early so Turndown sees canonical `<pre><code class="language-x">…</code></pre>`.
- Flatten GitHub highlight spans → plain text → preserve literal `<script>` as code (avoid executing / DOM altering).
- Shebang & limited HTML heuristics for language classification.
- Post-conversion fence preservation ensures later whitespace trimming/skipping does not corrupt code.

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

- Unit tests: table wrapping, `<br>` logic, code block inference, image include/exclude.
- Integration tests: composite HTML (email, GitHub README, Outlook NBSP artifacts, image-wrapped links).
- Snapshot test: real-world composite scenario to catch regression in combined transformations.
- Regression tests for previously problematic cases (empty permalink anchors, image-only links).

## Performance Notes

- DOMPurify + single DOM pass is O(n) for typical paste sizes.
- No caching by design (paste frequency low).
- Minimal regex passes post-conversion; fenced code extraction prevents pathological regex inside code blocks.

## Extension Points

- `sanitizerConfig.ts` – Adjust allowed tags/attrs centrally.
- `normalizeCodeBlocks` – Extend language inference map.
- `cleanupMarkdown` – Add formatting policies (e.g., trailing space trimming) with fenced protection.

## Trade-Offs

| Area               | Choice                             | Trade-Off                           |
| ------------------ | ---------------------------------- | ----------------------------------- |
| Semantics          | Drop style-based bold/italic       | Less recovery for raw styled spans  |
| Images             | Attribute-only sizing preservation | Inline style-based size lost        |
| Perf vs Simplicity | Always rebuild Turndown instance   | Minor overhead accepted             |
| Heuristics         | Limited (tables, code)             | Some edge formatting not “polished” |
| Safety             | DOMPurify strict config            | Potential loss of niche markup      |

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
