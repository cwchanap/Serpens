import { ARCHETYPES } from '$lib/game/archetypes';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import { MAX_STORE_LEVEL, getUnlockedCategoryCount } from '$lib/game/leveling';
import type { IndustrialBuildingTypeId, ProductId } from '$lib/game/types';
import { STARTER_STORE_CAP, getWorldCityDefinition } from '$lib/game/world';
import type { AuthoredBuilding, JsonObject, ValidationContext } from './shared';
import {
	BUILDING_INVENTORY_KEYS,
	CITY_INVENTORY_MATERIALS_KEYS,
	FOUNDING_STORE_KEYS,
	INDUSTRIAL_BUILDING_KEYS,
	KNOWN_CITY_IDS,
	KNOWN_MATERIAL_IDS,
	KNOWN_PRODUCT_IDS,
	OVERRIDE_KEYS,
	POLICY_KEYS,
	POLICY_VALUES,
	PRODUCT_OVERRIDE_KEYS,
	RETAIL_SUPPLY_ASSIGNMENT_KEYS,
	START_KEYS,
	STORE_OVERRIDE_KEYS,
	WORLD_OVERRIDE_KEYS,
	arrayValue,
	closedObject,
	diagnostic,
	isObject,
	nonEmptyString,
	nonNegativeInteger,
	nonNegativeNumber,
	positiveNumber,
	validateIncluded,
	validateKnownReference,
	validateReferenceArray
} from './shared';
import {
	validateIndustrialBuildingPlacement,
	validateIndustrialPlacementShape,
	validateRetailPlacement
} from './content';
import { canActivateRetailCity, overlapsFoundingStore } from './geometry';
import { validateRails } from './rails';

function validateStart(context: ValidationContext, value: unknown): void {
	const start = closedObject(context, value, 'start', START_KEYS);
	if (!start) return;
	const foundingStore = closedObject(
		context,
		start.foundingStore,
		'start.foundingStore',
		FOUNDING_STORE_KEYS
	);
	const setupRefs = new Set<string>();
	if (foundingStore) {
		if (nonEmptyString(context, foundingStore.ref, 'start.foundingStore.ref'))
			setupRefs.add(foundingStore.ref);
		if (validateRetailPlacement(context, foundingStore, 'start.foundingStore')) {
			context.activeRetailCityId = foundingStore.cityId as string;
		}
		validateIncluded(
			context,
			foundingStore.cityId,
			'start.foundingStore.cityId',
			context.content.cities
		);
		validateIncluded(
			context,
			foundingStore.archetypeId,
			'start.foundingStore.archetypeId',
			context.content.archetypes
		);
	}

	const occupiedByCity = new Map<string, Set<string>>();
	const buildings = arrayValue(context, start.industrialBuildings, 'start.industrialBuildings');
	if (buildings) {
		for (const [index, candidate] of buildings.entries()) {
			const path = `start.industrialBuildings[${index}]`;
			const building = closedObject(context, candidate, path, INDUSTRIAL_BUILDING_KEYS);
			if (!building) continue;
			if (nonEmptyString(context, building.ref, `${path}.ref`)) {
				if (setupRefs.has(building.ref))
					diagnostic(
						context,
						`${path}.ref`,
						'duplicate-reference',
						building.ref,
						`Duplicate setup ref: ${building.ref}.`
					);
				setupRefs.add(building.ref);
			}
			const authored = validateIndustrialPlacementShape(context, building, path, 'typeId');
			if (!authored) continue;
			authored.ref = typeof building.ref === 'string' ? building.ref : undefined;
			context.startBuildingPlacements.push(authored);
			authored.validPlacement = validateIndustrialBuildingPlacement(
				context,
				authored,
				occupiedByCity
			);
			validateIncluded(context, authored.cityId, `${path}.cityId`, context.content.cities);
			validateIncluded(context, authored.typeId, `${path}.typeId`, context.content.buildingTypes);
		}
	}

	validateRails(context, start.rails, occupiedByCity);
	validateOverrides(context, start.overrides, foundingStore, context.startBuildingPlacements);
}

function contentObject(context: ValidationContext): JsonObject | undefined {
	const content = context.definition?.content;
	return isObject(content) ? content : undefined;
}

function validateOverrides(
	context: ValidationContext,
	value: unknown,
	foundingStore: JsonObject | undefined,
	buildings: readonly AuthoredBuilding[]
): void {
	const overrides = closedObject(context, value, 'start.overrides', OVERRIDE_KEYS, []);
	if (!overrides) return;
	for (const key of ['cash', 'debt'] as const) {
		if (Object.hasOwn(overrides, key))
			nonNegativeInteger(context, overrides[key], `start.overrides.${key}`);
	}
	if (Object.hasOwn(overrides, 'policy')) validatePolicy(context, overrides.policy);
	if (Object.hasOwn(overrides, 'world')) validateWorldOverride(context, overrides.world);
	const targetLevels = validateStoreOverrides(context, overrides.stores, foundingStore);
	validateBuildingInventories(context, overrides.buildingInventories, buildings);
	validateCityInventoryMaterials(context, overrides.cityInventoryMaterials);
	validateRetailSupplyAssignments(context, overrides.retailSupplyAssignments);
	validateStoreCap(context, overrides.storeCap, foundingStore);
	validateAllowlistedProductUnlocks(context, foundingStore, targetLevels);
}

function validatePolicy(context: ValidationContext, value: unknown): void {
	const policy = closedObject(context, value, 'start.overrides.policy', POLICY_KEYS);
	if (!policy) return;
	for (const key of POLICY_KEYS) {
		if (!POLICY_VALUES[key].has(policy[key] as string)) {
			diagnostic(
				context,
				`start.overrides.policy.${key}`,
				'invalid-policy',
				policy[key],
				`Unsupported ${key} policy value.`
			);
		}
	}
}

function validateStoreOverrides(
	context: ValidationContext,
	value: unknown,
	foundingStore: JsonObject | undefined
): Map<string, { level: number; path: string; explicitLevel: boolean }> {
	const levels = new Map<string, { level: number; path: string; explicitLevel: boolean }>();
	if (value === undefined) return levels;
	const overrides = arrayValue(context, value, 'start.overrides.stores');
	if (!overrides) return levels;
	const seen = new Set<string>();
	for (const [index, candidate] of overrides.entries()) {
		const path = `start.overrides.stores[${index}]`;
		const override = closedObject(context, candidate, path, STORE_OVERRIDE_KEYS, ['storeRef']);
		if (!override) continue;
		const storeRef = override.storeRef;
		const validRef = nonEmptyString(context, storeRef, `${path}.storeRef`);
		if (validRef) {
			if (seen.has(storeRef))
				diagnostic(
					context,
					`${path}.storeRef`,
					'duplicate-reference',
					storeRef,
					`Duplicate store override for ${storeRef}.`
				);
			seen.add(storeRef);
			if (!foundingStore || storeRef !== foundingStore.ref) {
				diagnostic(
					context,
					`${path}.storeRef`,
					'invalid-reference',
					storeRef,
					'Store overrides must reference a store created earlier in setup.'
				);
			}
		}
		let targetLevel = 1;
		let explicitLevel = false;
		if (Object.hasOwn(override, 'targetLevel')) {
			if (
				typeof override.targetLevel !== 'number' ||
				!Number.isInteger(override.targetLevel) ||
				override.targetLevel < 1 ||
				override.targetLevel > MAX_STORE_LEVEL
			) {
				diagnostic(
					context,
					`${path}.targetLevel`,
					'invalid-target-level',
					override.targetLevel,
					`Target level must be an integer from 1 through ${MAX_STORE_LEVEL}.`
				);
			} else {
				targetLevel = override.targetLevel;
				explicitLevel = true;
			}
		}
		if (validRef) levels.set(storeRef, { level: targetLevel, path, explicitLevel });
		validateProductOverrides(context, override.products, path, foundingStore, targetLevel);
	}
	return levels;
}

function validateProductOverrides(
	context: ValidationContext,
	value: unknown,
	storePath: string,
	foundingStore: JsonObject | undefined,
	targetLevel: number
): void {
	if (value === undefined) return;
	const products = arrayValue(context, value, `${storePath}.products`);
	if (!products) return;
	const archetype = ARCHETYPES.find((candidate) => candidate.id === foundingStore?.archetypeId);
	const unlockedIds = new Set(
		archetype?.startingProductIds.slice(0, getUnlockedCategoryCount(targetLevel)) ?? []
	);
	const seen = new Set<string>();
	for (const [index, candidate] of products.entries()) {
		const path = `${storePath}.products[${index}]`;
		const product = closedObject(context, candidate, path, PRODUCT_OVERRIDE_KEYS);
		if (!product) continue;
		const productId = product.productId as ProductId;
		const validProduct = validateKnownReference(
			context,
			productId,
			`${path}.productId`,
			KNOWN_PRODUCT_IDS,
			'product'
		);
		if (validProduct) {
			if (seen.has(productId))
				diagnostic(
					context,
					`${path}.productId`,
					'duplicate-reference',
					productId,
					`Duplicate product override for ${productId}.`
				);
			seen.add(productId);
			if (!unlockedIds.has(productId))
				diagnostic(
					context,
					`${path}.productId`,
					'product-locked',
					productId,
					`Product ${productId} is not unlocked at target level ${targetLevel}.`
				);
			validateIncluded(context, productId, `${path}.productId`, context.content.products);
		}
		for (const key of ['stock', 'reorderThreshold', 'targetStock'] as const) {
			nonNegativeNumber(context, product[key], `${path}.${key}`);
		}
		positiveNumber(context, product.sellingPrice, `${path}.sellingPrice`);
		if (
			typeof product.reorderThreshold === 'number' &&
			typeof product.targetStock === 'number' &&
			product.reorderThreshold > product.targetStock
		) {
			diagnostic(
				context,
				`${path}.reorderThreshold`,
				'invalid-inventory-target',
				product.reorderThreshold,
				'Reorder threshold cannot exceed target stock.'
			);
		}
	}
}

function validateBuildingInventories(
	context: ValidationContext,
	value: unknown,
	buildings: readonly AuthoredBuilding[]
): void {
	if (value === undefined) return;
	const inventories = arrayValue(context, value, 'start.overrides.buildingInventories');
	if (!inventories) return;
	const byRef = new Map(buildings.map((building) => [building.ref, building]));
	const seen = new Set<string>();
	for (const [index, candidate] of inventories.entries()) {
		const path = `start.overrides.buildingInventories[${index}]`;
		const inventory = closedObject(context, candidate, path, BUILDING_INVENTORY_KEYS);
		if (!inventory) continue;
		const materials = validateMaterialRecord(
			context,
			inventory.materials,
			`${path}.materials`,
			true
		);
		if (nonEmptyString(context, inventory.buildingRef, `${path}.buildingRef`)) {
			if (seen.has(inventory.buildingRef))
				diagnostic(
					context,
					`${path}.buildingRef`,
					'duplicate-reference',
					inventory.buildingRef,
					`Duplicate building inventory for ${inventory.buildingRef}.`
				);
			seen.add(inventory.buildingRef);
			const building = byRef.get(inventory.buildingRef);
			if (!building)
				diagnostic(
					context,
					`${path}.buildingRef`,
					'invalid-reference',
					inventory.buildingRef,
					'Building inventories must reference a building created earlier in setup.'
				);
			else {
				const used = [...materials.values()].reduce((total, quantity) => total + quantity, 0);
				const capacity =
					INDUSTRIAL_BUILDING_TYPES[building.typeId as IndustrialBuildingTypeId]?.bufferCapacity ??
					0;
				if (used > capacity)
					diagnostic(
						context,
						`${path}.materials`,
						'building-inventory-capacity-exceeded',
						inventory.materials,
						`Building inventory uses ${used} units but capacity is ${capacity}.`
					);
			}
		}
	}
}

function validateMaterialRecord(
	context: ValidationContext,
	value: unknown,
	path: string,
	requireAllowed: boolean
): Map<string, number> {
	const result = new Map<string, number>();
	if (value === undefined) return result;
	if (!isObject(value)) {
		diagnostic(
			context,
			path,
			'invalid-object',
			value,
			`${path} must be a material quantity object.`
		);
		return result;
	}
	for (const [materialId, quantity] of Object.entries(value)) {
		const itemPath = `${path}.${materialId}`;
		if (!KNOWN_MATERIAL_IDS.has(materialId)) {
			diagnostic(
				context,
				itemPath,
				'invalid-reference',
				materialId,
				`Unknown material reference: ${materialId}.`
			);
			continue;
		}
		if (requireAllowed) validateIncluded(context, materialId, itemPath, context.content.materials);
		if (nonNegativeNumber(context, quantity, itemPath)) result.set(materialId, quantity);
	}
	return result;
}

function validateCityInventoryMaterials(context: ValidationContext, value: unknown): void {
	if (value === undefined) return;
	const overrides = arrayValue(context, value, 'start.overrides.cityInventoryMaterials');
	if (!overrides) return;
	const seenCityIds = new Set<string>();

	for (const [index, candidate] of overrides.entries()) {
		const path = `start.overrides.cityInventoryMaterials[${index}]`;
		const override = closedObject(context, candidate, path, CITY_INVENTORY_MATERIALS_KEYS);
		if (!override) continue;
		const cityId = override.cityId;
		const cityPath = `${path}.cityId`;
		const validCity = validateKnownReference(context, cityId, cityPath, KNOWN_CITY_IDS, 'city');
		if (validCity) {
			if (seenCityIds.has(cityId)) {
				diagnostic(
					context,
					cityPath,
					'duplicate-reference',
					cityId,
					`Duplicate city inventory override for ${cityId}.`
				);
			}
			seenCityIds.add(cityId);
			const city = getWorldCityDefinition(cityId);
			if (city?.kind !== 'industry') {
				diagnostic(
					context,
					cityPath,
					'invalid-city-inventory-city',
					cityId,
					'City inventory overrides require an industry city.'
				);
			} else if (!context.openedCityIds.has(cityId)) {
				diagnostic(
					context,
					cityPath,
					'city-inventory-city-closed',
					cityId,
					'City inventory overrides require an opened industry city.'
				);
			}
			validateIncluded(context, cityId, cityPath, context.content.cities);
		}

		validateCityInventoryMaterialRecord(context, override.materials, `${path}.materials`);
	}
}

function validateCityInventoryMaterialRecord(
	context: ValidationContext,
	value: unknown,
	path: string
): void {
	if (!isObject(value)) {
		diagnostic(
			context,
			path,
			'invalid-object',
			value,
			`${path} must be a material quantity object.`
		);
		return;
	}

	let total = 0;
	for (const [materialId, quantity] of Object.entries(value)) {
		const itemPath = `${path}.${materialId}`;
		if (!KNOWN_MATERIAL_IDS.has(materialId)) {
			diagnostic(
				context,
				itemPath,
				'invalid-reference',
				materialId,
				`Unknown material reference: ${materialId}.`
			);
			continue;
		}
		validateIncluded(context, materialId, itemPath, context.content.materials);
		if (!nonNegativeNumber(context, quantity, itemPath)) continue;
		if (!Number.isSafeInteger(quantity)) {
			diagnostic(
				context,
				itemPath,
				'invalid-city-inventory-quantity',
				quantity,
				'City inventory quantities must be non-negative safe integers.'
			);
			continue;
		}
		if (quantity > Number.MAX_SAFE_INTEGER - total) {
			diagnostic(
				context,
				path,
				'unsafe-city-inventory-total',
				value,
				'City inventory material totals must stay within the safe integer range.'
			);
			continue;
		}
		total += quantity;
	}
}

function validateRetailSupplyAssignments(context: ValidationContext, value: unknown): void {
	if (value === undefined) return;
	const assignments = arrayValue(context, value, 'start.overrides.retailSupplyAssignments');
	if (!assignments) return;
	const expectedRetailCityIds = [...context.openedCityIds].filter(
		(cityId) => getWorldCityDefinition(cityId)?.kind === 'retail'
	);
	const seenRetailCityIds = new Set<string>();

	for (const [index, candidate] of assignments.entries()) {
		const path = `start.overrides.retailSupplyAssignments[${index}]`;
		const assignment = closedObject(context, candidate, path, RETAIL_SUPPLY_ASSIGNMENT_KEYS);
		if (!assignment) continue;
		const ownerPath = `${path}.retailCityId`;
		const owner = assignment.retailCityId;
		const validOwner = validateKnownReference(context, owner, ownerPath, KNOWN_CITY_IDS, 'city');
		if (validOwner) {
			if (seenRetailCityIds.has(owner)) {
				diagnostic(
					context,
					ownerPath,
					'duplicate-reference',
					owner,
					`Duplicate retail supply assignment for ${owner}.`
				);
			}
			seenRetailCityIds.add(owner);
			const city = getWorldCityDefinition(owner);
			if (city?.kind !== 'retail') {
				diagnostic(
					context,
					ownerPath,
					'invalid-retail-supply-city',
					owner,
					'Retail supply assignments require a retail city owner.'
				);
			} else if (!context.openedCityIds.has(owner)) {
				diagnostic(
					context,
					ownerPath,
					'retail-supply-city-closed',
					owner,
					'Retail supply assignments require an opened retail city owner.'
				);
			}
			validateIncluded(context, owner, ownerPath, context.content.cities);
		}

		const supplyPath = `${path}.supplyCityId`;
		if (assignment.supplyCityId === null) continue;
		const source = assignment.supplyCityId;
		if (!validateKnownReference(context, source, supplyPath, KNOWN_CITY_IDS, 'city')) continue;
		const city = getWorldCityDefinition(source);
		if (city?.kind !== 'industry') {
			diagnostic(
				context,
				supplyPath,
				'invalid-supply-city',
				source,
				'Retail supply sources must be industry cities or null.'
			);
		} else if (!context.openedCityIds.has(source)) {
			diagnostic(
				context,
				supplyPath,
				'supply-city-closed',
				source,
				'Retail supply sources must be opened industry cities or null.'
			);
		}
		validateIncluded(context, source, supplyPath, context.content.cities);
	}

	const hasExpectedOwners =
		seenRetailCityIds.size === expectedRetailCityIds.length &&
		expectedRetailCityIds.every((cityId) => seenRetailCityIds.has(cityId));
	if (!hasExpectedOwners) {
		diagnostic(
			context,
			'start.overrides.retailSupplyAssignments',
			'missing-retail-supply-assignment',
			value,
			'Retail supply assignments must contain one record for every opened retail city.'
		);
	}
}

function validateWorldOverride(context: ValidationContext, value: unknown): void {
	const world = closedObject(context, value, 'start.overrides.world', WORLD_OVERRIDE_KEYS);
	if (!world) return;
	const revealed = validateReferenceArray(
		context,
		world.revealedCityIds,
		'start.overrides.world.revealedCityIds',
		KNOWN_CITY_IDS,
		'city'
	);
	const opened = validateReferenceArray(
		context,
		world.openedCityIds,
		'start.overrides.world.openedCityIds',
		KNOWN_CITY_IDS,
		'city'
	);
	context.revealedCityIds = revealed;
	context.openedCityIds = opened;
	for (const cityId of opened) {
		if (!revealed.has(cityId))
			diagnostic(
				context,
				'start.overrides.world.openedCityIds',
				'invalid-world-state',
				cityId,
				`Opened city ${cityId} must also be revealed.`
			);
	}
	validateWorldArrayInclusions(
		context,
		world.revealedCityIds,
		'start.overrides.world.revealedCityIds'
	);
	validateWorldArrayInclusions(context, world.openedCityIds, 'start.overrides.world.openedCityIds');
	for (const [key, kind] of [
		['activeRetailCityId', 'retail'],
		['activeIndustryCityId', 'industry']
	] as const) {
		const path = `start.overrides.world.${key}`;
		if (!validateKnownReference(context, world[key], path, KNOWN_CITY_IDS, 'city')) continue;
		const cityId = world[key] as string;
		if (key === 'activeRetailCityId') context.activeRetailCityId = cityId;
		if (getWorldCityDefinition(cityId)?.kind !== kind || !opened.has(cityId))
			diagnostic(
				context,
				path,
				'invalid-world-state',
				cityId,
				`Active ${kind} city must be an opened ${kind} city.`
			);
		validateIncluded(context, cityId, path, context.content.cities);
	}
}

function validateWorldArrayInclusions(
	context: ValidationContext,
	value: unknown,
	path: string
): void {
	if (!Array.isArray(value)) return;
	for (const [index, cityId] of value.entries()) {
		if (typeof cityId === 'string' && KNOWN_CITY_IDS.has(cityId)) {
			validateIncluded(context, cityId, `${path}[${index}]`, context.content.cities);
		}
	}
}

function validateStoreCap(
	context: ValidationContext,
	value: unknown,
	foundingStore: JsonObject | undefined
): void {
	const startingStoreCount = foundingStore ? 1 : 0;
	if (value === undefined) {
		if (!context.allowedCommands.has('openStore')) {
			context.storeCap = startingStoreCount;
			diagnostic(
				context,
				'start.overrides.storeCap',
				'invalid-store-cap',
				startingStoreCount,
				`When openStore is forbidden, the default store cap ${STARTER_STORE_CAP} must be overridden to the starting store count.`
			);
		} else {
			context.storeCap = STARTER_STORE_CAP;
		}
		return;
	}
	if (typeof value !== 'number' || !Number.isInteger(value) || value < startingStoreCount) {
		diagnostic(
			context,
			'start.overrides.storeCap',
			'invalid-store-cap',
			value,
			'Store cap must be an integer no lower than the starting store count.'
		);
		return;
	}
	context.storeCap = value;
	if (!context.allowedCommands.has('openStore') && value !== startingStoreCount) {
		diagnostic(
			context,
			'start.overrides.storeCap',
			'invalid-store-cap',
			value,
			'When openStore is forbidden, store cap must equal the starting store count.'
		);
	}
}

function validateAllowlistedProductUnlocks(
	context: ValidationContext,
	foundingStore: JsonObject | undefined,
	targetLevels: ReadonlyMap<string, { level: number; path: string; explicitLevel: boolean }>
): void {
	const upgradeAllowed = context.allowedCommands.has('upgradeStore');
	// Each reachable archetype instance pairs an archetype with the level it
	// can reach and the path to point at when its materialized products fall
	// outside the content boundary.
	interface ReachableInstance {
		archetypeId: string;
		reachableLevel: number;
		path: string;
	}
	const reachable: ReachableInstance[] = [];
	for (const archetype of ARCHETYPES) {
		if (!context.content.archetypes.has(archetype.id)) continue;
		const isFoundingArchetype = foundingStore?.archetypeId === archetype.id;
		const isOpenableArchetype =
			context.allowedCommands.has('openStore') &&
			context.storeCap > 1 &&
			context.permittedRetailPlacements.some(
				(placement) =>
					placement.archetypeId === archetype.id &&
					canActivateRetailCity(context, placement.cityId) &&
					!overlapsFoundingStore(context, placement, foundingStore)
			);
		if (!isFoundingArchetype && !isOpenableArchetype) continue;
		let reachableLevel = 1;
		let instancePath = 'start.foundingStore';
		if (isFoundingArchetype && typeof foundingStore.ref === 'string') {
			const override = targetLevels.get(foundingStore.ref);
			reachableLevel = override?.level ?? 1;
			if (override && override.explicitLevel) {
				instancePath = `${override.path}.targetLevel`;
			}
		}
		if (upgradeAllowed) reachableLevel = MAX_STORE_LEVEL;
		if (isFoundingArchetype) {
			reachable.push({ archetypeId: archetype.id, reachableLevel, path: instancePath });
		}
		if (!isOpenableArchetype) continue;
		for (const placement of context.permittedRetailPlacements) {
			if (placement.archetypeId !== archetype.id) continue;
			if (!canActivateRetailCity(context, placement.cityId)) continue;
			if (overlapsFoundingStore(context, placement, foundingStore)) continue;
			reachable.push({
				archetypeId: archetype.id,
				reachableLevel: upgradeAllowed ? MAX_STORE_LEVEL : 1,
				path: placement.path
			});
		}
	}

	for (const productId of context.content.products) {
		let available = false;
		for (const instance of reachable) {
			const archetype = ARCHETYPES.find((candidate) => candidate.id === instance.archetypeId)!;
			const index = archetype.startingProductIds.indexOf(productId);
			if (index < 0) continue;
			if (index < getUnlockedCategoryCount(instance.reachableLevel)) available = true;
		}
		if (!available) {
			const values = contentObject(context)?.productIds;
			const index = Array.isArray(values) ? values.indexOf(productId) : -1;
			diagnostic(
				context,
				`content.productIds[${Math.max(0, index)}]`,
				'product-locked',
				productId,
				`No allowed archetype can unlock ${productId} under the permitted commands.`
			);
		}
	}

	// Reverse check: every product a reachable archetype materializes must
	// be in the content allowlist. Without this, an upgradeStore path could
	// materialize a milestone product (e.g. snacks at level 4) that the
	// scenario never allowlisted, and simulateDay would still process it.
	const reported = new Set<string>();
	for (const instance of reachable) {
		const archetype = ARCHETYPES.find((candidate) => candidate.id === instance.archetypeId)!;
		const unlockedCount = getUnlockedCategoryCount(instance.reachableLevel);
		for (const productId of archetype.startingProductIds.slice(0, unlockedCount)) {
			if (context.content.products.has(productId)) continue;
			const key = `${instance.path}:${productId}`;
			if (reported.has(key)) continue;
			reported.add(key);
			diagnostic(
				context,
				instance.path,
				'product-not-allowlisted',
				productId,
				`Upgrade path materializes ${productId}, which is not in content.productIds.`
			);
		}
	}
}

export { validateStart };
