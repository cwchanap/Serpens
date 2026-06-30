# Game Audio - Design

**Date:** 2026-06-30
**Status:** Approved (pending spec review)

## Summary

Add a first pass of cozy, tactile game audio to Serpens:

- **Three short loopable BGM tracks**: retail map, industry map, and world map.
- **Expanded management SFX**: UI feedback, building placement, progression, saves, staff,
  policy, stock, upgrade, and production-chain actions.
- **Offline ElevenLabs MCP generation only**: generated files are checked into
  `static/assets/game/audio/`; the shipped browser/Tauri app never calls ElevenLabs.
- **Typed local playback layer**: a catalog plus a Svelte-side audio controller, with Phaser
  remaining map-render only.
- **Separate BGM and SFX controls** persisted as local app preferences, not game-save data.

The goal is to make the management loop feel responsive and warm without changing deterministic
game logic or introducing runtime API-cost risk.

## Decisions

| Question | Decision |
| --- | --- |
| v1 audio scope | Ambient and feedback-focused, with expanded management SFX |
| BGM coverage | Separate loops for retail, industry, and world map views |
| BGM length | Short, loopable tracks around 30-45 seconds |
| Generation tool | ElevenLabs MCP tools, not a project API script |
| Generation budget | One generation per cue; redo only clearly unusable cues |
| Runtime API calls | None |
| Sonic direction | Cozy mercantile sim |
| Output format | MP3 44.1kHz 128kbps |
| Runtime architecture | Typed local audio catalog plus Svelte-side audio controller |
| Audio controls | Separate BGM/SFX enabled state and volume |
| Settings persistence | Local app preferences, separate from game saves |
| BGM start | After the first player interaction when BGM is enabled |

## Architecture

Audio is a client-side feature beside the existing game/UI layers. Pure game transitions remain
audio-free, and Phaser scenes continue to render maps from snapshots without owning audio rules.

Generation produces local assets under:

```text
static/assets/game/audio/
```

Runtime code should introduce a small audio package, likely:

```text
src/lib/audio/audioCatalog.ts
src/lib/audio/audioController.ts
src/lib/audio/audioPreferences.ts
```

The catalog is the single source of truth for every cue. Each entry should include a stable cue id,
file path, channel (`bgm` or `sfx`), loop metadata, and a short usage note. Tests should assert that
registered paths exist.

The controller is created from `src/routes/+page.svelte`, where Serpens already owns map view
changes and gameplay transition handlers. The controller handles:

- first user-interaction unlock;
- active BGM loop selection from `activeMapView`;
- SFX playback for UI and gameplay actions;
- persisted preference reads/writes;
- graceful handling of load, decode, autoplay, and playback failures.

Phaser-specific tile selection remains unchanged. Svelte handlers decide which cue to play after
they accept or reject an action.

## Audio Assets

### BGM

Create three instrumental, loopable BGM cues:

| Cue | Purpose | Direction |
| --- | --- | --- |
| `bgm.retail-map` | Retail city map | Cozy storefront planning loop with warm keys, light percussion, plucked strings or marimba, and subtle paper/ledger texture |
| `bgm.industry-map` | Industry city map | Warm workshop loop with soft mechanical rhythm, muted percussion, gentle bass, and no harsh factory noise |
| `bgm.world-map` | Regional world map | Broader planning loop with airy map-table feel, restrained melody, and a calm sense of expansion |

Constraints:

- 30-45 seconds per track.
- Loopable by prompt and review.
- Instrumental only; no vocals or spoken words.
- MP3 44.1kHz 128kbps.
- One MCP generation per cue unless the output is clearly unusable.

### SFX

Create short, non-voice SFX. Use loop disabled. Most cues should be 0.5-2 seconds.

Core UI:

- `sfx.ui.click`
- `sfx.ui.menu-open`
- `sfx.ui.menu-close`
- `sfx.ui.panel-open`
- `sfx.ui.panel-close`

Placement and building:

- `sfx.build.arm`
- `sfx.build.retail-place`
- `sfx.build.industry-place`
- `sfx.build.invalid`

Time and progression:

- `sfx.time.advance-day`
- `sfx.world.city-unlock`
- `sfx.save.saved`
- `sfx.save.loaded`

Management:

- `sfx.staff.hire`
- `sfx.staff.assign`
- `sfx.staff.unassign`
- `sfx.staff.promote`
- `sfx.policy.change`
- `sfx.decision.resolve`
- `sfx.store.upgrade`
- `sfx.industry.upgrade`
- `sfx.stock.edit`
- `sfx.chain.feedback`

The desired SFX palette is tactile and mercantile: soft bells, small wood/metal clicks, paper
stamps, ledger taps, muted workshop hits, and warm confirmation tones. Avoid alarms, voice-like
tones, aggressive UI beeps, or long tails that stack during repeated interactions.

## Playback Behavior

BGM starts only after the first player interaction when BGM is enabled. After audio is unlocked,
the controller keeps one active BGM loop and swaps or crossfades when `activeMapView` changes
between retail, industry, and world.

SFX fire from existing action handlers:

- immediate UI feedback for menu/panel click actions;
- valid placement sounds after a retail store or industrial building is built;
- invalid placement sound when placement validation returns a block reason;
- management sounds from the same handler that performs hire, assign, unassign, promote, policy,
  decision, stock, and upgrade actions;
- save/load sounds only after the operation succeeds.

SFX should use Web Audio decoded buffers for low-latency playback. If Web Audio cannot decode or
play a cue, the controller can fall back to a lighter playback path or disable the failed cue for
the session. Short repeated SFX may overlap lightly; long or failed sounds should not stack.

## Controls And Persistence

Add an audio section to the existing map menu. Controls:

- BGM enabled/disabled.
- BGM volume.
- SFX enabled/disabled.
- SFX volume.

Preferences are local app settings, not `GameState` and not save-slot data. A player who mutes BGM
or adjusts volume should keep that preference across reloads and save slots. The persistence layer
can be a small localStorage-backed module with validation and defaults.

Default preferences:

- BGM enabled.
- SFX enabled.
- Moderate BGM volume.
- Moderate SFX volume.

The UI should expose only player-facing audio controls. It should not mention ElevenLabs,
generation prompts, or asset tooling.

## Error Handling

Audio is optional. Gameplay must continue if:

- an audio file is missing;
- an asset fails to load or decode;
- autoplay is blocked;
- Web Audio is unavailable;
- playback throws.

In development, the controller may log concise warnings. In normal gameplay, failed cues should
degrade silently after being marked unavailable for the session.

Generation guardrails:

- Use ElevenLabs MCP tools only during explicit offline asset generation.
- Do not put API keys or ElevenLabs calls in browser/Tauri runtime code.
- Stop on billing, credit, or payment errors, including `402 Payment Required`.
- Do not force retry after a payment or credit error.
- Keep the one-generation-per-cue budget unless the user approves more.

## Testing

Unit tests:

- catalog completeness: every registered audio path exists under `static/assets/game/audio/`;
- preference defaults, persistence, and invalid stored-value fallback;
- controller behavior with mocked audio APIs: BGM selection, first-interaction unlock, preference
  gating, SFX gating, missing asset handling, and volume updates.

Component tests:

- menu renders BGM/SFX controls;
- controls call the expected handlers;
- controls reflect persisted preference state after reload through the preference module.

Browser/e2e smoke tests:

- first interaction unlocks audio without blocking gameplay;
- changing map views updates the intended BGM cue;
- critical actions call the expected SFX hook.

Do not assert real audible output in Playwright. Prefer test-visible state or mocked controller
hooks.

Expected verification commands:

```sh
bun run check
bun run test:unit -- --run
```

Run focused component or e2e tests when the implementation touches those surfaces.

## Out Of Scope

- Voiceover or text-to-speech.
- Per-tile ambience.
- Dynamic music generated from simulation state.
- Runtime ElevenLabs API or MCP calls from the shipped app.
- Audio fields in `GameState` or save files.
- Moving map-render input or audio ownership into Phaser scenes.
