# Game Audio Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make retail BGM more energetic, attempt BGM on map entry, and add mutually exclusive click SFX in store details.

**Architecture:** Keep route-owned playback and local checked-in audio assets. Update the audio controller so BGM can make a best-effort autoplay attempt before explicit unlock, while first interaction remains the retry path. Pass a generic click callback from `+page.svelte` into `TileInspector` for neutral store-detail clicks only.

**Tech Stack:** TypeScript, Svelte 5 runes, Svelte MCP autofixer, Web Audio/HTMLAudioElement, ElevenLabs MCP, Vitest browser/server projects, Playwright.

---

## File Structure

- **Modify** `static/assets/game/audio/bgm/retail-map.mp3` - regenerated energetic retail BGM.
- **Modify** `src/lib/audio/audioController.ts` - best-effort BGM autoplay and retry-safe BGM failures.
- **Modify** `src/lib/audio/audioController.spec.ts` - controller tests for map-entry attempt and interaction retry.
- **Modify** `src/lib/components/game/TileInspector.svelte` - generic store-detail click callback.
- **Modify** `src/lib/components/game/TileInspector.svelte.spec.ts` - tab/click exclusivity coverage.
- **Modify** `src/routes/+page.svelte` - pass `sfx.ui.click` callback to the store inspector.

## Task 1: Regenerate energetic retail BGM

- [ ] **Step 1: Generate one replacement BGM**

Use `mcp__elevenlabs.compose_music` with:

```json
{
  "prompt": "Energetic cozy retail city management game loop, instrumental only, seamless loop, upbeat warm piano and marimba, light brushed drums, soft hand percussion, plucked strings, subtle cash register sparkle and ledger texture, lively storefront planning energy, no vocals, no harsh synths, no trailer hits.",
  "music_length_ms": 36000,
  "model_id": "music_v2",
  "force_instrumental": true,
  "output_directory": "/Users/chanwaichan/workspace/Serpens/static/assets/game/audio/bgm"
}
```

If the call returns billing, credit, or payment errors, stop and report the blocker.

- [ ] **Step 2: Replace `retail-map.mp3`**

Rename the returned MP3 to:

```text
static/assets/game/audio/bgm/retail-map.mp3
```

- [ ] **Step 3: Verify asset list**

Run:

```sh
rtk find static/assets/game/audio -type f | sort
rtk du -h static/assets/game/audio
```

Expected: still exactly 26 MP3 files and roughly the same size class.

- [ ] **Step 4: Commit**

```sh
rtk git add static/assets/game/audio/bgm/retail-map.mp3
rtk git commit -m "audio: refresh retail map bgm"
```

## Task 2: Attempt BGM on map entry and retry after interaction

- [ ] **Step 1: Add controller tests**

In `src/lib/audio/audioController.spec.ts`, add coverage that:

- `setActiveBgm('bgm.retail-map')` calls `play()` before `unlock()`;
- if that first `play()` rejects, the cue is retried when `unlock()` is called;
- asset creation failures still mark the cue failed for the session.

- [ ] **Step 2: Update controller behavior**

In `src/lib/audio/audioController.ts`:

- let `setActiveBgm` call `startActiveBgm()` immediately when preferences allow it;
- keep `unlock()` as a retry path;
- do not add the BGM cue to `failedCueIds` for `HTMLAudioElement.play()` promise rejection, because autoplay rejection is expected and retryable;
- continue marking synchronous creation errors as failed.

- [ ] **Step 3: Run focused controller tests**

```sh
rtk bun run test:unit -- src/lib/audio/audioController.spec.ts --run
```

Expected: PASS.

- [ ] **Step 4: Commit**

```sh
rtk git add src/lib/audio/audioController.ts src/lib/audio/audioController.spec.ts
rtk git commit -m "feat: attempt bgm on map entry"
```

## Task 3: Add mutually exclusive store-detail click SFX

- [ ] **Step 1: Add Svelte docs context**

Call Svelte MCP `list_sections`, fetch `$props`, `basic-markup`, `testing`, and event-handling/lifecycle sections relevant to component callbacks, then run `svelte_autofixer` after editing each Svelte file.

- [ ] **Step 2: Add TileInspector callback tests**

In `src/lib/components/game/TileInspector.svelte.spec.ts`, add tests that:

- clicking a store tab calls a new `onClickFeedback` callback once;
- clicking the store upgrade button does not call `onClickFeedback` because the route already plays `sfx.store.upgrade`.

- [ ] **Step 3: Update TileInspector**

In `src/lib/components/game/TileInspector.svelte`:

- add optional prop `onClickFeedback?: () => void`;
- default it to `() => {}`;
- call it in `selectStoreTab`;
- do not call it from upgrade, stock, staff, or close handlers.

- [ ] **Step 4: Update route wiring**

In `src/routes/+page.svelte`, pass:

```svelte
onClickFeedback={() => playSfx('sfx.ui.click')}
```

to `<TileInspector />`.

- [ ] **Step 5: Run focused tests**

```sh
rtk bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run
rtk bun run check
rtk bun run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
rtk git add src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/+page.svelte
rtk git commit -m "feat: add store detail click sfx"
```

## Task 4: Final verification

- [ ] **Step 1: Run full verification**

```sh
rtk bun run check
rtk bun run lint
rtk bun run test:unit -- src/lib/audio/audioController.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts --run
rtk bun run test:unit -- --run
rtk bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "audio controls persist"
rtk git status --short
```

Expected: all commands pass and git status is clean.
