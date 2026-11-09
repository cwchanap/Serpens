import { tick } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n, type I18nBundle } from '$lib/i18n';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
import { getExpansionFinanceOffer } from '$lib/game/finance';
import { createNewGame, getExpansionSetupCost } from '$lib/game/state';
import { getTileById } from '$lib/game/city';
import type { GameState } from '$lib/game/types';
import { isFinanceReviewEscapeOwned, type PendingFinancedPurchase } from './financePurchaseReview';
import type { GameRouteController, MutationAvailability } from './gameRouteController';
import { createPurchaseReviewSession } from './purchaseReviewSession.svelte';
import { createConstructionUi, type ConstructionUiCommands } from './constructionUi.svelte';
import ConstructionControls from './ConstructionControls.svelte';

const retailPurchaseTileId = 'tile-harbor-12';

function validOffer(): NonNullable<PendingFinancedPurchase['offer']> {
	return {
		principal: 1_200,
		termDays: 84,
		annualInterestRateBps: 725,
		estimatedPeakPayment: 40
	};
}

function retailPurchase(offer: PendingFinancedPurchase['offer']): PendingFinancedPurchase {
	return {
		kind: 'retail',
		tileId: retailPurchaseTileId,
		archetypeId: 'convenience',
		expectedCost: 2_450,
		offer
	};
}

function allAvailability(overrides: Partial<MutationAvailability> = {}): MutationAvailability {
	return {
		pending: false,
		advanceDay: true,
		resolveDecision: true,
		updatePolicy: true,
		scopedPolicy: true,
		delegation: true,
		openWorldCity: true,
		setRetailSupplySource: true,
		manageLogistics: true,
		createRecurringRoute: true,
		updateRecurringRoute: true,
		pauseRecurringRoute: true,
		resumeRecurringRoute: true,
		openStore: true,
		upgradeStore: true,
		hireStaff: true,
		assignStaff: true,
		unassignStaff: true,
		releaseStaff: true,
		promoteStaff: true,
		updateStoreSellingPrice: true,
		updateStoreInventoryTargets: true,
		updateStoreProductBrand: true,
		buildIndustrialBuilding: true,
		upgradeIndustrialBuilding: true,
		buildRail: true,
		upgradeRail: true,
		demolishRail: true,
		borrow: true,
		repayLoan: true,
		payOffLoan: true,
		refinanceLoan: true,
		financeWorldCity: true,
		financeRetailStore: true,
		financeIndustrialBuilding: true,
		...overrides
	};
}

interface DeferredCommand {
	result: Promise<GameRouteCommitResult>;
	resolve(result: GameRouteCommitResult): void;
}

function deferredCommand(): DeferredCommand {
	let resolve!: (result: GameRouteCommitResult) => void;
	const result = new Promise<GameRouteCommitResult>((res) => {
		resolve = res;
	});
	return { result, resolve };
}

type FinanceCommands = Pick<
	GameRouteController,
	'financeWorldCity' | 'financeRetailStore' | 'financeIndustrialBuilding'
>;

function financeCommands(spy: ReturnType<typeof vi.fn>): FinanceCommands {
	return {
		financeWorldCity: spy as unknown as FinanceCommands['financeWorldCity'],
		financeRetailStore: spy as unknown as FinanceCommands['financeRetailStore'],
		financeIndustrialBuilding: spy as unknown as FinanceCommands['financeIndustrialBuilding']
	};
}

function session(options: {
	commands: FinanceCommands;
	getGame?: () => GameState | null;
	getI18n?: () => I18nBundle;
	onCommitted?: () => void;
}) {
	return createPurchaseReviewSession({
		getGame: options.getGame ?? (() => createNewGame('convenience', 42)),
		getI18n: options.getI18n ?? (() => createI18n('en')),
		commands: options.commands,
		onCommitted: options.onCommitted ?? (() => {})
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

it('double confirm defers one command and ignores the second submit', async () => {
	expect.assertions(5);
	const financeCommand = vi.fn();
	const deferred = deferredCommand();
	financeCommand.mockReturnValue(deferred.result);
	const review = session({ commands: financeCommands(financeCommand) });

	review.open(retailPurchase(validOffer()));
	expect(review.state.confirmationPending).toBe(false);

	const first = review.confirm();
	expect(review.state.confirmationPending).toBe(true);
	const second = review.confirm();

	deferred.resolve({ status: 'committed' });
	await Promise.all([first, second]);

	expect(financeCommand).toHaveBeenCalledTimes(1);
	expect(financeCommand).toHaveBeenCalledWith(retailPurchaseTileId, 'convenience', 2_450);
	expect(review.state.purchase).toBeNull();
});

it('committed settlement runs the clear callback once and closes the review', async () => {
	expect.assertions(3);
	const financeCommand = vi.fn().mockResolvedValue({ status: 'committed' });
	const onCommitted = vi.fn();
	const review = session({ commands: financeCommands(financeCommand), onCommitted });

	review.open(retailPurchase(validOffer()));
	await review.confirm();

	expect(financeCommand).toHaveBeenCalledTimes(1);
	expect(onCommitted).toHaveBeenCalledTimes(1);
	expect(review.state.purchase).toBeNull();
});

it('stale generation cannot clear a newer review after opening it', async () => {
	expect.assertions(4);
	const deferred = deferredCommand();
	const financeCommand = vi.fn().mockReturnValue(deferred.result);
	const onCommitted = vi.fn();
	const review = session({ commands: financeCommands(financeCommand), onCommitted });

	const newerPurchase = retailPurchase({ ...validOffer(), principal: 900 });
	review.open(retailPurchase(validOffer()));
	const pending = review.confirm();
	review.open(newerPurchase);

	deferred.resolve({ status: 'committed' });
	await pending;

	expect(review.state.purchase).toBe(newerPurchase);
	expect(review.state.confirmationPending).toBe(false);
	expect(onCommitted).not.toHaveBeenCalled();
	expect(review.state.feedback).toBeNull();
});

it('refresh rejected quote uses the live game and keeps refresh eligibility', async () => {
	expect.assertions(8);
	const baseGame = createNewGame('convenience', 42);
	const city = baseGame.cities.find((candidate) => candidate.id === baseGame.activeCityId)!;
	const tile = getTileById(city, city.tiles.find((candidate) => !candidate.locked)!.id)!;
	const expectedCost = getExpansionSetupCost(tile, 'convenience');
	// Snapshot game still has credit headroom; the live game at settlement time
	// is deep in the red, so the refreshed offer derived from it must be null.
	const snapshotGame = { ...baseGame, cash: expectedCost - 1 };
	const holder: { game: GameState | null } = { game: snapshotGame };
	const financeCommand = vi.fn();
	const first = deferredCommand();
	financeCommand.mockReturnValue(first.result);
	const review = session({ commands: financeCommands(financeCommand), getGame: () => holder.game });

	review.open({
		kind: 'retail',
		tileId: tile.id,
		archetypeId: 'convenience',
		expectedCost,
		offer: validOffer()
	});
	const pending = review.confirm();
	holder.game = { ...snapshotGame, cash: -5_000_000 };
	first.resolve({
		status: 'domain-rejected',
		code: 'purchaseCostChanged',
		context: { expectedCost }
	});
	await pending;

	// Live game wins: deeply negative cash means no refreshed offer.
	expect(review.state.purchase?.offer).toBeNull();
	expect(review.state.confirmationPending).toBe(false);
	expect(review.state.feedback).toBe('Purchase cost changed');

	// Eligible rejection with the game gone falls back to the captured snapshot.
	holder.game = snapshotGame;
	review.open({
		kind: 'retail',
		tileId: tile.id,
		archetypeId: 'convenience',
		expectedCost,
		offer: validOffer()
	});
	const fallbackDeferred = deferredCommand();
	financeCommand.mockReturnValueOnce(fallbackDeferred.result);
	const fallbackPending = review.confirm();
	holder.game = null;
	fallbackDeferred.resolve({
		status: 'domain-rejected',
		code: 'insufficientCredit',
		context: {}
	});
	await fallbackPending;
	// The refreshed quote must be exactly the one derived from the game
	// captured when confirm started — not merely any non-null offer.
	expect(review.state.purchase).toEqual({
		kind: 'retail',
		tileId: tile.id,
		archetypeId: 'convenience',
		expectedCost,
		offer: getExpansionFinanceOffer(snapshotGame, expectedCost)
	});
	expect(review.state.feedback).toBe('Insufficient credit');

	// Ineligible failures keep the original purchase untouched. The confirm
	// path needs a live game (the page guard) — restore it after the
	// fallback sub-case nulled it.
	holder.game = snapshotGame;
	const ineligiblePurchase = retailPurchase(validOffer());
	review.open(ineligiblePurchase);
	const failedDeferred = deferredCommand();
	financeCommand.mockReturnValueOnce(failedDeferred.result);
	const failedPending = review.confirm();
	failedDeferred.resolve({ status: 'failed' });
	await failedPending;
	expect(review.state.feedback).toBe('Finance action could not be completed.');
	// The original purchase survives ineligible failures untouched: same
	// reference and same offer value, with no refreshed replacement applied.
	expect(review.state.purchase).toBe(ineligiblePurchase);
	expect(review.state.purchase?.offer).toEqual(validOffer());
});

it('locale at settlement localizes rejection feedback live', async () => {
	expect.assertions(3);
	const holder: { i18n: I18nBundle } = { i18n: createI18n('en') };
	const financeCommand = vi.fn().mockResolvedValue({
		status: 'domain-rejected',
		code: 'insufficientCredit',
		context: {}
	});
	const review = session({
		commands: financeCommands(financeCommand),
		getI18n: () => holder.i18n
	});

	review.open(retailPurchase(validOffer()));
	const pending = review.confirm();
	holder.i18n = createI18n('ja');
	await pending;

	expect(review.state.feedback).toBe(
		createI18n('ja').t('financePanel.failures.insufficientCredit')
	);
	expect(review.state.feedback).not.toBe('Insufficient credit');
	expect(review.state.purchase).not.toBeNull();
});

it('pending close is blocked and cannot dismiss the review', async () => {
	expect.assertions(5);
	const deferred = deferredCommand();
	const financeCommand = vi.fn().mockReturnValue(deferred.result);
	const review = session({ commands: financeCommands(financeCommand) });

	const purchase = retailPurchase(validOffer());
	review.open(purchase);
	const pending = review.confirm();
	review.close();

	expect(review.state.purchase).toBe(purchase);
	expect(review.state.confirmationPending).toBe(true);

	deferred.resolve({ status: 'committed' });
	await pending;
	expect(review.state.purchase).toBeNull();

	// Close after settlement completes normally.
	review.open(retailPurchase(validOffer()));
	review.close();
	expect(review.state.purchase).toBeNull();
	expect(financeCommand).toHaveBeenCalledTimes(1);
});

it('focus is restored after tick only for user dismissal, not success or reset', async () => {
	expect.assertions(6);
	const anchor = document.createElement('button');
	document.body.append(anchor);
	anchor.focus();
	expect(document.activeElement).toBe(anchor);

	const financeCommand = vi.fn().mockResolvedValue({ status: 'committed' });
	const review = session({ commands: financeCommands(financeCommand) });

	review.open(retailPurchase(validOffer()));
	anchor.blur();
	await review.confirm();
	await tick();
	expect(document.activeElement).not.toBe(anchor);

	anchor.focus();
	review.open(retailPurchase(validOffer()));
	anchor.blur();
	review.reset();
	await tick();
	expect(review.state.purchase).toBeNull();
	expect(document.activeElement).not.toBe(anchor);

	anchor.focus();
	review.open(retailPurchase(validOffer()));
	anchor.blur();
	review.close();
	expect(review.state.purchase).toBeNull();
	await tick();
	expect(document.activeElement).toBe(anchor);
	anchor.remove();
});

it('capture KeyboardEvent dismissal does not also cancel construction', async () => {
	expect.assertions(5);
	const fallback = createNewGame('convenience', 42);
	const commands = {
		foundStore: vi.fn(),
		openStore: vi.fn(),
		buildIndustrialBuilding: vi.fn(),
		buildRail: vi.fn(),
		financeWorldCity: vi.fn(),
		financeRetailStore: vi.fn().mockResolvedValue({ status: 'committed' }),
		financeIndustrialBuilding: vi.fn()
	} satisfies ConstructionUiCommands;
	const ui = createConstructionUi({
		getGame: () => fallback,
		getRetailCity: () => fallback.cities[0]!,
		getIndustryCity: () => fallback.industryCities[0]!,
		getFallback: () => fallback,
		getView: () => 'industry',
		getMode: () => 'sandbox',
		getDefinition: () => null,
		getAvailability: () => allAvailability(),
		getI18n: () => createI18n('en'),
		commands,
		playSfx: () => {},
		onSelectPlacementTile: () => {},
		onClearSelections: () => {},
		onFoundingPause: () => {},
		onMenuOpen: () => {}
	});

	render(ConstructionControls, {
		ui,
		i18n: createI18n('en'),
		cash: fallback.cash,
		view: 'industry',
		guidanceVisible: false,
		onOpenAdvisor: () => {}
	});

	const routing: Extract<Parameters<typeof ui.enterRailRouting>[0], { step: 'routing' }> = {
		step: 'routing',
		originBuildingId: 'building-1',
		waypoints: [{ x: 1, y: 1 }]
	};
	ui.enterRailRouting(routing);
	expect(ui.railMode).toEqual(routing);

	// Page-mirroring handler: while a review owns Escape, the page must not
	// cancel construction (the same guard +page.svelte applies).
	const pageKeydown = (event: KeyboardEvent): void => {
		if (event.key !== 'Escape') return;
		if (isFinanceReviewEscapeOwned(ui.purchaseReview)) return;
		ui.cancel();
	};
	window.addEventListener('keydown', pageKeydown);

	ui.review(retailPurchase(validOffer()));
	const generationAtOpen = ui.purchaseReview.generation;
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await tick();

	// The captured event dismissed the review through the single dialog path
	// (exactly one generation bump). If the page-level handler had also run
	// its cancel branch, the reset would bump the generation a second time.
	expect(ui.purchaseReview.purchase).toBeNull();
	expect(ui.purchaseReview.generation).toBe(generationAtOpen + 1);
	// Dismissal cleanup clears armed placement/rail exactly like the
	// pre-extraction route's dismissal handler did.
	expect(ui.railMode).toEqual({ step: 'idle' });

	// Without a review, the mirrored page handler cancels construction.
	ui.enterRailRouting(routing);
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await tick();
	expect(ui.railMode).toEqual({ step: 'idle' });
	window.removeEventListener('keydown', pageKeydown);
});

it('confirm is a no-op without a game', async () => {
	expect.assertions(2);
	const financeCommand = vi.fn();
	const review = session({ commands: financeCommands(financeCommand), getGame: () => null });

	review.open(retailPurchase(validOffer()));
	await review.confirm();

	expect(financeCommand).not.toHaveBeenCalled();
	expect(review.state.confirmationPending).toBe(false);
});

it('a world-city purchase dispatches financeWorldCity with the quoted args', async () => {
	expect.assertions(3);
	const financeCommand = vi.fn().mockResolvedValue({ status: 'committed' });
	const review = session({ commands: financeCommands(financeCommand) });

	review.open({
		kind: 'world',
		cityId: 'campus-junction',
		expectedCost: 18_000,
		offer: validOffer()
	});
	await review.confirm();

	expect(financeCommand).toHaveBeenCalledTimes(1);
	expect(financeCommand).toHaveBeenCalledWith('campus-junction', 18_000);
	expect(review.state.purchase).toBeNull();
});

it('close restores focus to the element that opened the review', async () => {
	expect.assertions(2);
	const review = session({ commands: financeCommands(vi.fn()) });
	const button = document.createElement('button');
	document.body.append(button);
	button.focus();
	try {
		review.open(retailPurchase(validOffer()));
		review.close();
		await tick();
		expect(document.activeElement).toBe(button);
		expect(review.state.purchase).toBeNull();
	} finally {
		button.remove();
	}
});

it('a missing active element keeps no return focus on open', async () => {
	expect.assertions(1);
	const spy = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null);
	const review = session({ commands: financeCommands(vi.fn()) });

	review.open(retailPurchase(validOffer()));
	review.close();
	await tick();

	expect(review.state.purchase).toBeNull();
	spy.mockRestore();
});
