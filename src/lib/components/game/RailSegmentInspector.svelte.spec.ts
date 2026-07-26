import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RailSegmentInspector from './RailSegmentInspector.svelte';
import {
	buildRailNetwork,
	deriveRailSegments,
	getSegmentsForCell,
	RAIL_MAX_LEVEL,
	type RailSegment
} from '$lib/game/rail';
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
	const city = game.industryCities[0]!;
	const network = buildRailNetwork(city);
	const allSegments = deriveRailSegments(network, game.industrialBuildings);
	return {
		game,
		cityId: CITY_ID,
		segments,
		allSegments,
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

	it('disables the demolish button when all cells are shared junctions', async () => {
		expect.assertions(3);
		// Two adjacent junctions (2,1) and (3,1), each with 3+ rail neighbors.
		// The junction-to-junction segment (2,1)-(3,1) consists entirely of
		// shared junction cells with outside rail neighbors, so
		// getDemolishRemovableCellKeys returns an empty set.
		//
		//       (2,0)
		//         |
		// (1,1)-(2,1)-(3,1)-(4,1)
		//               |     |
		//              (3,2) (4,2)
		const rails: RailCell[] = [
			{ x: 2, y: 0, level: 1 },
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 },
			{ x: 3, y: 1, level: 1 },
			{ x: 4, y: 1, level: 1 },
			{ x: 3, y: 2, level: 1 },
			{ x: 4, y: 2, level: 1 }
		];
		const game = makeGame(rails, {});
		const city = game.industryCities[0]!;
		const network = buildRailNetwork({ ...city, rails });
		const allSegments = deriveRailSegments(network, game.industrialBuildings);
		// The real app passes all segments at the clicked cell — for a
		// junction cell like (2,1), that includes every segment touching it.
		const cellSegments = getSegmentsForCell(allSegments, 2, 1);
		const junctionSegment = cellSegments.find((seg) => seg.id === 'seg:2,1|3,1');
		expect(junctionSegment).toBeDefined();

		render(RailSegmentInspector, baseProps(game, cellSegments));

		// Select the junction-to-junction segment in the picker.
		const junctionIndex = cellSegments.findIndex((seg) => seg.id === 'seg:2,1|3,1');
		await page.getByTestId(`rail-segment-option-${junctionIndex}`).click();

		const demolish = page.getByRole('button', { name: /demolish/i });
		await expect.element(demolish).toBeDisabled();
		await expect.element(page.getByText(/shared junctions/i)).toBeVisible();
	});

	it('combines independent rail permissions with normal constraints', async () => {
		expect.assertions(5);
		const rails: RailCell[] = [
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 }
		];
		const segment: RailSegment = { id: 'seg:1,1|2,1', cellKeys: ['1,1', '2,1'], minLevel: 1 };
		const props = baseProps(makeGame(rails, {}), [segment]);
		render(RailSegmentInspector, {
			...props,
			canUpgradeRail: false,
			canDemolishRail: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /demolish/i })).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.').first()).toBeVisible();
		expect(props.onUpgradeSegment).not.toHaveBeenCalled();
		expect(props.onDemolishSegment).not.toHaveBeenCalled();
	});

	it('shows the disabled reason hint next to the upgrade button when only upgrade is disabled', async () => {
		expect.assertions(3);
		const rails: RailCell[] = [
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 }
		];
		const segment: RailSegment = { id: 'seg:1,1|2,1', cellKeys: ['1,1', '2,1'], minLevel: 1 };
		const props = baseProps(makeGame(rails, {}), [segment]);
		render(RailSegmentInspector, {
			...props,
			canUpgradeRail: false,
			canDemolishRail: true,
			disabledReason: 'Upgrades are unavailable in this challenge.'
		});

		await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /demolish/i })).toBeEnabled();
		await expect
			.element(page.getByText('Upgrades are unavailable in this challenge.'))
			.toBeVisible();
	});
});
