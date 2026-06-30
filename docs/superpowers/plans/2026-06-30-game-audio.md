# Game Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add short loopable BGM and expanded management SFX generated through ElevenLabs MCP, then play the checked-in local assets through a typed Svelte-side audio layer.

**Architecture:** Generate MP3 assets offline into `static/assets/game/audio/`, register them in a typed catalog, and keep runtime playback in `src/lib/audio/`. `src/routes/+page.svelte` owns audio cue dispatch because it already owns game transitions and map view changes; Phaser remains map-render only.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5 runes, Vitest browser/server projects, Playwright e2e, ElevenLabs MCP tools, MP3 44.1kHz 128kbps.

**Spec:** `docs/superpowers/specs/2026-06-30-game-audio-design.md`

---

## File Structure

- **Create** `static/assets/game/audio/bgm/` - checked-in BGM MP3 files.
- **Create** `static/assets/game/audio/sfx/` - checked-in SFX MP3 files.
- **Create** `src/lib/audio/audioCatalog.ts` - stable cue ids, local file paths, channel metadata, loop flags.
- **Create** `src/lib/audio/audioCatalog.spec.ts` - catalog uniqueness and asset-existence tests.
- **Create** `src/lib/audio/audioPreferences.ts` - localStorage-backed BGM/SFX preference validation and persistence.
- **Create** `src/lib/audio/audioPreferences.spec.ts` - preference defaults, persistence, and invalid-value fallback tests.
- **Create** `src/lib/audio/audioController.ts` - BGM loop and Web Audio SFX playback controller.
- **Create** `src/lib/audio/audioController.spec.ts` - mocked runtime tests for unlock, BGM switching, SFX gating, and preference updates.
- **Create** `src/lib/components/game/AudioSettings.svelte` - menu controls for BGM/SFX enabled state and volume.
- **Create** `src/lib/components/game/AudioSettings.svelte.spec.ts` - component tests following the existing `vitest-browser-svelte` pattern.
- **Modify** `src/routes/+page.svelte` - instantiate controller, wire first-interaction unlock, BGM map-view changes, SFX calls, and menu controls.
- **Modify** `src/routes/retail-sim.e2e.ts` - smoke test menu audio controls and persisted preferences.

---

## Task 1: Generate and check in local audio assets

**Files:**
- Create: `static/assets/game/audio/bgm/retail-map.mp3`
- Create: `static/assets/game/audio/bgm/industry-map.mp3`
- Create: `static/assets/game/audio/bgm/world-map.mp3`
- Create: `static/assets/game/audio/sfx/ui-click.mp3`
- Create: `static/assets/game/audio/sfx/ui-menu-open.mp3`
- Create: `static/assets/game/audio/sfx/ui-menu-close.mp3`
- Create: `static/assets/game/audio/sfx/ui-panel-open.mp3`
- Create: `static/assets/game/audio/sfx/ui-panel-close.mp3`
- Create: `static/assets/game/audio/sfx/build-arm.mp3`
- Create: `static/assets/game/audio/sfx/build-retail-place.mp3`
- Create: `static/assets/game/audio/sfx/build-industry-place.mp3`
- Create: `static/assets/game/audio/sfx/build-invalid.mp3`
- Create: `static/assets/game/audio/sfx/time-advance-day.mp3`
- Create: `static/assets/game/audio/sfx/world-city-unlock.mp3`
- Create: `static/assets/game/audio/sfx/save-saved.mp3`
- Create: `static/assets/game/audio/sfx/save-loaded.mp3`
- Create: `static/assets/game/audio/sfx/staff-hire.mp3`
- Create: `static/assets/game/audio/sfx/staff-assign.mp3`
- Create: `static/assets/game/audio/sfx/staff-unassign.mp3`
- Create: `static/assets/game/audio/sfx/staff-promote.mp3`
- Create: `static/assets/game/audio/sfx/policy-change.mp3`
- Create: `static/assets/game/audio/sfx/decision-resolve.mp3`
- Create: `static/assets/game/audio/sfx/store-upgrade.mp3`
- Create: `static/assets/game/audio/sfx/industry-upgrade.mp3`
- Create: `static/assets/game/audio/sfx/stock-edit.mp3`
- Create: `static/assets/game/audio/sfx/chain-feedback.mp3`

- [ ] **Step 1: Create the target directories**

Run:

```sh
rtk mkdir -p static/assets/game/audio/bgm static/assets/game/audio/sfx
```

Expected: directories exist.

- [ ] **Step 2: Generate the three BGM tracks with ElevenLabs MCP**

Use `mcp__elevenlabs.compose_music` once per cue. Set `output_directory` to `/Users/chanwaichan/workspace/Serpens/static/assets/game/audio/bgm`, `model_id` to `music_v2`, `force_instrumental` to `true`, and `music_length_ms` to `36000`.

Call 1:

```json
{
  "prompt": "Cozy mercantile retail planning game loop, instrumental only, seamless loop, warm piano and marimba, light brushed percussion, soft plucked strings, subtle paper ledger texture, calm shopfront energy, no vocals, no harsh synths, no dramatic trailer hits.",
  "music_length_ms": 36000,
  "model_id": "music_v2",
  "force_instrumental": true,
  "output_directory": "/Users/chanwaichan/workspace/Serpens/static/assets/game/audio/bgm"
}
```

Rename the returned MP3 path to:

```text
static/assets/game/audio/bgm/retail-map.mp3
```

Call 2:

```json
{
  "prompt": "Cozy workshop and light industry planning game loop, instrumental only, seamless loop, warm muted mechanical rhythm, soft mallet percussion, gentle bass, small brass and wood textures, productive but calm, no vocals, no alarms, no harsh factory noise.",
  "music_length_ms": 36000,
  "model_id": "music_v2",
  "force_instrumental": true,
  "output_directory": "/Users/chanwaichan/workspace/Serpens/static/assets/game/audio/bgm"
}
```

Rename the returned MP3 path to:

```text
static/assets/game/audio/bgm/industry-map.mp3
```

Call 3:

```json
{
  "prompt": "Cozy regional map planning game loop, instrumental only, seamless loop, airy map table mood, restrained melody, warm piano, light strings, soft hand percussion, sense of expansion and planning, no vocals, no cinematic trailer percussion.",
  "music_length_ms": 36000,
  "model_id": "music_v2",
  "force_instrumental": true,
  "output_directory": "/Users/chanwaichan/workspace/Serpens/static/assets/game/audio/bgm"
}
```

Rename the returned MP3 path to:

```text
static/assets/game/audio/bgm/world-map.mp3
```

If any call returns a billing, credit, or payment error, including `402 Payment Required`, stop the task and report the blocker. Do not retry with force.

- [ ] **Step 3: Generate the SFX with ElevenLabs MCP**

Use `mcp__elevenlabs.text_to_sound_effects` once per cue. Set `output_directory` to `/Users/chanwaichan/workspace/Serpens/static/assets/game/audio/sfx`, `output_format` to `mp3_44100_128`, and `loop` to `false`. Rename each returned MP3 to the listed target path.

| Target file | Duration | Text |
| --- | ---: | --- |
| `ui-click.mp3` | 0.5 | `Soft tactile wood and brass UI click, cozy mercantile game, short, warm, no voice, no alarm.` |
| `ui-menu-open.mp3` | 0.8 | `Small paper map menu opens with gentle brass chime and soft page movement, short cozy UI sound, no voice.` |
| `ui-menu-close.mp3` | 0.7 | `Small paper map menu closes with soft page fold and muted wooden click, short cozy UI sound, no voice.` |
| `ui-panel-open.mp3` | 0.8 | `Ledger panel opens with soft paper slide, tiny bell, warm wooden tap, short UI sound, no voice.` |
| `ui-panel-close.mp3` | 0.7 | `Ledger panel closes with soft paper slide and muted latch, short UI sound, no voice.` |
| `build-arm.mp3` | 0.8 | `Construction tool selected, soft drafting pencil tap, small wooden ruler click, cozy management game UI, no voice.` |
| `build-retail-place.mp3` | 1.3 | `Retail shop placed successfully, warm shop bell, small stamp, soft coins, cozy city builder confirmation, no voice.` |
| `build-industry-place.mp3` | 1.3 | `Industrial building placed successfully, muted workshop clank, soft stamp, warm confirmation chime, no voice.` |
| `build-invalid.mp3` | 0.8 | `Invalid placement, gentle low wooden knock and soft paper rustle, non-harsh warning, no voice, no alarm.` |
| `time-advance-day.mp3` | 1.1 | `Advance day in cozy business sim, page flip, soft clock tick, warm ledger stamp, short and satisfying, no voice.` |
| `world-city-unlock.mp3` | 1.8 | `New city unlocked on regional map, warm bell flourish, paper map unfurl, gentle expansion cue, no voice.` |
| `save-saved.mp3` | 0.9 | `Game saved, soft ledger stamp and small brass confirmation bell, short cozy UI sound, no voice.` |
| `save-loaded.mp3` | 1.0 | `Game loaded, soft page turn and warm confirmation chime, short cozy UI sound, no voice.` |
| `staff-hire.mp3` | 1.0 | `Staff hired, friendly shop bell and small handshake-like wooden taps, warm management confirmation, no voice.` |
| `staff-assign.mp3` | 0.8 | `Staff assigned, soft token placed on board, tiny chime, short warm UI sound, no voice.` |
| `staff-unassign.mp3` | 0.8 | `Staff unassigned, soft token lifted from board, muted click, short warm UI sound, no voice.` |
| `staff-promote.mp3` | 1.4 | `Staff promoted, warm rising chime, stamp, soft coins, satisfying but restrained management game sound, no voice.` |
| `policy-change.mp3` | 0.9 | `Company policy changed, paper ledger stamp, small brass switch click, short cozy UI confirmation, no voice.` |
| `decision-resolve.mp3` | 1.0 | `Business decision resolved, soft gavel-like wooden tap and warm confirmation chime, no voice.` |
| `store-upgrade.mp3` | 1.5 | `Store upgraded, warm shop bell, tasteful coin sparkle, soft building flourish, cozy tycoon confirmation, no voice.` |
| `industry-upgrade.mp3` | 1.5 | `Industry building upgraded, muted workshop flourish, soft metal and wood taps, warm chime, no voice.` |
| `stock-edit.mp3` | 0.7 | `Stock setting changed, small abacus bead click, paper tick mark, short tactile UI sound, no voice.` |
| `chain-feedback.mp3` | 1.0 | `Production chain feedback, soft linked wooden tokens, gentle chime, warm analytical UI cue, no voice.` |

If any call returns a billing, credit, or payment error, including `402 Payment Required`, stop the task and report the blocker. Do not retry with force.

- [ ] **Step 4: Verify the generated files**

Run:

```sh
rtk find static/assets/game/audio -type f | sort
```

Expected: the output lists exactly the 26 MP3 files named in this task.

Run:

```sh
rtk du -h static/assets/game/audio
```

Expected: total size is reasonable for 3 short BGM loops plus short SFX.

- [ ] **Step 5: Commit**

```sh
rtk git add static/assets/game/audio
rtk git commit -m "feat: add generated game audio assets"
```

---

## Task 2: Add the typed audio catalog

**Files:**
- Create: `src/lib/audio/audioCatalog.ts`
- Create: `src/lib/audio/audioCatalog.spec.ts`

- [ ] **Step 1: Write the failing catalog test**

Create `src/lib/audio/audioCatalog.spec.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIO_CUES, BGM_CUES, SFX_CUES, getAudioCue } from './audioCatalog';

function staticAssetPath(path: string): string {
	return join(process.cwd(), 'static', path.replace(/^\//, ''));
}

describe('audio catalog', () => {
	it('registers the expected number of local cues', () => {
		expect.assertions(4);

		expect(Object.keys(BGM_CUES)).toHaveLength(3);
		expect(Object.keys(SFX_CUES)).toHaveLength(23);
		expect(AUDIO_CUES).toHaveLength(26);
		expect(new Set(AUDIO_CUES.map((cue) => cue.id)).size).toBe(AUDIO_CUES.length);
	});

	it('points every cue to a checked-in mp3 asset', () => {
		expect.assertions(AUDIO_CUES.length);

		for (const cue of AUDIO_CUES) {
			expect(existsSync(staticAssetPath(cue.path)), cue.path).toBe(true);
		}
	});

	it('looks up cues by stable id', () => {
		expect.assertions(3);

		expect(getAudioCue('bgm.retail-map')).toMatchObject({
			id: 'bgm.retail-map',
			channel: 'bgm',
			loop: true
		});
		expect(getAudioCue('sfx.build.invalid')).toMatchObject({
			id: 'sfx.build.invalid',
			channel: 'sfx',
			loop: false
		});
		expect(() => getAudioCue('sfx.missing' as never)).toThrow('Unknown audio cue');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
rtk bun run test:unit -- src/lib/audio/audioCatalog.spec.ts --run
```

Expected: FAIL because `src/lib/audio/audioCatalog.ts` does not exist.

- [ ] **Step 3: Create the catalog**

Create `src/lib/audio/audioCatalog.ts`:

```ts
export type AudioChannel = 'bgm' | 'sfx';

export type BgmCueId = 'bgm.retail-map' | 'bgm.industry-map' | 'bgm.world-map';

export type SfxCueId =
	| 'sfx.ui.click'
	| 'sfx.ui.menu-open'
	| 'sfx.ui.menu-close'
	| 'sfx.ui.panel-open'
	| 'sfx.ui.panel-close'
	| 'sfx.build.arm'
	| 'sfx.build.retail-place'
	| 'sfx.build.industry-place'
	| 'sfx.build.invalid'
	| 'sfx.time.advance-day'
	| 'sfx.world.city-unlock'
	| 'sfx.save.saved'
	| 'sfx.save.loaded'
	| 'sfx.staff.hire'
	| 'sfx.staff.assign'
	| 'sfx.staff.unassign'
	| 'sfx.staff.promote'
	| 'sfx.policy.change'
	| 'sfx.decision.resolve'
	| 'sfx.store.upgrade'
	| 'sfx.industry.upgrade'
	| 'sfx.stock.edit'
	| 'sfx.chain.feedback';

export type AudioCueId = BgmCueId | SfxCueId;
export type AudioAssetPath = `/assets/game/audio/${string}.mp3`;

export interface AudioCue<TId extends AudioCueId = AudioCueId> {
	id: TId;
	channel: AudioChannel;
	path: AudioAssetPath;
	loop: boolean;
	description: string;
}

export const BGM_CUES: Readonly<Record<BgmCueId, AudioCue<BgmCueId>>> = Object.freeze({
	'bgm.retail-map': Object.freeze({
		id: 'bgm.retail-map',
		channel: 'bgm',
		path: '/assets/game/audio/bgm/retail-map.mp3',
		loop: true,
		description: 'Cozy storefront planning loop for the retail city map'
	}),
	'bgm.industry-map': Object.freeze({
		id: 'bgm.industry-map',
		channel: 'bgm',
		path: '/assets/game/audio/bgm/industry-map.mp3',
		loop: true,
		description: 'Warm workshop planning loop for the industry city map'
	}),
	'bgm.world-map': Object.freeze({
		id: 'bgm.world-map',
		channel: 'bgm',
		path: '/assets/game/audio/bgm/world-map.mp3',
		loop: true,
		description: 'Regional planning loop for the world map'
	})
});

export const SFX_CUES: Readonly<Record<SfxCueId, AudioCue<SfxCueId>>> = Object.freeze({
	'sfx.ui.click': Object.freeze({
		id: 'sfx.ui.click',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-click.mp3',
		loop: false,
		description: 'General tactile UI click'
	}),
	'sfx.ui.menu-open': Object.freeze({
		id: 'sfx.ui.menu-open',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-menu-open.mp3',
		loop: false,
		description: 'Map menu opens'
	}),
	'sfx.ui.menu-close': Object.freeze({
		id: 'sfx.ui.menu-close',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-menu-close.mp3',
		loop: false,
		description: 'Map menu closes'
	}),
	'sfx.ui.panel-open': Object.freeze({
		id: 'sfx.ui.panel-open',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-panel-open.mp3',
		loop: false,
		description: 'Overlay panel opens'
	}),
	'sfx.ui.panel-close': Object.freeze({
		id: 'sfx.ui.panel-close',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-panel-close.mp3',
		loop: false,
		description: 'Overlay panel closes'
	}),
	'sfx.build.arm': Object.freeze({
		id: 'sfx.build.arm',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/build-arm.mp3',
		loop: false,
		description: 'Build tool selected'
	}),
	'sfx.build.retail-place': Object.freeze({
		id: 'sfx.build.retail-place',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/build-retail-place.mp3',
		loop: false,
		description: 'Retail store placed'
	}),
	'sfx.build.industry-place': Object.freeze({
		id: 'sfx.build.industry-place',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/build-industry-place.mp3',
		loop: false,
		description: 'Industrial building placed'
	}),
	'sfx.build.invalid': Object.freeze({
		id: 'sfx.build.invalid',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/build-invalid.mp3',
		loop: false,
		description: 'Placement rejected'
	}),
	'sfx.time.advance-day': Object.freeze({
		id: 'sfx.time.advance-day',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/time-advance-day.mp3',
		loop: false,
		description: 'Day advanced'
	}),
	'sfx.world.city-unlock': Object.freeze({
		id: 'sfx.world.city-unlock',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/world-city-unlock.mp3',
		loop: false,
		description: 'World city opened'
	}),
	'sfx.save.saved': Object.freeze({
		id: 'sfx.save.saved',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/save-saved.mp3',
		loop: false,
		description: 'Manual save completed'
	}),
	'sfx.save.loaded': Object.freeze({
		id: 'sfx.save.loaded',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/save-loaded.mp3',
		loop: false,
		description: 'Save loaded'
	}),
	'sfx.staff.hire': Object.freeze({
		id: 'sfx.staff.hire',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/staff-hire.mp3',
		loop: false,
		description: 'Staff member hired'
	}),
	'sfx.staff.assign': Object.freeze({
		id: 'sfx.staff.assign',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/staff-assign.mp3',
		loop: false,
		description: 'Staff assigned'
	}),
	'sfx.staff.unassign': Object.freeze({
		id: 'sfx.staff.unassign',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/staff-unassign.mp3',
		loop: false,
		description: 'Staff unassigned'
	}),
	'sfx.staff.promote': Object.freeze({
		id: 'sfx.staff.promote',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/staff-promote.mp3',
		loop: false,
		description: 'Staff promoted'
	}),
	'sfx.policy.change': Object.freeze({
		id: 'sfx.policy.change',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/policy-change.mp3',
		loop: false,
		description: 'Policy changed'
	}),
	'sfx.decision.resolve': Object.freeze({
		id: 'sfx.decision.resolve',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/decision-resolve.mp3',
		loop: false,
		description: 'Decision resolved'
	}),
	'sfx.store.upgrade': Object.freeze({
		id: 'sfx.store.upgrade',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/store-upgrade.mp3',
		loop: false,
		description: 'Store upgraded'
	}),
	'sfx.industry.upgrade': Object.freeze({
		id: 'sfx.industry.upgrade',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/industry-upgrade.mp3',
		loop: false,
		description: 'Industrial building upgraded'
	}),
	'sfx.stock.edit': Object.freeze({
		id: 'sfx.stock.edit',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/stock-edit.mp3',
		loop: false,
		description: 'Stock settings changed'
	}),
	'sfx.chain.feedback': Object.freeze({
		id: 'sfx.chain.feedback',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/chain-feedback.mp3',
		loop: false,
		description: 'Product-chain feedback'
	})
});

export const AUDIO_CUES: readonly AudioCue[] = Object.freeze([
	...Object.values(BGM_CUES),
	...Object.values(SFX_CUES)
]);

const AUDIO_CUE_BY_ID: Readonly<Record<AudioCueId, AudioCue>> = Object.freeze(
	Object.fromEntries(AUDIO_CUES.map((cue) => [cue.id, cue])) as Record<AudioCueId, AudioCue>
);

export function getAudioCue<TId extends AudioCueId>(cueId: TId): AudioCue<TId> {
	const cue = AUDIO_CUE_BY_ID[cueId];

	if (!cue) {
		throw new Error(`Unknown audio cue: ${cueId}`);
	}

	return cue as AudioCue<TId>;
}
```

- [ ] **Step 4: Run the focused test**

Run:

```sh
rtk bun run test:unit -- src/lib/audio/audioCatalog.spec.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
rtk git add src/lib/audio/audioCatalog.ts src/lib/audio/audioCatalog.spec.ts
rtk git commit -m "feat: register game audio cues"
```

---

## Task 3: Add local audio preferences

**Files:**
- Create: `src/lib/audio/audioPreferences.ts`
- Create: `src/lib/audio/audioPreferences.spec.ts`

- [ ] **Step 1: Write the failing preference tests**

Create `src/lib/audio/audioPreferences.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	AUDIO_PREFERENCES_STORAGE_KEY,
	DEFAULT_AUDIO_PREFERENCES,
	readAudioPreferences,
	saveAudioPreferences,
	sanitizeAudioPreferences
} from './audioPreferences';

class MemoryStorage implements Storage {
	private values = new Map<string, string>();

	get length(): number {
		return this.values.size;
	}

	clear(): void {
		this.values.clear();
	}

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	key(index: number): string | null {
		return Array.from(this.values.keys())[index] ?? null;
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

describe('audio preferences', () => {
	it('uses safe defaults when storage is unavailable', () => {
		expect.assertions(1);

		expect(readAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
	});

	it('persists and reads preferences from storage', () => {
		expect.assertions(2);
		const storage = new MemoryStorage();

		const saved = saveAudioPreferences(
			{ bgmEnabled: false, bgmVolume: 0.25, sfxEnabled: true, sfxVolume: 0.7 },
			storage
		);

		expect(saved).toEqual({
			bgmEnabled: false,
			bgmVolume: 0.25,
			sfxEnabled: true,
			sfxVolume: 0.7
		});
		expect(readAudioPreferences(storage)).toEqual(saved);
	});

	it('falls back for invalid stored json', () => {
		expect.assertions(1);
		const storage = new MemoryStorage();
		storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, '{not-json');

		expect(readAudioPreferences(storage)).toEqual(DEFAULT_AUDIO_PREFERENCES);
	});

	it('sanitizes invalid fields and clamps volumes', () => {
		expect.assertions(1);

		expect(
			sanitizeAudioPreferences({
				bgmEnabled: 'yes',
				bgmVolume: 2,
				sfxEnabled: false,
				sfxVolume: -1
			})
		).toEqual({
			...DEFAULT_AUDIO_PREFERENCES,
			bgmVolume: 1,
			sfxEnabled: false,
			sfxVolume: 0
		});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
rtk bun run test:unit -- src/lib/audio/audioPreferences.spec.ts --run
```

Expected: FAIL because `src/lib/audio/audioPreferences.ts` does not exist.

- [ ] **Step 3: Create the preference module**

Create `src/lib/audio/audioPreferences.ts`:

```ts
export interface AudioPreferences {
	bgmEnabled: boolean;
	bgmVolume: number;
	sfxEnabled: boolean;
	sfxVolume: number;
}

export const AUDIO_PREFERENCES_STORAGE_KEY = 'serpens.audioPreferences.v1';

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = Object.freeze({
	bgmEnabled: true,
	bgmVolume: 0.45,
	sfxEnabled: true,
	sfxVolume: 0.65
});

function clampVolume(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(1, Math.max(0, value));
}

export function sanitizeAudioPreferences(value: unknown): AudioPreferences {
	const input = value && typeof value === 'object' ? (value as Partial<AudioPreferences>) : {};

	return {
		bgmEnabled:
			typeof input.bgmEnabled === 'boolean'
				? input.bgmEnabled
				: DEFAULT_AUDIO_PREFERENCES.bgmEnabled,
		bgmVolume: clampVolume(input.bgmVolume, DEFAULT_AUDIO_PREFERENCES.bgmVolume),
		sfxEnabled:
			typeof input.sfxEnabled === 'boolean'
				? input.sfxEnabled
				: DEFAULT_AUDIO_PREFERENCES.sfxEnabled,
		sfxVolume: clampVolume(input.sfxVolume, DEFAULT_AUDIO_PREFERENCES.sfxVolume)
	};
}

function getDefaultStorage(): Storage | null {
	return typeof localStorage === 'undefined' ? null : localStorage;
}

export function readAudioPreferences(storage: Storage | null = getDefaultStorage()): AudioPreferences {
	if (!storage) {
		return { ...DEFAULT_AUDIO_PREFERENCES };
	}

	try {
		const raw = storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY);
		return raw ? sanitizeAudioPreferences(JSON.parse(raw)) : { ...DEFAULT_AUDIO_PREFERENCES };
	} catch {
		return { ...DEFAULT_AUDIO_PREFERENCES };
	}
}

export function saveAudioPreferences(
	preferences: AudioPreferences,
	storage: Storage | null = getDefaultStorage()
): AudioPreferences {
	const sanitized = sanitizeAudioPreferences(preferences);

	if (!storage) {
		return sanitized;
	}

	try {
		storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(sanitized));
	} catch {
		return sanitized;
	}

	return sanitized;
}
```

- [ ] **Step 4: Run the focused test**

Run:

```sh
rtk bun run test:unit -- src/lib/audio/audioPreferences.spec.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
rtk git add src/lib/audio/audioPreferences.ts src/lib/audio/audioPreferences.spec.ts
rtk git commit -m "feat: persist game audio preferences"
```

---

## Task 4: Add the audio controller

**Files:**
- Create: `src/lib/audio/audioController.ts`
- Create: `src/lib/audio/audioController.spec.ts`

- [ ] **Step 1: Write the failing controller tests**

Create `src/lib/audio/audioController.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createGameAudioController, type AudioControllerEnvironment } from './audioController';
import type { AudioPreferences } from './audioPreferences';

class FakeStorage implements Storage {
	private values = new Map<string, string>();

	get length(): number {
		return this.values.size;
	}

	clear(): void {
		this.values.clear();
	}

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	key(index: number): string | null {
		return Array.from(this.values.keys())[index] ?? null;
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

function createFakeEnvironment() {
	const createdAudio: Array<{
		src: string;
		loop: boolean;
		volume: number;
		currentTime: number;
		play: ReturnType<typeof vi.fn>;
		pause: ReturnType<typeof vi.fn>;
	}> = [];
	const sourceStart = vi.fn();
	const sourceConnect = vi.fn();
	const gainConnect = vi.fn();
	const decodeAudioData = vi.fn(async () => ({}) as AudioBuffer);
	const fetchArrayBuffer = vi.fn(async () => new ArrayBuffer(8));
	const storage = new FakeStorage();
	const warn = vi.fn();

	const environment: AudioControllerEnvironment = {
		createAudioElement: (src) => {
			const audio = {
				src,
				loop: false,
				volume: 1,
				currentTime: 0,
				play: vi.fn(async () => undefined),
				pause: vi.fn()
			};
			createdAudio.push(audio);
			return audio;
		},
		createAudioContext: () => ({
			state: 'running',
			destination: {} as AudioNode,
			resume: vi.fn(async () => undefined),
			decodeAudioData,
			createBufferSource: () =>
				({
					buffer: null,
					connect: sourceConnect,
					start: sourceStart
				}) as unknown as AudioBufferSourceNode,
			createGain: () =>
				({
					gain: { value: 1 },
					connect: gainConnect
				}) as unknown as GainNode,
			close: vi.fn(async () => undefined)
		}),
		fetchArrayBuffer,
		resolveAssetPath: (path) => `/base${path}`,
		storage,
		warn
	};

	return {
		createdAudio,
		decodeAudioData,
		environment,
		fetchArrayBuffer,
		gainConnect,
		sourceConnect,
		sourceStart,
		storage,
		warn
	};
}

describe('game audio controller', () => {
	it('waits for unlock before starting BGM', async () => {
		expect.assertions(4);
		const fake = createFakeEnvironment();
		const controller = createGameAudioController({ environment: fake.environment });

		controller.setActiveBgm('bgm.retail-map');
		expect(fake.createdAudio).toHaveLength(0);

		await controller.unlock();

		expect(fake.createdAudio).toHaveLength(1);
		expect(fake.createdAudio[0]?.src).toBe('/base/assets/game/audio/bgm/retail-map.mp3');
		expect(fake.createdAudio[0]?.play).toHaveBeenCalledOnce();
	});

	it('switches BGM when the active cue changes', async () => {
		expect.assertions(3);
		const fake = createFakeEnvironment();
		const controller = createGameAudioController({ environment: fake.environment });

		controller.setActiveBgm('bgm.retail-map');
		await controller.unlock();
		controller.setActiveBgm('bgm.world-map');

		expect(fake.createdAudio).toHaveLength(2);
		expect(fake.createdAudio[0]?.pause).toHaveBeenCalledOnce();
		expect(fake.createdAudio[1]?.src).toBe('/base/assets/game/audio/bgm/world-map.mp3');
	});

	it('persists preference updates and notifies listeners', () => {
		expect.assertions(3);
		const fake = createFakeEnvironment();
		const onPreferencesChanged = vi.fn();
		const controller = createGameAudioController({
			environment: fake.environment,
			onPreferencesChanged
		});

		controller.updatePreferences({ bgmEnabled: false, sfxVolume: 0.2 });

		const preferences = controller.getPreferences();
		expect(preferences).toMatchObject({ bgmEnabled: false, sfxVolume: 0.2 });
		expect(onPreferencesChanged).toHaveBeenCalledWith(preferences);
		expect(fake.storage.getItem('serpens.audioPreferences.v1')).toContain('"sfxVolume":0.2');
	});

	it('plays SFX through a decoded Web Audio buffer after unlock', async () => {
		expect.assertions(4);
		const fake = createFakeEnvironment();
		const controller = createGameAudioController({ environment: fake.environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');

		expect(fake.fetchArrayBuffer).toHaveBeenCalledWith('/base/assets/game/audio/sfx/ui-click.mp3');
		expect(fake.decodeAudioData).toHaveBeenCalledOnce();
		expect(fake.sourceConnect).toHaveBeenCalledOnce();
		expect(fake.sourceStart).toHaveBeenCalledOnce();
	});

	it('gates SFX when disabled', async () => {
		expect.assertions(1);
		const fake = createFakeEnvironment();
		const controller = createGameAudioController({ environment: fake.environment });

		await controller.unlock();
		controller.updatePreferences({ sfxEnabled: false });
		await controller.playSfx('sfx.ui.click');

		expect(fake.sourceStart).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
rtk bun run test:unit -- src/lib/audio/audioController.spec.ts --run
```

Expected: FAIL because `src/lib/audio/audioController.ts` does not exist.

- [ ] **Step 3: Create the audio controller**

Create `src/lib/audio/audioController.ts`:

```ts
import { asset } from '$app/paths';
import { getAudioCue, type AudioCueId, type BgmCueId, type SfxCueId } from './audioCatalog';
import {
	readAudioPreferences,
	saveAudioPreferences,
	sanitizeAudioPreferences,
	type AudioPreferences
} from './audioPreferences';

export interface ManagedAudioElement {
	src: string;
	loop: boolean;
	volume: number;
	currentTime: number;
	play: () => Promise<void>;
	pause: () => void;
}

export interface AudioContextLike {
	state: BaseAudioContext['state'];
	destination: AudioNode;
	resume: () => Promise<void>;
	decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
	createBufferSource: () => AudioBufferSourceNode;
	createGain: () => GainNode;
	close?: () => Promise<void>;
}

export interface AudioControllerEnvironment {
	createAudioElement: (src: string) => ManagedAudioElement;
	createAudioContext: () => AudioContextLike;
	fetchArrayBuffer: (url: string) => Promise<ArrayBuffer>;
	resolveAssetPath: (path: string) => string;
	storage: Storage | null;
	warn: (message: string, error?: unknown) => void;
}

export interface GameAudioControllerOptions {
	environment?: Partial<AudioControllerEnvironment>;
	onPreferencesChanged?: (preferences: AudioPreferences) => void;
}

export interface GameAudioController {
	destroy: () => void;
	getPreferences: () => AudioPreferences;
	playSfx: (cueId: SfxCueId) => Promise<void>;
	setActiveBgm: (cueId: BgmCueId) => void;
	unlock: () => Promise<void>;
	updatePreferences: (patch: Partial<AudioPreferences>) => void;
}

function createBrowserAudioElement(src: string): ManagedAudioElement {
	return new Audio(src);
}

function createBrowserAudioContext(): AudioContextLike {
	const AudioContextConstructor =
		window.AudioContext ??
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

	if (!AudioContextConstructor) {
		throw new Error('Web Audio is not available');
	}

	return new AudioContextConstructor();
}

function createDefaultEnvironment(): AudioControllerEnvironment {
	return {
		createAudioElement: createBrowserAudioElement,
		createAudioContext: createBrowserAudioContext,
		fetchArrayBuffer: async (url) => {
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`Unable to load audio asset: ${url}`);
			}

			return response.arrayBuffer();
		},
		resolveAssetPath: (path) => asset(path),
		storage: typeof localStorage === 'undefined' ? null : localStorage,
		warn: (message, error) => {
			if (import.meta.env.DEV) {
				console.warn(message, error);
			}
		}
	};
}

class BrowserGameAudioController implements GameAudioController {
	private activeBgmCueId: BgmCueId | null = null;
	private audioContext: AudioContextLike | null = null;
	private currentBgm: ManagedAudioElement | null = null;
	private currentBgmCueId: BgmCueId | null = null;
	private readonly failedCueIds = new Set<AudioCueId>();
	private preferences: AudioPreferences;
	private readonly sfxBuffers = new Map<SfxCueId, AudioBuffer>();
	private unlocked = false;

	constructor(
		private readonly environment: AudioControllerEnvironment,
		private readonly onPreferencesChanged?: (preferences: AudioPreferences) => void
	) {
		this.preferences = readAudioPreferences(environment.storage);
	}

	destroy(): void {
		this.stopBgm();
		void this.audioContext?.close?.();
		this.audioContext = null;
		this.sfxBuffers.clear();
	}

	getPreferences(): AudioPreferences {
		return { ...this.preferences };
	}

	async unlock(): Promise<void> {
		if (this.unlocked) {
			return;
		}

		this.unlocked = true;

		try {
			if (this.audioContext?.state === 'suspended') {
				await this.audioContext.resume();
			}
		} catch (error) {
			this.environment.warn('Unable to resume game audio context', error);
		}

		await this.playActiveBgm();
	}

	setActiveBgm(cueId: BgmCueId): void {
		this.activeBgmCueId = cueId;

		if (this.unlocked) {
			void this.playActiveBgm();
		}
	}

	updatePreferences(patch: Partial<AudioPreferences>): void {
		this.preferences = saveAudioPreferences(
			sanitizeAudioPreferences({ ...this.preferences, ...patch }),
			this.environment.storage
		);

		this.onPreferencesChanged?.(this.getPreferences());

		if (!this.preferences.bgmEnabled || this.preferences.bgmVolume <= 0) {
			this.stopBgm();
			return;
		}

		if (this.currentBgm) {
			this.currentBgm.volume = this.preferences.bgmVolume;
		}

		if (this.unlocked) {
			void this.playActiveBgm();
		}
	}

	async playSfx(cueId: SfxCueId): Promise<void> {
		if (
			!this.unlocked ||
			!this.preferences.sfxEnabled ||
			this.preferences.sfxVolume <= 0 ||
			this.failedCueIds.has(cueId)
		) {
			return;
		}

		try {
			const context = this.getAudioContext();
			const buffer = await this.getSfxBuffer(cueId, context);
			const source = context.createBufferSource();
			const gain = context.createGain();

			source.buffer = buffer;
			gain.gain.value = this.preferences.sfxVolume;
			source.connect(gain);
			gain.connect(context.destination);
			source.start(0);
		} catch (error) {
			this.failedCueIds.add(cueId);
			this.environment.warn(`Unable to play SFX cue: ${cueId}`, error);
		}
	}

	private getAudioContext(): AudioContextLike {
		if (!this.audioContext) {
			this.audioContext = this.environment.createAudioContext();
		}

		return this.audioContext;
	}

	private async getSfxBuffer(cueId: SfxCueId, context: AudioContextLike): Promise<AudioBuffer> {
		const cached = this.sfxBuffers.get(cueId);

		if (cached) {
			return cached;
		}

		const cue = getAudioCue(cueId);
		const url = this.environment.resolveAssetPath(cue.path);
		const audioData = await this.environment.fetchArrayBuffer(url);
		const buffer = await context.decodeAudioData(audioData);
		this.sfxBuffers.set(cueId, buffer);
		return buffer;
	}

	private async playActiveBgm(): Promise<void> {
		if (
			!this.activeBgmCueId ||
			!this.unlocked ||
			!this.preferences.bgmEnabled ||
			this.preferences.bgmVolume <= 0 ||
			this.failedCueIds.has(this.activeBgmCueId)
		) {
			return;
		}

		if (this.currentBgm && this.currentBgmCueId === this.activeBgmCueId) {
			this.currentBgm.volume = this.preferences.bgmVolume;
			return;
		}

		this.stopBgm();

		const cue = getAudioCue(this.activeBgmCueId);
		const audio = this.environment.createAudioElement(this.environment.resolveAssetPath(cue.path));
		audio.loop = cue.loop;
		audio.volume = this.preferences.bgmVolume;
		audio.currentTime = 0;
		this.currentBgm = audio;
		this.currentBgmCueId = cue.id as BgmCueId;

		try {
			await audio.play();
		} catch (error) {
			this.failedCueIds.add(cue.id);
			this.stopBgm();
			this.environment.warn(`Unable to play BGM cue: ${cue.id}`, error);
		}
	}

	private stopBgm(): void {
		if (!this.currentBgm) {
			return;
		}

		this.currentBgm.pause();
		this.currentBgm.currentTime = 0;
		this.currentBgm = null;
		this.currentBgmCueId = null;
	}
}

export function createGameAudioController(
	options: GameAudioControllerOptions = {}
): GameAudioController {
	return new BrowserGameAudioController(
		{ ...createDefaultEnvironment(), ...options.environment },
		options.onPreferencesChanged
	);
}
```

- [ ] **Step 4: Run the focused test**

Run:

```sh
rtk bun run test:unit -- src/lib/audio/audioController.spec.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
rtk git add src/lib/audio/audioController.ts src/lib/audio/audioController.spec.ts
rtk git commit -m "feat: add game audio controller"
```

---

## Task 5: Add the audio settings component

**Files:**
- Create: `src/lib/components/game/AudioSettings.svelte`
- Create: `src/lib/components/game/AudioSettings.svelte.spec.ts`

- [ ] **Step 1: Write the failing component test**

Create `src/lib/components/game/AudioSettings.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import AudioSettings from './AudioSettings.svelte';

function inputByLabel(label: string): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

	if (!input) {
		throw new Error(`Missing input: ${label}`);
	}

	return input;
}

describe('AudioSettings', () => {
	it('renders BGM and SFX controls from preferences', async () => {
		expect.assertions(4);

		render(AudioSettings, {
			preferences: { ...DEFAULT_AUDIO_PREFERENCES, bgmEnabled: false, sfxVolume: 0.4 },
			onChange: vi.fn()
		});

		await expect.element(page.getByRole('group', { name: /audio settings/i })).toBeVisible();
		await expect.element(page.getByRole('checkbox', { name: 'BGM' })).not.toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'SFX' })).toBeChecked();
		expect(inputByLabel('Effects volume').value).toBe('0.4');
	});

	it('emits preference patches', async () => {
		expect.assertions(4);
		const onChange = vi.fn();

		render(AudioSettings, {
			preferences: { ...DEFAULT_AUDIO_PREFERENCES },
			onChange
		});

		await page.getByRole('checkbox', { name: 'BGM' }).click();
		inputByLabel('Music volume').value = '0.3';
		inputByLabel('Music volume').dispatchEvent(new Event('input', { bubbles: true }));
		await page.getByRole('checkbox', { name: 'SFX' }).click();
		inputByLabel('Effects volume').value = '0.2';
		inputByLabel('Effects volume').dispatchEvent(new Event('input', { bubbles: true }));

		expect(onChange).toHaveBeenNthCalledWith(1, { bgmEnabled: false });
		expect(onChange).toHaveBeenNthCalledWith(2, { bgmVolume: 0.3 });
		expect(onChange).toHaveBeenNthCalledWith(3, { sfxEnabled: false });
		expect(onChange).toHaveBeenNthCalledWith(4, { sfxVolume: 0.2 });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
rtk bun run test:unit -- src/lib/components/game/AudioSettings.svelte.spec.ts --run --project client
```

Expected: FAIL because `src/lib/components/game/AudioSettings.svelte` does not exist.

- [ ] **Step 3: Create the component**

Create `src/lib/components/game/AudioSettings.svelte`. This snippet was checked with the official Svelte MCP `svelte_autofixer`.

```svelte
<script lang="ts">
	import type { AudioPreferences } from '$lib/audio/audioPreferences';

	interface Props {
		preferences: AudioPreferences;
		onChange: (patch: Partial<AudioPreferences>) => void;
	}

	let { preferences, onChange }: Props = $props();

	function updateBgmEnabled(event: Event): void {
		onChange({ bgmEnabled: (event.currentTarget as HTMLInputElement).checked });
	}

	function updateBgmVolume(event: Event): void {
		onChange({ bgmVolume: Number((event.currentTarget as HTMLInputElement).value) });
	}

	function updateSfxEnabled(event: Event): void {
		onChange({ sfxEnabled: (event.currentTarget as HTMLInputElement).checked });
	}

	function updateSfxVolume(event: Event): void {
		onChange({ sfxVolume: Number((event.currentTarget as HTMLInputElement).value) });
	}
</script>

<section class="audio-settings" role="group" aria-label="Audio settings">
	<h3>Audio</h3>

	<div class="audio-channel">
		<label class="toggle-row">
			<span>BGM</span>
			<input type="checkbox" checked={preferences.bgmEnabled} onchange={updateBgmEnabled} />
		</label>
		<label class="volume-row">
			<span>Music volume</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={preferences.bgmVolume}
				aria-label="Music volume"
				disabled={!preferences.bgmEnabled}
				oninput={updateBgmVolume}
			/>
		</label>
	</div>

	<div class="audio-channel">
		<label class="toggle-row">
			<span>SFX</span>
			<input type="checkbox" checked={preferences.sfxEnabled} onchange={updateSfxEnabled} />
		</label>
		<label class="volume-row">
			<span>Effects volume</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={preferences.sfxVolume}
				aria-label="Effects volume"
				disabled={!preferences.sfxEnabled}
				oninput={updateSfxVolume}
			/>
		</label>
	</div>
</section>

<style>
	.audio-settings {
		display: grid;
		gap: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--brass-500);
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.audio-channel {
		display: grid;
		gap: 0.45rem;
	}

	.toggle-row,
	.volume-row {
		display: grid;
		gap: 0.4rem;
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--ink-700);
	}

	.toggle-row {
		grid-template-columns: 1fr auto;
		align-items: center;
	}

	.volume-row input {
		width: 100%;
	}
</style>
```

- [ ] **Step 4: Run Svelte autofixer**

Run the official Svelte MCP `svelte_autofixer` on `AudioSettings.svelte`.

Expected: no issues. If issues are returned, apply the corrections and call `svelte_autofixer` again until it returns no issues.

- [ ] **Step 5: Run the focused component test**

Run:

```sh
rtk bun run test:unit -- src/lib/components/game/AudioSettings.svelte.spec.ts --run --project client
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
rtk git add src/lib/components/game/AudioSettings.svelte src/lib/components/game/AudioSettings.svelte.spec.ts
rtk git commit -m "feat: add game audio settings controls"
```

---

## Task 6: Wire audio into the main route

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Add imports and state**

Modify the imports near the top of `src/routes/+page.svelte`:

```ts
import AudioSettings from '$lib/components/game/AudioSettings.svelte';
import { createGameAudioController, type GameAudioController } from '$lib/audio/audioController';
import {
	DEFAULT_AUDIO_PREFERENCES,
	type AudioPreferences
} from '$lib/audio/audioPreferences';
import type { BgmCueId, SfxCueId } from '$lib/audio/audioCatalog';
```

Add this constant near the `managementPanelMenuItems` declaration:

```ts
const bgmCueByMapView: Record<MapViewId, BgmCueId> = {
	retail: 'bgm.retail-map',
	industry: 'bgm.industry-map',
	world: 'bgm.world-map'
};
```

Add this state near the existing route state:

```ts
let audioController: GameAudioController | null = $state(null);
let audioPreferences = $state<AudioPreferences>({ ...DEFAULT_AUDIO_PREFERENCES });
```

- [ ] **Step 2: Initialize and synchronize the controller**

Replace the existing `onMount` block:

```ts
onMount(() => {
	void initializeSaves();
});
```

with:

```ts
onMount(() => {
	void initializeSaves();

	const controller = createGameAudioController({
		onPreferencesChanged: (nextPreferences) => {
			audioPreferences = nextPreferences;
		}
	});

	audioController = controller;
	audioPreferences = controller.getPreferences();
	controller.setActiveBgm(bgmCueByMapView[activeMapView]);

	return () => {
		controller.destroy();
		audioController = null;
	};
});

$effect(() => {
	audioController?.setActiveBgm(bgmCueByMapView[activeMapView]);
});
```

Add these helper functions near the other UI handlers:

```ts
function unlockAudio(): void {
	void audioController?.unlock();
}

function playSfx(cueId: SfxCueId): void {
	void audioController?.playSfx(cueId);
}

function updateAudioPreferences(patch: Partial<AudioPreferences>): void {
	audioController?.updatePreferences(patch);
}

function setGameAndAutosaveWithSfx(
	currentGame: GameState,
	nextGame: GameState,
	cueId: SfxCueId
): void {
	setGameAndAutosave(nextGame);

	if (nextGame !== currentGame) {
		playSfx(cueId);
	}
}
```

- [ ] **Step 3: Unlock audio from the first interaction**

Change:

```svelte
<svelte:window onkeydown={handleKeydown} />

<main class="app">
```

to:

```svelte
<svelte:window onkeydown={handleKeydown} />

<main class="app" onpointerdown={unlockAudio}>
```

At the top of `handleKeydown`, before Escape handling, add:

```ts
unlockAudio();
```

- [ ] **Step 4: Add SFX to UI and state-changing handlers**

Apply these focused handler changes:

```ts
function toggleViewMenu() {
	const nextIsOpen = !isViewMenuOpen;
	isViewMenuOpen = nextIsOpen;
	playSfx(nextIsOpen ? 'sfx.ui.menu-open' : 'sfx.ui.menu-close');
}
```

```ts
function openBuildMenu(): void {
	if (activeMapView === 'world') {
		return;
	}

	isViewMenuOpen = false;
	isSavePanelOpen = false;
	activeManagementPanelId = null;
	isBuildMenuOpen = true;
	playSfx('sfx.ui.panel-open');
}

function closeBuildMenu(): void {
	isBuildMenuOpen = false;
	playSfx('sfx.ui.panel-close');
}
```

```ts
function advanceDay() {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(currentGame, simulateDay(currentGame), 'sfx.time.advance-day');
	}
}

function changePolicy(patch: Partial<CompanyPolicy>) {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(currentGame, updatePolicy(currentGame, patch), 'sfx.policy.change');
	}
}

function chooseDecision(decisionId: string, optionId: string) {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(
			currentGame,
			resolveDecision(currentGame, decisionId, optionId),
			'sfx.decision.resolve'
		);
	}
}

function hireStaff(candidateId: string) {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(currentGame, hireCandidate(currentGame, candidateId), 'sfx.staff.hire');
	}
}

function assignStaff(staffId: string, storeId: string) {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(
			currentGame,
			assignStaffToStore(currentGame, staffId, storeId),
			'sfx.staff.assign'
		);
	}
}

function unassignStoreStaff(staffId: string) {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(currentGame, unassignStaff(currentGame, staffId), 'sfx.staff.unassign');
	}
}

function promoteStaffMember(staffId: string) {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(currentGame, promoteStaff(currentGame, staffId), 'sfx.staff.promote');
	}
}

function changeStoreProduct(storeId: string, categoryId: string, patch: StoreProductPatch): void {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(
			currentGame,
			updateStoreProduct(currentGame, storeId, categoryId, patch),
			'sfx.stock.edit'
		);
	}
}

function upgradeStoreHandler(storeId: string): void {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(currentGame, upgradeStore(currentGame, storeId), 'sfx.store.upgrade');
	}
}

function upgradeBuildingHandler(buildingId: string): void {
	if (game) {
		const currentGame = game;
		setGameAndAutosaveWithSfx(
			currentGame,
			upgradeBuilding(currentGame, buildingId),
			'sfx.industry.upgrade'
		);
	}
}
```

In `armRetailPlacement` and `armIndustryPlacement`, add this at the end of each function:

```ts
playSfx('sfx.build.arm');
```

In `placeRetailAtTile`, add `playSfx('sfx.build.invalid');` before each invalid `return`, and add `playSfx('sfx.build.retail-place');` after the successful `setGameAndAutosave(...)` branch but before `cancelPlacement()`.

In `placeIndustryAtTile`, add `playSfx('sfx.build.invalid');` before each invalid `return`, and add `playSfx('sfx.build.industry-place');` after the successful `setGameAndAutosave(...)` call but before `cancelPlacement()`.

In `openSelectedWorldCity`, use:

```ts
function openSelectedWorldCity(cityId: string): void {
	if (!game) {
		return;
	}

	const currentGame = game;
	const nextGame = openWorldCity(currentGame, cityId);
	setGameAndAutosaveWithSfx(currentGame, nextGame, 'sfx.world.city-unlock');
	selectedWorldCityId = cityId;
}
```

For manual save/load functions, play SFX only after successful operations:

```ts
playSfx('sfx.save.saved');
```

after `saveStatus = ...` in `saveManualSlot`, and:

```ts
playSfx('sfx.save.loaded');
```

after successful `resumeAutoSave` and `loadManualSlot`.

- [ ] **Step 5: Add the audio controls to the existing map menu**

Replace the dropdown structure:

```svelte
<div class="hud-dropdown paper" role="menu" aria-label="Map menu">
```

with:

```svelte
<div class="hud-dropdown paper" aria-label="Map menu">
	<div role="menu" aria-label="Map navigation">
```

Keep the existing menu buttons inside the inner `role="menu"` div. After the `{#each managementPanelMenuItems ...}` block, close the inner div and render the audio settings:

```svelte
	</div>
	<AudioSettings preferences={audioPreferences} onChange={updateAudioPreferences} />
</div>
```

Update CSS selectors that currently target `.hud-dropdown button` so they target `.hud-dropdown [role='menu'] button` for navigation buttons. Keep `.audio-settings` styling inside `AudioSettings.svelte`.

- [ ] **Step 6: Run Svelte autofixer**

Run the official Svelte MCP `svelte_autofixer` on the modified `+page.svelte`.

Expected: no issues. If issues are returned, apply the corrections and call `svelte_autofixer` again until it returns no issues.

- [ ] **Step 7: Run the route checks**

Run:

```sh
rtk bun run check
```

Expected: PASS.

Run:

```sh
rtk bun run test:unit -- src/lib/audio/audioController.spec.ts src/lib/components/game/AudioSettings.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 8: Commit**

```sh
rtk git add src/routes/+page.svelte
rtk git commit -m "feat: wire game audio into route actions"
```

---

## Task 7: Add e2e audio settings smoke coverage

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Add an e2e test for menu controls and persisted preferences**

Append this test near the other menu/HUD tests in `src/routes/retail-sim.e2e.ts`:

```ts
test('audio controls persist as local app preferences', async ({ page }) => {
	expect.assertions(5);
	await page.goto('/');

	await page.getByRole('button', { name: /open menu/i }).click();
	await expect(page.getByRole('group', { name: /audio settings/i })).toBeVisible();

	const bgmToggle = page.getByRole('checkbox', { name: 'BGM' });
	const sfxToggle = page.getByRole('checkbox', { name: 'SFX' });
	await bgmToggle.uncheck();
	await sfxToggle.uncheck();

	await page.reload();
	await page.getByRole('button', { name: /open menu/i }).click();

	await expect(page.getByRole('checkbox', { name: 'BGM' })).not.toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'SFX' })).not.toBeChecked();

	const stored = await page.evaluate(() => localStorage.getItem('serpens.audioPreferences.v1'));
	expect(stored).toContain('"bgmEnabled":false');
	expect(stored).toContain('"sfxEnabled":false');
});
```

- [ ] **Step 2: Run the focused e2e test**

Run:

```sh
rtk bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "audio controls persist"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```sh
rtk git add src/routes/retail-sim.e2e.ts
rtk git commit -m "test: cover persisted audio controls"
```

---

## Task 8: Run final verification and document the result

**Files:**
- Modify only if a previous task exposed a real implementation defect.

- [ ] **Step 1: Run type and Svelte diagnostics**

Run:

```sh
rtk bun run check
```

Expected: PASS.

- [ ] **Step 2: Run focused unit/component tests**

Run:

```sh
rtk bun run test:unit -- src/lib/audio/audioCatalog.spec.ts src/lib/audio/audioPreferences.spec.ts src/lib/audio/audioController.spec.ts src/lib/components/game/AudioSettings.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 3: Run full one-shot unit suite**

Run:

```sh
rtk bun run test:unit -- --run
```

Expected: PASS.

- [ ] **Step 4: Run focused e2e smoke**

Run:

```sh
rtk bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "audio controls persist"
```

Expected: PASS.

- [ ] **Step 5: Inspect final status**

Run:

```sh
rtk git status --short
```

Expected: no uncommitted changes after the task commits.

If any verification fails because the ElevenLabs MCP returned a billing, credit, or payment error during Task 1, stop and report that audio asset generation is blocked by account state. Do not replace the generated assets with scripted tones.
