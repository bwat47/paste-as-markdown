# paste-as-markdown Architecture

## Purpose

This plugin turns clipboard HTML into clean Markdown for Joplin. It favors predictable output, safe HTML handling, and graceful fallback to plain text when conversion cannot complete reliably.

## High-Level Flow

1. Joplin invokes the plugin's paste command.
2. The paste handler reads clipboard data and plugin settings.
3. If HTML is available, the conversion pipeline:
    - normalizes and sanitizes the HTML,
    - optionally converts pasted images into Joplin resources,
    - converts the cleaned DOM into Markdown,
    - applies light Markdown cleanup.
4. The resulting Markdown is inserted into the editor.
5. If HTML processing fails, the plugin falls back to pasting plain text and notifies the user.

## Main Components

### Entry Point

- `src/index.ts` registers the Joplin command and menus, and delegates settings setup to `src/settings.ts`.

### Settings

- `src/settings.ts` owns setting keys, paste-option defaults, Joplin settings registration, and loading raw values into validated `PasteOptions`.
- Defaulting happens only at this boundary; the rest of the pipeline requires complete, already-resolved options.

### Paste Orchestration

- `src/pasteHandler.ts` coordinates the end-to-end paste flow.
- It reads clipboard content, loads resolved options from `src/settings.ts`, detects a clipboard source discriminant such as `google-docs`, builds the shared pass context, calls the converter, inserts the result into the editor, and manages user-facing fallback behavior.

### HTML Processing

- `src/html/processHtml.ts` owns the HTML preparation stage.
- It parses clipboard HTML, runs pre-sanitize passes, sanitizes the result, runs post-sanitize passes, optionally converts images, and then runs post-image passes before returning a safe DOM subtree for Markdown conversion.
- The pass registry under `src/html/passes/` groups passes into those three explicit phases. Passes execute in their declared array order.
- `src/html/passContext.ts` holds the default pass context used when no clipboard source discriminant is detected.
- Unexpected pass or pipeline-stage exceptions stop conversion and trigger plain-text fallback; expected per-image conversion failures remain recoverable and are reported through resource counts.
- The post-image phase is the exception: resources are already created and no pass runs after it, so a failure there is logged and the converted DOM is kept rather than discarding the paste and orphaning those resources.
- Settings that shape output structure (for example forcing tight lists) are implemented as conditional DOM passes rather than Markdown post-processing, so they can act on the real document tree instead of re-parsing generated text.
- Optional badge removal is a post-sanitize pass. A known badge-service URL or a donation call-to-action alt label identifies a badge on its own; an enclosing donation link only counts when the image itself also looks like a badge asset, so linked photographs survive. It runs before empty-anchor cleanup and image resource conversion.

### Markdown Conversion

- `src/markdownConverter.ts` translates the processed DOM into Markdown.
- It requires a complete `PasteOptions` and an explicit `PassContext` from its caller, so option resolution stays in `src/settings.ts`.
- It builds a fresh Turndown pipeline for each paste, applies the GFM plugin, adds a small set of project-specific rules, and performs final Markdown cleanup before returning the result.
- `src/markdown/fencedCode.ts` uses a read-only Lezer CST to identify fenced-code ranges so cleanup never changes code contents.

### Resource Conversion

- `src/resourceConverter.ts` handles optional image conversion into Joplin resources.
- This runs as part of HTML processing so Markdown output can reference Joplin-managed images instead of raw external data when that option is enabled.
- Size and timeout limits default to `DEFAULT_RESOURCE_CONVERSION_LIMITS` and are injectable per call, so the caps stay explicit dependencies rather than module-level globals.

### Shared Infrastructure

- `src/logger.ts` centralizes logging.
- `src/utils.ts` contains shared helpers such as toast notifications.
- `src/types.ts` defines the main data shapes shared across the pipeline.

## Design Priorities

- Security first: HTML is sanitized before conversion output is trusted.
- Separation of concerns: paste orchestration, HTML processing, Markdown conversion, and resource handling are kept in distinct modules.
- Fail safely: when HTML conversion cannot proceed, the plugin prefers plain-text fallback over inserting unsafe or partial output.

## Testing Strategy

Tests in `src/__tests__/` focus on the main user-visible behaviors: HTML cleanup, sanitization, Markdown conversion, image handling, and paste fallback behavior.
