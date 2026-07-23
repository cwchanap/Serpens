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
		onStart: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onResume: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onRestart: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onStartCurrent: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onImport: (
			code: string,
			confirmed: boolean
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
		onStart: vi.fn(),
		onResume: vi.fn(),
		onRestart: vi.fn(),
		onStartCurrent: vi.fn(),
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
		const onStart = vi.fn();
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
		expect(onStart).toHaveBeenCalledWith(cards[0]);
		expect(onResume).toHaveBeenCalledWith(cards[1]);
		expect(onRestart).toHaveBeenCalledWith(cards[1]);
	});

	it('confirms replacing an older active version with the current version', async () => {
		expect.assertions(3);
		const onStartCurrent = vi.fn();
		const old = card('first-profit', 'First Profit', {
			primaryAction: 'resume',
			primaryLabel: 'Resume version 1',
			showRestart: true,
			showStartCurrent: true,
			activeVersionLabel: 'Active version 1 (current version 2)',
			version: 2
		});
		renderCatalog({ cards: [old], onStartCurrent });

		await expect.element(page.getByText('Active version 1 (current version 2)')).toBeVisible();
		await page.getByRole('button', { name: 'Start current First Profit' }).click();
		expect(onStartCurrent).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Confirm replacement' }).click();
		expect(onStartCurrent).toHaveBeenCalledWith(old);
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
		expect(onImport).toHaveBeenLastCalledWith('valid', true);
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
});
