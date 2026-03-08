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

- `src/index.ts` registers the Joplin command and plugin settings.

### Paste Orchestration

- `src/pasteHandler.ts` coordinates the end-to-end paste flow.
- It reads clipboard content, validates settings, detects special sources such as Google Docs, calls the converter, inserts the result into the editor, and manages user-facing fallback behavior.

### HTML Processing

- `src/html/processHtml.ts` owns the HTML preparation stage.
- It parses clipboard HTML, runs ordered preprocessing and cleanup passes, sanitizes the result, and returns a safe DOM subtree for Markdown conversion.
- The pass registry under `src/html/passes/` keeps HTML cleanup logic organized and centrally ordered.

### Markdown Conversion

- `src/markdownConverter.ts` translates the processed DOM into Markdown.
- It builds a fresh Turndown pipeline for each paste, applies the GFM plugin, adds a small set of project-specific rules, and performs final Markdown cleanup before returning the result.

### Resource Conversion

- `src/resourceConverter.ts` handles optional image conversion into Joplin resources.
- This runs as part of HTML processing so Markdown output can reference Joplin-managed images instead of raw external data when that option is enabled.

### Shared Infrastructure

- `src/constants.ts` defines setting keys and shared configuration.
- `src/logger.ts` centralizes logging.
- `src/utils.ts` contains shared helpers such as settings validation and toast notifications.
- `src/types.ts` defines the main data shapes shared across the pipeline.

## Design Priorities

- Security first: HTML is sanitized before conversion output is trusted.
- Separation of concerns: paste orchestration, HTML processing, Markdown conversion, and resource handling are kept in distinct modules.
- Fail safely: when HTML conversion cannot proceed, the plugin prefers plain-text fallback over inserting unsafe or partial output.

## Testing Strategy

Tests in `src/__tests__/` focus on the main user-visible behaviors: HTML cleanup, sanitization, Markdown conversion, image handling, and paste fallback behavior.
