import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import type {
	ScenarioCatalogActionResult,
	ScenarioCatalogCardViewModel
} from '$lib/i18n/scenarioCopy';
import ScenarioCatalog from './ScenarioCatalog.svelte';

function card(
	id: ScenarioCatalogCardViewModel['id'],
	title: string,
	overrides: Partial<ScenarioCatalogCardViewModel> = {}
): ScenarioCatalogCardViewModel {
	return {
		id,
		version: 1,
		title,
		summary: `${title} summary`,
		briefing: `${title} briefing`,
		strategyHint: `${title} hint`,
		dayLimitLabel: '14 day limit',
		objectiveSummaries: ['Earn a profit'],
		allowedContentSummary: '1 city, 1 store type, 1 product',
		seedLabel: 'Official seed 101',
		eligibilityLabel: 'Ranked',
		available: true,
		unavailableReason: null,
		primaryAction: 'start',
		primaryLabel: 'Start',
		showRestart: false,
		activeDefinitionRef: null,
		activeRunId: null,
		showStartCurrent: false,
		activeVersionLabel: null,
		best: null,
		priorVersionResult: null,
		shareCode: `SC1.${id}.1.2t.0000000`,
		...overrides
	};
}

const cards = [
	card('first-profit', 'First Profit', {
		best: { scoreLabel: '880 points', medalLabel: 'Silver' }
	}),
	card('import-squeeze', 'Import Squeeze', {
		primaryAction: 'resume',
		primaryLabel: 'Resume',
		showRestart: true
	}),
	card('local-lifeline', 'Local Lifeline')
];

function renderCatalog(
	overrides: Partial<{
		cards: ScenarioCatalogCardViewModel[];
		operationError: string | null;
		pending: boolean;
		persistenceReady: boolean;
		onStart: (
			card: ScenarioCatalogCardViewModel,
			confirmed: boolean,
			expectedRunId?: string | null,
			expectedRevision?: number | null
		) => ScenarioCatalogActionResult | Promise<ScenarioCatalogActionResult>;
		onResume: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onRestart: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onStartCurrent: (
			card: ScenarioCatalogCardViewModel,
			confirmed: boolean,
			expectedRunId?: string | null,
			expectedRevision?: number | null
		) => ScenarioCatalogActionResult | Promise<ScenarioCatalogActionResult>;
		onImport: (
			code: string,
			confirmed: boolean,
			expectedRunId?: string | null,
			expectedRevision?: number | null
		) => ScenarioCatalogActionResult | Promise<ScenarioCatalogActionResult>;
		onCopy: (code: string) => boolean | Promise<boolean>;
		onRetry: () => void | Promise<void>;
		onClose: () => void;
	}> = {}
) {
	const props = {
		cards,
		i18n: createI18n('en'),
		operationError: null,
		pending: false,
		persistenceReady: true,
		onStart: vi.fn(async (): Promise<ScenarioCatalogActionResult> => ({ status: 'started' })),
		onResume: vi.fn(),
		onRestart: vi.fn(),
		onStartCurrent: vi.fn(
			async (): Promise<ScenarioCatalogActionResult> => ({ status: 'started' })
		),
		onImport: vi.fn(async (): Promise<ScenarioCatalogActionResult> => ({ status: 'started' })),
		onCopy: vi.fn(async () => true),
		onRetry: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};
	return { ...props, result: render(ScenarioCatalog, props) };
}

describe('ScenarioCatalog', () => {
	it('renders three available cards, current bests, and Start/Resume/Restart actions', async () => {
		expect.assertions(8);
		const onStart = vi.fn(
			async (): Promise<ScenarioCatalogActionResult> => ({ status: 'started' })
		);
		const onResume = vi.fn();
		const onRestart = vi.fn();
		renderCatalog({ onStart, onResume, onRestart });

		await expect.element(page.getByRole('dialog', { name: 'Challenge catalog' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'First Profit' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Import Squeeze' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Local Lifeline' })).toBeVisible();
		await expect.element(page.getByText('Silver · 880 points')).toBeVisible();
		await page.getByRole('button', { name: 'Start First Profit' }).click();
		await page.getByRole('button', { name: 'Resume Import Squeeze' }).click();
		await page.getByRole('button', { name: 'Restart Import Squeeze' }).click();
		expect(onStart).toHaveBeenCalledWith(cards[0], false);
		expect(onResume).toHaveBeenCalledWith(cards[1]);
		expect(onRestart).toHaveBeenCalledWith(cards[1]);
	});

	it('confirms replacing an active run discovered by the ordinary Start action', async () => {
		expect.assertions(3);
		const onStart = vi.fn(
			async (
				_card: ScenarioCatalogCardViewModel,
				confirmed: boolean
			): Promise<ScenarioCatalogActionResult> => {
				if (!confirmed) {
					return {
						status: 'confirmation-required',
						message: 'Starting this challenge replaces the active run.',
						expectedRunId: 'run-active',
						expectedRevision: 3
					};
				}
				return { status: 'started' };
			}
		);
		// A card whose summary said "no active run" when the catalogue opened,
		// but another tab started the scenario before this tab clicked Start.
		const stale = card('first-profit', 'First Profit');
		renderCatalog({ cards: [stale], onStart });

		await page.getByRole('button', { name: 'Start First Profit' }).click();
		expect(onStart).toHaveBeenCalledWith(stale, false);
		await expect
			.element(
				page.getByRole('alertdialog', {
					name: 'Starting this challenge replaces the active run.'
				})
			)
			.toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onStart).toHaveBeenLastCalledWith(stale, true, 'run-active', 3);
	});

	it('reopens the Start confirmation when the confirmed write loses the compare-and-swap', async () => {
		expect.assertions(5);
		const responses: Array<
			(card: ScenarioCatalogCardViewModel, confirmed: boolean) => ScenarioCatalogActionResult
		> = [
			() => ({
				status: 'confirmation-required',
				message: 'Replace run A?',
				expectedRunId: 'runA',
				expectedRevision: 1
			}),
			() => ({
				status: 'confirmation-required',
				message: 'Replace run B?',
				expectedRunId: 'runB',
				expectedRevision: 2
			}),
			() => ({ status: 'started' })
		];
		const onStart = vi.fn(async (_card: ScenarioCatalogCardViewModel, _confirmed: boolean) =>
			responses.shift()!(_card, _confirmed)
		);
		const stale = card('first-profit', 'First Profit');
		renderCatalog({ cards: [stale], onStart });

		await page.getByRole('button', { name: 'Start First Profit' }).click();
		expect(onStart).toHaveBeenLastCalledWith(stale, false);
		await expect.element(page.getByRole('alertdialog', { name: 'Replace run A?' })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onStart).toHaveBeenLastCalledWith(stale, true, 'runA', 1);
		await expect.element(page.getByRole('alertdialog', { name: 'Replace run B?' })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onStart).toHaveBeenLastCalledWith(stale, true, 'runB', 2);
	});

	it('confirms replacing an older active version with the current version', async () => {
		expect.assertions(4);
		const onStartCurrent = vi.fn(
			async (
				_card: ScenarioCatalogCardViewModel,
				confirmed: boolean
			): Promise<ScenarioCatalogActionResult> => {
				if (!confirmed) {
					return {
						status: 'confirmation-required',
						message: 'Starting the current version replaces the active older run.',
						expectedRunId: 'run-old',
						expectedRevision: 1
					};
				}
				return { status: 'started' };
			}
		);
		const old = card('first-profit', 'First Profit', {
			primaryAction: 'resume',
			primaryLabel: 'Resume version 1',
			showRestart: true,
			showStartCurrent: true,
			activeVersionLabel: 'Active version 1 (current version 2)',
			activeRunId: 'run-old',
			version: 2
		});
		renderCatalog({ cards: [old], onStartCurrent });

		await expect.element(page.getByText('Active version 1 (current version 2)')).toBeVisible();
		await page.getByRole('button', { name: 'Start current First Profit' }).click();
		expect(onStartCurrent).toHaveBeenCalledWith(old, false);
		await expect
			.element(
				page.getByRole('alertdialog', {
					name: 'Starting the current version replaces the active older run.'
				})
			)
			.toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onStartCurrent).toHaveBeenLastCalledWith(old, true, 'run-old', 1);
	});

	it('reopens the current-version confirmation when the confirmed write loses the compare-and-swap', async () => {
		expect.assertions(5);
		const responses: Array<
			(card: ScenarioCatalogCardViewModel, confirmed: boolean) => ScenarioCatalogActionResult
		> = [
			() => ({
				status: 'confirmation-required',
				message: 'Replace run A?',
				expectedRunId: 'runA',
				expectedRevision: 1
			}),
			() => ({
				status: 'confirmation-required',
				message: 'Replace run B?',
				expectedRunId: 'runB',
				expectedRevision: 2
			}),
			() => ({ status: 'started' })
		];
		const onStartCurrent = vi.fn(async (_card: ScenarioCatalogCardViewModel, _confirmed: boolean) =>
			responses.shift()!(_card, _confirmed)
		);
		const old = card('first-profit', 'First Profit', {
			primaryAction: 'resume',
			primaryLabel: 'Resume version 1',
			showRestart: true,
			showStartCurrent: true,
			activeVersionLabel: 'Active version 1 (current version 2)',
			activeRunId: 'run-old',
			version: 2
		});
		renderCatalog({ cards: [old], onStartCurrent });

		// The initial (confirmed=false) call discovers the existing run and
		// returns its (runId, revision) pair as the confirmation token.
		await page.getByRole('button', { name: 'Start current First Profit' }).click();
		expect(onStartCurrent).toHaveBeenLastCalledWith(old, false);
		await expect.element(page.getByRole('alertdialog', { name: 'Replace run A?' })).toBeVisible();
		// The confirmed write lost the compare-and-swap to a newer run; the
		// dialog reopens with run B's message and token instead of closing.
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onStartCurrent).toHaveBeenLastCalledWith(old, true, 'runA', 1);
		await expect.element(page.getByRole('alertdialog', { name: 'Replace run B?' })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onStartCurrent).toHaveBeenLastCalledWith(old, true, 'runB', 2);
	});

	it('confirms imported replacement and announces malformed, unsupported, and checksum errors', async () => {
		expect.assertions(6);
		const responses: ScenarioCatalogActionResult[] = [
			{ status: 'error', message: 'Malformed share-code format.' },
			{ status: 'error', message: 'Unsupported challenge version.' },
			{ status: 'error', message: 'Share-code checksum does not match.' },
			{ status: 'confirmation-required', message: 'Replace the active run?' },
			{ status: 'started' }
		];
		const onImport = vi.fn(async () => responses.shift()!);
		renderCatalog({ onImport });
		const input = page.getByLabelText('Share code');
		const submit = page.getByRole('button', { name: 'Import code' });

		for (const [code, message] of [
			['bad', 'Malformed share-code format.'],
			['old', 'Unsupported challenge version.'],
			['checksum', 'Share-code checksum does not match.']
		]) {
			await input.fill(code);
			await submit.click();
			await expect.element(page.getByText(message)).toBeVisible();
		}
		await input.fill('valid');
		await submit.click();
		await expect.element(page.getByText('Replace the active run?')).toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onImport).toHaveBeenLastCalledWith('valid', true, undefined, undefined);
		expect(onImport).toHaveBeenCalledTimes(5);
	});

	it('announces copy success and failure without direct clipboard access', async () => {
		expect.assertions(3);
		const onCopy = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		renderCatalog({ cards: [cards[0]!], onCopy });

		await page.getByRole('button', { name: 'Copy code for First Profit' }).click();
		await expect.element(page.getByText('Share code copied.')).toBeVisible();
		await page.getByRole('button', { name: 'Copy code for First Profit' }).click();
		await expect.element(page.getByText('Unable to copy the share code.')).toBeVisible();
		expect(onCopy).toHaveBeenCalledTimes(2);
	});

	it('renders invalid definitions unavailable and retries persistence errors without changing cards', async () => {
		expect.assertions(5);
		const onRetry = vi.fn();
		const invalid = card('first-profit', 'First Profit', {
			available: false,
			unavailableReason: 'Invalid built-in challenge: invalid reference.'
		});
		renderCatalog({
			cards: [invalid],
			operationError: 'The challenge could not be saved.',
			onRetry
		});

		await expect
			.element(page.getByText('Invalid built-in challenge: invalid reference.'))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Start First Profit' })).toBeDisabled();
		await expect.element(page.getByText('The challenge could not be saved.')).toBeVisible();
		await page.getByRole('button', { name: 'Retry' }).click();
		expect(onRetry).toHaveBeenCalledTimes(1);
		await expect.element(page.getByRole('heading', { name: 'First Profit' })).toBeVisible();
	});

	it('closes with Escape and restores focus to the opener', async () => {
		expect.assertions(2);
		const opener = document.createElement('button');
		opener.textContent = 'Open challenges';
		document.body.append(opener);
		opener.focus();
		const onClose = vi.fn();
		const { result } = renderCatalog({ cards: [cards[0]!], onClose });

		(document.activeElement as HTMLElement).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		expect(onClose).toHaveBeenCalledTimes(1);
		await result.unmount();
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});

	it('disables Start/Resume/Restart/StartCurrent/Import while persistence is not ready', async () => {
		expect.assertions(6);
		const onStart = vi.fn(
			async (): Promise<ScenarioCatalogActionResult> => ({ status: 'started' })
		);
		const onResume = vi.fn();
		const onRestart = vi.fn();
		const onStartCurrent = vi.fn();
		const onImport = vi.fn(
			async (): Promise<ScenarioCatalogActionResult> => ({
				status: 'started'
			})
		);
		const readyCard = card('import-squeeze', 'Import Squeeze', {
			primaryAction: 'resume',
			primaryLabel: 'Resume',
			showRestart: true,
			showStartCurrent: true,
			activeVersionLabel: 'Active version 1 (current version 2)',
			version: 2
		});
		renderCatalog({
			cards: [readyCard],
			persistenceReady: false,
			onStart,
			onResume,
			onRestart,
			onStartCurrent,
			onImport
		});

		await expect
			.element(page.getByRole('button', { name: 'Resume Import Squeeze' }))
			.toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: 'Restart Import Squeeze' }))
			.toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: 'Start current Import Squeeze' }))
			.toBeDisabled();
		const submit = page.getByRole('button', { name: 'Import code' });
		await expect.element(submit).toBeDisabled();

		await page.getByRole('button', { name: 'Copy code for Import Squeeze' }).click();
		expect(onStart).not.toHaveBeenCalled();
		expect(onImport).not.toHaveBeenCalled();
	});

	it('renders the prior version result line when a previous run exists', async () => {
		expect.assertions(1);
		const prior = card('first-profit', 'First Profit', {
			priorVersionResult: { medalLabel: 'Gold', scoreLabel: '900 points' }
		});
		renderCatalog({ cards: [prior] });

		await expect.element(page.getByText('Prior version result: Gold · 900 points')).toBeVisible();
	});

	it('disables the import submit and operation-error retry buttons while an operation is pending', async () => {
		expect.assertions(2);
		renderCatalog({
			cards: [cards[0]!],
			operationError: 'The challenge could not be saved.',
			pending: true
		});

		await expect.element(page.getByRole('button', { name: 'Retry' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Import code' })).toBeDisabled();
	});

	it('does not call onImport when the share-code field is empty', async () => {
		expect.assertions(1);
		const onImport = vi.fn();
		renderCatalog({ cards: [cards[0]!], onImport });

		await page.getByRole('button', { name: 'Import code' }).click();
		expect(onImport).not.toHaveBeenCalled();
	});

	it('clears the announcement when an import starts successfully on the first try', async () => {
		expect.assertions(2);
		const onImport = vi.fn(
			async (): Promise<ScenarioCatalogActionResult> => ({ status: 'started' })
		);
		renderCatalog({ cards: [cards[0]!], onImport });

		await page.getByLabelText('Share code').fill('valid');
		await page.getByRole('button', { name: 'Import code' }).click();
		expect(onImport).toHaveBeenCalledWith('valid', false);
		// A successful start neither opens a confirmation nor announces an error.
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
	});

	it('announces the error when a confirmed import replacement fails', async () => {
		expect.assertions(3);
		const onImport = vi.fn(
			async (code: string, confirmed: boolean): Promise<ScenarioCatalogActionResult> => {
				if (!confirmed) {
					return { status: 'confirmation-required', message: 'Replace the active run?' };
				}
				return { status: 'error', message: 'The challenge could not be imported.' };
			}
		);
		renderCatalog({ cards: [cards[0]!], onImport });

		await page.getByLabelText('Share code').fill('valid');
		await page.getByRole('button', { name: 'Import code' }).click();
		await expect
			.element(page.getByRole('alertdialog', { name: 'Replace the active run?' }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onImport).toHaveBeenLastCalledWith('valid', true, undefined, undefined);
		await expect.element(page.getByText('The challenge could not be imported.')).toBeVisible();
	});

	it('reopens the confirmation with the new token when a confirmed import returns a second confirmation-required', async () => {
		expect.assertions(5);
		const responses: Array<(code: string, confirmed: boolean) => ScenarioCatalogActionResult> = [
			() => ({
				status: 'confirmation-required',
				message: 'Replace run A?',
				expectedRunId: 'runA',
				expectedRevision: 1
			}),
			() => ({
				status: 'confirmation-required',
				message: 'Replace run B?',
				expectedRunId: 'runB',
				expectedRevision: 2
			}),
			() => ({ status: 'started' })
		];
		const onImport = vi.fn(async (_code: string, _confirmed: boolean) =>
			responses.shift()!(_code, _confirmed)
		);
		renderCatalog({ cards: [cards[0]!], onImport });

		await page.getByLabelText('Share code').fill('valid');
		await page.getByRole('button', { name: 'Import code' }).click();
		await expect.element(page.getByRole('alertdialog', { name: 'Replace run A?' })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onImport).toHaveBeenLastCalledWith('valid', true, 'runA', 1);
		// The confirmed write lost the compare-and-swap to a newer run; the
		// dialog reopens with run B's message and token instead of closing.
		await expect.element(page.getByRole('alertdialog', { name: 'Replace run B?' })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onImport).toHaveBeenLastCalledWith('valid', true, 'runB', 2);
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
	});

	it('clears an open confirmation with Escape instead of closing the catalog', async () => {
		expect.assertions(3);
		const onClose = vi.fn();
		const onStartCurrent = vi.fn(
			async (): Promise<ScenarioCatalogActionResult> => ({
				status: 'confirmation-required',
				message: 'Starting the current version replaces the active older run.',
				expectedRunId: 'run-old',
				expectedRevision: 1
			})
		);
		const old = card('first-profit', 'First Profit', {
			primaryAction: 'resume',
			primaryLabel: 'Resume version 1',
			showRestart: true,
			showStartCurrent: true,
			activeVersionLabel: 'Active version 1 (current version 2)',
			version: 2
		});
		const { result } = renderCatalog({ cards: [old], onClose, onStartCurrent });

		await page.getByRole('button', { name: 'Start current First Profit' }).click();
		await expect
			.element(
				page.getByRole('alertdialog', {
					name: 'Starting the current version replaces the active older run.'
				})
			)
			.toBeVisible();
		(document.activeElement as HTMLElement).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
		await result.unmount();
	});

	it('ignores non-Escape keydowns and leaves the catalog open', async () => {
		expect.assertions(1);
		const onClose = vi.fn();
		const { result } = renderCatalog({ cards: [cards[0]!], onClose });

		(document.activeElement as HTMLElement).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
		);
		expect(onClose).not.toHaveBeenCalled();
		await result.unmount();
	});

	it('announces the error when start-current returns an error status', async () => {
		expect.assertions(2);
		const onStartCurrent = vi.fn(
			async (): Promise<ScenarioCatalogActionResult> => ({
				status: 'error',
				message: 'The challenge could not be started.'
			})
		);
		const startCard = card('first-profit', 'First Profit', {
			showStartCurrent: true,
			version: 2
		});
		renderCatalog({ cards: [startCard], onStartCurrent });

		await page.getByRole('button', { name: 'Start current First Profit' }).click();
		expect(onStartCurrent).toHaveBeenCalledWith(startCard, false);
		await expect.element(page.getByText('The challenge could not be started.')).toBeVisible();
	});

	it('clears the announcement when start-current succeeds on the first try', async () => {
		expect.assertions(2);
		const onStartCurrent = vi.fn(
			async (): Promise<ScenarioCatalogActionResult> => ({ status: 'started' })
		);
		const startCard = card('first-profit', 'First Profit', {
			showStartCurrent: true,
			version: 2
		});
		renderCatalog({ cards: [startCard], onStartCurrent });

		await page.getByRole('button', { name: 'Start current First Profit' }).click();
		expect(onStartCurrent).toHaveBeenCalledWith(startCard, false);
		// A successful start neither opens a confirmation nor announces an error.
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
	});

	it('announces the error when a confirmed start-current replacement fails', async () => {
		expect.assertions(2);
		const onStartCurrent = vi.fn(
			async (
				_card: ScenarioCatalogCardViewModel,
				confirmed: boolean
			): Promise<ScenarioCatalogActionResult> => {
				if (!confirmed) {
					return {
						status: 'confirmation-required',
						message: 'Starting the current version replaces the active older run.',
						expectedRunId: 'run-old',
						expectedRevision: 1
					};
				}
				return { status: 'error', message: 'The challenge could not be started.' };
			}
		);
		const old = card('first-profit', 'First Profit', {
			showStartCurrent: true,
			version: 2
		});
		renderCatalog({ cards: [old], onStartCurrent });

		await page.getByRole('button', { name: 'Start current First Profit' }).click();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onStartCurrent).toHaveBeenLastCalledWith(old, true, 'run-old', 1);
		await expect.element(page.getByText('The challenge could not be started.')).toBeVisible();
	});
});
