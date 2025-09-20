# Repository Guidelines

## Project Structure & Module Organization

- `src/` TypeScript sources for the Joplin plugin.
	- `pasteHandler.ts` Core clipboard reading and paste orchestration.
	- `markdownConverter.ts` HTML-to-Markdown conversion pipeline.
	- `html/` HTML processing, sanitization, and DOM manipulation.
	- `resourceConverter.ts` Image conversion to Joplin resources.
	- `utils.ts` Settings validation, toast notifications, and helpers.
	- `constants.ts` Centralized configuration and string constants.
	- `gfmPlugin.ts` Dynamic import wrapper for GFM plugin.
	- `manifest.json` Plugin manifest; keep settings in sync with code.
- `src/__tests__/` Test files alongside sources; use descriptive names.
- `publish/` Build artifacts (`*.jpl`) created by the dist task.
- Build configuration files at project root.

## Build, Test, and Development Commands

- `npm test` Run Jest test suite with JSDOM environment.
- `npm run dist` Build plugin and create archive at `publish/*.jpl`.
- `npm run lint` Lint TypeScript with ESLint.
- `npm run lint:fix` Auto-fix linting issues.
- `npm run format` Format code with Prettier.
- `npm run updateVersion` Sync plugin version metadata.

Use Node LTS (18+) and npm 9+ for consistency.

## Design Principles

- Simple over complex; prefer focused, single-responsibility modules.
- Fail fast with clear error messages; don't swallow exceptions silently.
- Keep `index.ts` lean (plugin registration, command binding, settings only).
- Centralize constants in `constants.ts` and validate settings in `utils.ts`.
- HTML processing pipeline: sanitize early, process systematically, handle edge cases.
- Separation of concerns: clipboard → HTML processing → Markdown conversion → editor insertion.

## Coding Style & Naming Conventions

- Language: TypeScript; 4-space indentation; semicolons enforced.
- Prefer explicit types and narrow public exports; avoid `any`, use `unknown` then narrow.
- Filenames: `camelCase.ts` for modules; tests in `__tests__/<name>.test.ts`.
- Run `npm run lint` and `npm run format` before pushing.
- Use JSDoc on complex functions, especially HTML processing and conversion logic.
- Log with consistent prefix: `[paste-as-markdown]`.

## HTML Processing & Security Guidelines

- Security first: Always sanitize HTML via DOMPurify before processing.
- Process HTML in phases: pre-sanitize cleanup → sanitize → post-sanitize normalization.
- Preserve code blocks and literal content during text normalization passes.

## Settings & Configuration

- Define setting keys as string constants in `constants.ts`.
- Validate all settings via `validatePasteSettings()` helper.
- Provide sensible defaults; fail gracefully when settings are invalid.
- Document setting interactions (e.g., image resource conversion requires images enabled).

## Testing Guidelines

- Framework: Jest with `ts-jest` and JSDOM for DOM environment.
- Place tests in `src/__tests__/<feature>.test.ts` with descriptive names.
- Mock Joplin APIs consistently; use test setup for DOM globals.
- Include integration tests for full clipboard → Markdown workflows.
- Test edge cases: empty clipboard, malformed HTML, large images, complex tables.

## HTML-to-Markdown Conversion Process

- **Input validation**: Check clipboard content, fall back to plain text gracefully.
- **HTML processing pipeline**: Normalize → sanitize → clean → convert.
- **Markdown post-processing**: Post-processing that can't easily be handled by DOM pre-processing (e.g. whitespace normalization).
- **Error handling**: Capture conversion failures, show user-friendly messages.

## Resource Conversion & Image Handling

- Respect size limits (`MAX_IMAGE_BYTES`) to avoid memory issues.
- Handle timeouts for remote image downloads (`DOWNLOAD_TIMEOUT_MS`).
- Support both data URLs and remote HTTP(S) images.
- Generate meaningful alt text when missing; truncate overly long alt text.
- Clean up temporary files on conversion failure.

## Commit & Pull Request Guidelines

- Commits: clear, present-tense messages (e.g., "Fix table cell whitespace handling").
- Scope commits to single features or fixes; reference issues when applicable.
- PRs: include description, test coverage, and validation steps.

## Performance & Resource Management

- Cache expensive operations (GFM plugin loading, DOM parsing).
- Avoid bundling unused dependencies; check bundle size after changes.
- Handle large clipboard content gracefully; set reasonable timeouts.
- Clean up resources (temp files, DOM nodes) in error paths.

## Security & Compatibility Notes

- Never trust clipboard HTML content; always sanitize via DOMPurify.

	