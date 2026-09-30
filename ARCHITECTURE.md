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

- `src/index.ts` registers the Joplin command, menus, and separate CodeMirror 5 and CodeMirror 6 content scripts, and delegates settings setup to `src/settings.ts`.
- `src/pasteCommand.ts` is the command boundary. It stops before reading or converting clipboard data when `editor.codeView` indicates the unsupported rich text editor.

### Editor Integration

- `src/editorCommands.ts` holds the command names shared between the plugin and its content scripts.
- `src/contentScripts/codeMirror6.ts` and `src/contentScripts/codeMirror5.ts` register those commands in the CodeMirror 6 and legacy editors respectively; each ignores the other's editor. They expose a shared insertion command and track recent editor `contextmenu` events via `src/contentScripts/contextMenuOrigin.ts`, a single-use marker with a short grace period.
- `src/editorIntegration.ts` is the plugin-side wrapper for those commands. Insertion falls back to Joplin's `insertText` when the content script is unavailable. The context-menu filter first checks Joplin's `editor.codeView` setting to exclude rich text mode, then consumes the marker to distinguish the Markdown editor from its viewer.

### Settings

- `src/settings.ts` owns setting keys, paste-option defaults, Joplin settings registration, and loading raw values into validated `PasteOptions`.
- Defaulting happens only at this boundary; the rest of the pipeline requires complete, already-resolved options.

### Paste Orchestration

- `src/pasteHandler.ts` coordinates the end-to-end paste flow.
- It reads clipboard content, loads resolved options from `src/settings.ts`, detects a clipboard source discriminant such as `google-docs`, builds the shared pass context, calls the conversion pipeline, inserts the result through the active Markdown editor's content-script command, and manages user-facing fallback behavior.
- `src/pasteConversion.ts` exposes `convertHtmlToMarkdown`, composing HTML processing with DOM-to-Markdown conversion and returning Markdown alongside resource metadata. It requires complete paste options and an explicit pass context.

### HTML Processing

- `src/html/processHtml.ts` owns the HTML preparation stage.
- It wraps orphaned table fragments before parsing clipboard HTML, runs pre-sanitize passes, sanitizes the result, runs post-sanitize passes, optionally converts images, and then runs post-image passes before returning a safe DOM subtree and resource metadata for Markdown conversion.
- HTML is parsed exactly once. The parsed body's children are handed to DOMPurify as a fragment with `RETURN_DOM`, and the sanitized body flows straight into the post-sanitize passes and Turndown. Nothing is serialized and re-parsed, so the tree DOMPurify checked is the tree that gets converted. Because the parser never re-normalizes the sanitized tree, content that stripped tags would strand in invalid positions must be relocated by a pre-sanitize pass (for example, `pre/tableCaptions.ts` lifts `<caption>` text out of `<table>`).
- `src/html/sanitize.ts` applies the DOMPurify configuration and hook-based element restrictions that cannot be expressed by tag and attribute allowlists alone. The tag and attribute allowlists themselves live in `src/html/sanitizerConfig.ts`.
- The pass registry under `src/html/passes/` groups passes into those three explicit phases. Passes execute in their declared array order.
- `src/html/shared/imageSource.ts` defines which image sources Joplin can render (`:/` resources, `data:`, `http(s)://`). The first post-sanitize pass removes all other images (relative paths, `file:`, `blob:`, ...), and resource conversion uses the same classification.
- `src/html/passContext.ts` holds the default pass context used when no clipboard source discriminant is detected.
- Unexpected pass or pipeline-stage exceptions stop conversion and trigger plain-text fallback; expected per-image conversion failures remain recoverable and are reported through resource counts.
- The post-image phase is the exception: resources are already created and no pass runs after it, so a failure there is logged and the converted DOM is kept rather than discarding the paste and orphaning those resources.
- Settings that shape output structure (for example forcing tight lists) are implemented as conditional DOM passes rather than Markdown post-processing, so they can act on the real document tree instead of re-parsing generated text.

### Markdown Conversion

- `src/markdownConverter.ts` exposes synchronous `domToMarkdown`, translating a sanitized, fully processed DOM into Markdown without modifying the supplied tree.
- Its caller must supply the body returned by `processHtml` or an equivalent trusted DOM; the converter does not sanitize input, run HTML passes, or create resources. Image inclusion is resolved during sanitization; the converter accepts only the list-indentation option.
- It builds a fresh Turndown pipeline for each paste, applies the GFM plugin, adds a small set of project-specific rules, and performs final Markdown cleanup before returning the result.
- The custom list-item rule applies the configured spaces-or-tabs indentation while preserving the width required for valid nested Markdown.
- `src/markdown/fencedCode.ts` uses a read-only Lezer CST to identify fenced-code ranges so cleanup never changes code contents.

### Resource Conversion

- `src/resourceConverter.ts` handles optional image conversion into Joplin resources.
- This runs as part of HTML processing so Markdown output can reference Joplin-managed images instead of raw external data when that option is enabled.
- Size and timeout limits default to `DEFAULT_RESOURCE_CONVERSION_LIMITS` and are injectable per call, so the caps stay explicit dependencies rather than module-level globals.
- The remote download timeout is a total deadline covering retries, headers and the full body stream.
- Data URLs must declare an `image/*` type; remote downloads must declare one or send no/a generic binary content type. Anything else is rejected before decoding or reading the body.
- `resolveImageType` in `src/imageMime.ts` decides the stored MIME type and extension from content, never from the declared type: raster images must match an allowlisted `file-type` signature (APNG is stored as PNG). SVG has no signature, so it is accepted only when declared as `image/svg+xml` and parsed by `DOMParser` as well-formed XML with an `svg` root in the SVG namespace (or no namespace). This checks XML syntax, not SVG feature validity or sanitization. Unsupported images fail conversion and keep their original `src`.
- The resolved type always sets the file extension; a remote URL only contributes the filename stem.

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
