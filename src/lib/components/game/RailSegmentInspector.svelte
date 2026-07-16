<script lang="ts">
	import {
		buildRailNetwork,
		parseRailCellKey,
		railUsageKey,
		RAIL_MAX_LEVEL,
		type RailNetwork,
		type RailSegment
	} from '$lib/game/rail';
	import {
		getDemolishRemovableCellKeys,
		getSegmentDemolishRefund,
		getSegmentUpgradeCost
	} from '$lib/game/railPlacement';
	import type { I18nBundle } from '$lib/i18n';
	import type { GameState } from '$lib/game/types';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';

	interface Props {
		game: GameState;
		cityId: string;
		segments: RailSegment[];
		i18n: I18nBundle;
		onClose: () => void;
		onUpgradeSegment: (segmentId: string) => void;
		onDemolishSegment: (segmentId: string) => void;
	}

	let { game, cityId, segments, i18n, onClose, onUpgradeSegment, onDemolishSegment }: Props =
		$props();

	// Starts unset (rather than capturing segments[0]?.id at mount) so the
	// fallback below re-derives correctly if the `segments` prop changes to a
	// different selection while this component instance is reused.
	let selectedSegmentId = $state<string | null>(null);

	const selectedSegment = $derived(
		segments.find((segment) => segment.id === selectedSegmentId) ?? segments[0] ?? null
	);
	const isJunction = $derived(segments.length > 1);

	const network = $derived.by<RailNetwork>(() => {
		const city = game.industryCities.find((candidate) => candidate.id === cityId);
		return city ? buildRailNetwork(city) : { cityId, cells: new Map() };
	});
	const railUsage = $derived(game.reports.at(-1)?.productionReport.railUsage ?? {});

	const cellCount = $derived(selectedSegment?.cellKeys.length ?? 0);
	const level = $derived(selectedSegment?.minLevel ?? 0);
	const capacity = $derived.by(() => {
		if (!selectedSegment) return 0;
		let total = 0;
		for (const key of selectedSegment.cellKeys) {
			total += network.cells.get(key)?.level ?? 0;
		}
		return total;
	});
	const utilization = $derived.by(() => {
		if (!selectedSegment) {
			return 0;
		}

		let max = 0;
		for (const key of selectedSegment.cellKeys) {
			const { x, y } = parseRailCellKey(key);
			const cellLevel = network.cells.get(key)?.level ?? selectedSegment.minLevel;
			if (cellLevel <= 0) {
				continue;
			}
			const usage = railUsage[railUsageKey(cityId, x, y)] ?? 0;
			max = Math.max(max, usage / Math.max(1, cellLevel));
		}
		return Math.min(1, max);
	});

	const canUpgrade = $derived(selectedSegment ? selectedSegment.minLevel < RAIL_MAX_LEVEL : false);
	const upgradeCost = $derived(
		selectedSegment && canUpgrade ? getSegmentUpgradeCost(selectedSegment, network) : 0
	);
	const canAffordUpgrade = $derived(canUpgrade && game.cash >= upgradeCost);
	const demolishRefund = $derived.by(() => {
		if (!selectedSegment) return 0;
		const removable = getDemolishRemovableCellKeys(selectedSegment, segments, network);
		return getSegmentDemolishRefund(removable.size);
	});

	function segmentOptionLabel(segment: RailSegment): string {
		return `${i18n.t('railSegmentInspector.level')} ${segment.minLevel} / ${RAIL_MAX_LEVEL} · ${i18n.format.integer(segment.cellKeys.length)}`;
	}

	function stopMapInteraction(event: Event): void {
		event.stopPropagation();
	}

	const blockMapInteraction: Attachment<HTMLElement> = (node) => {
		const cleanups = [
			on(node, 'pointerdown', stopMapInteraction),
			on(node, 'pointerup', stopMapInteraction),
			on(node, 'click', stopMapInteraction)
		];

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	};
</script>

<aside
	class="inspector"
	aria-label={i18n.t('railSegmentInspector.title')}
	{@attach blockMapInteraction}
>
	<button
		type="button"
		class="close"
		aria-label={i18n.t('industryTileInspector.close')}
		onclick={onClose}>×</button
	>

	<div class="heading">
		<div>
			<p>{i18n.t('railSegmentInspector.eyebrow')}</p>
			<h2>{i18n.t('railSegmentInspector.title')}</h2>
		</div>
	</div>

	{#if isJunction}
		<section aria-label={i18n.t('railSegmentInspector.pickSegment')}>
			<h3>{i18n.t('railSegmentInspector.pickSegment')}</h3>
			<ul class="segment-picker">
				{#each segments as segment, index (segment.id)}
					<li>
						<button
							type="button"
							class="segment-option"
							class:selected={segment.id === selectedSegment?.id}
							aria-pressed={segment.id === selectedSegment?.id}
							data-testid={`rail-segment-option-${index}`}
							onclick={() => (selectedSegmentId = segment.id)}
						>
							{segmentOptionLabel(segment)}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if selectedSegment}
		<section aria-label={i18n.t('railSegmentInspector.title')}>
			<dl>
				<div>
					<dt>{i18n.t('railSegmentInspector.cells')}</dt>
					<dd data-testid="rail-segment-cells">{i18n.format.integer(cellCount)}</dd>
				</div>
				<div>
					<dt>{i18n.t('railSegmentInspector.level')}</dt>
					<dd data-testid="rail-segment-level">{level} / {RAIL_MAX_LEVEL}</dd>
				</div>
				<div>
					<dt>{i18n.t('railSegmentInspector.capacity')}</dt>
					<dd data-testid="rail-segment-capacity">{i18n.format.integer(capacity)}</dd>
				</div>
				<div>
					<dt>{i18n.t('railSegmentInspector.utilization')}</dt>
					<dd data-testid="rail-segment-utilization">{i18n.format.percent(utilization)}</dd>
				</div>
			</dl>

			<div class="actions">
				<button
					type="button"
					class="upgrade"
					disabled={!canUpgrade || !canAffordUpgrade}
					onclick={() => onUpgradeSegment(selectedSegment.id)}
				>
					{canUpgrade
						? i18n.t('railSegmentInspector.upgrade', {
								cost: i18n.format.currency(upgradeCost)
							})
						: i18n.t('railSegmentInspector.atMaxLevel')}
				</button>
				{#if canUpgrade && !canAffordUpgrade}
					<p class="hint">{i18n.t('industryTileInspector.notEnoughCash')}</p>
				{/if}
				<button
					type="button"
					class="demolish"
					onclick={() => onDemolishSegment(selectedSegment.id)}
				>
					{i18n.t('railSegmentInspector.demolish', {
						refund: i18n.format.currency(demolishRefund)
					})}
				</button>
			</div>
		</section>
	{/if}
</aside>

<style>
	.inspector {
		position: relative;
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
		padding: 1rem 1.1rem 1.1rem;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background-color: var(--paper-100);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		color: var(--ink-700);
		box-shadow:
			inset 0 0 0 2px var(--paper-100),
			inset 0 0 0 3px var(--brass-500),
			var(--shadow-paper);
	}

	.close {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		width: 1.9rem;
		height: 1.9rem;
		padding: 0;
		border: 1px solid var(--ink-700);
		border-radius: 999px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		text-align: center;
	}

	.close:hover {
		background: var(--paper-200);
	}

	.heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding-right: 2.2rem;
	}

	h2,
	h3,
	p,
	dl {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1.1;
		color: var(--ink-700);
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.heading p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	dt {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.6rem;
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	section {
		display: grid;
		gap: 0.75rem;
	}

	.segment-picker {
		display: grid;
		gap: 0.4rem;
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.segment-option {
		width: 100%;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.48rem 0.55rem;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		text-align: left;
	}

	.segment-option:hover,
	.segment-option:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-500);
		outline: none;
	}

	.segment-option.selected {
		border-color: var(--brass-500);
		background: var(--paper-200);
		font-weight: 700;
	}

	.actions {
		display: grid;
		gap: 0.4rem;
	}

	.hint {
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--ink-500);
		margin: 0;
	}

	.upgrade,
	.demolish {
		width: 100%;
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	.upgrade:hover:not(:disabled),
	.demolish:hover:not(:disabled) {
		background: var(--paper-200);
	}

	.upgrade:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
