import { describe, expect, it } from 'vitest';
import { getIndustrialLinkIssues } from './industryLinks';
import { createNewGame } from './state';
import type { GameState, IndustrialBuilding, IndustryCity, RailCell } from './types';

function makeBuilding(
	id: string,
	typeId: IndustrialBuilding['typeId'],
	mapX: number,
	mapY: number,
	cityId = 'industry-city'
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId,
		tileId: `${cityId}-${mapX}-${mapY}`,
		mapX,
		mapY,
		status: 'idle',
		inventory: {},
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function makeCity(rails: RailCell[], id = 'industry-city'): IndustryCity {
	return { id, name: 'Rail City', width: 30, height: 30, tiles: [], rails };
}

function straightRails(y: number, fromX: number, toX: number): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level: 1 });
	return cells;
}

function makeGame(cities: IndustryCity[], buildings: IndustrialBuilding[]): GameState {
	return {
		...createNewGame('convenience', 20260917),
		industryCities: cities,
		industrialBuildings: buildings
	};
}

// Footprints are 2x2 and attach on the row below (y = 4 for mapY = 2), so a
// rail line on y = 4 links every building placed on mapY = 2 that it spans.
const pump = makeBuilding('pump', 'water-pump', 2, 2);
const bottler = makeBuilding('bottler', 'water-bottler', 6, 2);
const warehouse = makeBuilding('warehouse', 'warehouse', 10, 2);

describe('getIndustrialLinkIssues', () => {
	it('reports nothing when a city has no production buildings', () => {
		expect(getIndustrialLinkIssues(makeGame([makeCity([])], [warehouse])).size).toBe(0);
	});

	it('flags a lone producer as having nowhere to send output', () => {
		expect([...getIndustrialLinkIssues(makeGame([makeCity([])], [pump]))]).toEqual([
			['pump', 'no-warehouse']
		]);
	});

	it('flags a producer whose consumer exists but is not on the same rail', () => {
		const issues = getIndustrialLinkIssues(makeGame([makeCity([])], [pump, bottler]));

		expect(issues.get('pump')).toBe('rail-disconnected');
		// Nothing consumes bottled water and there is no warehouse yet.
		expect(issues.get('bottler')).toBe('no-warehouse');
	});

	it('flags every producer as rail-disconnected once a warehouse exists without rail', () => {
		const issues = getIndustrialLinkIssues(makeGame([makeCity([])], [pump, bottler, warehouse]));

		expect([...issues]).toEqual([
			['pump', 'rail-disconnected'],
			['bottler', 'rail-disconnected']
		]);
	});

	it('clears every issue when one rail line links the chain to the warehouse', () => {
		const issues = getIndustrialLinkIssues(
			makeGame([makeCity(straightRails(4, 2, 11))], [pump, bottler, warehouse])
		);

		expect(issues.size).toBe(0);
	});

	it('treats a rail that stops short of the warehouse as disconnected', () => {
		// The line links pump and bottler but ends before the warehouse's attach cells.
		const issues = getIndustrialLinkIssues(
			makeGame([makeCity(straightRails(4, 2, 7))], [pump, bottler, warehouse])
		);

		expect(issues.get('pump')).toBeUndefined();
		expect(issues.get('bottler')).toBe('rail-disconnected');
	});

	it('does not link buildings through rail pieces that do not touch', () => {
		const rails = [...straightRails(4, 2, 4), ...straightRails(4, 9, 11)];
		const issues = getIndustrialLinkIssues(makeGame([makeCity(rails)], [pump, warehouse]));

		expect(issues.get('pump')).toBe('rail-disconnected');
	});

	it('checks each industry city on its own', () => {
		const otherPump = makeBuilding('other-pump', 'water-pump', 2, 2, 'other-city');
		const issues = getIndustrialLinkIssues(
			makeGame(
				[makeCity(straightRails(4, 2, 11)), makeCity([], 'other-city')],
				[pump, warehouse, otherPump]
			)
		);

		expect([...issues]).toEqual([['other-pump', 'no-warehouse']]);
	});
});
