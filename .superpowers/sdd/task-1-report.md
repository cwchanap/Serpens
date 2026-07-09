# Task 1 Report: Core Locale Runtime

## Implemented

- Added `src/lib/i18n/locales.ts` with `SupportedLocale`, `LANGUAGE_PREFERENCE_STORAGE_KEY`, `resolveSupportedLocale`, `readLocalePreference`, and `saveLocalePreference`.
- Added locale message trees in `src/lib/i18n/messages/en.ts`, `zh-Hant.ts`, and `ja.ts`, plus `src/lib/i18n/messages/index.ts`.
- Added `src/lib/i18n/translate.ts` with dot-key lookup, interpolation, English fallback, and dev warning support.
- Added `src/lib/i18n/format.ts` with cached `Intl.NumberFormat`, `Intl.DateTimeFormat`, and `Intl.ListFormat` instances per locale.
- Added `src/lib/i18n/index.ts` with the public i18n bundle surface and `createI18n(locale)`.
- Added tests for locale resolution, translation lookup/parity, and formatter output under `src/lib/i18n/*.spec.ts`.

## TDD Evidence

### RED

Command:

```bash
rtk bun run test:unit -- src/lib/i18n/locales.spec.ts --run
```

Expected failure captured:

```text
Error: Cannot find module './locales' imported from /Users/chanwaichan/workspace/Serpens/src/lib/i18n/locales.spec.ts
```

Command:

```bash
rtk bun run test:unit -- src/lib/i18n/translate.spec.ts src/lib/i18n/format.spec.ts --run
```

Expected failure captured:

```text
Error: Cannot find module './format' imported from /Users/chanwaichan/workspace/Serpens/src/lib/i18n/format.spec.ts
Error: Cannot find module './translate' imported from /Users/chanwaichan/workspace/Serpens/src/lib/i18n/translate.spec.ts
```

### GREEN

Command:

```bash
rtk bun run test:unit -- src/lib/i18n/locales.spec.ts src/lib/i18n/translate.spec.ts src/lib/i18n/format.spec.ts --run
```

Result:

```text
Test Files  3 passed (3)
Tests       10 passed (10)
```

Additional verification:

```bash
rtk bun run check
```

Result:

```text
svelte-check found 0 errors and 0 warnings
```

## Changed Files

- `src/lib/i18n/locales.ts`
- `src/lib/i18n/locales.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/index.ts`
- `src/lib/i18n/translate.ts`
- `src/lib/i18n/translate.spec.ts`
- `src/lib/i18n/format.ts`
- `src/lib/i18n/format.spec.ts`
- `src/lib/i18n/index.ts`

## Self-Review

- Locale resolution now prefers a valid stored value, ignores invalid stored values, and catches storage access failures.
- Message keys are present in all supported locales and the translator falls back to English without warning in the tested happy path.
- Formatter instances are created once per bundle and reused by the returned methods.
- `createI18n` exposes both `formatters` and `format` for downstream flexibility.

## Concerns

- The brief’s translation parity test listed `expect.assertions(1)` while making two assertions; I corrected that to `expect.assertions(2)` so the test suite could run as written otherwise.
