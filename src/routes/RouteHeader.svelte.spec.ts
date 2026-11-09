import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from '$lib/audio/audioPreferences';
import { MANAGEMENT_PANEL_SHORTCUT_KEY, type ManagementPanelId } from '$lib/game/keyboardShortcuts';
import type { MapViewId } from '$lib/game/mapViewKeepAlive';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import { createI18n, type I18nBundle, type SupportedLocale } from '$lib/i18n';
import type { LocalizedGameAlert } from '$lib/i18n/localizedTypes';
import { createFixtureScenarioRun } from '$lib/persistence/scenarioRepository.testUtils';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import { startScenario } from '$lib/scenarios/runtime';
import type { ScenarioOperationError, ScenarioResult, ScenarioRun } from '$lib/scenarios/types';
import type { ManagementPanelMenuItem } from './managementUi.svelte';
import RouteHeaderHarness from './RouteHeaderHarness.svelte';
import { createScenarioUi, type ScenarioUiCommands } from './scenarioUi.svelte';

const PANEL_IDS: ManagementPanelId[] = [
	'dashboard',
	'policies',
	'staff',
	'stores',
	'decisions',
	'reports',
	'productChains',
	'finance',
	'logistics'
];

function menuFor(i18n: I18nBundle): ManagementPanelMenuItem[] {
	return PANEL_IDS.map((id) => ({
		id,
		label: i18n.labels.managementPanel(id),
		shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY[id]
	}));
}

/** Deterministic live game with `extraDays` simulated closes (reports follow). */
function headerGame(extraDays: number): GameState {
	let game = createNewGame('convenience', 20260830);
	for (let day = 0; day < extraDays; day += 1) game = simulateDay(game);
	return game;
}

function withInventories(game: GameState): GameState {
	return {
		...game,
		cityInventories: [
			{ cityId: 'industry-city', materials: { grain: 120, flour: 80 } },
			{ cityId: 'breadbasket-basin', materials: { 'bottled-water': 40, sugar: 3 } }
		]
	};
}

const twoAlerts: LocalizedGameAlert[] = [
	{
		id: 'store-stock:store-1',
		kind: 'store-stock',
		message: 'Founding store stock needs attention',
		storeId: 'store-1',
		cityId: 'harbor-city'
	},
	{
		id: 'decision:decision-1',
		kind: 'decision',
		message: 'A supplier decision is waiting'
	}
];

function scenarioRun(): ScenarioRun {
	const definition = resolveScenarioDefinition(createFixtureScenarioRun().definition)!;
	const started = startScenario(definition, definition.officialSeed);
	if (!started.ok) throw new Error('invalid scenario fixture');
	return started.value;
}

/** The real scenario owner, driven by live inputs exactly like the route. */
function scenarioPresentation() {
	const run = scenarioRun();
	let inputs = $state.raw({
		run: null as ScenarioRun | null,
		result: null as ScenarioResult | null,
		best: false,
		error: null as ScenarioOperationError | null,
		retry: null as (() => Promise<void>) | null,
		pending: false,
		ready: true,
		mode: 'sandbox' as 'sandbox' | 'scenario',
		game: run.game as GameState | null,
		i18n: createI18n('en')
	});
	const commands: ScenarioUiCommands = {
		startScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		importScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		resumeScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		restartScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		abandonScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		returnToSandbox: vi.fn(),
		dismissScenarioOperationError: vi.fn()
	};
	const ui = createScenarioUi({
		commands,
		getActiveRun: () => inputs.run,
		getResult: () => inputs.result,
		getBestUpdated: () => inputs.best,
		getError: () => inputs.error,
		getRetry: () => inputs.retry,
		getPending: () => inputs.pending,
		getReady: () => inputs.ready,
		getMode: () => inputs.mode,
		getGame: () => inputs.game,
		getI18n: () => inputs.i18n,
		resolveDefinition: resolveScenarioDefinition,
		onOpenCatalog: vi.fn(),
		onResultsClosed: vi.fn()
	});
	/** Wholesale replacement, as the route's getters re-read fresh values. */
	function update(patch: Partial<typeof inputs>): void {
		inputs = { ...inputs, ...patch };
	}
	return { ui, commands, update };
}

interface HeaderLive {
	game: GameState | null;
	industryCityId: string;
	eyebrow: string;
	title: string;
	i18n: I18nBundle;
	activeLocale: SupportedLocale;
	alerts: LocalizedGameAlert[];
	activeMapView: MapViewId;
	managementMenu: ManagementPanelMenuItem[];
	audioPreferences: AudioPreferences;
	playMode: 'sandbox' | 'scenario';
}

function baseLive(overrides: Partial<HeaderLive> = {}): HeaderLive {
	const en = createI18n('en');
	return {
		game: withInventories(headerGame(2)),
		industryCityId: 'industry-city',
		eyebrow: 'Retail city map',
		title: 'Harbor City',
		i18n: en,
		activeLocale: 'en',
		alerts: [],
		activeMapView: 'retail',
		managementMenu: menuFor(en),
		audioPreferences: { ...DEFAULT_AUDIO_PREFERENCES },
		playMode: 'sandbox',
		...overrides
	};
}

function mountHeader(live: HeaderLive = baseLive(), scenario = scenarioPresentation()) {
	const spies = {
		onOpenManagementPanel: vi.fn<(id: ManagementPanelId) => void>(),
		onSelectAlert: vi.fn<(alert: LocalizedGameAlert) => void>(),
		onSelectView: vi.fn<(view: MapViewId) => void>(),
		onSelectLocale: vi.fn<(locale: SupportedLocale) => void>(),
		onUpdateAudioPreferences: vi.fn<(patch: Partial<AudioPreferences>) => void>(),
		onOpenSaves: vi.fn<() => void>()
	};
	const props = () => ({
		game: live.game,
		industryCityId: live.industryCityId,
		eyebrow: live.eyebrow,
		title: live.title,
		i18n: live.i18n,
		activeLocale: live.activeLocale,
		alerts: live.alerts,
		activeMapView: live.activeMapView,
		managementMenu: live.managementMenu,
		audioPreferences: live.audioPreferences,
		scenarioUi: scenario.ui,
		playMode: live.playMode,
		...spies
	});
	const result = render(RouteHeaderHarness, props());
	/** Re-renders with the holder's current live values, as the page would. */
	function sync(): void {
		void result.rerender(props());
	}
	return { result, live, scenario, spies, sync };
}

const rootGameMenuOpen = () => page.getByTestId('root-game-menu-open');
const rootAlertsMenuOpen = () => page.getByTestId('root-alerts-menu-open');
const menuTrigger = () => page.getByTestId('game-menu-trigger');
const menuPopover = () => page.getByRole('dialog');
const alertsBell = () => page.getByRole('button', { name: /alerts|通知/i });

/** Escape pressed inside the popover, as the focused dialog receives it. */
async function pressEscapeInPopover(): Promise<void> {
	const popover = await menuPopover().element();
	popover!.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
	);
}

describe('RouteHeader', () => {
	it('live header inputs and root bindings', async () => {
		const live = baseLive();
		const game2 = withInventories(headerGame(5));
		const mounted = mountHeader(live);

		// Visible projection of the live game: heading, day, cash, cash trend.
		await expect.element(page.getByRole('heading', { name: 'Harbor City' })).toBeVisible();
		await expect.element(page.getByLabelText(`Day ${live.game!.day}`)).toBeVisible();
		await expect
			.element(page.getByTestId('cash-readout'))
			.toHaveTextContent(live.i18n.format.currency(live.game!.cash));
		const trendPoints = () =>
			document.querySelector('.cash-trend polyline')?.getAttribute('points') ?? null;
		expect(trendPoints()).not.toBeNull();
		const initialTrend = trendPoints();

		// Live game swap (day/cash/history) updates in place, without remount —
		// the trend polyline must re-render the replaced reports' points.
		live.game = game2;
		mounted.sync();
		await expect.element(page.getByLabelText(`Day ${game2.day}`)).toBeVisible();
		await expect
			.element(page.getByTestId('cash-readout'))
			.toHaveTextContent(live.i18n.format.currency(game2.cash));
		await vi.waitFor(() => expect(trendPoints()).not.toBe(initialTrend));

		// Industry view swaps the day ticker for the selected city's inventory.
		live.activeMapView = 'industry';
		mounted.sync();
		await expect.element(page.getByLabelText('Grain: 120')).toBeVisible();
		await expect.element(page.getByLabelText(`Day ${game2.day}`)).not.toBeInTheDocument();

		// The inventory follows the selected industry city id.
		live.industryCityId = 'breadbasket-basin';
		mounted.sync();
		await expect.element(page.getByLabelText('Bottled Water: 40')).toBeVisible();
		await expect.element(page.getByLabelText('Grain: 120')).not.toBeInTheDocument();

		// A live inventory-value update for the selected city changes the
		// readout in place, without remounting the header.
		live.game = {
			...game2,
			cityInventories: [
				{ cityId: 'industry-city', materials: { grain: 120, flour: 80 } },
				{ cityId: 'breadbasket-basin', materials: { 'bottled-water': 97, sugar: 3 } }
			]
		};
		mounted.sync();
		await expect.element(page.getByLabelText('Bottled Water: 97')).toBeVisible();
		await expect.element(page.getByLabelText('Bottled Water: 40')).not.toBeInTheDocument();

		// Alerts drive the bell count.
		live.alerts = twoAlerts;
		mounted.sync();
		await expect.element(alertsBell()).toHaveAttribute('aria-label', '2 alerts');

		// Locale change re-binds the bundle and the active locale.
		const ja = createI18n('ja');
		live.i18n = ja;
		live.activeLocale = 'ja';
		live.managementMenu = menuFor(ja);
		live.activeMapView = 'retail';
		mounted.sync();

		// Panel labels follow the translated menu inside the hamburger menu;
		// the locale selector shows the active locale.
		await menuTrigger().click();
		await expect.element(rootGameMenuOpen()).toHaveTextContent('true');
		await expect.element(page.getByTestId('language-selector')).toHaveValue('ja');
		await expect
			.element(page.getByTestId('cash-readout'))
			.toHaveTextContent(ja.format.currency(game2.cash));
		await expect
			.element(menuPopover().getByRole('button', { name: 'スタッフ', exact: true }))
			.toBeVisible();

		// Anchor: Escape through the popover closes the root-owned binding…
		await pressEscapeInPopover();
		await expect.element(rootGameMenuOpen()).toHaveTextContent('false');
		await expect.element(menuPopover()).not.toBeInTheDocument();

		// …while the alerts binding stays independent.
		await alertsBell().click();
		await expect.element(rootAlertsMenuOpen()).toHaveTextContent('true');
		await expect.element(rootGameMenuOpen()).toHaveTextContent('false');
		await expect.element(page.getByRole('group', { name: '通知一覧' })).toBeVisible();

		// Click-outside dismisses the popover through the same binding.
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.element(rootAlertsMenuOpen()).toHaveTextContent('false');

		// An alert click funnels through the named callback and closes the list.
		await alertsBell().click();
		await page.getByRole('button', { name: /founding store stock/i }).click();
		expect(mounted.spies.onSelectAlert).toHaveBeenCalledWith(twoAlerts[0]);
		await expect.element(rootAlertsMenuOpen()).toHaveTextContent('false');

		// View and locale navigation use the named callbacks and close the menu.
		await menuTrigger().click();
		await menuPopover().getByRole('button', { name: '工業都市マップ', exact: true }).click();
		expect(mounted.spies.onSelectView).toHaveBeenCalledWith('industry');
		await expect.element(rootGameMenuOpen()).toHaveTextContent('false');

		await menuTrigger().click();
		await page.getByTestId('language-selector').selectOptions('ja');
		expect(mounted.spies.onSelectLocale).toHaveBeenCalledWith('ja');
		await expect.element(rootGameMenuOpen()).toHaveTextContent('false');

		// A menu action reports to the root, which closes the menu; focus
		// leaves the unmounted popover (restored by the focus trap).
		await menuTrigger().click();
		const popover = await menuPopover().element();
		expect(popover!.contains(document.activeElement)).toBe(true);
		await menuPopover().getByRole('button', { name: 'スタッフ', exact: true }).click();
		expect(mounted.spies.onOpenManagementPanel).toHaveBeenCalledWith('staff');
		await expect.element(rootGameMenuOpen()).toHaveTextContent('false');
		expect(await menuPopover().elements()).toHaveLength(0);
		expect(popover!.contains(document.activeElement)).toBe(false);
	});

	it('keeps scenario and sandbox menu actions scoped with the audio row after them', async () => {
		const mounted = mountHeader(baseLive());
		await menuTrigger().click();
		await expect.element(rootGameMenuOpen()).toHaveTextContent('true');

		// Order first: management group, then the root-supplied actions
		// snippet, then the audio row.
		const management = await page.getByRole('group', { name: 'Management panels' }).element();
		const savesButton = await page.getByRole('button', { name: 'Saves', exact: true }).element();
		const audio = await page.getByRole('group', { name: 'Audio settings' }).element();
		expect(
			management!.compareDocumentPosition(savesButton!) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		expect(
			savesButton!.compareDocumentPosition(audio!) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();

		// Sandbox mode: catalog + saves entry points from the snippet; the
		// root's save handler closes the menu like the page does.
		await expect
			.element(page.getByRole('button', { name: 'Challenge catalog', exact: true }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Saves', exact: true }).click();
		expect(mounted.spies.onOpenSaves).toHaveBeenCalledOnce();
		await expect.element(rootGameMenuOpen()).toHaveTextContent('false');

		// Live switch to an active scenario run without unmounting the header.
		await menuTrigger().click();
		mounted.live.playMode = 'scenario';
		mounted.scenario.update({ mode: 'scenario', run: scenarioRun() });
		mounted.sync();
		await expect
			.element(page.getByRole('button', { name: 'Restart challenge', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Saves', exact: true }))
			.not.toBeInTheDocument();

		// Pending disables stay scoped to the scenario actions…
		mounted.scenario.update({ pending: true });
		mounted.sync();
		await expect
			.element(page.getByRole('button', { name: 'Restart challenge', exact: true }))
			.toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: 'Dashboard', exact: true }))
			.toBeEnabled();

		// …and the header's root binding is untouched by the snippet change.
		await expect.element(rootGameMenuOpen()).toHaveTextContent('true');

		mounted.scenario.update({ pending: false });
		mounted.sync();
		await page.getByRole('button', { name: 'Restart challenge', exact: true }).click();
		await vi.waitFor(() => {
			expect(mounted.scenario.commands.restartScenarioRun).toHaveBeenCalled();
		});
		await expect.element(rootGameMenuOpen()).toHaveTextContent('true');
	});

	it('keeps audio preferences usable across menu reopen and preference updates', async () => {
		const mounted = mountHeader(baseLive());
		await menuTrigger().click();
		const bgmToggle = page.getByRole('checkbox', { name: 'BGM' });
		await expect.element(bgmToggle).toBeChecked();
		await bgmToggle.click();
		expect(mounted.spies.onUpdateAudioPreferences).toHaveBeenCalledWith({ bgmEnabled: false });

		// The root applies the preference; the control reflects it live.
		mounted.live.audioPreferences = {
			...DEFAULT_AUDIO_PREFERENCES,
			bgmEnabled: false,
			bgmVolume: 0.3
		};
		mounted.sync();
		await expect.element(bgmToggle).not.toBeChecked();
		await expect.element(page.getByRole('slider', { name: 'Music volume' })).toHaveValue('0.3');
		await expect.element(page.getByRole('slider', { name: 'Music volume' })).toBeDisabled();
		await expect.element(page.getByRole('slider', { name: 'Effects volume' })).toBeEnabled();

		// Reopen after Escape: preferences and controls survive.
		await userEvent.keyboard('[Escape]');
		await expect.element(rootGameMenuOpen()).toHaveTextContent('false');
		await menuTrigger().click();
		await expect.element(bgmToggle).not.toBeChecked();

		// Re-enabling through the root preferences makes the row usable again.
		mounted.live.audioPreferences = { ...DEFAULT_AUDIO_PREFERENCES, bgmEnabled: true };
		mounted.sync();
		await expect.element(bgmToggle).toBeChecked();
		await expect.element(page.getByRole('slider', { name: 'Music volume' })).toBeEnabled();
	});

	it('keeps the management menu accessible on a narrow viewport', async () => {
		await page.viewport(375, 667);
		const mounted = mountHeader(baseLive());
		await menuTrigger().click();
		await expect.element(page.getByRole('group', { name: 'Management panels' })).toBeVisible();
		for (const item of mounted.live.managementMenu) {
			await expect
				.element(page.getByRole('button', { name: item.label, exact: true }))
				.toBeVisible();
		}
		const popover = await menuPopover().element();
		const box = popover!.getBoundingClientRect();
		expect(box).not.toBeNull();
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(375);
		await expect.element(page.getByRole('group', { name: 'Audio settings' })).toBeVisible();
	});
});
