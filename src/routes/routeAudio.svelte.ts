import { createGameAudioController, type GameAudioController } from '$lib/audio/audioController';
import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from '$lib/audio/audioPreferences';
import type { BgmCueId, SfxCueId } from '$lib/audio/audioCatalog';
import type { MapViewId } from '$lib/game/mapViewKeepAlive';

const bgmCueByMapView: Record<MapViewId, BgmCueId> = {
	retail: 'bgm.retail-map',
	industry: 'bgm.industry-map',
	world: 'bgm.world-map'
};

interface RouteAudioOptions {
	/** Live map view; the BGM cue follows view switches. */
	getView(): MapViewId;
}

/**
 * Route audio owner: the browser-gated audio controller, its live
 * preference mirror and the map-view BGM pin. `mount` creates the
 * controller, pins the first BGM cue to the current view synchronously and
 * returns the synchronous teardown that destroys the controller exactly
 * once. Preferences start from the controller's stored values and follow
 * `onPreferencesChanged` for live updates.
 */
export function createRouteAudio(options: RouteAudioOptions) {
	let controller: GameAudioController | null = $state(null);
	// Defaults until `mount` replaces them with the controller's stored values.
	let preferences = $state<AudioPreferences>({ ...DEFAULT_AUDIO_PREFERENCES });

	$effect(() => {
		controller?.setActiveBgm(bgmCueByMapView[options.getView()]);
	});

	function mount(): () => void {
		const created = createGameAudioController({
			onPreferencesChanged: (nextPreferences) => {
				preferences = nextPreferences;
			}
		});
		controller = created;
		preferences = created.getPreferences();
		created.setActiveBgm(bgmCueByMapView[options.getView()]);
		return () => {
			void created.destroy();
			controller = null;
		};
	}

	function unlock(): void {
		void controller?.unlock();
	}

	function playSfx(cueId: SfxCueId): void {
		void controller?.playSfx(cueId);
	}

	function updatePreferences(patch: Partial<AudioPreferences>): void {
		controller?.updatePreferences(patch);
	}

	return {
		get preferences() {
			return preferences;
		},
		mount,
		unlock,
		playSfx,
		updatePreferences
	};
}
