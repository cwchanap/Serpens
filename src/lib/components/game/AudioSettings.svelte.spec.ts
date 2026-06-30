import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from '$lib/audio/audioPreferences';
import AudioSettings from './AudioSettings.svelte';

function renderAudioSettings(
	overrides: Partial<{
		preferences: AudioPreferences;
		onChange: (patch: Partial<AudioPreferences>) => void;
	}> = {}
) {
	const props = {
		preferences: DEFAULT_AUDIO_PREFERENCES,
		onChange: vi.fn(),
		...overrides
	};

	render(AudioSettings, props);

	return props;
}

function inputRangeValue(label: string, value: string): void {
	const input = page.getByLabelText(label).element() as HTMLInputElement;

	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('AudioSettings', () => {
	it('renders BGM and SFX controls from preferences', async () => {
		expect.assertions(4);

		renderAudioSettings({
			preferences: {
				...DEFAULT_AUDIO_PREFERENCES,
				bgmEnabled: false,
				sfxVolume: 0.4
			}
		});

		await expect.element(page.getByRole('group', { name: /audio settings/i })).toBeVisible();
		await expect.element(page.getByRole('checkbox', { name: 'BGM' })).not.toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'SFX' })).toBeChecked();
		await expect.element(page.getByLabelText('Effects volume')).toHaveValue('0.4');
	});

	it('leaves menu framing to the parent and disables volume controls for muted channels', async () => {
		expect.assertions(4);

		renderAudioSettings({
			preferences: {
				...DEFAULT_AUDIO_PREFERENCES,
				bgmEnabled: false,
				sfxEnabled: false
			}
		});

		const audioSettings = page.getByRole('group', { name: /audio settings/i });

		await expect.element(audioSettings).not.toHaveClass('panel');
		await expect.element(audioSettings).not.toHaveClass('paper');
		await expect.element(page.getByLabelText('Music volume')).toBeDisabled();
		await expect.element(page.getByLabelText('Effects volume')).toBeDisabled();
	});

	it('emits preference patches', async () => {
		expect.assertions(5);
		const onChange = vi.fn();

		renderAudioSettings({ onChange });

		await page.getByRole('checkbox', { name: 'BGM' }).click();
		expect(onChange).toHaveBeenNthCalledWith(1, { bgmEnabled: false });

		inputRangeValue('Music volume', '0.3');
		expect(onChange).toHaveBeenNthCalledWith(2, { bgmVolume: 0.3 });

		await page.getByRole('checkbox', { name: 'SFX' }).click();
		expect(onChange).toHaveBeenNthCalledWith(3, { sfxEnabled: false });

		inputRangeValue('Effects volume', '0.2');
		expect(onChange).toHaveBeenNthCalledWith(4, { sfxVolume: 0.2 });
		expect(onChange).toHaveBeenCalledTimes(4);
	});
});
