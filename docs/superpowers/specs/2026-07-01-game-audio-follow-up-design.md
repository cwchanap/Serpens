# Game Audio Follow-up - Design

**Date:** 2026-07-01
**Status:** Approved

## Summary

This follow-up tightens the first audio pass in three places:

- Replace the retail city BGM with a more energetic short loop.
- Attempt BGM playback as soon as the player enters the map, while still retrying after first interaction when browser autoplay blocks audible playback.
- Add generic click SFX for store-detail interactions, with mutually exclusive cue handling so one click produces at most one sound.

Runtime still uses only checked-in local assets. ElevenLabs MCP is used only once, offline, to regenerate `static/assets/game/audio/bgm/retail-map.mp3`.

## Behavior

### Retail BGM

Regenerate only `bgm.retail-map`. Keep the existing filename and catalog entry so no route or save behavior changes. The replacement should be:

- 36 seconds or less;
- instrumental and loopable;
- more energetic than the current retail loop;
- still cozy and mercantile, not loud, harsh, or cinematic.

If ElevenLabs returns a billing, credit, or payment error, stop and report the blocker. Do not retry with force and do not replace the track with scripted tones.

### BGM Start

The controller should try to start the active BGM immediately once the route sets the active map cue. This is best-effort because browser autoplay policy can still reject audible playback. If playback is rejected, the cue must not be permanently failed; the existing first-interaction unlock path should retry it.

Expected result:

- Browser/Tauri contexts that allow autoplay start BGM on map entry.
- Browsers that block autoplay remain playable after the first click/key interaction.
- Failed asset loads or unsupported audio APIs still degrade without breaking gameplay.

### Store Detail Click SFX

Every click in the store details/inspector surface should have SFX feedback, but cues must be mutually exclusive:

- Specific domain actions keep their existing specific cues, such as store upgrade, stock edit, staff hire, staff assign, and staff unassign.
- Neutral store-detail clicks play `sfx.ui.click`.
- A single user click must not stack `sfx.ui.click` on top of a specific action cue.

The route remains the owner of actual audio playback. Store detail components should request generic click feedback through callbacks rather than importing the audio controller directly.

## Testing

Add or update tests that verify:

- `setActiveBgm` attempts playback before unlock and retries after unlock if autoplay rejects.
- Store inspector tab clicks call the generic click callback.
- Upgrade/domain actions do not also call the generic click callback.

Run:

```sh
rtk bun run check
rtk bun run lint
rtk bun run test:unit -- src/lib/audio/audioController.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts --run
rtk bun run test:unit -- --run
rtk bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "audio controls persist"
```
