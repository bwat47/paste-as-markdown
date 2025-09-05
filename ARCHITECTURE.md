# paste-as-markdown – Architecture (Concise)

Goal: Deterministic HTML → Markdown conversion for Joplin with minimal heuristics and stable formatting.

## Pipeline Overview

1. Input acquisition (HTML string + options).
2. HTML preprocessing (`processHtml`):
    - Safe DOM parse (guarded if no DOM APIs).
    - Pre-sanitize code block neutralization: flatten highlight/token spans, convert `<br>`→`\n`, escape literal `<script>/<style>` examples by moving innerHTML to textContent.
    - DOMPurify sanitize (single authority for safety; images allowed only if setting enabled).
    - Post-sanitize normalization:
        - Code blocks: enforce `<pre><code>` shape, drop toolbars/empty blocks, infer language from class patterns (alias mapping), remove stray wrappers.
        - Anchor cleanup (permalink / empty anchors).
        - Whitespace normalization (NBSP variants outside code).
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
6. Return `{ markdown, resourcesMeta }`.

## Key Helpers

- `wrapOrphanedTableElements(html)` – Enables GFM table rule on row-only fragments.
- `normalizeCodeBlocks(body)` – Language inference + structural cleanup (class-based only; no heuristic on file content).
- `withFencedCodeProtection(markdown, transform)` – Protects fenced code during regex-based cleanup.
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
- Image resource conversion & sizing preservation.

## Design Principles (Applied)

- Single sanitize pass (DOMPurify) before structural mutation.
- Prefer DOM over regex for semantics; regex only for final line/spacing cleanup.
- No style-based semantic inference (bold/italic from CSS dropped intentionally).
- Per-invocation Turndown instance (no shared mutable state).
- Minimal post-processing; only tasks simpler after Markdown emission.

## Retained Legacy Heuristic (Justification)

- Table fragment wrapping: High value, low complexity, still necessary because plugin activates only on `<table>` root nodes.

## Exclusions / Non-Goals

- No attempt to recover styling-based emphasis.
- No content-based language detection (class names only).
- No deep normalization of nested task list indentation beyond spacing cleanup.

## Security

- DOMPurify configured centrally; scripts/styles/event handlers stripped once.
- Subsequent stages assume sanitized tree (no double stripping).

## Testing Focus

- Table fragment wrapping, task list spacing (nested + top-level), code block language inference, image include/exclude & resource conversion edge cases, literal `<script>` preservation, anchor cleanup, NBSP + `<br>` policies, custom mark/sup/sub rules.

## Summary

A deterministic two-phase approach:
(1) DOM preprocessing (safety + structural normalization),
(2) Turndown (upstream + forked GFM + minimal custom rules),
followed by constrained Markdown cleanup (spacing + line semantics).
Redundant logic removed; only `wrapOrphanedTableElements` retained to ensure GFM table rule applicability.
