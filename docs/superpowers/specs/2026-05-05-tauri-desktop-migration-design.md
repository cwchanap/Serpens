# Tauri Desktop Migration Design

## Status

Approved for design documentation on 2026-05-05.

## Goal

Migrate Serpens from a browser-targeted SvelteKit app into a desktop-only Tauri app while preserving the current retail simulation architecture and adding first-class desktop saves.

The desktop app should launch the existing SvelteKit and Phaser experience in a native Tauri window, support auto-resume, and support manual in-app save slots.

## Product Scope

This migration targets the first desktop build of Serpens:

- Tauri 2 desktop shell.
- SvelteKit static SPA output for the webview.
- Existing Phaser city map and Svelte management UI.
- Tauri-backed auto-save.
- Tauri-backed manual in-app save slots.
- Browser dev and automated tests remain useful for development, but production support is desktop-only.

The migration should not change business balancing, city generation, Phaser map behavior, or storefront art behavior.

## Architecture

Serpens remains a SvelteKit, Svelte 5, Phaser, TypeScript, and Bun project. Tauri becomes the native host and persistence provider.

The existing boundaries stay in place:

- Pure TypeScript modules under `src/lib/game` own simulation state, city generation, placement rules, reports, and daily economy.
- Svelte owns route state, UI composition, management panels, and save controls.
- Phaser owns city map rendering, camera behavior, tile interaction, and store sprites.
- Tauri owns the desktop shell and native save persistence.

Core game modules must not import Tauri APIs. Desktop-specific behavior should sit behind small persistence and shell-facing modules so the simulation remains testable without a native runtime.

## SvelteKit Desktop Build

SvelteKit should move from `adapter-auto` to `adapter-static` for desktop production output.

The desktop build should use SPA mode:

- Configure `adapter-static` with a fallback entry suitable for Tauri, such as `index.html`.
- Disable app-level SSR so Tauri and browser-only APIs run in the webview rather than during server rendering.
- Keep Phaser mounted through the existing browser-only `onMount` pattern.
- Preserve static asset URLs for storefront art and verify they work inside the Tauri webview.

This project has no current `+server`, `+page.server`, or `+layout.server` routes, so the first migration does not need to preserve server-side SvelteKit behavior.

## Tauri Shell

Add a minimal Tauri 2 shell under `src-tauri/`.

Configuration should include:

- App identifier: `com.serpens.game`.
- Window title: `Serpens`.
- Development URL pointing at the SvelteKit dev server.
- `beforeDevCommand`: `bun run dev`.
- `beforeBuildCommand`: `bun run build`.
- `frontendDist`: `../build`.
- Store plugin registration and the matching capability permission.

Package scripts should expose the native workflow through Bun, for example:

- `tauri`
- `tauri:dev`
- `tauri:build`

Native menus, updater integration, import/export save files, signing, installer customization, and distribution pipelines are out of scope for this pass.

## Save System

Add a save persistence boundary under `src/lib/persistence` or a similarly focused location.

The UI should talk to a save repository abstraction rather than calling Tauri APIs directly. The first production repository uses `@tauri-apps/plugin-store`.

The store file should be a single structured JSON store, such as `serpens-saves.json`, containing:

- `schemaVersion`.
- Auto-save record metadata.
- Auto-save game payload.
- Manual save slot metadata.
- Manual save slot game payloads.

Save records should include:

- Stable slot id.
- Display name.
- Updated timestamp.
- Game day.
- Cash.
- Store count or company summary.
- Serialized `GameState`.

Schema version `1` is the first supported save format. The implementation should reject incompatible future versions with a clear error instead of trying to load unknown data.

## Save Behavior

The first desktop save behavior supports both auto-save and manual slots:

- Auto-save updates after meaningful game state changes, such as founding a store, opening a store, changing policy, resolving a decision, or advancing a day.
- On app launch, the player can resume the latest auto-save if one exists.
- Manual slots can be created, overwritten, loaded, and deleted from the in-app save UI.
- Manual slots are in-app only. The player does not choose files on disk in this pass.
- Save and load actions should avoid silent failure. The UI should show clear status text for successful saves, failed saves, failed loads, and missing saves.

Browser-only development may use a localStorage-backed or memory-backed repository for tests and iteration, but desktop production should use the Tauri store repository.

## Save UI

Add a modest save surface rather than a large file manager.

The save UI can live behind a `Saves` control in the top-level management shell or Control Tower. It should show:

- Whether an auto-save exists.
- Resume auto-save action when available.
- Manual save slot list.
- Save current game to slot.
- Load slot.
- Delete slot.
- Save status or error message.

The UI should be usable after the game starts. If no active game exists, it should still allow loading existing saves.

## Data Flow

Startup flow:

1. Svelte route creates the save repository.
2. Repository checks for auto-save and slot metadata.
3. UI offers resume or load actions when saved games exist.
4. Loading a save replaces the route-owned `GameState` and restores the map snapshot through existing derived state.

Auto-save flow:

1. Player performs a meaningful game action.
2. Route updates `GameState` through existing pure helpers.
3. Save coordinator writes the latest `GameState` to the auto-save record.
4. UI shows the latest save status.

Manual slot flow:

1. Player chooses a slot name or existing slot.
2. Save repository writes versioned metadata and payload to the store.
3. Slot list refreshes from repository metadata.
4. Loading a slot validates schema version and replaces active `GameState`.

## Error Handling

The desktop app should handle:

- Tauri store plugin unavailable.
- Store permission misconfiguration.
- Store load or save failure.
- Corrupt save payload.
- Unsupported save schema version.
- Missing manual slot.
- Loading a save with stale selected tile id.
- Browser development environment without Tauri APIs.

Failures should leave the app running. A failed save should not mutate game state. A failed load should keep the current game state.

## Testing Strategy

Pure TypeScript tests:

- Save record serialization.
- Slot metadata creation.
- Auto-save replacement.
- Manual slot create, overwrite, load, and delete behavior.
- Unsupported schema version handling.
- Corrupt payload handling.
- Non-Tauri fallback repository behavior.

Svelte and browser tests:

- Existing founding-store and advance-day flow still works after SPA/static build changes.
- Save UI displays empty, saved, saving, success, and error states.
- Loading a slot restores visible game state such as day, cash, stores, and selected city.

Desktop verification:

- `bun run check`.
- Focused unit tests for persistence.
- Existing unit tests.
- Existing Playwright e2e tests.
- `bun run build` produces static output without adapter-auto warnings.
- Tauri dev or build smoke test runs if local Rust and platform prerequisites are installed.

If local Tauri prerequisites are missing, the implementation result should report the exact missing prerequisite or command failure rather than claiming desktop verification passed.

## Out Of Scope

This pass does not include:

- Importing or exporting `.serpens-save` files.
- Multiple profiles outside in-app save slots.
- Cloud sync.
- Save migrations beyond rejecting unsupported versions.
- Native updater.
- App signing and release packaging.
- Native menus beyond scaffold defaults.
- Major UI redesign.
- Business simulation balance changes.
- Phaser renderer rewrites.
