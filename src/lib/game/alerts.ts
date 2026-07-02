import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import { getStoreProductStatus } from './stock';
import type { GameState } from './types';

export type GameAlertKind = 'store-stock' | 'decision' | 'factory-blocked';

export interface GameAlert {
	id: string;
	kind: GameAlertKind;
	message: string;
	cityId?: string;
	storeId?: string;
	buildingId?: string;
	tileId?: string;
	decisionId?: string;
}

export function collectGameAlerts(game: GameState): GameAlert[] {
	const alerts: GameAlert[] = [];

	for (const store of game.stores) {
		const troubled = store.products.filter(
			(product) => getStoreProductStatus(product) !== 'Healthy'
		);

		if (troubled.length === 0) {
			continue;
		}

		const outOfStock = troubled.some(
			(product) => getStoreProductStatus(product) === 'Out of stock'
		);
		const noun = troubled.length === 1 ? 'product' : 'products';
		const verb = outOfStock ? 'out of stock' : 'need import';

		alerts.push({
			id: `store-stock:${store.id}`,
			kind: 'store-stock',
			message: `${store.name}: ${troubled.length} ${noun} ${verb}`,
			cityId: store.cityId,
			storeId: store.id,
			tileId: store.tileId
		});
	}

	for (const decision of game.decisions) {
		alerts.push({
			id: `decision:${decision.id}`,
			kind: 'decision',
			message: `Decision: ${decision.title}`,
			decisionId: decision.id
		});
	}

	for (const building of game.industrialBuildings) {
		if (building.status !== 'blocked' && building.blockedDays <= 0) {
			continue;
		}

		const name = INDUSTRIAL_BUILDING_TYPES[building.typeId]?.name ?? building.typeId;

		alerts.push({
			id: `factory-blocked:${building.id}`,
			kind: 'factory-blocked',
			message: `${name} starved of inputs`,
			cityId: building.cityId,
			buildingId: building.id,
			tileId: building.tileId
		});
	}

	return alerts;
}
