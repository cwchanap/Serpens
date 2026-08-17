import type { DecisionContext } from './decisionContext';

export type ArchetypeId = 'convenience' | 'boutique' | 'electronics' | 'grocery';
export type ProductFamilyId =
	| 'beverages'
	| 'convenience-goods'
	| 'fashion'
	| 'electronics'
	| 'grocery-food';
export type ProductId =
	| 'bottled-water'
	| 'soft-drinks'
	| 'snacks'
	| 'essentials'
	| 'household'
	| 'apparel'
	| 'home-goods'
	| 'gifts'
	| 'fashion-accessories'
	| 'games'
	| 'accessories'
	| 'devices'
	| 'peripherals'
	| 'produce'
	| 'pantry'
	| 'prepared'
	| 'bakery';
export type PricingPosture = 'discount' | 'competitive' | 'standard' | 'premium';
export type InventoryBuffer = 'lean' | 'balanced' | 'generous';
export type StaffingPosture = 'minimal' | 'efficient' | 'service';
export type StaffRole = 'manager' | 'general';
export type MarketingFocus = 'none' | 'awareness' | 'promotions' | 'loyalty';
export type ServicePriority = 'speed' | 'balanced' | 'highTouch';
export type ScoreKey = 'profit' | 'customerSatisfaction' | 'staffMorale' | 'marketPosition';

export type StructuredCopyParams = Readonly<Record<string, string | number>>;
export interface StructuredCopyRef {
	key: string;
	params: StructuredCopyParams;
}

export type EventTarget = { kind: 'company' } | { kind: 'recurring-route'; routeId: string };
export type EventTargetSelector =
	| { kind: 'company' }
	| { kind: 'recurring-route'; state: 'active' };

export type EventCondition =
	| { kind: 'always' }
	| { kind: 'all'; conditions: readonly EventCondition[] }
	| { kind: 'day-at-least'; day: number }
	| { kind: 'cash-below'; amount: number }
	| { kind: 'cash-at-least'; amount: number }
	| { kind: 'score-at-least'; score: ScoreKey; value: number }
	| { kind: 'store-count-below-cap' };

export type EventSelectionPolicy =
	| { kind: 'forced'; priority: number }
	| { kind: 'weighted'; weight: number };

export type EventImmediateEffect =
	| { kind: 'cash-adjust'; amount: number }
	| { kind: 'score-adjust'; score: ScoreKey; amount: number }
	| { kind: 'store-morale-adjust'; scope: 'all-stores'; amount: number }
	| { kind: 'store-stock-adjust-by-target-percent'; scope: 'all-stores'; percent: number }
	| {
			kind: 'finance-borrow';
			purpose: 'emergency' | 'supplierCredit';
			amount: number;
			termDays: 28 | 56;
	  };

export type EventTimedEffect =
	| {
			kind: 'import-cost-multiplier';
			scope: 'retail-product';
			target: { kind: 'all' };
			multiplier: number;
	  }
	| { kind: 'route-lead-time-adjustment'; days: number }
	| { kind: 'route-capacity-multiplier'; multiplier: number }
	| { kind: 'route-dispatch-suspension' }
	| { kind: 'route-transport-cost-multiplier'; multiplier: number };

export interface EventModifierTemplate {
	durationDays: number;
	stackingKey: string;
	stackingRule: 'replace';
	effect: EventTimedEffect;
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}

export interface ActiveEventModifier {
	id: string;
	source: { eventId: string; instanceId: string; optionId: string };
	target: EventTarget;
	startsOnDay: number;
	expiresOnDay: number;
	stackingKey: string;
	stackingRule: 'replace';
	effect: EventTimedEffect;
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}

/** The route-modifier fields the effective-route resolver reads: identity,
 * target, activity window, effect, and evidence copy. Structural subset of
 * {@link ActiveEventModifier} so planner projections can pass copied
 * modifiers without widening casts. */
export type RouteModifierInput = Pick<
	ActiveEventModifier,
	'id' | 'source' | 'target' | 'startsOnDay' | 'expiresOnDay' | 'effect' | 'explanation'
>;

export interface EventModifierSnapshot {
	readonly id: string;
	readonly source: Readonly<ActiveEventModifier['source']>;
	readonly target: Readonly<EventTarget>;
	readonly startsOnDay: number;
	readonly expiresOnDay: number;
	readonly stackingKey: string;
	readonly effect: Readonly<EventTimedEffect>;
	readonly explanation: Readonly<StructuredCopyRef>;
	readonly importance: 'normal' | 'important';
}

export interface EventModifierImpact {
	modifierId: string;
	source: ActiveEventModifier['source'];
	target: EventTarget;
	effectKind: 'import-cost-multiplier';
	explanation: StructuredCopyRef;
	scope: 'retail-product';
	affectedIds: string[];
	multiplier: number;
	resolvedMultiplier: number;
	baselineCost: number;
	actualCost: number;
	applicationCount: number;
}

export interface EventModifierLifecycle {
	status: 'activated' | 'replaced' | 'expired';
	modifier: EventModifierSnapshot;
	replacedByModifierId?: string;
}
export type NeighborhoodId =
	| 'downtown'
	| 'campus'
	| 'residential'
	| 'mall'
	| 'transit'
	| 'industrial'
	| 'suburb'
	| 'parkEdge';
export type TerrainId = 'commercial' | 'residential' | 'green' | 'transit' | 'industrial';
export type CityTileFeature = 'road' | 'river' | null;
export type MaterialId =
	| 'grain'
	| 'salt'
	| 'oilseeds'
	| 'water'
	| 'fruit'
	| 'sugar'
	| 'pulpwood'
	| 'chemical-feedstock'
	| 'flour'
	| 'cooking-oil'
	| 'filtered-water'
	| 'syrup'
	| 'paper-pulp'
	| 'plastic'
	| 'packaging'
	| 'cleaning-base'
	| 'snacks'
	| 'drinks'
	| 'essentials'
	| 'gifts'
	| 'bottled-water'
	| 'produce'
	| 'pantry';
export type MaterialKind = 'raw' | 'intermediate' | 'finished';
export type IndustryTerrainId =
	| 'farmland'
	| 'forest'
	| 'water'
	| 'deposit'
	| 'industrial'
	| 'blocked';
export type IndustryResourceId =
	| 'grain-field'
	| 'salt-deposit'
	| 'oilseed-field'
	| 'water-source'
	| 'fruit-orchard'
	| 'sugar-field'
	| 'pulpwood-forest'
	| 'chemical-feedstock';
export type WorldCityId =
	| 'harbor-city'
	| 'campus-junction'
	| 'garden-borough'
	| 'industry-city'
	| 'breadbasket-basin'
	| 'quarry-works';
export type WorldCityKind = 'retail' | 'industry';
export type WorldCityState = 'opened' | 'revealed' | 'locked';
export type WorldMilestoneId =
	| 'reveal-campus-junction'
	| 'reveal-breadbasket-basin'
	| 'reveal-garden-borough'
	| 'reveal-quarry-works'
	| 'positive-income-store-cap';

export interface WorldProgress {
	revealedCityIds: WorldCityId[];
	openedCityIds: WorldCityId[];
	claimedMilestoneIds: WorldMilestoneId[];
}

export type RetailDemandProfile = Partial<Record<ProductId, number>>;

export interface IndustryResourceProfile {
	resourceIds: IndustryResourceId[];
	industrialBias: number;
}

export interface WorldCityDefinition {
	id: WorldCityId;
	name: string;
	kind: WorldCityKind;
	worldX: number;
	worldY: number;
	seed: number;
	openingCost: number;
	initiallyOpened: boolean;
	unlockRequirement: string;
	specialtySummary: string;
	storeCapBonus: number;
	retailDemandProfile: RetailDemandProfile;
	industryResourceProfile: IndustryResourceProfile | null;
}
export type IndustrialBuildingTypeId =
	| 'grain-farm'
	| 'salt-mine'
	| 'oilseed-farm'
	| 'water-pump'
	| 'fruit-farm'
	| 'sugar-farm'
	| 'pulpwood-grove'
	| 'chemical-feedstock-well'
	| 'flour-mill'
	| 'oil-press'
	| 'water-filtration-plant'
	| 'syrup-plant'
	| 'pulp-mill'
	| 'plastic-plant'
	| 'packaging-plant'
	| 'chemical-plant'
	| 'snack-factory'
	| 'drink-bottling-plant'
	| 'household-goods-factory'
	| 'gift-workshop'
	| 'water-bottler'
	| 'produce-packhouse'
	| 'pantry-works'
	| 'warehouse';
export type ProductionRecipeId =
	| 'grain-harvest'
	| 'salt-mining'
	| 'oilseed-harvest'
	| 'water-pumping'
	| 'fruit-harvest'
	| 'sugar-harvest'
	| 'pulpwood-harvest'
	| 'chemical-feedstock-extraction'
	| 'flour-milling'
	| 'oil-pressing'
	| 'water-filtration'
	| 'syrup-production'
	| 'pulp-milling'
	| 'plastic-production'
	| 'packaging-production'
	| 'cleaning-base-production'
	| 'snack-production'
	| 'drink-bottling'
	| 'household-goods-production'
	| 'gift-production'
	| 'water-bottling'
	| 'produce-packing'
	| 'pantry-goods-production';

export interface MaterialDefinition {
	id: MaterialId;
	name: string;
	kind: MaterialKind;
	importCost: number;
	localValue: number;
}

export interface MaterialQuantity {
	materialId: MaterialId;
	quantity: number;
}

export interface RailCell {
	x: number;
	y: number;
	level: number; // capacity per day, 1..RAIL_MAX_LEVEL
}

export interface RailShipment {
	cityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	value: number;
	kind: 'pull-producer' | 'pull-warehouse' | 'push-warehouse';
	fromId: string; // source building id
	toId: string; // destination building id
}

export interface IndustryTile {
	id: string;
	cityId: string;
	x: number;
	y: number;
	terrain: IndustryTerrainId;
	resource: IndustryResourceId | null;
	locked: boolean;
}

export interface IndustryCity {
	id: string;
	name: string;
	width: number;
	height: number;
	tiles: IndustryTile[];
	rails: RailCell[];
}

export interface ProductionRecipe {
	id: ProductionRecipeId;
	inputs: MaterialQuantity[];
	outputs: MaterialQuantity[];
	operatingCost: number;
	stage: 'raw' | 'process' | 'final';
}

/**
 * Build-menu/chart grouping only — no gameplay gating. 1 = tier-1 chain
 * buildings (cheap onboarding chains), 2 = deep-chain raw/process
 * buildings, 3 = deep-chain final factories. A building shared by a tier-1
 * and a deeper chain takes the lower tier.
 */
export type BuildingTier = 1 | 2 | 3;

export interface IndustrialBuildingType {
	id: IndustrialBuildingTypeId;
	name: string;
	buildCost: number;
	dailyOperatingCost: number;
	requiredResource: IndustryResourceId | null;
	requiresIndustrialTile: boolean;
	recipeId: ProductionRecipeId | null;
	warehouseCapacity: number;
	bufferCapacity: number;
	tier: BuildingTier;
}

export interface DailyMaterialMovement {
	cityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	value: number;
	source: 'local' | 'import' | 'warehouse' | 'overflow' | 'rail';
}

export interface DailyCityInventorySummary {
	cityId: WorldCityId;
	capacity: number;
	used: number;
	overflowUnits: number;
	overflowCost: number;
}

export interface DailyProductionReport {
	produced: DailyMaterialMovement[];
	consumed: DailyMaterialMovement[];
	importedInputs: DailyMaterialMovement[];
	warehousePulls: DailyMaterialMovement[];
	shopImports: DailyMaterialMovement[];
	importSpend: number;
	operatingCost: number;
	overflowUnits: number;
	overflowCost: number;
	warehouseCapacity: number;
	warehouseUsed: number;
	railShipments: RailShipment[];
	railUsage: Record<string, number>;
	/** Required production-close snapshot in normalized current state. */
	cityInventories: DailyCityInventorySummary[];
}

export interface CityInventory {
	cityId: WorldCityId;
	materials: Partial<Record<MaterialId, number>>;
}

export interface CityInventoryStats {
	capacity: number;
	used: number;
	overflowUnits: number;
	overflowCost: number;
}

export interface RetailSupplyAssignment {
	retailCityId: WorldCityId;
	supplyCityId: WorldCityId | null;
}

export type TransferOrderSource = { kind: 'manual' } | { kind: 'recurring-route'; routeId: string };

export interface TransferOrder {
	id: string;
	source: TransferOrderSource;
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	createdOnDay: number;
	dispatchedOnDay: number;
	arrivalOnDay: number;
	transportCost: number;
	status: 'in-transit' | 'delivered';
}

export interface DailyTransferArrival {
	transferOrderId: string;
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
}

export interface RouteDispatchModifierContributor {
	modifierId: string;
	source: ActiveEventModifier['source'];
	explanation: StructuredCopyRef;
}

interface RouteDispatchImpactBase {
	contributors: RouteDispatchModifierContributor[];
}

/**
 * Compact persisted evidence of how active route modifiers changed one
 * dispatch attempt. Unaffected attempts store `[]`. Contributors are ordered
 * by modifier ID; multiple modifiers of one effect kind share one impact row.
 */
export type RouteDispatchModifierImpact =
	| (RouteDispatchImpactBase & {
			effectKind: 'route-lead-time-adjustment';
			baselineLeadTimeDays: number;
			effectiveLeadTimeDays: number;
	  })
	| (RouteDispatchImpactBase & {
			effectKind: 'route-capacity-multiplier';
			baselineCapacity: number;
			effectiveCapacity: number;
			baselineDispatchedQuantity: number;
			effectiveDispatchedQuantity: number;
	  })
	| (RouteDispatchImpactBase & {
			effectKind: 'route-dispatch-suspension';
			baselineDispatchedQuantity: number;
			effectiveDispatchedQuantity: 0;
	  })
	| (RouteDispatchImpactBase & {
			effectKind: 'route-transport-cost-multiplier';
			baselineTransportCost: number;
			effectiveTransportCost: number;
	  });

export interface DailyRouteDispatchAttempt {
	routeId: string;
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	destinationNeed: number;
	/** Effective capacity: base capacity composed with active route modifiers. */
	capacity: number;
	availableOriginStock: number;
	dispatchedQuantity: number;
	unusedCapacity: number;
	unmetDestinationNeed: number;
	transportCost: number;
	transferOrderId: string | null;
	/** Base-configured capacity; owns route-configuration matching. */
	baselineCapacity: number;
	dispatchSuspended: boolean;
	modifierImpacts: RouteDispatchModifierImpact[];
}

export interface RouteRecoveryBase {
	routeId: string;
	modifierId: string;
	source: ActiveEventModifier['source'];
}

/**
 * Discriminated per-effect evidence that a route modifier stopped affecting a
 * route after expiry. Derived by `buildRouteModifierRecoveries` when the
 * effective value recovers; see `DailyLogisticsReport.modifierRecoveries`.
 */
export type DailyRouteModifierRecovery =
	| (RouteRecoveryBase & {
			effectKind: 'route-lead-time-adjustment';
			disruptedLeadTimeDays: number;
			recoveredLeadTimeDays: number;
	  })
	| (RouteRecoveryBase & {
			effectKind: 'route-capacity-multiplier';
			disruptedCapacity: number;
			recoveredCapacity: number;
	  })
	| (RouteRecoveryBase & {
			effectKind: 'route-dispatch-suspension';
			disruptedSuspended: true;
			recoveredSuspended: false;
	  })
	| (RouteRecoveryBase & {
			effectKind: 'route-transport-cost-multiplier';
			disruptedTransportCostPerUnit: number;
			recoveredTransportCostPerUnit: number;
	  });

export interface DailyLogisticsReport {
	arrivals: DailyTransferArrival[];
	routeDispatchAttempts: DailyRouteDispatchAttempt[];
	deliveredUnits: number;
	scheduledTransportCost: number;
	modifierRecoveries: DailyRouteModifierRecovery[];
}

export interface RecurringRoute {
	id: string;
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	capacity: number;
	frequencyDays: number;
	leadTimeDays: number;
	transportCostPerUnit: number;
	priority: number;
	state: 'active' | 'paused';
	nextDispatchOnDay: number;
}

export interface LogisticsState {
	transferOrders: TransferOrder[];
	recurringRoutes: RecurringRoute[];
	nextTransferSequence: number;
	nextRouteSequence: number;
}

export interface RetailReplenishmentContext {
	retailCityId: WorldCityId;
	configuredSupplyCityId: WorldCityId | null;
	resolvedSupplyCityId: WorldCityId | null;
}

export type RetailReplenishmentOutcome =
	| 'city-inventory'
	| 'mixed'
	| 'import-only'
	| 'unassigned-import'
	| 'source-unavailable-import';

export type IndustrialBuildingStatus =
	| 'idle'
	| 'produced'
	| 'imported-inputs'
	| 'stalled'
	| 'blocked';

export interface IndustrialBuilding {
	id: string;
	level: number;
	typeId: IndustrialBuildingTypeId;
	cityId: string;
	tileId: string;
	mapX: number;
	mapY: number;
	status: IndustrialBuildingStatus;
	lastProduction: DailyMaterialMovement[];
	producedTotal: number;
	importedInputTotal: number;
	blockedDays: number;
	inventory: Partial<Record<MaterialId, number>>;
}

export interface CompanyPolicy {
	pricing: PricingPosture;
	inventory: InventoryBuffer;
	staffing: StaffingPosture;
	marketing: MarketingFocus;
	service: ServicePriority;
}

export interface Scorecard {
	profit: number;
	customerSatisfaction: number;
	staffMorale: number;
	marketPosition: number;
}

export interface ProductDynamics {
	shelfLifeDays?: number;
	shrinkRate?: number;
	trend?: { amplitude: number; periodDays: number; phaseDays: number };
	obsolescence?: { startsAfterDays: number; demandFloor: number };
	markdown?: { startsAtAgeDays: number; priceMultiplier: number };
	reputationSensitivity?: number;
}

export interface ProductMarketDynamics {
	trendMultiplier: number;
	obsolescenceMultiplier: number;
	markdownMultiplier: number;
}

export interface ProductDefinition {
	id: ProductId;
	familyId: ProductFamilyId;
	name: string;
	demandWeight: number;
	importCost: number;
	defaultSellingPrice: number;
	priceSensitivity: number;
	productionMaterialId: MaterialId | null;
	dynamics: ProductDynamics;
}

export interface ProductStockLot {
	receivedDay: number;
	quantity: number;
}

export interface StoreProduct {
	productId: ProductId;
	lots: ProductStockLot[];
	reorderThreshold: number;
	targetStock: number;
	sellingPrice: number;
}

export interface ProductInventoryAgingResult {
	product: StoreProduct;
	wasteUnits: number;
	wasteValue: number;
	shrinkUnits: number;
	shrinkValue: number;
	averageAgeDays: number | null;
	freshnessPercent: number | null;
	oldestSellableAgeDays: number | null;
}

export interface StoreProductPatch {
	sellingPrice?: number;
	reorderThreshold?: number;
	targetStock?: number;
}

export interface StoreArchetype {
	id: ArchetypeId;
	name: string;
	description: string;
	startingCash: number;
	startingDebt: number;
	baseRent: number;
	baseWage: number;
	baseTraffic: number;
	customerExpectation: number;
	startingProductIds: readonly ProductId[];
	risks: string[];
}

export interface StoreLocation {
	neighborhoodId: NeighborhoodId;
	x: number;
	y: number;
}

export interface Store {
	id: string;
	level: number;
	name: string;
	archetypeId: ArchetypeId;
	location: StoreLocation;
	cityId: string;
	tileId: string;
	mapX: number;
	mapY: number;
	daysOpen: number;
	reputation: number;
	stockHealth: number;
	products: StoreProduct[];
	staffMorale: number;
	staffCapacity: number;
	localDemand: number;
	competition: number;
	managerQuality: number;
}

export interface StaffingRequirement {
	manager: number;
	general: number;
}

export interface StaffingSummary {
	requirement: StaffingRequirement;
	assigned: StaffingRequirement;
	shortage: StaffingRequirement;
	coverage: number;
	averageSkill: number;
	averageMorale: number;
}

export interface HiringCandidate {
	id: string;
	name: string;
	role: StaffRole;
	monthlySalary: number;
	skill: number;
	morale: number;
}

export interface StaffMember extends HiringCandidate {
	assignedStoreId: string | null;
	hiredOnDay: number;
	level: number;
	xp: number;
}

export interface CityTile {
	id: string;
	cityId: string;
	x: number;
	y: number;
	neighborhood: NeighborhoodId;
	terrain: TerrainId;
	feature: CityTileFeature;
	demand: number;
	rent: number;
	footTraffic: number;
	customerFit: number;
	locked: boolean;
}

export interface City {
	id: string;
	name: string;
	width: number;
	height: number;
	tiles: CityTile[];
}

export interface OpeningForecast {
	tileId: string;
	setupCost: number;
	projectedDailyRevenue: number;
	projectedDailyRent: number;
	demandScore: number;
	customerFit: number;
	risks: string[];
}

export interface OpeningOption {
	archetypeId: ArchetypeId;
	forecast: OpeningForecast;
	disabledReason: string | null;
}

export interface DailyProductReport {
	productId: ProductId;
	name: string;
	unitsSold: number;
	demandMissed: number;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	endingStock: number;
	warehouseUnits: number;
	warehouseValue: number;
	importedUnits: number;
	importCost: number;
	importSpend: number;
	/** Product-dynamics evidence is present on reports produced by daily simulation; legacy fixtures omit it until strict Task 6 decoding. */
	wasteUnits?: number;
	wasteValue?: number;
	shrinkUnits?: number;
	shrinkValue?: number;
	stockoutLostDemand?: number;
	averageAgeDays?: number | null;
	oldestSellableAgeDays?: number | null;
	trendMultiplier?: number;
	obsolescenceMultiplier?: number;
	baseSellingPrice?: number;
	effectiveSellingPrice?: number;
	markdownAmount?: number;
}

export type StoreReportWarning =
	| { code: 'stockPressure'; storeId: string }
	| { code: 'nearStaffCapacity'; storeId: string }
	| { code: 'shortManager'; storeId: string; count: number }
	| { code: 'shortGeneral'; storeId: string; count: number }
	| { code: 'missedProductDemand'; storeId: string }
	| { code: 'reputationSlipping'; storeId: string };

export type DailyReportWarning = StoreReportWarning | { code: 'cashReservesLow' };

export interface DailyStoreReport {
	storeId: string;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	operatingCosts: number;
	importSpend: number;
	netIncome: number;
	customersServed: number;
	demandMissed: number;
	staffingCoverage: number;
	staffingShortage: StaffingRequirement;
	stockHealth: number;
	staffMorale: number;
	reputation: number;
	marketPosition: number;
	productReports: DailyProductReport[];
	/** Sum of product waste and shrink valued at import cost. */
	inventoryLossExpense?: number;
	warnings: StoreReportWarning[];
	/** Explicit context when a replenishment attempt occurred, otherwise null. */
	replenishment: RetailReplenishmentContext | null;
}

export interface DailyReport {
	day: number;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	operatingCosts: number;
	payrollCost: number;
	importSpend: number;
	cashBefore: number;
	operatingIncome: number;
	operatingCashFlow: number;
	interestAccrued: number;
	interestPaid: number;
	interestCapitalized: number;
	principalBorrowed: number;
	principalRepaid: number;
	refinancedPrincipal: number;
	financingCashFlow: number;
	netCashChange: number;
	netIncome: number;
	cashAfter: number;
	outstandingPrincipalAfter: number;
	nextLoanPayment: LoanPaymentSnapshot | null;
	scorecard: Scorecard;
	productionReport: DailyProductionReport;
	logistics: DailyLogisticsReport;
	storeReports: DailyStoreReport[];
	/** Sum of store inventory loss expenses; excluded from operating cash flow. */
	inventoryLossExpense?: number;
	modifierImpacts: EventModifierImpact[];
	modifierLifecycle: EventModifierLifecycle[];
	warnings: DailyReportWarning[];
}

export interface LoanPaymentSnapshot {
	loanId: string;
	day: number;
	amount: number;
}

export interface SystemDecisionOption {
	id: string;
	label: string;
	description: string;
}

export interface SystemDecisionItem {
	kind: 'system';
	id: string;
	title: string;
	context: DecisionContext;
	expiresOnDay: number;
	options: SystemDecisionOption[];
}

export interface EventDecisionOption {
	id: string;
	effects: EventImmediateEffect[];
	modifiers: EventModifierTemplate[];
}

export interface EventDecisionItem {
	kind: 'event';
	id: string;
	eventId: string;
	definitionVersion: number;
	generatedOnDay: number;
	expiresOnDay: number;
	target: EventTarget;
	copy: StructuredCopyRef;
	options: EventDecisionOption[];
}

export type DecisionItem = SystemDecisionItem | EventDecisionItem;

export interface EventCooldownRecord {
	eventId: string;
	target: EventTarget;
	generatedOnDay: number;
	eligibleOnDay: number;
}

export type EventHistoryEntry =
	| {
			kind: 'event-generated';
			day: number;
			eventId: string;
			instanceId: string;
			target: EventTarget;
	  }
	| {
			kind: 'event-resolved';
			day: number;
			eventId: string;
			instanceId: string;
			optionId: string;
			target: EventTarget;
	  }
	| {
			kind: 'event-decision-expired';
			day: number;
			eventId: string;
			instanceId: string;
			target: EventTarget;
	  }
	| ({
			kind: 'modifier-lifecycle';
			day: number;
	  } & EventModifierLifecycle);

export interface EventRuntimeState {
	selectionSchemaVersion: 1;
	rngState: number;
	nextInstanceSequence: number;
	nextModifierSequence: number;
	cooldowns: EventCooldownRecord[];
	activeModifiers: ActiveEventModifier[];
	history: EventHistoryEntry[];
}

export type LoanPurpose =
	| 'founding'
	| 'workingCapital'
	| 'emergency'
	| 'supplierCredit'
	| 'expansion'
	| 'refinance';

export type LoanStatus = 'active' | 'delinquent' | 'paid' | 'refinanced';

export type LoanTermDays = 28 | 56 | 84;

export interface LoanInstrument {
	id: string;
	purpose: LoanPurpose;
	status: LoanStatus;
	openedOnDay: number;
	originalPrincipal: number;
	remainingPrincipal: number;
	annualInterestRateBps: number;
	termDays: LoanTermDays;
	installmentsProcessed: number;
	nextPaymentDay: number | null;
	lastInterestAccrualDay: number;
	accruedInterestMicros: number;
	overdueInterest: number;
	overduePrincipal: number;
	arrearsSinceDay: number | null;
	scheduledPaymentCount: number;
	onTimePaymentCount: number;
	missedPaymentCount: number;
	refinancedFromLoanId?: string;
	refinancedByLoanId?: string;
}

export type FinanceTransactionKind =
	| 'disbursement'
	| 'principalPayment'
	| 'interestPayment'
	| 'missedPayment'
	| 'refinance';

export interface FinanceTransaction {
	id: string;
	day: number;
	kind: FinanceTransactionKind;
	loanId: string;
	relatedLoanId?: string;
	cashDelta: number;
	principalAmount: number;
	principalDelta: number;
	interestAmount: number;
}

export interface FinanceDayActivity {
	day: number;
	principalBorrowed: number;
	principalRepaid: number;
	interestPaid: number;
	interestCapitalized: number;
	refinancedPrincipal: number;
	financingCashFlow: number;
}

export interface FinanceState {
	loans: LoanInstrument[];
	transactions: FinanceTransaction[];
	nextLoanSequence: number;
	nextTransactionSequence: number;
	currentDayActivity: FinanceDayActivity;
}

export interface GameState {
	seed: number;
	rngState: number;
	day: number;
	cash: number;
	finance: FinanceState;
	policy: CompanyPolicy;
	scorecard: Scorecard;
	world: WorldProgress;
	storeCap: number;
	cities: City[];
	activeCityId: string;
	industryCities: IndustryCity[];
	activeIndustryCityId: string;
	industrialBuildings: IndustrialBuilding[];
	cityInventories: CityInventory[];
	retailSupplyAssignments: RetailSupplyAssignment[];
	logistics: LogisticsState;
	stores: Store[];
	staff: StaffMember[];
	hiringCandidates: HiringCandidate[];
	events: EventRuntimeState;
	decisions: DecisionItem[];
	reports: DailyReport[];
}
