# paste-as-markdown – Architecture (Concise)

Goal: Deterministic HTML → Markdown conversion for Joplin with minimal heuristics and stable formatting.

## Pipeline Overview

1. Input acquisition (HTML string + options).
2. HTML preprocessing (`processHtml`):
    - Safe DOM parse (guarded if no DOM APIs).
    - Pre-sanitize passes (order matters):
        - Text normalization (idempotent): normalize NBSP and optionally smart quotes; skips `code/pre`.
        - UI cleanup: remove obvious non-content UI (e.g., `<button>`, role-based controls, non-checkbox inputs, `<select>`), skipping `code/pre`.
        - Image sizing promotion: on `<img>` elements, promote `style="width: Npx; height: Mpx;"` into `width="N"`/`height="M"` attributes when neither attribute is present; remove `style` for determinism.
        - Code block neutralization: flatten highlight/token spans, convert `<br>`→`\n`, and escape literal `<script>/<style>` examples by moving innerHTML to textContent.
    - DOMPurify sanitize (single authority for safety; images allowed only if setting enabled). KEEP_CONTENT is enabled, hence early UI cleanup.
    - Post-sanitize normalization:
        - Literal tag mentions in prose: wrap tag-like tokens (e.g., `<table>`, `<img ...>`, `<br>`, etc.) in inline code to prevent accidental HTML interpretation; applies only outside `code/pre`.
        - Code blocks: enforce `<pre><code>` shape, drop toolbars/empty blocks, infer language from class patterns (alias mapping), remove stray wrappers.
        - Anchor cleanup (permalink / empty anchors; remove empty anchors only when images are excluded).
        - Text normalization again (idempotent) to remain robust to structure changes.
        - Image handling (optional conversion to Joplin resources + attribute normalization; or removal when disabled).
3. Pre-Turndown HTML fixups (`markdownConverter`):
    - `wrapOrphanedTableElements` – Wrap bare `<tr>/<td>/<col>` fragments in `<table>` (clipboard edge cases e.g. Excel) so GFM table rule can apply.
4. Turndown conversion:
    - Upstream Turndown (fresh instance per paste).
    - Forked `turndown-plugin-gfm` (tables, strikethrough, task list items).
        - The plugin’s `highlightedCodeBlock` rule is effectively superseded by our broader code block normalization;
        - `mark` → `==text==`.
        - `sup` / `sub` preserved as literal HTML (`<sup>..</sup>`, `<sub>..</sub>`).
        - Sized images rule (preserve width/height attributes when present).
        - (Other upstream behaviors left intact: task list marker insertion, strikethrough, tables).
5. Markdown post-processing (`cleanupMarkdown` + helpers):
    - Trim leading blank lines.
    - `<br>` semantics (outside code fences & inline code):
        - Single `<br>` → hard break (`"  \n"`).
        - Runs of 2+ `<br>` → paragraph break (`\n\n`).
    - Collapse excessive blank lines (protect fenced code via sentinel extraction).
    - Remove whitespace-only NBSP lines.
    - Normalize task list spacing (top-level + nested): enforce `- [ ] Task` / `- [x] Task` while preserving original indentation (tabs/spaces).
    - Optional: Force tight lists (setting) — remove blank lines between consecutive list items (unordered/ordered/tasks), protected by fenced-code extraction.
6. Return `{ markdown, resourcesMeta }`.

## Key Helpers

- `wrapOrphanedTableElements(html)` – Enables GFM table rule on row-only fragments.
- `normalizeCodeBlocks(body)` – Language inference + structural cleanup (class-based only; no heuristic on file content).
- `removeNonContentUi(body)` – Drops buttons/role-based UI/non-checkbox inputs/select (skips in code/pre).
- `normalizeTextCharacters(body, normalizeQuotes)` – Normalizes NBSP/smart quotes outside code/pre; idempotent.
- `promoteImageSizingStylesToAttributes(body)` – Pre-sanitize: move px width/height from `<img style>` to `width`/`height` attributes (only when neither attribute exists) and remove style.
- `protectLiteralHtmlTagMentions(body)` – Post-sanitize: wrap tag-like mentions in inline code, skipping `code/pre`.
- `withFencedCodeProtection(markdown, transform)` – Protects fenced code during regex-based cleanup.
- `tightenListSpacing(markdown)` – Collapses blank lines between list items when the “Force tight lists” option is enabled.
- Image conversion utilities (resource creation, metrics: attempted / failed / ids).

## What the GFM Plugin Now Covers

- Tables (including header detection & pipe escaping).
- Strikethrough (`del|s|strike` → `~~`).
- Task list markers (checkbox inputs → `[ ]` / `[x]`).
- (We bypass its limited highlighted code wrapper rule in favor of richer internal normalization.)

## Custom Responsibilities Not in GFM

- Broad code block normalization & language alias mapping (hljs / highlight-_ / language-_ / brush:\* etc.).
- `<mark>` → `==text==`.
- Preserve `<sup>/<sub>` tags directly.
- NBSP sanitation & task list spacing normalization.
- Orphaned table fragment wrapping.
- Tight list enforcement (optional post-processing preference; removes inter-item blank lines only).
- Image resource conversion & sizing preservation.
- Literal tag mention protection in prose to avoid unintended rendering (e.g., tables) when pasting escaped tags.
- Image sizing promotion from inline style to attributes; style removed for deterministic output.

## Design Principles (Applied)

- Sanitize pass (DOMPurify).
- Prefer DOM over regex for semantics; regex only for final line/spacing cleanup.
- Make pre-sanitize passes idempotent and safe (text normalization can run twice; early UI removal compensates for KEEP_CONTENT behavior).
- No style-based semantic inference (bold/italic from CSS dropped intentionally).
- Per-invocation Turndown instance (no shared mutable state).
- Minimal post-processing; only tasks simpler after Markdown emission.

## Retained Legacy Heuristic (Justification)

- Table fragment wrapping: High value, low complexity, still necessary because plugin activates only on `<table>` root nodes.

## Exclusions / Non-Goals

- No attempt to recover styling-based emphasis.
- No content-based language detection (class names only).
- No deep normalization of nested task list indentation beyond spacing cleanup.
- Tight lists do not collapse or merge multi-paragraph content within a single list item; only inter-item blank lines are removed when the setting is enabled.
<!-- Autolinks may be wrapped if they appear as tag-like tokens in pasted text; in practice source HTML rarely contains raw `<https://...>` text. -->

## Security

- DOMPurify configured centrally; scripts/styles/event handlers stripped once.
- Subsequent stages assume sanitized tree (no double stripping).

## Testing Focus

- Table fragment wrapping, task list spacing (nested + top-level), tight list option behavior, code block language inference, image include/exclude & resource conversion edge cases, literal `<script>` preservation, anchor cleanup, NBSP + `<br>` policies, custom mark/sup/sub rules.
- Image sizing promotion from style → attributes (single- and double-dimension, precedence when attributes already exist).
- Literal tag mention wrapping.

## Summary

A deterministic two-phase approach:
(1) DOM preprocessing (safety + structural normalization),
(2) Turndown (upstream + forked GFM + minimal custom rules),
followed by constrained Markdown cleanup (spacing + line semantics).

Redundant logic removed; only `wrapOrphanedTableElements` retained to ensure GFM table rule applicability.
