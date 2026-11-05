import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import { createI18n } from '$lib/i18n';
import type { GameAlert } from '$lib/game/alerts';
import type { WorldCityId } from '$lib/game/types';
import {
	selectMapViewSelections,
	selectMapHeading,
	selectWorldCityStatuses,
	resolveMapAlertDestination,
	resolveWorldCitySelection,
	resolveWorldCityOpening,
	resolveWorldCityFinancing
} from './mapNavigationRoute';

const allowed: WorldCityId[] = ['harbor-city', 'industry-city', 'campus-junction'];
const game = createNewGame('convenience', 1);

describe('map view selection cleanup', () => {
	const selections = {
		selectedTileId: 'retail-tile',
		selectedIndustryTileId: 'industry-tile',
		selectedWorldCityId: 'campus-junction',
		selectedLogisticsRouteId: 'r1',
		focusedLogisticsRouteId: 'r2'
	};
	it.each([
		[
			'retail',
			{
				selectedTileId: 'retail-tile',
				selectedIndustryTileId: null,
				selectedWorldCityId: null,
				selectedLogisticsRouteId: null,
				focusedLogisticsRouteId: null
			}
		],
		[
			'industry',
			{
				selectedTileId: null,
				selectedIndustryTileId: 'industry-tile',
				selectedWorldCityId: null,
				selectedLogisticsRouteId: null,
				focusedLogisticsRouteId: null
			}
		],
		[
			'world',
			{
				selectedTileId: null,
				selectedIndustryTileId: null,
				selectedWorldCityId: 'campus-junction',
				selectedLogisticsRouteId: 'r1',
				focusedLogisticsRouteId: 'r2'
			}
		]
	] as const)('clears only the selections displaced by %s', (view, expected) => {
		expect(selectMapViewSelections(view, selections)).toEqual(expected);
		expect(selections.selectedTileId).toBe('retail-tile');
	});
});

describe('world map presentation', () => {
	it('shows starter cities as inspectable but never offers pre-game opening', () => {
		const statuses = selectWorldCityStatuses(null);
		expect(statuses.find((status) => status.city.id === 'harbor-city')).toMatchObject({
			state: 'opened',
			canOpen: false,
			storeCount: 0,
			buildingCount: 0,
			blockedReason: null
		});
		expect(statuses.find((status) => status.city.id === 'campus-junction')).toMatchObject({
			state: 'locked',
			canOpen: false,
			blockedReason: { code: 'worldCityNotAvailableYet' }
		});
		expect(statuses.every((status) => !status.canOpen)).toBe(true);
	});
	it('uses live world reveal state, affordability and occupancy after founding', () => {
		const revealed = { ...game, cash: 18000, world: { ...game.world, revealedCityIds: allowed } };
		const statuses = selectWorldCityStatuses(revealed);
		expect(statuses.find((status) => status.city.id === 'harbor-city')?.storeCount).toBe(1);
		expect(statuses.find((status) => status.city.id === 'campus-junction')).toMatchObject({
			state: 'revealed',
			canOpen: true,
			blockedReason: null
		});
	});
	it.each([
		['world', 'World Map', 'Regional Network'],
		['retail', 'Retail City Map', 'Campus Junction'],
		['industry', 'Industry City Map', 'Industry City']
	] as const)('labels the %s view using its own city', (view, eyebrow, title) => {
		expect(selectMapHeading(view, 'campus-junction', 'industry-city', createI18n('en'))).toEqual({
			mapEyebrow: eyebrow,
			mapTitle: title
		});
	});
});

// These catch permission-gate inversions, loss of read-only inspection during writes,
// and incorrectly navigating to revealed rather than opened cities.
describe('world city navigation', () => {
	it.each(['unknown', 'garden-borough'])('ignores invalid or disallowed city %s', (cityId) => {
		expect(resolveWorldCitySelection(game, cityId, allowed, true)).toBeNull();
	});
	it('allows pre-game inspection without selecting an active map', () => {
		expect(resolveWorldCitySelection(null, 'harbor-city', allowed, true)).toEqual({
			cityId: 'harbor-city',
			mapView: null
		});
	});
	it.each([
		['harbor-city', 'retail'],
		['industry-city', 'industry']
	] as const)('navigates an opened %s to its %s map', (cityId, mapView) => {
		expect(resolveWorldCitySelection(game, cityId, allowed, true)).toEqual({ cityId, mapView });
	});
	it('keeps opened-city inspection available while scenario selection is busy/forbidden', () => {
		expect(resolveWorldCitySelection(game, 'industry-city', allowed, false)).toEqual({
			cityId: 'industry-city',
			mapView: null
		});
	});
	it('only inspects a locked or revealed city', () => {
		expect(resolveWorldCitySelection(game, 'campus-junction', allowed, true)?.mapView).toBeNull();
		const revealed = { ...game, world: { ...game.world, revealedCityIds: allowed } };
		expect(
			resolveWorldCitySelection(revealed, 'campus-junction', allowed, true)?.mapView
		).toBeNull();
	});
});

describe('world opening and financing entry', () => {
	it('leaves cash/status validation to the open command, but requires game, capability and allowed id', () => {
		expect(resolveWorldCityOpening(game, 'campus-junction', allowed, true)).toBe('campus-junction');
		expect(resolveWorldCityOpening(null, 'campus-junction', allowed, true)).toBeNull();
		expect(resolveWorldCityOpening(game, 'campus-junction', allowed, false)).toBeNull();
		expect(resolveWorldCityOpening(game, 'garden-borough', allowed, true)).toBeNull();
		expect(resolveWorldCityOpening(game, 'unknown', allowed, true)).toBeNull();
	});
	it('offers financing only for a revealed city with a real shortfall and offer', () => {
		const revealed = { ...game, cash: 17000, world: { ...game.world, revealedCityIds: allowed } };
		const review = resolveWorldCityFinancing(revealed, 'campus-junction', allowed, true);
		expect(review).toMatchObject({ kind: 'world', cityId: 'campus-junction', expectedCost: 18000 });
		expect(review?.offer).toMatchObject({ principal: 1000 });
		expect(
			resolveWorldCityFinancing({ ...revealed, cash: 0 }, 'campus-junction', allowed, true)
		).toBeNull();
		expect(resolveWorldCityFinancing(game, 'campus-junction', allowed, true)).toBeNull();
		expect(
			resolveWorldCityFinancing({ ...revealed, cash: 18000 }, 'campus-junction', allowed, true)
		).toBeNull();
		expect(resolveWorldCityFinancing(revealed, 'harbor-city', allowed, true)).toBeNull();
		expect(resolveWorldCityFinancing(revealed, 'campus-junction', allowed, false)).toBeNull();
		expect(resolveWorldCityFinancing(revealed, 'campus-junction', [], true)).toBeNull();
		expect(resolveWorldCityFinancing(null, 'campus-junction', allowed, true)).toBeNull();
	});
});

describe('map-specific alert destinations', () => {
	const stockAlert: GameAlert = { id: 'stock', kind: 'store-stock', storeId: game.stores[0]!.id };
	it('preserves route precedence over a stale panel, and finance focus', () => {
		expect(
			resolveMapAlertDestination(
				{ id: 'route', kind: 'event-modifier', routeId: 'r1', managementPanelId: 'decisions' },
				null,
				[],
				false
			)
		).toEqual({ kind: 'world-route', routeId: 'r1' });
		expect(
			resolveMapAlertDestination(
				{ id: 'loan', kind: 'missedLoanPayment', loanId: 'loan1', managementPanelId: 'finance' },
				null,
				[],
				false
			)
		).toEqual({ kind: 'panel', panelId: 'finance', focusedFinanceLoanId: 'loan1' });
	});
	it('uses live stock location and product, allowing a local alert during a pending write', () => {
		expect(
			resolveMapAlertDestination(
				{ ...stockAlert, cityId: 'campus-junction', tileId: 'stale' },
				game,
				[],
				false
			)
		).toMatchObject({ kind: 'retail', tileId: game.stores[0]!.tileId, cityIdToSelect: null });
		expect(resolveMapAlertDestination(stockAlert, null, allowed, true)).toBeNull();
		expect(
			resolveMapAlertDestination({ ...stockAlert, storeId: 'deleted' }, game, allowed, true)
		).toBeNull();
	});
	it('requires permission and a legal city before a cross-city stock handoff', () => {
		const otherCity = { ...game, activeCityId: 'campus-junction' };
		expect(resolveMapAlertDestination(stockAlert, otherCity, allowed, true)?.kind).toBe('retail');
		expect(resolveMapAlertDestination(stockAlert, otherCity, allowed, true)).toMatchObject({
			cityIdToSelect: 'harbor-city'
		});
		expect(resolveMapAlertDestination(stockAlert, otherCity, allowed, false)).toBeNull();
		expect(resolveMapAlertDestination(stockAlert, otherCity, [], true)).toBeNull();
		const invalid = { ...otherCity, stores: [{ ...game.stores[0]!, cityId: 'unknown' }] };
		expect(resolveMapAlertDestination(stockAlert, invalid, allowed, true)).toBeNull();
	});
	it.each(['factory-blocked', 'industry-warehouse-missing', 'industry-rail-disconnected'] as const)(
		'resolves %s to the industry tile and retains its fix handoff',
		(kind) => {
			const alert: GameAlert = {
				id: kind,
				kind,
				tileId: 'tile1',
				cityId: 'industry-city',
				buildingId: 'building1'
			};
			expect(resolveMapAlertDestination(alert, game, [], false)).toEqual({
				kind: 'industry',
				tileId: 'tile1',
				cityIdToSelect: null,
				fix:
					kind === 'industry-warehouse-missing'
						? 'warehouse'
						: kind === 'industry-rail-disconnected'
							? 'rail'
							: null,
				buildingId: 'building1'
			});
			expect(
				resolveMapAlertDestination({ ...alert, tileId: undefined }, game, allowed, true)
			).toBeNull();
		}
	);
	it('blocks illegal cross-industry handoffs, but preserves pre-game inspector behavior', () => {
		const alert: GameAlert = {
			id: 'factory',
			kind: 'factory-blocked',
			tileId: 't',
			cityId: 'campus-junction'
		};
		expect(resolveMapAlertDestination(alert, game, allowed, true)).toMatchObject({
			cityIdToSelect: 'campus-junction'
		});
		expect(resolveMapAlertDestination(alert, game, allowed, false)).toBeNull();
		expect(resolveMapAlertDestination(alert, game, [], true)).toBeNull();
		expect(
			resolveMapAlertDestination({ ...alert, cityId: 'unknown' }, game, allowed, true)
		).toBeNull();
		expect(resolveMapAlertDestination(alert, null, [], false)).toMatchObject({
			kind: 'industry',
			cityIdToSelect: null
		});
	});
	it('ignores an alert without a navigation target', () => {
		expect(
			resolveMapAlertDestination({ id: 'cash', kind: 'lowCashRunway' }, game, allowed, true)
		).toBeNull();
	});
});
