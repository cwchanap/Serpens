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

	it('freezes public cue objects', () => {
		expect.assertions(AUDIO_CUES.length + 3);

		for (const cue of AUDIO_CUES) {
			expect(Object.isFrozen(cue), cue.id).toBe(true);
		}

		expect(Object.isFrozen(BGM_CUES['bgm.retail-map'])).toBe(true);
		expect(Object.isFrozen(SFX_CUES['sfx.build.invalid'])).toBe(true);
		expect(Object.isFrozen(getAudioCue('sfx.build.invalid'))).toBe(true);
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
		expect(() => getAudioCue('sfx.missing' as never)).toThrow('Unknown audio cue: sfx.missing');
	});
});
