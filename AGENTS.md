# Repository Guidelines

## Internal Project Documentation

ARCHITECTURE.md

- Keep up to date with architecture changes when applicable.
- Keep this document concise, it's meant for LLMs to reference.

## Build, Test, and Development Commands

- `npm test` Run Jest test suite with JSDOM environment.
- `npm run dist` Build plugin and create archive at `publish/*.jpl`.
- `npm run lint` Lint TypeScript with ESLint.
- `npm run lint:fix` Auto-fix linting issues.
- `npm run format` Format code with Prettier.
- `npm run updateVersion` Sync plugin version metadata.

## Design Principles

- **Simple over complex:** Prefer focused, single-responsibility modules.
- **One clear way**: Avoid multiple competing approaches.
- **Separation of concerns**: Each module handles one aspect.
- **Fail fast**: Validate inputs early; provide clear error messages to users.

## Coding Style & Naming Conventions

- Language: TypeScript; 4-space indentation; semicolons enforced.
- Prefer explicit types and narrow public exports; avoid `any`.
- Filenames: `camelCase.ts` for modules; tests in `__tests__/<name>.test.ts`.
- Documentation: Use JSDoc for complex functions; document regex patterns with examples.
- Constants and configuration: No magic literals — extract to constants, enums, config objects, or dedicated types.
- Structure and Testability: Pure logic lives in small, focused units when internal behaviour is non-trivial. Global state and hidden side effects are avoided in favour of explicit dependencies when possible.
- Log messages should use `src\logger.ts`.

## HTML Processing & Security Guidelines

- Security first: Always sanitize HTML via DOMPurify before processing.
- Use the pass registry/runner for HTML pre-processing; define ordering and conditions via `ProcessingPass` objects instead of ad-hoc invocations.

## Settings & Configuration

- Define setting keys as string constants in `constants.ts`.
- Validate all settings via `validatePasteSettings()` helper.
- Provide sensible defaults; fail gracefully when settings are invalid.

## Testing Guidelines

- Framework: Jest with `ts-jest` and JSDOM for DOM environment.
- Place tests in `src/__tests__/<feature>.test.ts` with descriptive names.
