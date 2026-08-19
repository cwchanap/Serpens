import { describe, expect, test } from 'vitest';
import { createTwoIndustryCityGame } from './interCityLogistics.testUtils';
import {
	applyManagerDelegations,
	removeManagerDelegation,
	setManagerDelegation
} from './managerDelegation';
import { createNewGame } from './state';
import type {
	DailyProductReport,
	DailyReport,
	DailyStoreReport,
	GameState,
	ManagerDelegation,
	ProductId,
	StaffMember,
	StoreProduct,
	WorldCityId
} from './types';

const MANAGER_ID = 'staff-store-1-manager-1';

function authority(
	overrides: Partial<ManagerDelegation['authority']> = {}
): ManagerDelegation['authority'] {
	return {
		pricing: true,
		inventory: true,
		staffing: true,
		supply: true,
		...overrides
	};
}

function delegation(overrides: Partial<ManagerDelegation> = {}): ManagerDelegation {
	return {
		managerId: MANAGER_ID,
		scope: { kind: 'store', storeId: 'store-1' },
		playbook: 'protect-margin',
		authority: authority(),
		enabled: true,
		...overrides
	};
}

function productReport(
	productId: ProductId,
	overrides: Partial<
		Pick<DailyProductReport, 'unitsSold' | 'demandMissed' | 'stockoutLostDemand'>
	> = {}
): DailyProductReport {
	return {
		productId,
		unitsSold: 0,
		demandMissed: 0,
		stockoutLostDemand: 0,
		...overrides
	} as DailyProductReport;
}

function storeReport(
	storeId: string,
	overrides: Partial<DailyStoreReport> = {},
	products: DailyProductReport[] = []
): DailyStoreReport {
	return {
		storeId,
		revenue: 100,
		grossMargin: 50,
		marketPosition: 70,
		stockHealth: 80,
		warnings: [],
		productReports: products,
		...overrides
	} as DailyStoreReport;
}

function withLatestReport(
	game: GameState,
	storeReports: DailyStoreReport[],
	operatingCashFlow = 100
): GameState {
	return {
		...game,
		reports: [{ day: game.day - 1, operatingCashFlow, storeReports } as DailyReport]
	};
}

function withProducts(game: GameState, products: StoreProduct[], storeId = 'store-1'): GameState {
	return {
		...game,
		stores: game.stores.map((store) =>
			store.id === storeId ? { ...store, products, stockHealth: 80 } : store
		)
	};
}

function product(
	productId: ProductId = 'bottled-water',
	overrides: Partial<StoreProduct> = {}
): StoreProduct {
	return {
		productId,
		lots: [{ receivedDay: 1, quantity: 0 }],
		reorderThreshold: 10,
		targetStock: 20,
		sellingPrice: 3,
		...overrides
	};
}

function addManager(game: GameState, id: string): GameState {
	const source = game.staff.find((member) => member.role === 'manager')!;
	const manager: StaffMember = { ...source, id, assignedStoreId: null };
	return { ...game, staff: [...game.staff, manager] };
}

function addStore(game: GameState, id: string): GameState {
	const source = game.stores[0]!;
	return {
		...game,
		stores: [
			...game.stores,
			{
				...source,
				id,
				name: id,
				tileId: `${source.tileId}-${id}`,
				products: source.products.map((item) => ({
					...item,
					lots: item.lots.map((lot) => ({ ...lot }))
				}))
			}
		]
	};
}

function lastRecord(game: GameState) {
	return game.managerActionHistory.at(-1)!;
}

describe('manager delegation configuration', () => {
	test('upserts one delegation per manager and removes it', () => {
		const game = createNewGame('convenience', 41);
		const first = setManagerDelegation(game, delegation());
		const updated = setManagerDelegation(
			first,
			delegation({ playbook: 'grow-market-share', authority: authority({ inventory: false }) })
		);
		const removed = removeManagerDelegation(updated, MANAGER_ID);

		expect(updated.managerDelegations).toEqual([
			{
				...delegation(),
				playbook: 'grow-market-share',
				authority: authority({ inventory: false })
			}
		]);
		expect(removed.managerDelegations).toEqual([]);
	});

	test('rejects an unknown manager, invalid scope, and store-scoped local supply', () => {
		const game = createNewGame('convenience', 42);
		const unknownManager = setManagerDelegation(game, delegation({ managerId: 'missing' }));
		const invalidStore = setManagerDelegation(
			game,
			delegation({ scope: { kind: 'store', storeId: 'missing-store' } })
		);
		const invalidSupplyScope = setManagerDelegation(
			game,
			delegation({ playbook: 'prefer-local-supply' })
		);

		expect(unknownManager).toBe(game);
		expect(invalidStore).toBe(game);
		expect(invalidSupplyScope).toBe(game);
	});
});

describe('manager proposals', () => {
	test('no enabled delegation is a strict no-op', () => {
		const game = createNewGame('convenience', 51);
		const disabled = { ...game, managerDelegations: [delegation({ enabled: false })] };
		const result = applyManagerDelegations(disabled);

		expect(result.game).toBe(disabled);
		expect(result.records).toEqual([]);
	});

	test('reports empty means no proposal or history row', () => {
		const game = { ...createNewGame('convenience', 52), managerDelegations: [delegation()] };
		const result = applyManagerDelegations(game);

		expect(result.game).toBe(game);
		expect(result.records).toEqual([]);
	});

	test('bounds manager history after appending all records for one day', () => {
		const base = withLatestReport(
			{
				...createNewGame('convenience', 521),
				managerDelegations: [delegation()],
				managerActionHistory: Array.from(
					{ length: 100 },
					(_, index) => ({ id: `old-${index}` }) as GameState['managerActionHistory'][number]
				)
			},
			[storeReport('store-1', { revenue: 100, grossMargin: 10 })]
		);
		const result = applyManagerDelegations(base);

		expect(result.game.managerActionHistory).toHaveLength(100);
		expect(result.game.managerActionHistory[0]?.id).toBe('old-1');
		expect(result.game.managerActionHistory.at(-1)?.id).toBe(result.records[0]?.id);
	});

	test('Grow Market Share uses the latest store report marketPosition', () => {
		const base = createNewGame('convenience', 53);
		const game: GameState = {
			...base,
			managerDelegations: [delegation({ playbook: 'grow-market-share' })],
			reports: [
				{
					day: 0,
					operatingCashFlow: 100,
					storeReports: [storeReport('store-1', { marketPosition: 20, stockHealth: 80 })]
				} as DailyReport,
				{
					day: 1,
					operatingCashFlow: 100,
					storeReports: [storeReport('store-1', { marketPosition: 70, stockHealth: 80 })]
				} as DailyReport
			]
		};

		const result = applyManagerDelegations(game);

		expect(result.records).toEqual([]);
		expect(result.game).toBe(game);
	});

	test('Stabilize Cash uses the latest DailyReport operatingCashFlow', () => {
		const base = withProducts(createNewGame('convenience', 54), [product()]);
		const game = withLatestReport(
			{ ...base, managerDelegations: [delegation({ playbook: 'stabilize-cash' })] },
			[storeReport('store-1', {}, [productReport('bottled-water', { unitsSold: 1 })])],
			100
		);

		const result = applyManagerDelegations(game);

		expect(result.records).toEqual([]);
		expect(result.game).toBe(game);
	});

	test('pricing and staffing already at target posture produce no proposal', () => {
		const premium = withLatestReport(
			{
				...createNewGame('convenience', 55),
				policy: { ...createNewGame('convenience', 55).policy, pricing: 'premium' },
				managerDelegations: [delegation()]
			},
			[storeReport('store-1', { revenue: 100, grossMargin: 10 })]
		);
		const service = withLatestReport(
			{
				...createNewGame('convenience', 56),
				policy: { ...createNewGame('convenience', 56).policy, staffing: 'service' },
				managerDelegations: [delegation({ playbook: 'protect-availability' })]
			},
			[storeReport('store-1', { warnings: [{ code: 'nearStaffCapacity', storeId: 'store-1' }] })]
		);

		const premiumResult = applyManagerDelegations(premium);
		const serviceResult = applyManagerDelegations(service);

		expect(premiumResult.records).toEqual([]);
		expect(serviceResult.records).toEqual([]);
	});

	test('Stabilize Cash suppresses an identical target floor proposal', () => {
		const base = withProducts(createNewGame('convenience', 57), [
			product('bottled-water', { reorderThreshold: 0, targetStock: 1 })
		]);
		const game = withLatestReport(
			{ ...base, managerDelegations: [delegation({ playbook: 'stabilize-cash' })] },
			[storeReport('store-1', {}, [productReport('bottled-water', { unitsSold: 0 })])],
			-1
		);

		const result = applyManagerDelegations(game);

		expect(result.records).toEqual([]);
		expect(result.game).toBe(game);
	});

	test('applies all five playbooks through their configured domains', () => {
		const cases: Array<{
			name: string;
			game: GameState;
			change: string;
			assertion: (result: ReturnType<typeof applyManagerDelegations>) => void;
		}> = [
			{
				name: 'Protect Margin pricing',
				game: withLatestReport(
					{ ...createNewGame('convenience', 58), managerDelegations: [delegation()] },
					[storeReport('store-1', { revenue: 100, grossMargin: 10 })]
				),
				change: 'pricing-policy',
				assertion: (result) =>
					expect(result.game.policyOverrides).toContainEqual({
						scope: { kind: 'store', storeId: 'store-1' },
						values: { pricing: 'premium' }
					})
			},
			{
				name: 'Protect Availability inventory',
				game: withLatestReport(
					{
						...withProducts(createNewGame('convenience', 59), [product()]),
						managerDelegations: [delegation({ playbook: 'protect-availability' })]
					},
					[storeReport('store-1', {}, [productReport('bottled-water', { stockoutLostDemand: 3 })])]
				),
				change: 'inventory-targets',
				assertion: (result) =>
					expect(result.game.stores[0]?.products[0]).toMatchObject({
						reorderThreshold: 11,
						targetStock: 22
					})
			},
			{
				name: 'Protect Availability staffing fallback',
				game: withLatestReport(
					{
						...createNewGame('convenience', 60),
						managerDelegations: [delegation({ playbook: 'protect-availability' })]
					},
					[
						storeReport(
							'store-1',
							{ warnings: [{ code: 'nearStaffCapacity', storeId: 'store-1' }] },
							[productReport('bottled-water')]
						)
					]
				),
				change: 'staffing-policy',
				assertion: (result) =>
					expect(result.game.policyOverrides).toContainEqual({
						scope: { kind: 'store', storeId: 'store-1' },
						values: { staffing: 'service' }
					})
			},
			{
				name: 'Grow Market Share pricing',
				game: withLatestReport(
					{
						...createNewGame('convenience', 61),
						managerDelegations: [delegation({ playbook: 'grow-market-share' })]
					},
					[storeReport('store-1', { marketPosition: 50, stockHealth: 80 })]
				),
				change: 'pricing-policy',
				assertion: (result) =>
					expect(result.game.policyOverrides).toContainEqual({
						scope: { kind: 'store', storeId: 'store-1' },
						values: { pricing: 'competitive' }
					})
			},
			{
				name: 'Stabilize Cash inventory',
				game: withLatestReport(
					{
						...withProducts(createNewGame('convenience', 62), [product()]),
						managerDelegations: [delegation({ playbook: 'stabilize-cash' })]
					},
					[storeReport('store-1', {}, [productReport('bottled-water', { unitsSold: 1 })])],
					-1
				),
				change: 'inventory-targets',
				assertion: (result) =>
					expect(result.game.stores[0]?.products[0]).toMatchObject({
						reorderThreshold: 9,
						targetStock: 18
					})
			}
		];

		for (const testCase of cases) {
			const result = applyManagerDelegations(testCase.game);
			expect(testCase.change).toBe(result.records[0]?.change.kind);
			testCase.assertion(result);
			expect(result.records[0]?.outcome).toBe('applied');
		}

		expect(cases).toHaveLength(5);
	});

	test('Prefer Local Supply applies only a city supply assignment', () => {
		const game = withLatestReport(
			{
				...createTwoIndustryCityGame({ seed: 63, materials: false }),
				cityInventories: [
					{ cityId: 'industry-city', materials: { 'bottled-water': 20 } },
					{ cityId: 'breadbasket-basin', materials: {} }
				],
				retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: null }],
				managerDelegations: [
					delegation({
						scope: { kind: 'city', cityId: 'harbor-city' },
						playbook: 'prefer-local-supply'
					})
				]
			},
			[],
			0
		);

		const result = applyManagerDelegations(game);

		expect(result.game.policyOverrides).toEqual([]);
		expect(result.game.retailSupplyAssignments).toContainEqual({
			retailCityId: 'harbor-city',
			supplyCityId: 'industry-city'
		});
		expect(result.records[0]?.change.kind).toBe('supply-source');
	});
});

describe('manager authority', () => {
	const cases: Array<{
		playbook: ManagerDelegation['playbook'];
		authority: ManagerDelegation['authority'];
		game: GameState;
	}> = [
		{
			playbook: 'protect-margin',
			authority: authority({ pricing: false }),
			game: withLatestReport(createNewGame('convenience', 70), [
				storeReport('store-1', { revenue: 100, grossMargin: 10 })
			])
		},
		{
			playbook: 'protect-availability',
			authority: authority({ inventory: false }),
			game: withLatestReport(withProducts(createNewGame('convenience', 71), [product()]), [
				storeReport('store-1', {}, [productReport('bottled-water', { stockoutLostDemand: 2 })])
			])
		},
		{
			playbook: 'protect-availability',
			authority: authority({ staffing: false }),
			game: withLatestReport(createNewGame('convenience', 72), [
				storeReport('store-1', { warnings: [{ code: 'nearStaffCapacity', storeId: 'store-1' }] })
			])
		},
		{
			playbook: 'grow-market-share',
			authority: authority({ pricing: false }),
			game: withLatestReport(createNewGame('convenience', 73), [
				storeReport('store-1', { marketPosition: 20, stockHealth: 80 })
			])
		},
		{
			playbook: 'stabilize-cash',
			authority: authority({ inventory: false }),
			game: withLatestReport(
				withProducts(createNewGame('convenience', 74), [product()]),
				[storeReport('store-1', {}, [productReport('bottled-water', { unitsSold: 1 })])],
				-1
			)
		},
		{
			playbook: 'prefer-local-supply',
			authority: authority({ supply: false }),
			game: withLatestReport(
				{
					...createTwoIndustryCityGame({ seed: 75, materials: false }),
					cityInventories: [
						{ cityId: 'industry-city', materials: { 'bottled-water': 20 } },
						{ cityId: 'breadbasket-basin', materials: {} }
					],
					retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: null }]
				},
				[],
				0
			)
		}
	];

	test.each(cases)(
		'$playbook requires its configured authority domain',
		({ playbook, authority: configured, game }) => {
			const delegationScope =
				playbook === 'prefer-local-supply'
					? { kind: 'city' as const, cityId: 'harbor-city' as WorldCityId }
					: { kind: 'store' as const, storeId: 'store-1' };
			const result = applyManagerDelegations({
				...game,
				managerDelegations: [
					delegation({ playbook, authority: configured, scope: delegationScope })
				]
			});

			expect(result.records[0]?.outcome).toBe('out-of-authority');
			expect(result.records[0]?.reason).toBe('authority-disabled');
			expect(result.game.policyOverrides).toEqual(game.policyOverrides);
		}
	);
});

describe('manager scope and conflict resolution', () => {
	test('city-scope store playbooks expand to store writes, not city overrides', () => {
		let game = addStore(createNewGame('convenience', 80), 'store-2');
		game = withLatestReport(
			{
				...game,
				managerDelegations: [delegation({ scope: { kind: 'city', cityId: 'harbor-city' } })]
			},
			[
				storeReport('store-2', { revenue: 100, grossMargin: 10 }),
				storeReport('store-1', { revenue: 100, grossMargin: 10 })
			]
		);

		const result = applyManagerDelegations(game);

		expect(result.game.policyOverrides.map((override) => override.scope)).toEqual([
			{ kind: 'store', storeId: 'store-1' },
			{ kind: 'store', storeId: 'store-2' }
		]);
		expect(result.game.policyOverrides.some((override) => override.scope.kind === 'city')).toBe(
			false
		);
		expect(result.records.map((record) => record.conflictKey)).toEqual([
			'pricing:store-1',
			'pricing:store-2'
		]);
	});

	test('store scope beats city scope on the same conflict key', () => {
		let game = addManager(createNewGame('convenience', 81), 'manager-store');
		game = withLatestReport(
			{
				...game,
				managerDelegations: [
					delegation({ managerId: 'manager-city', scope: { kind: 'city', cityId: 'harbor-city' } }),
					delegation({ managerId: 'manager-store', scope: { kind: 'store', storeId: 'store-1' } })
				]
			},
			[storeReport('store-1', { revenue: 100, grossMargin: 10 })]
		);

		const result = applyManagerDelegations(game);
		const cityRecord = result.records.find((record) => record.managerId === 'manager-city')!;
		const storeRecord = result.records.find((record) => record.managerId === 'manager-store')!;

		expect(storeRecord.outcome).toBe('applied');
		expect(cityRecord.outcome).toBe('overridden');
		expect(cityRecord.reason).toBe('conflict-lost');
	});

	test('equal specificity uses managerId ascending and records the loser', () => {
		let game = addManager(createNewGame('convenience', 82), 'manager-a');
		game = addManager(game, 'manager-z');
		game = withLatestReport(
			{
				...game,
				managerDelegations: [
					delegation({ managerId: 'manager-z' }),
					delegation({ managerId: 'manager-a' })
				]
			},
			[storeReport('store-1', { revenue: 100, grossMargin: 10 })]
		);

		const result = applyManagerDelegations(game);
		const winner = result.records.find((record) => record.managerId === 'manager-a')!;
		const loser = result.records.find((record) => record.managerId === 'manager-z')!;

		expect(winner.outcome).toBe('applied');
		expect(loser.outcome).toBe('overridden');
		expect(result.game.policyOverrides).toHaveLength(1);
	});
});

describe('truthful manager application', () => {
	test('records actual inventory values when they equal the proposal', () => {
		const game = withLatestReport(
			{
				...withProducts(createNewGame('convenience', 90), [product()]),
				managerDelegations: [delegation({ playbook: 'protect-availability' })]
			},
			[storeReport('store-1', {}, [productReport('bottled-water', { stockoutLostDemand: 1 })])]
		);

		const result = applyManagerDelegations(game);
		const record = lastRecord(result.game);

		expect(record.outcome).toBe('applied');
		expect(record.change.applied).toEqual({ reorderThreshold: 11, targetStock: 22 });
		expect(record.change.applied).toEqual(record.change.proposed);
	});

	test('records normalized inventory values rather than proposed values', () => {
		const game = withLatestReport(
			{
				...withProducts(createNewGame('convenience', 91), [
					product('bottled-water', { reorderThreshold: 10.1, targetStock: 10 })
				]),
				managerDelegations: [delegation({ playbook: 'protect-availability' })]
			},
			[storeReport('store-1', {}, [productReport('bottled-water', { stockoutLostDemand: 1 })])]
		);

		const result = applyManagerDelegations(game);
		const record = lastRecord(result.game);

		expect(record.outcome).toBe('applied');
		expect(record.change.proposed).toEqual({ reorderThreshold: 12, targetStock: 11 });
		expect(record.change.applied).toEqual({ reorderThreshold: 12, targetStock: 12 });
	});

	test('rejects a transition whose actual inventory values equal before', () => {
		const max = Number.MAX_SAFE_INTEGER;
		const game = withLatestReport(
			{
				...withProducts(createNewGame('convenience', 92), [
					product('bottled-water', { reorderThreshold: max, targetStock: max })
				]),
				managerDelegations: [delegation({ playbook: 'protect-availability' })]
			},
			[storeReport('store-1', {}, [productReport('bottled-water', { stockoutLostDemand: 1 })])]
		);

		const result = applyManagerDelegations(game);
		const record = lastRecord(result.game);

		expect(record.outcome).toBe('rejected');
		expect(record.reason).toBe('transition-rejected');
		expect(record.change.applied).toBeNull();
	});

	test('rejects a supply transition when setRetailSupplySource reports invalid', () => {
		const game = withLatestReport(
			{
				...createTwoIndustryCityGame({ seed: 94, materials: false }),
				cities: [],
				cityInventories: [
					{ cityId: 'industry-city', materials: { 'bottled-water': 20 } },
					{ cityId: 'breadbasket-basin', materials: {} }
				],
				retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: null }],
				managerDelegations: [
					delegation({
						scope: { kind: 'city', cityId: 'harbor-city' },
						playbook: 'prefer-local-supply'
					})
				]
			},
			[],
			0
		);

		const result = applyManagerDelegations(game);

		expect(result.records[0]?.outcome).toBe('rejected');
		expect(result.records[0]?.reason).toBe('transition-rejected');
		expect(result.records[0]?.change.applied).toBeNull();
	});

	test('does not create an applied supply record when the transition reports unchanged', () => {
		const game = withLatestReport(
			{
				...createTwoIndustryCityGame({ seed: 93, materials: false }),
				cityInventories: [
					{ cityId: 'industry-city', materials: { 'bottled-water': 20 } },
					{ cityId: 'breadbasket-basin', materials: {} }
				],
				retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }],
				managerDelegations: [
					delegation({
						scope: { kind: 'city', cityId: 'harbor-city' },
						playbook: 'prefer-local-supply'
					})
				]
			},
			[],
			0
		);

		const result = applyManagerDelegations(game);

		expect(result.records).toEqual([]);
		expect(result.game).toBe(game);
	});
});
