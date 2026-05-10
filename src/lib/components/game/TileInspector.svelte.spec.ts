import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TileInspector from './TileInspector.svelte';
import { getStoreArt } from '$lib/assets/gameArt';
import { initializeStoreProducts } from '$lib/game/stock';
import type {
	ArchetypeId,
	CityTile,
	DailyStoreReport,
	HiringCandidate,
	OpeningForecast,
	OpeningOption,
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
		openingOptions: OpeningOption[];
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		gameStarted: boolean;
		disabledReason: string | null;
		latestStoreReport: DailyStoreReport | null;
		onFoundStore: (archetypeId: ArchetypeId, tileId: string) => void;
		onOpenStore: (archetypeId: ArchetypeId, tileId: string) => void;
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
		openingOptions: [],
		staff: [],
		hiringCandidates: [],
		gameStarted: true,
		disabledReason: null,
		latestStoreReport: null,
		onFoundStore: vi.fn(),
		onOpenStore: vi.fn(),
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

function forecastFor(archetypeId: ArchetypeId): OpeningForecast {
	const offset = ['convenience', 'boutique', 'electronics', 'grocery'].indexOf(archetypeId) + 1;

	return {
		tileId: tile.id,
		setupCost: 10_000 + offset * 500,
		projectedDailyRevenue: 1_000 + offset * 100,
		projectedDailyRent: tile.rent,
		demandScore: 70,
		customerFit: 75,
		risks: []
	};
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

describe('TileInspector opening choices', () => {
	it('shows a disabled store type message when no opening options are available', async () => {
		renderInspector({ openingOptions: [], gameStarted: true });

		await expect.element(page.getByRole('heading', { name: 'Store type' })).toBeVisible();
		await expect.element(page.getByText('No store types available')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Open store here' }))
			.not.toBeInTheDocument();
	});

	it('opens the selected expansion type only after confirmation', async () => {
		const electronicsArt = getStoreArt('electronics');
		const boutiqueArt = getStoreArt('boutique');
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'electronics', forecast: forecastFor('electronics'), disabledReason: null },
			{ archetypeId: 'boutique', forecast: forecastFor('boutique'), disabledReason: null },
			{ archetypeId: 'convenience', forecast: forecastFor('convenience'), disabledReason: null },
			{
				archetypeId: 'grocery',
				forecast: forecastFor('grocery'),
				disabledReason: 'Store limit reached'
			}
		];
		const onOpenStore = vi.fn();
		const onClose = vi.fn();

		renderInspector({ openingOptions, onOpenStore, onClose });

		const electronicsButton = page.getByRole('button', { name: /Open Electronics & Games here/ });
		await expect.element(electronicsButton).toBeVisible();
		await expect
			.element(electronicsButton.getByRole('img', { name: electronicsArt.alt }))
			.toHaveAttribute('src', electronicsArt.path);
		await expect
			.element(
				page
					.getByRole('button', { name: /Open Boutique Goods here/ })
					.getByRole('img', { name: boutiqueArt.alt })
			)
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Open Grocery Market here/ }))
			.toBeDisabled();
		await expect.element(page.getByText('Store limit reached')).toBeVisible();

		await electronicsButton.click();

		expect(onOpenStore).not.toHaveBeenCalled();
		const dialog = page.getByRole('dialog', { name: 'Confirm store opening' });
		await expect.element(dialog).toBeVisible();
		await expect
			.element(dialog.getByRole('heading', { name: 'Open Electronics & Games?' }))
			.toBeVisible();
		await expect
			.element(dialog.getByRole('img', { name: electronicsArt.alt }))
			.toHaveAttribute('src', electronicsArt.path);

		await dialog.getByRole('button', { name: 'Confirm opening' }).click();

		expect(onOpenStore).toHaveBeenCalledWith('electronics', tile.id);
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('cancels a pending store type confirmation without opening a store', async () => {
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'boutique', forecast: forecastFor('boutique'), disabledReason: null }
		];
		const onOpenStore = vi.fn();
		const onClose = vi.fn();

		renderInspector({ openingOptions, onOpenStore, onClose });

		await page.getByRole('button', { name: /Open Boutique Goods here/ }).click();
		const dialog = page.getByRole('dialog', { name: 'Confirm store opening' });
		await expect.element(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

		expect(onOpenStore).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		await expect.element(dialog).not.toBeInTheDocument();
	});

	it('opens the selected founding type only after confirmation', async () => {
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'grocery', forecast: forecastFor('grocery'), disabledReason: null }
		];
		const onFoundStore = vi.fn();
		const onClose = vi.fn();

		renderInspector({ openingOptions, gameStarted: false, onFoundStore, onClose });

		await page.getByRole('button', { name: /Open Grocery Market here/ }).click();
		expect(onFoundStore).not.toHaveBeenCalled();

		await page
			.getByRole('dialog', { name: 'Confirm store opening' })
			.getByRole('button', { name: 'Confirm opening' })
			.click();

		expect(onFoundStore).toHaveBeenCalledWith('grocery', tile.id);
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('shows road placement feedback on a road tile', async () => {
		const roadTile: CityTile = { ...tile, feature: 'road' };
		const openingOptions: OpeningOption[] = [
			{
				archetypeId: 'boutique',
				forecast: forecastFor('boutique'),
				disabledReason: 'Road location'
			}
		];

		renderInspector({ tile: roadTile, openingOptions, disabledReason: 'Road location' });

		await expect.element(page.getByText('Road', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Road location')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Open Boutique Goods here/ }))
			.toBeDisabled();
	});

	it('shows river placement feedback on a river tile', async () => {
		const riverTile: CityTile = { ...tile, feature: 'river' };
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'grocery', forecast: forecastFor('grocery'), disabledReason: 'River location' }
		];

		renderInspector({ tile: riverTile, openingOptions, disabledReason: 'River location' });

		await expect.element(page.getByText('River', { exact: true })).toBeVisible();
		await expect.element(page.getByText('River location')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Open Grocery Market here/ }))
			.toBeDisabled();
	});
});
