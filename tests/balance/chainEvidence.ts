import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARCHETYPES } from '$lib/game/archetypes';
import { getCompanyBookValue } from '$lib/game/companyBookValue';
import {
	getIndustrialBuildingTypesForProductChain,
	INDUSTRIAL_BUILDING_TYPES,
	MATERIALS,
	PRODUCTION_RECIPES
} from '$lib/game/industry';
import { PRODUCTS } from '$lib/game/products';
import { evaluateProgression } from '$lib/game/progression';
import type {
	ArchetypeId,
	IndustrialBuildingTypeId,
	MaterialId,
	ProductId,
	ProgressionTierId
} from '$lib/game/types';
import { runProgressionBot, type ProgressionRunResult } from './bots';

export interface ChainEvidenceOptions {
	seeds: number[];
	days: number;
	archetype: ArchetypeId;
	product: ProductId;
	costBuildings?: IndustrialBuildingTypeId[];
	output?: string;
}

function argsError(detail: string): never {
	throw new Error(`chain-evidence: ${detail}`);
}

function parsePositiveInteger(flag: string, raw: string): number {
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1) {
		argsError(`--${flag} expects a positive integer, got "${raw}".`);
	}
	return value;
}

export function parseChainEvidenceArgs(argv: readonly string[]): ChainEvidenceOptions {
	let seeds: number[] | undefined;
	let days: number | undefined;
	let archetype: ArchetypeId | undefined;
	let product: ProductId | undefined;
	let costBuildings: IndustrialBuildingTypeId[] | undefined;
	let output: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (
			flag !== '--seeds' &&
			flag !== '--days' &&
			flag !== '--archetype' &&
			flag !== '--product' &&
			flag !== '--cost-buildings' &&
			flag !== '--output'
		) {
			argsError(
				`unknown argument "${flag}". Expected --seeds, --days, --archetype, --product, --cost-buildings or --output.`
			);
		}
		const raw = argv[index + 1];
		if (raw === undefined) {
			argsError(`--${flag.slice(2)} requires a value.`);
		}
		index += 1;
		switch (flag) {
			case '--seeds':
				seeds = raw.split(',').map((part) => parsePositiveInteger('seeds', part.trim()));
				break;
			case '--days':
				days = parsePositiveInteger('days', raw.trim());
				break;
			case '--archetype':
				archetype = raw.trim() as ArchetypeId;
				break;
			case '--product':
				product = raw.trim() as ProductId;
				break;
			case '--cost-buildings':
				costBuildings = raw
					.split(',')
					.map((part) => part.trim() as IndustrialBuildingTypeId)
					.filter((part) => part.length > 0);
				break;
			case '--output':
				output = raw;
				if (output.length === 0) argsError('--output expects a file path.');
				break;
		}
	}

	if (!seeds)
		argsError('--seeds is required (comma-separated seeds; every run is seeded explicitly).');
	if (!days) argsError('--days is required (positive integer of simulated days per run).');
	if (!archetype) argsError('--archetype is required (the progression bot archetype to run).');
	if (!product) argsError('--product is required (an industry-linked stocked product).');
	const knownArchetypes = new Set(ARCHETYPES.map((entry) => entry.id));
	if (!knownArchetypes.has(archetype)) {
		argsError(`unknown archetype "${archetype}". Expected ${[...knownArchetypes].join(', ')}.`);
	}
	if (!Object.hasOwn(PRODUCTS, product)) {
		argsError(`unknown product "${product}".`);
	}
	if (PRODUCTS[product].productionMaterialId === null) {
		argsError(`product "${product}" has no productionMaterialId — no chain to measure.`);
	}
	for (const buildingTypeId of costBuildings ?? []) {
		if (!Object.hasOwn(INDUSTRIAL_BUILDING_TYPES, buildingTypeId)) {
			argsError(`unknown building type "${buildingTypeId}" in --cost-buildings.`);
		}
	}
	return {
		seeds,
		days,
		archetype,
		product,
		...(costBuildings === undefined ? {} : { costBuildings }),
		...(output === undefined ? {} : { output })
	};
}

export function chainMaterialIds(finishedMaterialId: MaterialId): MaterialId[] {
	const materialIds = new Set<MaterialId>([finishedMaterialId]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const recipe of Object.values(PRODUCTION_RECIPES)) {
			if (!recipe.outputs.some((output) => materialIds.has(output.materialId))) continue;
			for (const input of recipe.inputs) {
				if (!materialIds.has(input.materialId)) {
					materialIds.add(input.materialId);
					changed = true;
				}
			}
		}
	}
	return [...materialIds].sort();
}

export interface ChainBuildingEvidence {
	id: string;
	typeId: IndustrialBuildingTypeId;
	cityId: string;
	tileId: string;
	level: number;
	builtOnDay: number | null;
	chainBuilding: boolean;
	producedTotal: number;
	importedInputTotal: number;
	closingInventory: Record<string, number>;
	fixedOperatingCost: number;
	recipeOperatingEstimate: number;
}

export interface ChainRunEvidence {
	seed: number;
	claims: { tierId: ProgressionTierId; claimedOnDay: number }[];
	finalCash: number;
	finalDebt: number;
	finalBookValue: number;
	peakBookValue: number;
	storeCount: number;
	openedCityCount: number;
	product: {
		warehouseUnits: number;
		warehouseValue: number;
		importedUnits: number;
		importSpend: number;
		unitsSold: number;
		demandMissed: number;
		firstLocalDeliveryDay: number | null;
		localDeliveryDays: number;
	};
	chainMaterials: Record<
		string,
		{
			produced: number;
			importedInputQuantity: number;
			importedInputValue: number;
			railShipped: number;
			consumedLocal: number;
			consumedRail: number;
			consumedWarehouse: number;
			consumedImport: number;
			importCost: number;
			localValue: number;
		}
	>;
	otherProducedMaterials: Record<string, number>;
	otherImportedInputs: Record<string, number>;
	productionTotals: {
		operatingCost: number;
		importSpend: number;
		overflowCost: number;
	};
	buildings: ChainBuildingEvidence[];
	costScope: {
		buildingTypeIds: IndustrialBuildingTypeId[];
		fixedOperating: number;
		recipeOperatingEstimate: number;
	};
	plannerNoOpReasons: Record<string, number>;
	railFailureReasons: Record<string, number>;
	borrowCount: number;
	totalBorrowed: number;
	unclaimedTierGoalIds: Record<string, string[]>;
}

export function summarizeChainEvidence(
	seed: number,
	result: ProgressionRunResult,
	options: { days: number; product: ProductId; costBuildings: IndustrialBuildingTypeId[] }
): ChainRunEvidence {
	const { game, ledger, progression } = result;
	const product = PRODUCTS[options.product];
	const finishedMaterialId = product.productionMaterialId!;
	const materialIds = new Set(chainMaterialIds(finishedMaterialId));
	const chainBuildingTypeIds = new Set(
		getIndustrialBuildingTypesForProductChain(finishedMaterialId).map((type) => type.id)
	);

	const productEvidence = {
		warehouseUnits: 0,
		warehouseValue: 0,
		importedUnits: 0,
		importSpend: 0,
		unitsSold: 0,
		demandMissed: 0,
		firstLocalDeliveryDay: null as number | null,
		localDeliveryDays: 0
	};
	const producedByMaterial = new Map<MaterialId, number>();
	const importedInputQuantity = new Map<MaterialId, number>();
	const importedInputValue = new Map<MaterialId, number>();
	const consumedByMaterialSource = new Map<string, number>();
	const railShippedByMaterial = new Map<MaterialId, number>();
	let operatingCost = 0;
	let productionImportSpend = 0;
	let overflowCost = 0;

	for (const report of game.reports) {
		operatingCost += report.productionReport.operatingCost;
		productionImportSpend += report.productionReport.importSpend;
		overflowCost += report.productionReport.overflowCost;
		for (const movement of report.productionReport.produced) {
			producedByMaterial.set(
				movement.materialId,
				(producedByMaterial.get(movement.materialId) ?? 0) + movement.quantity
			);
		}
		for (const movement of report.productionReport.importedInputs) {
			importedInputQuantity.set(
				movement.materialId,
				(importedInputQuantity.get(movement.materialId) ?? 0) + movement.quantity
			);
			importedInputValue.set(
				movement.materialId,
				(importedInputValue.get(movement.materialId) ?? 0) + movement.value
			);
		}
		for (const movement of report.productionReport.consumed) {
			const key = `${movement.materialId}:${movement.source}`;
			consumedByMaterialSource.set(
				key,
				(consumedByMaterialSource.get(key) ?? 0) + movement.quantity
			);
		}
		for (const shipment of report.productionReport.railShipments) {
			railShippedByMaterial.set(
				shipment.materialId,
				(railShippedByMaterial.get(shipment.materialId) ?? 0) + shipment.quantity
			);
		}
		for (const store of report.storeReports) {
			for (const entry of store.productReports) {
				if (entry.productId !== options.product) continue;
				productEvidence.warehouseUnits += entry.warehouseUnits;
				productEvidence.warehouseValue += entry.warehouseValue;
				productEvidence.importedUnits += entry.importedUnits;
				productEvidence.importSpend += entry.importSpend;
				productEvidence.unitsSold += entry.unitsSold;
				productEvidence.demandMissed += entry.demandMissed;
				if (entry.warehouseUnits > 0) {
					productEvidence.localDeliveryDays += 1;
					if (productEvidence.firstLocalDeliveryDay === null) {
						productEvidence.firstLocalDeliveryDay = report.day;
					}
				}
			}
		}
	}

	const buildDayByTileId = new Map<string, number>();
	for (const action of ledger.actions) {
		if (
			action.outcome === 'applied' &&
			(action.action === 'progression:build-producer' ||
				action.action === 'progression:build-warehouse')
		) {
			const tileId = action.detail?.split(' on ')[1];
			if (tileId) buildDayByTileId.set(tileId, action.day);
		}
	}

	const buildings: ChainBuildingEvidence[] = game.industrialBuildings.map((building) => {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];
		const recipe = buildingType.recipeId ? PRODUCTION_RECIPES[buildingType.recipeId] : undefined;
		const builtOnDay = buildDayByTileId.get(building.tileId) ?? null;
		const daysAlive = builtOnDay === null ? 0 : options.days - builtOnDay + 1;
		const nominalOutput =
			recipe?.outputs.reduce((total, output) => total + output.quantity, 0) ?? 0;
		return {
			id: building.id,
			typeId: building.typeId,
			cityId: building.cityId,
			tileId: building.tileId,
			level: building.level,
			builtOnDay,
			chainBuilding: chainBuildingTypeIds.has(building.typeId),
			producedTotal: building.producedTotal,
			importedInputTotal: building.importedInputTotal,
			closingInventory: Object.fromEntries(
				Object.entries(building.inventory).filter(([, quantity]) => (quantity ?? 0) > 0)
			) as Record<string, number>,
			fixedOperatingCost:
				buildingType.recipeId === null ? 0 : daysAlive * buildingType.dailyOperatingCost,
			recipeOperatingEstimate:
				recipe && nominalOutput > 0
					? (recipe.operatingCost * building.producedTotal) / nominalOutput
					: 0
		};
	});

	const costBuildings = new Set(options.costBuildings);
	const scoped = buildings.filter((building) => costBuildings.has(building.typeId));
	const plannerNoOpReasons: Record<string, number> = {};
	const railFailureReasons: Record<string, number> = {};
	for (const action of ledger.actions) {
		if (action.action === 'progression:none' && action.detail?.startsWith(`${options.product}:`)) {
			const reason = action.detail.split(': ')[1]!;
			plannerNoOpReasons[reason] = (plannerNoOpReasons[reason] ?? 0) + 1;
		}
		if (action.action === 'progression:connect-rail' && action.outcome !== 'applied') {
			const code = action.detail?.match(/"code":"(\w+)"/)?.[1] ?? action.outcome;
			railFailureReasons[code] = (railFailureReasons[code] ?? 0) + 1;
		}
	}

	const evaluation = evaluateProgression(game);
	const unclaimedTierGoalIds: Record<string, string[]> = {};
	for (const tier of evaluation.tiers) {
		if (tier.claimed) continue;
		unclaimedTierGoalIds[tier.tier.id] = tier.goals
			.filter((goal) => !goal.passes)
			.map((goal) => goal.goal.id);
	}

	const chainMaterials: ChainRunEvidence['chainMaterials'] = {};
	for (const materialId of materialIds) {
		chainMaterials[materialId] = {
			produced: producedByMaterial.get(materialId) ?? 0,
			importedInputQuantity: importedInputQuantity.get(materialId) ?? 0,
			importedInputValue: importedInputValue.get(materialId) ?? 0,
			railShipped: railShippedByMaterial.get(materialId) ?? 0,
			consumedLocal: consumedByMaterialSource.get(`${materialId}:local`) ?? 0,
			consumedRail: consumedByMaterialSource.get(`${materialId}:rail`) ?? 0,
			consumedWarehouse: consumedByMaterialSource.get(`${materialId}:warehouse`) ?? 0,
			consumedImport: consumedByMaterialSource.get(`${materialId}:import`) ?? 0,
			importCost: MATERIALS[materialId].importCost,
			localValue: MATERIALS[materialId].localValue
		};
	}

	return {
		seed,
		claims: progression.claims.map((claim) => ({ ...claim })),
		finalCash: game.cash,
		finalDebt: game.finance.loans.reduce(
			(total, loan) => total + Math.max(0, loan.remainingPrincipal),
			0
		),
		finalBookValue: getCompanyBookValue(game).total,
		peakBookValue: game.reports.reduce(
			(peak, report) => Math.max(peak, report.companyBookValueAfter),
			0
		),
		storeCount: game.stores.length,
		openedCityCount: game.world.openedCityIds.length,
		product: productEvidence,
		chainMaterials,
		otherProducedMaterials: Object.fromEntries(
			[...producedByMaterial].filter(([materialId]) => !materialIds.has(materialId))
		),
		otherImportedInputs: Object.fromEntries(
			[...importedInputQuantity].filter(([materialId]) => !materialIds.has(materialId))
		),
		productionTotals: {
			operatingCost,
			importSpend: productionImportSpend,
			overflowCost
		},
		buildings,
		costScope: {
			buildingTypeIds: [...options.costBuildings].sort(),
			fixedOperating: scoped.reduce((total, building) => total + building.fixedOperatingCost, 0),
			recipeOperatingEstimate: scoped.reduce(
				(total, building) => total + building.recipeOperatingEstimate,
				0
			)
		},
		plannerNoOpReasons,
		railFailureReasons,
		borrowCount: progression.creditEvents.length,
		totalBorrowed: progression.creditEvents.reduce((total, event) => total + event.amount, 0),
		unclaimedTierGoalIds
	};
}

export function main(argv: readonly string[]): number {
	const options = parseChainEvidenceArgs(argv);
	const chainBuildingTypeIds = getIndustrialBuildingTypesForProductChain(
		PRODUCTS[options.product].productionMaterialId!
	).map((type) => type.id);
	const costBuildings = options.costBuildings ?? chainBuildingTypeIds;

	const runs = options.seeds.map((seed) =>
		summarizeChainEvidence(seed, runProgressionBot(options.archetype, seed, options.days), {
			days: options.days,
			product: options.product,
			costBuildings
		})
	);

	const tierClaimDays: Record<string, number[]> = {};
	for (const run of runs) {
		for (const claim of run.claims) {
			(tierClaimDays[claim.tierId] ??= []).push(claim.claimedOnDay);
		}
	}
	for (const days of Object.values(tierClaimDays)) days.sort((a, b) => a - b);

	const report = {
		config: {
			seeds: [...options.seeds].sort((a, b) => a - b),
			days: options.days,
			archetype: options.archetype,
			product: options.product,
			costBuildings: [...costBuildings].sort()
		},
		summary: {
			runs: runs.length,
			runsWithProductLocalDelivery: runs.filter((run) => run.product.warehouseUnits > 0).length,
			totalProductWarehouseUnits: runs.reduce(
				(total, run) => total + run.product.warehouseUnits,
				0
			),
			totalProductImportedUnits: runs.reduce((total, run) => total + run.product.importedUnits, 0),
			totalProductImportSpend: runs.reduce((total, run) => total + run.product.importSpend, 0),
			totalCostScopeFixedOperating: runs.reduce(
				(total, run) => total + run.costScope.fixedOperating,
				0
			),
			totalCostScopeRecipeOperatingEstimate: runs.reduce(
				(total, run) => total + run.costScope.recipeOperatingEstimate,
				0
			),
			tierClaimDays
		},
		runs
	};

	const outputBase = options.output ?? 'docs/balance/generated/chain-evidence';
	mkdirSync(dirname(outputBase), { recursive: true });
	writeFileSync(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`);
	console.log(
		`chain-evidence: ${runs.length} ${options.archetype} run(s) over ${options.seeds.length} seed(s) × ${options.days} days; ` +
			`${options.product} local units ${report.summary.totalProductWarehouseUnits}, imported ${report.summary.totalProductImportedUnits}; wrote ${outputBase}.json`
	);
	return 0;
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) {
	process.exit(main(process.argv.slice(2)));
}
