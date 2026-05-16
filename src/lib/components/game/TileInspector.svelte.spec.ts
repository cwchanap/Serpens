import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TileInspector from './TileInspector.svelte';
import { getStoreArt } from '$lib/assets/gameArt';
import { initializeStoreProducts } from '$lib/game/stock';
import type {
	CityTile,
	DailyStoreReport,
	HiringCandidate,
	StaffMember,
	Store,
	StoreProductPatch
} from '$lib/game/types';

const tile: CityTile = {
	id: 'harbor-city-1-1',
	cityId: 'harbor-city',
	x: 1,
	y: 1,
	neighborhood: 'downtown',
	terrain: 'commercial',
	feature: null,
	demand: 72,
	rent: 190,
	footTraffic: 76,
	customerFit: 70,
	locked: false
};

const store: Store = {
	id: 'store-1',
	name: 'Founding Store',
	archetypeId: 'convenience',
	location: 'Downtown (1, 1)',
	cityId: 'harbor-city',
	tileId: tile.id,
	mapX: 1,
	mapY: 1,
	daysOpen: 0,
	reputation: 50,
	stockHealth: 80,
	products: initializeStoreProducts('convenience'),
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	competition: 15,
	managerQuality: 60
};

const latestStoreReport: DailyStoreReport = {
	storeId: 'store-1',
	revenue: 84,
	costOfGoods: 36,
	grossMargin: 48,
	operatingCosts: 120,
	importSpend: 0,
	netIncome: -36,
	customersServed: 12,
	demandMissed: 2,
	staffingCoverage: 100,
	staffingShortage: { manager: 0, general: 0 },
	stockHealth: 80,
	staffMorale: 75,
	reputation: 50,
	marketPosition: 40,
	productReports: [
		{
			categoryId: 'snacks',
			name: 'Snacks',
			unitsSold: 12,
			demandMissed: 2,
			revenue: 60,
			costOfGoods: 36,
			grossMargin: 24,
			endingStock: 58,
			warehouseUnits: 0,
			warehouseValue: 0,
			importedUnits: 0,
			importCost: 3,
			importSpend: 0
		}
	],
	warnings: []
};

function renderInspector(
	overrides: Partial<{
		tile: CityTile | null;
		store: Store | null;
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		latestStoreReport: DailyStoreReport | null;
		onUpdateStoreProduct: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
		onHireStaff: (candidateId: string) => void;
		onAssignStaff: (staffId: string, storeId: string) => void;
		onUnassignStaff: (staffId: string) => void;
		onClose: () => void;
	}> = {}
) {
	const props = {
		tile,
		store: null,
		staff: [],
		hiringCandidates: [],
		latestStoreReport: null,
		onUpdateStoreProduct: vi.fn(),
		onHireStaff: vi.fn(),
		onAssignStaff: vi.fn(),
		onUnassignStaff: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};

	render(TileInspector, props);

	return props;
}

describe('TileInspector storefront art', () => {
	it('does not show convenience storefront art for an empty selected tile', async () => {
		const convenienceArt = getStoreArt('convenience');

		renderInspector({ store: null });

		await expect
			.element(page.getByRole('img', { name: convenienceArt.alt }))
			.not.toBeInTheDocument();
	});

	it('shows electronics storefront art for an electronics store tile', async () => {
		const electronicsArt = getStoreArt('electronics');

		renderInspector({
			store: {
				...store,
				archetypeId: 'electronics',
				products: initializeStoreProducts('electronics')
			}
		});

		const image = page.getByRole('img', { name: electronicsArt.alt });
		await expect.element(image).toBeVisible();
		await expect.element(image).toHaveAttribute('src', electronicsArt.path);
	});
});

describe('TileInspector stock management', () => {
	it('shows stock row count in details and renders stock on a separate tab', async () => {
		expect.assertions(9);

		renderInspector({ store, latestStoreReport });

		await expect.element(page.getByText('Stock rows')).toBeVisible();
		await expect.element(page.getByText('Local demand')).not.toBeInTheDocument();

		const detailsTab = page.getByRole('tab', { name: 'Details' });
		const stockTab = page.getByRole('tab', { name: 'Stock' });
		const staffTab = page.getByRole('tab', { name: 'Staff' });
		await expect.element(detailsTab).toHaveAttribute('aria-selected', 'true');
		await expect.element(stockTab).toHaveAttribute('aria-selected', 'false');
		await expect.element(staffTab).toHaveAttribute('aria-selected', 'false');
		await expect
			.element(page.getByRole('heading', { name: 'Founding Store stock' }))
			.not.toBeInTheDocument();

		await stockTab.click();

		await expect.element(stockTab).toHaveAttribute('aria-selected', 'true');
		await expect.element(page.getByRole('cell', { name: 'Snacks' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Founding Store stock' })).toBeVisible();
	});
});

describe('TileInspector staff management', () => {
	it('renders store staff on a dedicated tab and dispatches staffing actions', async () => {
		expect.assertions(8);
		const onHireStaff = vi.fn();
		const onAssignStaff = vi.fn();
		const onUnassignStaff = vi.fn();
		const staff: StaffMember[] = [
			{
				id: 'staff-alex',
				name: 'Alex Chen',
				role: 'manager',
				monthlySalary: 4_800,
				skill: 72,
				morale: 68,
				assignedStoreId: store.id,
				hiredOnDay: 0
			},
			{
				id: 'staff-blair',
				name: 'Blair Kim',
				role: 'general',
				monthlySalary: 3_000,
				skill: 61,
				morale: 74,
				assignedStoreId: null,
				hiredOnDay: 2
			}
		];
		const hiringCandidates: HiringCandidate[] = [
			{
				id: 'candidate-casey',
				name: 'Casey Rivera',
				role: 'general',
				monthlySalary: 2_900,
				skill: 64,
				morale: 70
			}
		];

		renderInspector({
			store,
			staff,
			hiringCandidates,
			onHireStaff,
			onAssignStaff,
			onUnassignStaff
		});

		const staffTab = page.getByRole('tab', { name: 'Staff' });
		await expect.element(staffTab).toHaveAttribute('aria-selected', 'false');

		await staffTab.click();

		await expect.element(staffTab).toHaveAttribute('aria-selected', 'true');
		await expect.element(page.getByRole('heading', { name: 'Founding Store staff' })).toBeVisible();
		await expect.element(page.getByText('1/1 managers, 0/1 general')).toBeVisible();

		await page
			.getByRole('button', {
				name: 'Assign Blair Kim, General staff staff-blair to Founding Store'
			})
			.click();
		await page
			.getByRole('button', {
				name: 'Hire Casey Rivera, General candidate candidate-casey'
			})
			.click();
		await page
			.getByRole('button', {
				name: 'Unassign Alex Chen, Manager staff staff-alex from Founding Store'
			})
			.click();

		expect(onAssignStaff).toHaveBeenCalledWith('staff-blair', store.id);
		expect(onHireStaff).toHaveBeenCalledWith('candidate-casey');
		expect(onUnassignStaff).toHaveBeenCalledWith('staff-alex');
		expect(onAssignStaff).toHaveBeenCalledOnce();
	});
});

describe('TileInspector empty tile details', () => {
	it('shows tile stats without construction controls for an empty selected tile', async () => {
		renderInspector({ store: null });

		await expect.element(page.getByRole('heading', { name: 'Tile 1, 1' })).toBeVisible();
		await expect.element(page.getByText('Demand')).toBeVisible();
		await expect.element(page.getByText('$190')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Store type' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /open .* here/i })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('dialog', { name: 'Confirm store opening' }))
			.not.toBeInTheDocument();
	});

	it('shows road tile details without placement feedback or construction buttons', async () => {
		const roadTile: CityTile = { ...tile, feature: 'road' };

		renderInspector({ tile: roadTile });

		await expect.element(page.getByText('Road', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Open Boutique Goods here/ }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText('Road location')).not.toBeInTheDocument();
	});

	it('shows river tile details without placement feedback or construction buttons', async () => {
		const riverTile: CityTile = { ...tile, feature: 'river' };

		renderInspector({ tile: riverTile });

		await expect.element(page.getByText('River', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Open Grocery Market here/ }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText('River location')).not.toBeInTheDocument();
	});
});
