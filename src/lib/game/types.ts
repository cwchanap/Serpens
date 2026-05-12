export const MAX_STORES = 3;

export type ArchetypeId = 'convenience' | 'boutique' | 'electronics' | 'grocery';
export type PricingPosture = 'discount' | 'competitive' | 'standard' | 'premium';
export type InventoryBuffer = 'lean' | 'balanced' | 'generous';
export type StaffingPosture = 'minimal' | 'efficient' | 'service';
export type StaffRole = 'manager' | 'general';
export type MarketingFocus = 'none' | 'awareness' | 'promotions' | 'loyalty';
export type ServicePriority = 'speed' | 'balanced' | 'highTouch';
export type ScoreKey = 'profit' | 'customerSatisfaction' | 'staffMorale' | 'marketPosition';
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
	| 'essentials';
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
	| 'household-goods-production';

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
}

export interface ProductionRecipe {
	id: ProductionRecipeId;
	inputs: MaterialQuantity[];
	outputs: MaterialQuantity[];
	operatingCost: number;
	stage: 'raw' | 'process' | 'final';
}

export interface IndustrialBuildingType {
	id: IndustrialBuildingTypeId;
	name: string;
	buildCost: number;
	dailyOperatingCost: number;
	requiredResource: IndustryResourceId | null;
	requiresIndustrialTile: boolean;
	recipeId: ProductionRecipeId | null;
	warehouseCapacity: number;
}

export interface DailyMaterialMovement {
	materialId: MaterialId;
	quantity: number;
	value: number;
	source: 'local' | 'import' | 'warehouse' | 'overflow';
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
}

export interface WarehouseInventory {
	capacity: number;
	materials: Partial<Record<MaterialId, number>>;
	overflowUnits: number;
	overflowCost: number;
}

export type IndustrialBuildingStatus = 'idle' | 'produced' | 'imported-inputs' | 'blocked';

export interface IndustrialBuilding {
	id: string;
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

export interface ProductCategory {
	id: string;
	name: string;
	baseDemand: number;
	margin: number;
	demandWeight: number;
	importCost: number;
	defaultSellingPrice: number;
	priceSensitivity: number;
}

export interface StoreProduct {
	categoryId: string;
	stock: number;
	reorderThreshold: number;
	targetStock: number;
	sellingPrice: number;
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
	startingCategories: ProductCategory[];
	risks: string[];
}

export interface Store {
	id: string;
	name: string;
	archetypeId: ArchetypeId;
	location: string;
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
	categoryId: string;
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
}

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
	warnings: string[];
}

export interface DailyReport {
	day: number;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	operatingCosts: number;
	payrollCost: number;
	importSpend: number;
	netIncome: number;
	cashAfter: number;
	scorecard: Scorecard;
	productionReport: DailyProductionReport;
	storeReports: DailyStoreReport[];
	warnings: string[];
}

export interface DecisionOption {
	id: string;
	label: string;
	description: string;
	effects: Partial<Scorecard> & {
		cash?: number;
		stockHealth?: number;
		staffMorale?: number;
		reputation?: number;
	};
}

export interface DecisionItem {
	id: string;
	title: string;
	context: string;
	expiresOnDay: number;
	options: DecisionOption[];
}

export interface GameState {
	seed: number;
	rngState: number;
	day: number;
	cash: number;
	debt: number;
	policy: CompanyPolicy;
	scorecard: Scorecard;
	cities: City[];
	activeCityId: string;
	industryCities: IndustryCity[];
	activeIndustryCityId: string;
	industrialBuildings: IndustrialBuilding[];
	warehouse: WarehouseInventory;
	stores: Store[];
	staff: StaffMember[];
	hiringCandidates: HiringCandidate[];
	decisions: DecisionItem[];
	reports: DailyReport[];
}
