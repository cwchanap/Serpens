<script lang="ts">
	import type { AudioPreferences } from '$lib/audio/audioPreferences';

	let {
		preferences,
		onChange
	}: {
		preferences: AudioPreferences;
		onChange: (patch: Partial<AudioPreferences>) => void;
	} = $props();

	function updateEnabled(key: 'bgmEnabled' | 'sfxEnabled', checked: boolean): void {
		onChange({ [key]: checked });
	}

	function updateVolume(key: 'bgmVolume' | 'sfxVolume', value: number): void {
		onChange({ [key]: value });
	}
</script>

<section class="audio-settings panel paper" role="group" aria-label="Audio settings">
	<h2>Audio</h2>

	<div class="audio-grid">
		<div class="audio-channel">
			<label class="toggle">
				<input
					type="checkbox"
					checked={preferences.bgmEnabled}
					onchange={(event) => updateEnabled('bgmEnabled', event.currentTarget.checked)}
				/>
				<span>BGM</span>
			</label>

			<label class="volume-control">
				<span>Music</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={preferences.bgmVolume}
					aria-label="Music volume"
					disabled={!preferences.bgmEnabled}
					oninput={(event) => updateVolume('bgmVolume', event.currentTarget.valueAsNumber)}
				/>
			</label>
		</div>

		<div class="audio-channel">
			<label class="toggle">
				<input
					type="checkbox"
					checked={preferences.sfxEnabled}
					onchange={(event) => updateEnabled('sfxEnabled', event.currentTarget.checked)}
				/>
				<span>SFX</span>
			</label>

			<label class="volume-control">
				<span>Effects</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={preferences.sfxVolume}
					aria-label="Effects volume"
					disabled={!preferences.sfxEnabled}
					oninput={(event) => updateVolume('sfxVolume', event.currentTarget.valueAsNumber)}
				/>
			</label>
		</div>
	</div>
</section>

<style>
	.audio-settings {
		padding: 1rem 1.1rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.audio-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}

	.audio-channel {
		display: grid;
		gap: 0.65rem;
		min-width: 0;
	}

	.toggle,
	.volume-control {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.toggle {
		grid-template-columns: auto 1fr;
		align-items: center;
	}

	span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	input[type='checkbox'] {
		width: 1rem;
		height: 1rem;
		margin: 0;
		accent-color: var(--brass-700);
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--brass-700);
	}

	input:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	@media (max-width: 520px) {
		.audio-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
