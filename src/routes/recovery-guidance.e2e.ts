import { expect, test, type Page } from '@playwright/test';
import {
	buildIndustrialBuilding,
	getIndustrialPlacementBlockReason
} from '../lib/game/industryPlacement';
import { simulateDay } from '../lib/game/simulateDay';
import { createNewGame } from '../lib/game/state';
import type { GameState, IndustrialBuildingTypeId } from '../lib/game/types';
import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '../lib/i18n/locales';
import { BROWSER_SAVE_STORAGE_KEY } from '../lib/persistence/browserSaveRepository';
import { BROWSER_SCENARIO_STORAGE_KEY } from '../lib/persistence/browserScenarioRepository';
import {
	createAutoSaveRecord,
	createEmptySaveStore,
	validateSaveStoreSnapshot
} from '../lib/persistence/saveCodec';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(
		({ languageKey, scenarioKey }) => {
			window.localStorage.setItem(languageKey, 'en');
			const isolationKey = 'serpens.e2e.challenge-storage-isolated';
			if (window.sessionStorage.getItem(isolationKey) !== 'true') {
				window.localStorage.removeItem(scenarioKey);
				window.sessionStorage.setItem(isolationKey, 'true');
			}
		},
		{
			languageKey: LANGUAGE_PREFERENCE_STORAGE_KEY,
			scenarioKey: BROWSER_SCENARIO_STORAGE_KEY
		}
	);
});

async function resumeSandboxSave(page: Page, game: GameState): Promise<void> {
	const snapshot = validateSaveStoreSnapshot({
		...createEmptySaveStore(),
		autoSave: createAutoSaveRecord(game, new Date('2026-10-17T12:00:00.000Z'))
	});
	await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
		key: BROWSER_SAVE_STORAGE_KEY,
		value: JSON.stringify(snapshot)
	});
	await page.goto('/');
	await page.getByRole('button', { name: /^menu$/i }).click();
	await page.getByRole('button', { name: /^saves$/i }).click();
	// Loading a save starts paused, so the state stays put while we look.
	await page.getByRole('button', { name: /^resume$/i }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /saves/i })).toHaveCount(0);
}

function buildOnFirstValidTile(game: GameState, buildingTypeId: IndustrialBuildingTypeId) {
	const city = game.industryCities.find((candidate) => candidate.id === game.activeIndustryCityId)!;
	const tile = city.tiles.find(
		(candidate) => getIndustrialPlacementBlockReason(game, candidate.id, buildingTypeId) === null
	);
	if (!tile) throw new Error(`No valid tile for ${buildingTypeId}`);
	return buildIndustrialBuilding(game, { tileId: tile.id, buildingTypeId });
}

test('a rail-less water chain raises a rail alert that starts routing from the stranded building', async ({
	page
}) => {
	let game: GameState = { ...createNewGame('convenience', 20260917), cash: 100_000 };
	for (const typeId of ['water-pump', 'water-bottler', 'warehouse'] as const) {
		game = buildOnFirstValidTile(game, typeId);
	}
	expect(game.industrialBuildings).toHaveLength(3);
	await resumeSandboxSave(page, { ...game, decisions: [] });

	await page.locator('button.alerts-bell').click();
	await page
		.getByRole('group', { name: 'Alerts list' })
		.getByRole('button', { name: /buildings have no rail link; start with Water Pump\.$/ })
		.click();

	await expect(page.getByRole('status', { name: /placement status/i })).toContainText(
		'Select waypoints, then the destination building'
	);
});

test('water pump placement names the resource and emphasises its tiles', async ({ page }) => {
	await resumeSandboxSave(page, { ...createNewGame('convenience', 20260917), cash: 100_000 });
	await page.getByRole('button', { name: /^menu$/i }).click();
	await page.getByRole('button', { name: /industry city map/i }).click();
	const canvas = page.locator('.active-map-surface .map-canvas canvas');
	await expect(canvas).toHaveAttribute('data-industry-terrain-asset-mode', 'image');

	await page.getByRole('button', { name: /^build$/i }).click();
	const buildMenu = page.getByRole('dialog', { name: /build menu/i });
	await expect(buildMenu.getByTestId('build-menu-rail-hint')).toBeVisible();
	await buildMenu.getByRole('button', { name: /build water pump/i }).click();

	await expect(page.getByRole('status', { name: /placement status/i })).toContainText(
		'Choose a highlighted Water Source tile to build.'
	);
	await expect(canvas).toHaveAttribute('data-placement-preview-emphasis', 'resource');
});

test('cash recovery appears after the opening window and releases idle staff', async ({ page }) => {
	let game = createNewGame('convenience', 20260917);
	for (let day = 0; day < 8; day += 1) game = simulateDay(game);
	const candidate = game.hiringCandidates[0]!;
	game = {
		...game,
		cash: -100,
		decisions: [],
		staff: [
			...game.staff,
			{ ...candidate, assignedStoreId: null, hiredOnDay: game.day, level: 1, xp: 0 }
		]
	};
	await resumeSandboxSave(page, game);

	const card = page.getByTestId('cash-recovery-guidance');
	await expect(card).toBeVisible();
	await expect(page.getByTestId('opening-guidance')).toHaveCount(0);
	await card.getByRole('button', { name: 'Release 1 idle staff member' }).click();

	const staffPanel = page.getByRole('dialog', { name: /staff/i });
	await expect(staffPanel).toBeVisible();
	page.once('dialog', (dialog) => void dialog.accept());
	await staffPanel.getByTestId(`release-staff-${candidate.id}`).click();
	await expect(staffPanel.getByTestId(`release-staff-${candidate.id}`)).toHaveCount(0);
});
