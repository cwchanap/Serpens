import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RailSegmentInspector from './RailSegmentInspector.svelte';
import { createI18n } from '$lib/i18n';
import { createNewGame } from '$lib/game/state';
import type { RailSegment } from '$lib/game/rail';
import type { GameState, RailCell } from '$lib/game/types';

const CITY_ID = 'industry-city';

function makeGame(
	rails: RailCell[],
	railUsage?: Record<string, number>,
	includeReport = true
): GameState {
	const base = createNewGame('convenience', 12345);
	const city = { ...base.industryCities[0]!, rails };
	return {
		...base,
		industryCities: [city],
		reports: includeReport
			? ([{ productionReport: { railUsage } }] as unknown as GameState['reports'])
			: []
	};
}

function props(game: GameState, cityId: string, segments: RailSegment[]) {
	return {
		game,
		cityId,
		segments,
		allSegments: segments,
		i18n: createI18n('en'),
		onClose: vi.fn(),
		onUpgradeSegment: vi.fn(),
		onDemolishSegment: vi.fn()
	};
}

describe('RailSegmentInspector coverage fallbacks', () => {
	it('uses an empty network and zero usage when the city and report are missing', async () => {
		expect.assertions(5);
		const segment: RailSegment = {
			id: 'seg:4,4',
			cellKeys: ['4,4'],
			minLevel: 2
		};
		const game = makeGame([], undefined, false);

		render(RailSegmentInspector, props(game, 'missing-city', [segment]));

		await expect.element(page.getByTestId('rail-segment-cells')).toHaveTextContent('1');
		await expect.element(page.getByTestId('rail-segment-level')).toHaveTextContent('2 / 5');
		await expect.element(page.getByTestId('rail-segment-capacity')).toHaveTextContent('2');
		await expect.element(page.getByTestId('rail-segment-utilization')).toHaveTextContent('0%');
		await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeEnabled();
	});

	it('falls back to the segment level for a missing cell and clamps utilization to 100%', async () => {
		expect.assertions(1);
		const segment: RailSegment = {
			id: 'seg:8,8',
			cellKeys: ['8,8'],
			minLevel: 2
		};
		const game = makeGame([], { [`${CITY_ID}:8,8`]: 10 });

		render(RailSegmentInspector, props(game, CITY_ID, [segment]));

		await expect.element(page.getByTestId('rail-segment-utilization')).toHaveTextContent('100%');
	});

	it('skips non-positive cell levels when calculating utilization', async () => {
		expect.assertions(2);
		const rails: RailCell[] = [{ x: 3, y: 3, level: 0 }];
		const segment: RailSegment = {
			id: 'seg:3,3',
			cellKeys: ['3,3'],
			minLevel: 0
		};
		const game = makeGame(rails, { [`${CITY_ID}:3,3`]: 5 });

		render(RailSegmentInspector, props(game, CITY_ID, [segment]));

		await expect.element(page.getByTestId('rail-segment-utilization')).toHaveTextContent('0%');
		await expect.element(page.getByTestId('rail-segment-level')).toHaveTextContent('0 / 5');
	});

	it('returns zero utilization for a selected segment with no cells', async () => {
		expect.assertions(2);
		const segment: RailSegment = { id: 'seg:empty', cellKeys: [], minLevel: 1 };
		const game = makeGame([], {}, true);

		render(RailSegmentInspector, props(game, CITY_ID, [segment]));

		await expect.element(page.getByTestId('rail-segment-cells')).toHaveTextContent('0');
		await expect.element(page.getByTestId('rail-segment-utilization')).toHaveTextContent('0%');
	});

	it('renders the no-selection path without segment statistics or actions', async () => {
		expect.assertions(3);
		const game = makeGame([], undefined, false);

		render(RailSegmentInspector, props(game, CITY_ID, []));

		await expect.element(page.getByTestId('rail-segment-cells')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /demolish/i })).not.toBeInTheDocument();
	});
});
