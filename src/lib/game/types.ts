export const MAX_STORES = 3;

export type ArchetypeId = 'convenience' | 'boutique' | 'electronics' | 'grocery';
export type PricingPosture = 'discount' | 'competitive' | 'standard' | 'premium';
export type InventoryBuffer = 'lean' | 'balanced' | 'generous';
export type StaffingPosture = 'minimal' | 'efficient' | 'service';
export type MarketingFocus = 'none' | 'awareness' | 'promotions' | 'loyalty';
export type ServicePriority = 'speed' | 'balanced' | 'highTouch';
export type ScoreKey = 'profit' | 'customerSatisfaction' | 'staffMorale' | 'marketPosition';

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
	daysOpen: number;
	reputation: number;
	stockHealth: number;
	staffMorale: number;
	staffCapacity: number;
	localDemand: number;
	competition: number;
	managerQuality: number;
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
	stores: Store[];
	decisions: DecisionItem[];
	reports: DailyReport[];
}
