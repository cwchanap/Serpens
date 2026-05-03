export const MAX_STORES = 3;

export type ArchetypeId = 'convenience' | 'boutique' | 'electronics' | 'grocery';
export type PricingPosture = 'discount' | 'competitive' | 'standard' | 'premium';
export type InventoryBuffer = 'lean' | 'balanced' | 'generous';
export type StaffingPosture = 'minimal' | 'efficient' | 'service';
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
	staffMorale: number;
	staffCapacity: number;
	localDemand: number;
	competition: number;
	managerQuality: number;
}

export interface CityTile {
	id: string;
	cityId: string;
	x: number;
	y: number;
	neighborhood: NeighborhoodId;
	terrain: TerrainId;
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

export interface DailyStoreReport {
	storeId: string;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	operatingCosts: number;
	netIncome: number;
	customersServed: number;
	demandMissed: number;
	stockHealth: number;
	staffMorale: number;
	reputation: number;
	marketPosition: number;
	warnings: string[];
}

export interface DailyReport {
	day: number;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	operatingCosts: number;
	netIncome: number;
	cashAfter: number;
	scorecard: Scorecard;
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
	stores: Store[];
	decisions: DecisionItem[];
	reports: DailyReport[];
}
