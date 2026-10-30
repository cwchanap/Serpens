import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import { getCompanyBookValue } from '$lib/game/companyBookValue';
import { createNewGame } from '$lib/game/state';
import type { DailyReport, GameState, ProgressionTierId } from '$lib/game/types';
import SandboxProgression from './SandboxProgression.svelte';

function reportStub(day: number, companyBookValueAfter: number): DailyReport {
	return {
		day,
		companyBookValueAfter,
		netIncome: 0,
		storeReports: [],
		productionReport: {
			produced: [],
			consumed: [],
			importedInputs: [],
			warehousePulls: [],
			shopImports: [],
			importSpend: 0,
			operatingCost: 0,
			overflowUnits: 0,
			overflowCost: 0,
			warehouseCapacity: 0,
			warehouseUsed: 0,
			railShipments: []
		}
	} as unknown as DailyReport;
}

function gameWith(overrides: Partial<GameState>): GameState {
	return { ...createNewGame('convenience', 20260503), ...overrides };
}

function claim(tierId: ProgressionTierId, claimedOnDay: number) {
	return { tierId, claimedOnDay };
}

function allClaims(): ReturnType<typeof claim>[] {
	return [
		claim('local-shop', 10),
		claim('neighborhood-chain', 40),
		claim('regional-supplier', 90),
		claim('multi-city-operator', 150),
		claim('market-leader', 250)
	];
}

describe('SandboxProgression', () => {
	it('renders the book-value headline, current tier rows with actual/target evidence, and the reward copy', async () => {
		expect.assertions(9);
		const i18n = createI18n('en');
		const game = gameWith({ cash: 50_000 });
		render(SandboxProgression, { game, i18n });

		await expect.element(page.getByRole('heading', { name: 'Company progression' })).toBeVisible();
		await expect.element(page.getByText('Company book value', { exact: true })).toBeVisible();
		// The headline must read the computed company book value (assets minus
		// debt), not the raw cash balance.
		const bookValueLabel = i18n.format.currency(getCompanyBookValue(game).total);
		expect(bookValueLabel).not.toBe(i18n.format.currency(50_000));
		await expect.element(page.getByText(bookValueLabel)).toBeVisible();

		await expect
			.element(page.getByRole('heading', { name: 'Next milestone: Local Shop' }))
			.toBeVisible();
		await expect.element(page.getByText('Open a second store')).toBeVisible();
		await expect.element(page.getByText('Actual 1 · Target 2')).toBeVisible();
		await expect
			.element(page.getByText('Grow reported peak company book value to $70,000'))
			.toBeVisible();
		await expect.element(page.getByText('higher possible credit', { exact: false })).toBeVisible();
	});

	it('uses a distinct sandbox root id and the shared objective-panel row markup', async () => {
		expect.assertions(3);
		render(SandboxProgression, { game: gameWith({}), i18n: createI18n('en') });

		await expect
			.element(page.getByRole('heading', { name: 'Next milestone: Local Shop' }))
			.toBeVisible();
		expect(document.getElementById('sandbox-progression')).not.toBeNull();
		expect(document.getElementById('sandbox-progression-objectives')).not.toBeNull();
	});

	it('shows the final-tier summary with claimed day, peak value, and store cap, with no continue action', async () => {
		expect.assertions(6);
		const game = gameWith({
			day: 300,
			storeCap: 8,
			reports: [reportStub(120, 95_000), reportStub(240, 160_000)],
			progression: { claims: allClaims() }
		});
		render(SandboxProgression, { game, i18n: createI18n('en') });

		await expect.element(page.getByRole('heading', { name: 'Ladder complete' })).toBeVisible();
		await expect.element(page.getByText('Final tier claimed on day 250')).toBeVisible();
		await expect.element(page.getByText('Peak company book value: $160,000')).toBeVisible();
		await expect.element(page.getByText('Current store limit: 8')).toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: 'Next milestone: Local Shop' }))
			.not.toBeInTheDocument();
		// Play never ends — the summary must not offer a terminal action.
		await expect.element(page.getByRole('button')).not.toBeInTheDocument();
	});

	it('localizes the headline and tier title for ja', async () => {
		expect.assertions(2);
		render(SandboxProgression, { game: gameWith({}), i18n: createI18n('ja') });

		await expect.element(page.getByRole('heading', { name: '会社の発展' })).toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: '次のマイルストーン：ローカルショップ' }))
			.toBeVisible();
	});
});
