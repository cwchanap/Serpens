import {
	addCityInventoryMaterial,
	getCityInventory,
	removeCityInventoryMaterial
} from './cityInventory';
import { MATERIALS } from './industry';
import { getWorldCityDefinition } from './worldCatalog';
import type {
	DailyTransferArrival,
	GameState,
	MaterialId,
	TransferOrder,
	TransferOrderSource,
	WorldCityId
} from './types';

export const INTER_CITY_DISTANCE_PER_BAND = 25;

export interface InterCityTransferQuote {
	leadTimeDays: number;
	transportCostPerUnit: number;
	transportCost: number;
}

export interface ManualTransferInput {
	originCityId: string;
	destinationCityId: string;
	materialId: string;
	quantity: number;
}

export type ManualTransferFailure =
	| 'invalid-origin'
	| 'invalid-destination'
	| 'same-city'
	| 'invalid-material'
	| 'invalid-quantity'
	| 'insufficient-origin-stock'
	| 'insufficient-cash';

export type InterCityTransferQuoteResult =
	| { ok: true; quote: InterCityTransferQuote }
	| { ok: false; reason: ManualTransferFailure };

export type ManualTransferResult =
	| { ok: true; game: GameState; order: TransferOrder }
	| { ok: false; reason: ManualTransferFailure };

interface ValidManualTransfer {
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	quote: InterCityTransferQuote;
}

interface CreateDispatchedTransferInput {
	source: TransferOrderSource;
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	leadTimeDays: number;
	transportCost: number;
}

interface CreatedDispatchedTransfer {
	game: GameState;
	order: TransferOrder;
	transportCost: number;
}

export function quoteInterCityTransfer(
	game: GameState,
	input: ManualTransferInput
): InterCityTransferQuoteResult {
	const validation = validateManualTransfer(game, input);
	if (!validation.ok) {
		return validation;
	}

	if (game.cash < validation.transfer.quote.transportCost) {
		return { ok: false, reason: 'insufficient-cash' };
	}

	return { ok: true, quote: validation.transfer.quote };
}

export function dispatchManualTransfer(
	game: GameState,
	input: ManualTransferInput
): ManualTransferResult {
	const validation = validateManualTransfer(game, input);
	if (!validation.ok) {
		return validation;
	}

	const { transfer } = validation;
	if (game.cash < transfer.quote.transportCost) {
		return { ok: false, reason: 'insufficient-cash' };
	}

	const created = createDispatchedTransfer(game, {
		source: { kind: 'manual' },
		originCityId: transfer.originCityId,
		destinationCityId: transfer.destinationCityId,
		materialId: transfer.materialId,
		quantity: transfer.quantity,
		leadTimeDays: transfer.quote.leadTimeDays,
		transportCost: transfer.quote.transportCost
	});

	return {
		ok: true,
		game: { ...created.game, cash: created.game.cash - created.transportCost },
		order: created.order
	};
}

export function processTransferArrivals(
	game: GameState,
	day: number
): { game: GameState; arrivals: DailyTransferArrival[]; deliveredUnits: number } {
	const dueOrders = game.logistics.transferOrders
		.filter((order) => order.status === 'in-transit' && order.arrivalOnDay <= day)
		.sort(compareTransferOrderIds);

	if (dueOrders.length === 0) {
		return { game, arrivals: [], deliveredUnits: 0 };
	}

	let cityInventories = game.cityInventories;
	let deliveredUnits = 0;
	const arrivals: DailyTransferArrival[] = [];
	const deliveredOrderIds = new Set<string>();

	for (const order of dueOrders) {
		const destination = getCityInventory(game, order.destinationCityId);
		if (!destination.ok) {
			throw new Error(`Transfer arrival destination is invalid: ${destination.reason}`);
		}

		const currentInventory = cityInventories[destination.index]!;
		const nextInventory = addCityInventoryMaterial(
			currentInventory,
			order.materialId,
			order.quantity
		);
		cityInventories = cityInventories.map((inventory, index) =>
			index === destination.index ? nextInventory : inventory
		);
		deliveredUnits = checkedAdd(deliveredUnits, order.quantity, 'Delivered transfer units');
		deliveredOrderIds.add(order.id);
		arrivals.push({
			transferOrderId: order.id,
			originCityId: order.originCityId,
			destinationCityId: order.destinationCityId,
			materialId: order.materialId,
			quantity: order.quantity
		});
	}

	return {
		game: {
			...game,
			cityInventories,
			logistics: {
				...game.logistics,
				transferOrders: game.logistics.transferOrders.map((order) =>
					deliveredOrderIds.has(order.id) ? { ...order, status: 'delivered' } : order
				)
			}
		},
		arrivals,
		deliveredUnits
	};
}

function validateManualTransfer(
	game: GameState,
	input: ManualTransferInput
): { ok: true; transfer: ValidManualTransfer } | { ok: false; reason: ManualTransferFailure } {
	const origin = getCityInventory(game, input.originCityId);
	if (!origin.ok) {
		return { ok: false, reason: 'invalid-origin' };
	}

	const destination = getCityInventory(game, input.destinationCityId);
	if (!destination.ok) {
		return { ok: false, reason: 'invalid-destination' };
	}

	if (origin.inventory.cityId === destination.inventory.cityId) {
		return { ok: false, reason: 'same-city' };
	}

	if (!Object.hasOwn(MATERIALS, input.materialId)) {
		return { ok: false, reason: 'invalid-material' };
	}
	const materialId = input.materialId as MaterialId;

	if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
		return { ok: false, reason: 'invalid-quantity' };
	}

	const availableOriginStock = origin.inventory.materials[materialId] ?? 0;
	if (!Number.isSafeInteger(availableOriginStock) || availableOriginStock < input.quantity) {
		return { ok: false, reason: 'insufficient-origin-stock' };
	}

	const originCity = getWorldCityDefinition(origin.inventory.cityId)!;
	const destinationCity = getWorldCityDefinition(destination.inventory.cityId)!;
	const distance = Math.hypot(
		destinationCity.worldX - originCity.worldX,
		destinationCity.worldY - originCity.worldY
	);
	const band = Math.max(1, Math.ceil(distance / INTER_CITY_DISTANCE_PER_BAND));
	const transportCost = checkedMultiply(band, input.quantity);
	if (transportCost === null) {
		return { ok: false, reason: 'invalid-quantity' };
	}

	return {
		ok: true,
		transfer: {
			originCityId: origin.inventory.cityId,
			destinationCityId: destination.inventory.cityId,
			materialId,
			quantity: input.quantity,
			quote: {
				leadTimeDays: band,
				transportCostPerUnit: band,
				transportCost
			}
		}
	};
}

function createDispatchedTransfer(
	game: GameState,
	input: CreateDispatchedTransferInput
): CreatedDispatchedTransfer {
	const origin = getCityInventory(game, input.originCityId);
	if (!origin.ok) {
		throw new Error(`Transfer origin is invalid: ${origin.reason}`);
	}

	const nextTransferSequence = checkedAdd(
		game.logistics.nextTransferSequence,
		1,
		'Next transfer sequence'
	);
	const arrivalOnDay = checkedAdd(game.day, input.leadTimeDays, 'Transfer arrival day');
	const removal = removeCityInventoryMaterial(origin.inventory, input.materialId, input.quantity);
	if (removal.shortage !== 0) {
		throw new Error('Transfer origin stock changed before dispatch');
	}

	const order: TransferOrder = {
		id: `transfer-${game.logistics.nextTransferSequence}`,
		source: input.source,
		originCityId: input.originCityId,
		destinationCityId: input.destinationCityId,
		materialId: input.materialId,
		quantity: input.quantity,
		createdOnDay: game.day,
		dispatchedOnDay: game.day,
		arrivalOnDay,
		transportCost: input.transportCost,
		status: 'in-transit'
	};

	return {
		game: {
			...game,
			cityInventories: game.cityInventories.map((inventory, index) =>
				index === origin.index ? removal.inventory : inventory
			),
			logistics: {
				...game.logistics,
				transferOrders: [...game.logistics.transferOrders, order],
				nextTransferSequence
			}
		},
		order,
		transportCost: input.transportCost
	};
}

function compareTransferOrderIds(left: TransferOrder, right: TransferOrder): number {
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function checkedAdd(left: number, right: number, label: string): number {
	const sum = left + right;
	if (!Number.isSafeInteger(sum)) {
		throw new RangeError(`${label} exceeds the safe integer range`);
	}

	return sum;
}

function checkedMultiply(left: number, right: number): number | null {
	const product = left * right;
	return Number.isSafeInteger(product) ? product : null;
}
