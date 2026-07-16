import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RailSegmentInspector from './RailSegmentInspector.svelte';
import { RAIL_MAX_LEVEL, type RailSegment } from '$lib/game/rail';
import { createI18n } from '$lib/i18n';
import { createNewGame } from '$lib/game/state';
import type { GameState, RailCell } from '$lib/game/types';

const CITY_ID = 'industry-city';

function makeGame(rails: RailCell[], railUsage: Record<string, number>, cash = 999_999): GameState {
	const base = createNewGame('convenience', 12_345);
	const city = { ...base.industryCities[0]!, rails };
	return {
		...base,
		cash,
		industryCities: [city],
		reports: [{ productionReport: { railUsage } }] as unknown as GameState['reports']
	};
}

function baseProps(game: GameState, segments: RailSegment[]) {
	return {
		game,
		cityId: CITY_ID,
		segments,
		i18n: createI18n('en'),
		onClose: vi.fn(),
		onUpgradeSegment: vi.fn(),
		onDemolishSegment: vi.fn()
	};
}

describe('RailSegmentInspector', () => {
	it('renders cells, level, capacity, and yesterday utilization for a single segment', async () => {
		expect.assertions(5);
		const rails: RailCell[] = [
			{ x: 1, y: 1, level: 2 },
			{ x: 2, y: 1, level: 2 },
			{ x: 3, y: 1, level: 2 }
		];
		const segment: RailSegment = {
			id: 'seg:1,1|2,1|3,1',
			cellKeys: ['1,1', '2,1', '3,1'],
			minLevel: 2
		};
		const game = makeGame(rails, { 'industry-city:2,1': 1 });

		render(RailSegmentInspector, baseProps(game, [segment]));

		await expect.element(page.getByRole('heading', { name: 'Rail segment' })).toBeVisible();
		await expect.element(page.getByTestId('rail-segment-cells')).toHaveTextContent('3');
		await expect.element(page.getByTestId('rail-segment-level')).toHaveTextContent('2 / 5');
		await expect.element(page.getByTestId('rail-segment-capacity')).toHaveTextContent('2');
		await expect.element(page.getByTestId('rail-segment-utilization')).toHaveTextContent('50%');
	});

	it('renders a segment picker for a junction and switches the displayed segment', async () => {
		expect.assertions(4);
		const rails: RailCell[] = [
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 },
			{ x: 2, y: 2, level: 1 },
			{ x: 2, y: 3, level: 1 }
		];
		const segA: RailSegment = { id: 'seg:1,1|2,1', cellKeys: ['1,1', '2,1'], minLevel: 1 };
		const segB: RailSegment = {
			id: 'seg:2,1|2,2|2,3',
			cellKeys: ['2,1', '2,2', '2,3'],
			minLevel: 1
		};
		const game = makeGame(rails, {});

		render(RailSegmentInspector, baseProps(game, [segA, segB]));

		await expect.element(page.getByText('Junction — pick a segment')).toBeVisible();
		await expect.element(page.getByTestId('rail-segment-option-0')).toBeVisible();
		await expect.element(page.getByTestId('rail-segment-cells')).toHaveTextContent('2');
		await page.getByTestId('rail-segment-option-1').click();
		await expect.element(page.getByTestId('rail-segment-cells')).toHaveTextContent('3');
	});

	it('disables the upgrade button and shows the max-level label at RAIL_MAX_LEVEL', async () => {
		expect.assertions(2);
		const rails: RailCell[] = [
			{ x: 1, y: 1, level: RAIL_MAX_LEVEL },
			{ x: 2, y: 1, level: RAIL_MAX_LEVEL }
		];
		const segment: RailSegment = {
			id: 'seg:1,1|2,1',
			cellKeys: ['1,1', '2,1'],
			minLevel: RAIL_MAX_LEVEL
		};
		const game = makeGame(rails, {});

		render(RailSegmentInspector, baseProps(game, [segment]));

		const button = page.getByRole('button', { name: 'At max level' });
		await expect.element(button).toBeVisible();
		await expect.element(button).toBeDisabled();
	});

	it('fires upgrade and demolish callbacks with the selected segment id', async () => {
		expect.assertions(2);
		const onUpgradeSegment = vi.fn();
		const onDemolishSegment = vi.fn();
		const rails: RailCell[] = [
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 }
		];
		const segment: RailSegment = { id: 'seg:1,1|2,1', cellKeys: ['1,1', '2,1'], minLevel: 1 };
		const game = makeGame(rails, {});

		render(RailSegmentInspector, {
			...baseProps(game, [segment]),
			onUpgradeSegment,
			onDemolishSegment
		});

		await page.getByRole('button', { name: /upgrade/i }).click();
		expect(onUpgradeSegment).toHaveBeenCalledWith('seg:1,1|2,1');
		await page.getByRole('button', { name: /demolish/i }).click();
		expect(onDemolishSegment).toHaveBeenCalledWith('seg:1,1|2,1');
	});

	it('renders without a selected segment when segments is empty', async () => {
		expect.assertions(2);
		const game = makeGame([], {});

		render(RailSegmentInspector, baseProps(game, []));

		await expect.element(page.getByRole('heading', { name: 'Rail segment' })).toBeVisible();
		// No stats section renders when there is no selected segment.
		await expect.element(page.getByTestId('rail-segment-cells')).not.toBeInTheDocument();
	});

	it('shows the not-enough-cash hint when upgrade is available but unaffordable', async () => {
		expect.assertions(2);
		const rails: RailCell[] = [
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 }
		];
		const segment: RailSegment = { id: 'seg:1,1|2,1', cellKeys: ['1,1', '2,1'], minLevel: 1 };
		const game = makeGame(rails, {}, 0);

		render(RailSegmentInspector, baseProps(game, [segment]));

		const upgrade = page.getByRole('button', { name: /upgrade/i });
		await expect.element(upgrade).toBeDisabled();
		await expect.element(page.getByText('Not enough cash.')).toBeVisible();
	});
});
