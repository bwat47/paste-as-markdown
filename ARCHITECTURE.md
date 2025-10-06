# paste-as-markdown – Architecture (Concise)

Goal: Deterministic HTML → Markdown conversion for Joplin with minimal heuristics and stable formatting.

## Pipeline Overview

1. Input acquisition (HTML string + options).
2. HTML preprocessing (`processHtml`):
    - Safe DOM parse (guarded if no DOM APIs).
    - Pre-sanitize pass registry (see `src/html/passes/registry.ts`): ordered `ProcessingPass` objects describe the transformation steps (text normalization, UI cleanup, image sizing promotion, Google Docs wrapper removal, code neutralization, etc.) and are executed via the shared runner so additions live in one place.
    - DOMPurify sanitize (single authority for safety; images allowed only if setting enabled). KEEP_CONTENT is enabled, hence early UI cleanup. Sanitization failure (or missing DOM APIs) skips enhancement and returns a secure plain-text fallback rather than raw HTML.
    - Pass runner (`runPasses`) wraps each stage in defensive try/catch and logs warnings without halting the pipeline; the registry still defines logical order, conditions, and names for accurate logs.
    - Post-sanitize pass registry (same file) handles literal tag protection, heading/empty anchor cleanup, code block normalization, NBSP sentinels, and image attribute normalization. Image conversion remains asynchronous and triggers a second batch of post-image passes when enabled.
3. Pre-Turndown HTML fixups (`markdownConverter`):
    - `wrapOrphanedTableElements` – Wrap bare `<tr>/<td>/<col>` fragments in `<table>` (clipboard edge cases e.g. Excel) so GFM table rule can apply.
4. Turndown conversion:
    - Feed the sanitized `<body>` DOM node directly to Turndown when available. If no DOM body is available (e.g., environment lacks DOM APIs), fall back to the sanitized HTML string produced by `processHtml`.
    - Plain‑text fallback is not emitted by the HTML pipeline; when sanitization cannot complete safely, the paste handler decides whether to insert clipboard `text/plain` instead (and shows a toast if that’s unavailable).
    - Upstream Turndown (fresh instance per paste).
    - `mark` → `==text==`.
    - `sup` / `sub` / `ins` preserved as literal HTML (`<sup>..</sup>`, `<sub>..</sub>`) due to markdown syntax for these not being widespread (and conflicting with GFM strikethough in the case of `sub`).
    - Sized images rule (preserve width/height attributes when present).
    - List items rule (`pamListItem`) normalizes list rendering during conversion:
        - Exactly one space after list markers (ul, ol, and checkboxes).
        - Ensures nested list item content is indented by at least 4 spaces (what Joplin expects)
        - Honors `<ol start>` to compute the correct ordered prefixes
        - Normalizes task checkbox spacing inline to `- [ ] Text` / `- [x] Text` so post-processing doesn’t need to re‑regex task lines
    - Forked `turndown-plugin-gfm` (tables, strikethrough, task list items).
        - The plugin’s `highlightedCodeBlock` rule is effectively superseded by our broader code block normalization.
        - (Other upstream behaviors left intact: task list marker insertion, strikethrough, tables).
5. Markdown post-processing (`cleanupMarkdown` + helpers):
    - Trim leading blank lines.
    - `<br>` semantics (outside code fences & inline code):
        - Single `<br>` → hard break (`"  \n"`).
        - Runs of 2+ `<br>` → paragraph break (`\n\n`).
    - Collapse excessive blank lines (protect fenced code via sentinel extraction).
    - Remove whitespace-only NBSP lines.
    - Optional: Force tight lists (setting) — remove blank lines between consecutive list items (unordered/ordered/tasks), protected by fenced-code extraction.
6. Return `{ markdown, resourcesMeta, plainTextFallback }`. The boolean is reserved for outer plain-text fallbacks handled by the paste command (the HTML pipeline no longer emits sanitized plain text).

## What the GFM Plugin Covers

- Tables (including header detection & pipe escaping).
- Strikethrough (`del|s|strike` → `~~`).
- Task list markers (checkbox inputs → `[ ]` / `[x]`).
- (We bypass its limited highlighted code wrapper rule in favor of richer internal normalization.)
- Project uses a forked version of @truto/turndown-plugin-gfm
    - Upstream turndown-plugin-gfm is unmaintained (and didn't work well in testing).
    - Joplin's forked turndown-plugin-gfm has table logic that conflicts with plugin goals (keeping complex tables as HTML).
    - @truto version aligns with goals (simplified table handling, simplifies/collapses multi-line table cell content). My fork only contains a minor tweak.

## Design Principles

- Sanitize pass (DOMPurify).
- Prefer DOM over regex for semantics; regex only for final line/spacing cleanup.
- Make pre-sanitize passes idempotent and safe (text normalization can run twice; early UI removal compensates for KEEP_CONTENT behavior).
- Register cleanup stages once in the pass registry so ordering, conditions, and logging stay authoritative.
- No style-based semantic inference (bold/italic from CSS dropped intentionally).
- Per-invocation Turndown instance (no shared mutable state).
- Minimal post-processing; only tasks simpler after Markdown emission.

## Exclusions / Non-Goals

- No attempt to recover styling-based emphasis.
- No content-based language detection (class names only).
- No deep normalization of nested task list indentation beyond spacing cleanup.
- Tight lists do not collapse or merge multi-paragraph content within a single list item; only inter-item blank lines are removed when the setting is enabled.

## Security

- DOMPurify configured centrally; scripts/styles/event handlers stripped once and treated as the hard security boundary.
- Pre- and post-sanitize passes execute through the runner, which logs failures and continues so DOMPurify output is still used.
- Sanitization failure or lack of DOM APIs surfaces an error toast and aborts conversion, guaranteeing unsanitized HTML is never returned.
- Subsequent stages assume sanitized tree (no double stripping).

## Fallback Hierarchy

1. Full enhancement: DOMPurify + post-sanitize cleanup + Turndown → Markdown.
2. Sanitized HTML only: DOMPurify succeeded (during the main pass or the fallback sanitization) but enhancements or image conversion failed; sanitized markup still feeds Turndown.
3. Failure: Both sanitize attempts failed or DOM access is unavailable; the pipeline emits an error toast and stops, leaving callers to decide whether to attempt plain text.

## Testing Focus

- Table fragment wrapping, task list spacing (nested + top-level), tight list option behavior, code block language inference, image include/exclude & resource conversion edge cases, literal `<script>` preservation, anchor cleanup, NBSP + `<br>` policies, custom mark/sup/sub rules.
- Image sizing promotion from style → attributes (single- and double-dimension, precedence when attributes already exist).
- Literal tag mention wrapping.

## Summary

A deterministic two-phase approach:
(1) DOM preprocessing (safety + structural normalization),
(2) Turndown (upstream + forked GFM + minimal custom rules),
followed by constrained Markdown cleanup (spacing + line semantics), surfacing a toast and aborting when sanitization cannot complete safely.
