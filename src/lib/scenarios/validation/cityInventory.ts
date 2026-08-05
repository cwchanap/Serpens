import {
	compareWorldCityIds,
	getCityInventory,
	getCityInventoryStats
} from '$lib/game/cityInventory';
import { MATERIALS } from '$lib/game/industry';
import type { GameState, MaterialId, WorldCityId } from '$lib/game/types';
import { getWorldCityDefinition } from '$lib/game/world';
import type { ScenarioDiagnostic, ScenarioStartBlueprint } from '../types';
import { sortScenarioDiagnostics } from './shared';

function scenarioDiagnostic(
	path: string,
	code: string,
	value: unknown,
	detail: string
): ScenarioDiagnostic {
	return { path, code, value, detail };
}

function cityInventoryPath(index: number, field: 'cityId' | 'materials'): string {
	return `start.overrides.cityInventoryMaterials[${index}].${field}`;
}

function retailSupplyPath(index: number, field: 'retailCityId' | 'supplyCityId'): string {
	return `start.overrides.retailSupplyAssignments[${index}].${field}`;
}

function isKnownMaterialId(value: string): value is MaterialId {
	return Object.hasOwn(MATERIALS, value);
}

function validateCityInventoryEndpoint(
	game: GameState,
	cityId: unknown,
	path: string,
	diagnostics: ScenarioDiagnostic[]
): WorldCityId | undefined {
	if (typeof cityId !== 'string' || cityId.length === 0) {
		diagnostics.push(
			scenarioDiagnostic(
				path,
				'invalid-string',
				cityId,
				'City inventory overrides require a city ID.'
			)
		);
		return undefined;
	}
	const city = getWorldCityDefinition(cityId);
	if (!city) {
		diagnostics.push(
			scenarioDiagnostic(path, 'invalid-reference', cityId, 'Unknown city reference.')
		);
		return undefined;
	}
	if (city.kind !== 'industry') {
		diagnostics.push(
			scenarioDiagnostic(
				path,
				'invalid-city-inventory-city',
				cityId,
				'City inventory overrides require an industry city.'
			)
		);
		return undefined;
	}

	const access = getCityInventory(game, city.id);
	if (!access.ok) {
		const code =
			access.reason === 'city-closed'
				? 'city-inventory-city-closed'
				: access.reason === 'inventory-missing'
					? 'city-inventory-unavailable'
					: 'city-inventory-city-unavailable';
		diagnostics.push(
			scenarioDiagnostic(
				path,
				code,
				cityId,
				'City inventory overrides require an opened, materialized industry inventory.'
			)
		);
		return undefined;
	}

	return city.id;
}

/**
 * Validates each authored city independently after setup has synchronized its
 * same-city warehouse capacity. The scenario definition validator owns schema
 * and content allowlists; this boundary verifies the finished game state.
 */
export function validateCityInventoryCapacities(
	game: GameState,
	blueprint: ScenarioStartBlueprint
): ScenarioDiagnostic[] {
	const diagnostics: ScenarioDiagnostic[] = [];
	const overrides = blueprint.overrides.cityInventoryMaterials;
	if (!overrides) return diagnostics;
	const seenCityIds = new Set<string>();

	for (const [index, override] of overrides.entries()) {
		const cityPath = cityInventoryPath(index, 'cityId');
		const materialsPath = cityInventoryPath(index, 'materials');
		if (seenCityIds.has(override.cityId)) {
			diagnostics.push(
				scenarioDiagnostic(
					cityPath,
					'duplicate-reference',
					override.cityId,
					`Duplicate city inventory override for ${override.cityId}.`
				)
			);
		}
		seenCityIds.add(override.cityId);
		const cityId = validateCityInventoryEndpoint(game, override.cityId, cityPath, diagnostics);
		if (!cityId) continue;
		const access = getCityInventory(game, cityId);
		if (!access.ok) continue;
		if (
			typeof override.materials !== 'object' ||
			override.materials === null ||
			Array.isArray(override.materials)
		) {
			diagnostics.push(
				scenarioDiagnostic(
					materialsPath,
					'invalid-object',
					override.materials,
					'City inventory materials must be an object.'
				)
			);
			continue;
		}

		let used = 0;
		for (const [materialId, quantity] of Object.entries(override.materials)) {
			const itemPath = `${materialsPath}.${materialId}`;
			if (!isKnownMaterialId(materialId)) {
				diagnostics.push(
					scenarioDiagnostic(
						itemPath,
						'invalid-reference',
						materialId,
						'Unknown material reference.'
					)
				);
				continue;
			}
			if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) {
				diagnostics.push(
					scenarioDiagnostic(
						itemPath,
						'invalid-non-negative-number',
						quantity,
						'City inventory quantities must be finite and non-negative.'
					)
				);
				continue;
			}
			if (!Number.isSafeInteger(quantity)) {
				diagnostics.push(
					scenarioDiagnostic(
						itemPath,
						'invalid-city-inventory-quantity',
						quantity,
						'City inventory quantities must be non-negative safe integers.'
					)
				);
				continue;
			}
			if (quantity > Number.MAX_SAFE_INTEGER - used) {
				diagnostics.push(
					scenarioDiagnostic(
						materialsPath,
						'unsafe-city-inventory-total',
						override.materials,
						'City inventory material totals must stay within the safe integer range.'
					)
				);
				continue;
			}
			used += quantity;
		}

		const { capacity } = getCityInventoryStats(game, cityId);
		if (used > capacity) {
			diagnostics.push(
				scenarioDiagnostic(
					materialsPath,
					'city-inventory-capacity-exceeded',
					override.materials,
					`Starting city inventory uses ${used} units but ${cityId} has capacity ${capacity}.`
				)
			);
		}
	}

	return sortScenarioDiagnostics(diagnostics);
}

function expectedRetailCityIds(game: GameState): WorldCityId[] {
	return game.world.openedCityIds
		.filter((cityId) => {
			const city = getWorldCityDefinition(cityId);
			return city?.kind === 'retail' && game.cities.some((candidate) => candidate.id === city.id);
		})
		.sort(compareWorldCityIds);
}

function validateRetailOwner(
	game: GameState,
	retailCityId: unknown,
	path: string,
	diagnostics: ScenarioDiagnostic[]
): WorldCityId | undefined {
	if (typeof retailCityId !== 'string' || retailCityId.length === 0) {
		diagnostics.push(
			scenarioDiagnostic(
				path,
				'invalid-string',
				retailCityId,
				'Retail supply owners require a city ID.'
			)
		);
		return undefined;
	}
	const city = getWorldCityDefinition(retailCityId);
	if (!city) {
		diagnostics.push(
			scenarioDiagnostic(path, 'invalid-reference', retailCityId, 'Unknown retail city reference.')
		);
		return undefined;
	}
	if (city.kind !== 'retail') {
		diagnostics.push(
			scenarioDiagnostic(
				path,
				'invalid-retail-supply-city',
				retailCityId,
				'Retail supply assignments require a retail city owner.'
			)
		);
		return undefined;
	}
	if (!game.world.openedCityIds.includes(city.id)) {
		diagnostics.push(
			scenarioDiagnostic(
				path,
				'retail-supply-city-closed',
				retailCityId,
				'Retail supply assignments require an opened retail city owner.'
			)
		);
		return undefined;
	}
	if (!game.cities.some((candidate) => candidate.id === city.id)) {
		diagnostics.push(
			scenarioDiagnostic(
				path,
				'retail-supply-city-unavailable',
				retailCityId,
				'Retail supply assignments require a materialized retail city owner.'
			)
		);
		return undefined;
	}
	return city.id;
}

function validateSupplyEndpoint(
	game: GameState,
	supplyCityId: unknown,
	path: string,
	diagnostics: ScenarioDiagnostic[]
): void {
	if (supplyCityId === null) return;
	if (typeof supplyCityId !== 'string' || supplyCityId.length === 0) {
		diagnostics.push(
			scenarioDiagnostic(
				path,
				'invalid-string',
				supplyCityId,
				'Retail supply sources must be a city ID or null.'
			)
		);
		return;
	}
	const city = getWorldCityDefinition(supplyCityId);
	if (!city) {
		diagnostics.push(
			scenarioDiagnostic(path, 'invalid-reference', supplyCityId, 'Unknown supply city reference.')
		);
		return;
	}
	if (city.kind !== 'industry') {
		diagnostics.push(
			scenarioDiagnostic(
				path,
				'invalid-supply-city',
				supplyCityId,
				'Retail supply sources must be industry cities or null.'
			)
		);
		return;
	}
	const access = getCityInventory(game, city.id);
	if (!access.ok) {
		const code =
			access.reason === 'city-closed'
				? 'supply-city-closed'
				: access.reason === 'inventory-missing'
					? 'supply-city-unavailable'
					: access.reason === 'unsupported-city'
						? 'supply-city-unmaterialized'
						: 'supply-city-unavailable';
		diagnostics.push(
			scenarioDiagnostic(
				path,
				code,
				supplyCityId,
				'Retail supply sources must resolve to an opened, materialized city inventory.'
			)
		);
	}
}

/**
 * Validates the finished canonical retail assignment collection. Explicit
 * overrides must cover every opened retail city; omitted overrides retain the
 * lifecycle defaults created during scenario setup.
 */
export function validateRetailSupplyAssignments(
	game: GameState,
	blueprint: ScenarioStartBlueprint
): ScenarioDiagnostic[] {
	const diagnostics: ScenarioDiagnostic[] = [];
	const assignments = game.retailSupplyAssignments;
	const expectedCityIds = expectedRetailCityIds(game);
	const seenRetailCityIds = new Set<WorldCityId>();
	let previousRetailCityId: WorldCityId | undefined;

	for (const [index, assignment] of assignments.entries()) {
		const ownerPath = retailSupplyPath(index, 'retailCityId');
		const owner = validateRetailOwner(game, assignment.retailCityId, ownerPath, diagnostics);
		if (owner) {
			if (seenRetailCityIds.has(owner)) {
				diagnostics.push(
					scenarioDiagnostic(
						ownerPath,
						'duplicate-reference',
						owner,
						`Duplicate retail supply assignment for ${owner}.`
					)
				);
			}
			if (previousRetailCityId && compareWorldCityIds(previousRetailCityId, owner) >= 0) {
				diagnostics.push(
					scenarioDiagnostic(
						'start.overrides.retailSupplyAssignments',
						'noncanonical-retail-supply-assignment',
						assignments,
						'Retail supply assignments must use canonical retail-city order.'
					)
				);
			}
			seenRetailCityIds.add(owner);
			previousRetailCityId = owner;
		}
		validateSupplyEndpoint(
			game,
			assignment.supplyCityId,
			retailSupplyPath(index, 'supplyCityId'),
			diagnostics
		);
	}

	if (
		seenRetailCityIds.size !== expectedCityIds.length ||
		expectedCityIds.some((cityId) => !seenRetailCityIds.has(cityId))
	) {
		diagnostics.push(
			scenarioDiagnostic(
				'start.overrides.retailSupplyAssignments',
				'missing-retail-supply-assignment',
				assignments,
				'Retail supply assignments must contain one record for every opened retail city.'
			)
		);
	}

	const authored = blueprint.overrides.retailSupplyAssignments;
	if (authored) {
		const authoredCityIds = authored.map((assignment) => assignment.retailCityId);
		const canonicalAuthoredOrder = [...authoredCityIds].sort(compareWorldCityIds);
		if (!authoredCityIds.every((cityId, index) => cityId === canonicalAuthoredOrder[index])) {
			diagnostics.push(
				scenarioDiagnostic(
					'start.overrides.retailSupplyAssignments',
					'noncanonical-retail-supply-assignment',
					authored,
					'Authored retail supply assignments must use canonical retail-city order.'
				)
			);
		}
	}

	return sortScenarioDiagnostics(diagnostics);
}
