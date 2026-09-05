import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GameIcon from './GameIcon.svelte';
import { ICON_PATHS, type GameIconName } from './gameNavigation';

for (const name of Object.keys(ICON_PATHS) as GameIconName[]) {
	it(`renders ${name} as a decorative SVG`, () => {
		expect.assertions(3);

		render(GameIcon, { name });
		const svg = document.querySelector(`svg[data-icon="${name}"]`);

		expect(svg).not.toBeNull();
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
		expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
	});
}
