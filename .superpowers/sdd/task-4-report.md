# Task 4 Report: Route, Document Language, and Game Menu Selector

## What I implemented

- Wired route-level locale ownership in `src/routes/+page.svelte`:
  - reads the saved/browser locale on mount with `readLocalePreference(...)`
  - persists user changes with `saveLocalePreference(...)`
  - drives `createI18n(activeLocale)` from route state
  - updates `document.documentElement.lang` reactively
- Localized route-owned copy required by the brief:
  - page `<title>`
  - map eyebrow text
  - game-menu management section label
  - saves button label
  - placement status/cancel copy
  - control-tower management header/status/close labels
  - day/cash readouts in the tower header
- Added `i18n` plumbing to task-owned components:
  - `TopBar.svelte`
  - `GameMenu.svelte`
  - `ControlDesk.svelte`
  - `AudioSettings.svelte`
- Added the game-menu language selector:
  - native `<select>`
  - `aria-label={i18n.t('gameMenu.language')}`
  - `data-testid="game-menu-trigger"`
  - `data-testid="language-selector"`
- Localized `TopBar.svelte`:
  - removed hard-coded `Intl.NumberFormat('en-US')`
  - uses `i18n.format.currency`
  - localizes day/cash/alerts/no-alerts strings
  - localizes alert row text via `localizeAlert(alert, alertGame, i18n)`
  - added `data-testid="cash-readout"`
- Extended and updated the touched component specs for the new prop surface and language-selector behavior.
- Added the needed message-catalog keys in:
  - `src/lib/i18n/messages/en.ts`
  - `src/lib/i18n/messages/ja.ts`
  - `src/lib/i18n/messages/zh-Hant.ts`

## What I tested and exact results

### Focused browser unit tests

Command:

```bash
rtk bun run test:unit -- src/lib/components/game/GameMenu.svelte.spec.ts src/lib/components/game/TopBar.svelte.spec.ts src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/AudioSettings.svelte.spec.ts --run --project client
```

Final result:

```text
Test Files  4 passed (4)
Tests       26 passed (26)
```

Note: this required an unsandboxed Chromium launch. The initial sandboxed attempt failed before tests ran with:

```text
FATAL: ... MachPortRendezvousServer ... Permission denied (1100)
```

### Svelte check

Command:

```bash
rtk bun run check
```

Result:

```text
svelte-check found 0 errors and 0 warnings
```

### Lint

Command:

```bash
rtk bun run lint
```

Result:

```text
Checking formatting...
All matched files use Prettier code style!
```

## TDD evidence

### RED

1. Updated touched specs first, including the new `GameMenu` language-selector test.

2. Ran the focused client suite.

Initial sandboxed run:

```text
Error: browserType.launch: Target page, context or browser has been closed
FATAL: ... MachPortRendezvousServer ... Permission denied (1100)
```

Unsandboxed rerun for the real product signal:

```text
FAIL  src/lib/components/game/GameMenu.svelte.spec.ts > GameMenu > shows language choices and emits the selected locale
VitestBrowserElementError: Cannot find element with locator: getByLabel('Language')
```

That was the intended RED state for the missing language selector.

### GREEN

Final rerun:

```text
Test Files  4 passed (4)
Tests       26 passed (26)
Duration    2.11s
```

Follow-up full verification:

```text
rtk bun run check -> svelte-check found 0 errors and 0 warnings
rtk bun run lint  -> All matched files use Prettier code style!
```

## Files changed

- `src/routes/+page.svelte`
- `src/lib/components/game/TopBar.svelte`
- `src/lib/components/game/GameMenu.svelte`
- `src/lib/components/game/ControlDesk.svelte`
- `src/lib/components/game/AudioSettings.svelte`
- `src/lib/components/game/GameMenu.svelte.spec.ts`
- `src/lib/components/game/TopBar.svelte.spec.ts`
- `src/lib/components/game/ControlDesk.svelte.spec.ts`
- `src/lib/components/game/AudioSettings.svelte.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

## Svelte MCP / autofixer evidence

Ran `list-sections` first, then fetched these relevant docs:

- `svelte/$state`
- `svelte/$derived`
- `svelte/$effect`
- `svelte/$props`
- `svelte/bind`
- `svelte/lifecycle-hooks`
- `svelte/testing`
- `kit/$app-environment`
- `kit/accessibility`

Ran `svelte-autofixer` on:

- full `GameMenu.svelte` -> no issues
- full `TopBar.svelte` -> no issues
- full `ControlDesk.svelte` -> no issues
- full `AudioSettings.svelte` -> no issues
- `+page.svelte` route snippets, because the full route file is large
  - script/state snippet -> no issues after review, one advisory suggestion about an intentional `$effect` side effect
  - markup/binding snippet with state declarations -> no issues

The autofixer also caught that TypeScript `as never` casts inside markup snippets were not safe to leave in template expressions, so I removed those from the affected template calls.

## Self-review findings

- Scope stayed inside the task-owned files plus the allowed i18n catalogs.
- The route remains the single source of truth for locale state; components do not recreate `createI18n('en')`.
- The browser-test escalation was environmental, not a product failure.
- No remaining correctness issues found in the touched surface after final verification.

## Concerns

- Browser-based unit verification on this machine requires an unsandboxed Chromium launch. The sandboxed run still fails with the known macOS Mach port permission error before assertions start.
- `src/app.html` already had `lang=\"en\"`, so no content change was needed there.
