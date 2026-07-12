<script lang="ts">
	import type { GameState } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';

	interface Props {
		activeGame: GameState | null;
		autoSave: SaveSlotMetadata | null;
		slots: SaveSlotMetadata[];
		status: string;
		error: string | null;
		i18n: I18nBundle;
		onResumeAutoSave: () => void | Promise<void>;
		onSaveSlot: (name: string, slotId?: string) => void | Promise<void>;
		onLoadSlot: (slotId: string) => void | Promise<void>;
		onDeleteSlot: (slotId: string) => void | Promise<void>;
		onClose: () => void;
	}

	let {
		activeGame,
		autoSave,
		slots,
		status,
		error,
		i18n,
		onResumeAutoSave,
		onSaveSlot,
		onLoadSlot,
		onDeleteSlot,
		onClose
	}: Props = $props();

	let slotName = $state('');

	const canSaveNewSlot = $derived(Boolean(activeGame && slotName.trim().length > 0));
	function formatUpdatedAt(value: string): string {
		const date = new Date(value);

		if (Number.isNaN(date.getTime())) {
			return value;
		}

		return i18n.format.dateTime(date);
	}

	function formatStoreCount(storeCount: number): string {
		return i18n.t(
			(storeCount === 1 ? 'savePanel.storeCount.one' : 'savePanel.storeCount.other') as never,
			{
				count: i18n.format.integer(storeCount)
			}
		);
	}

	function formatSlotDetails(slot: SaveSlotMetadata): string {
		return i18n.t('savePanel.autoSlotDetails' as never, {
			day: i18n.format.integer(slot.day),
			storeCount: formatStoreCount(slot.storeCount),
			updatedAt: formatUpdatedAt(slot.updatedAt)
		});
	}

	function formatManualSlotDetails(slot: SaveSlotMetadata): string {
		return i18n.t('savePanel.manualSlotDetails' as never, {
			day: i18n.format.integer(slot.day),
			city: i18n.labels.worldCity(slot.activeCityId).name,
			storeCount: formatStoreCount(slot.storeCount),
			updatedAt: formatUpdatedAt(slot.updatedAt)
		});
	}

	function saveNewSlot(): void {
		const name = slotName.trim();

		if (!activeGame || name.length === 0) {
			return;
		}

		void onSaveSlot(name);
		slotName = '';
	}
</script>

<div class="save-backdrop">
	<button
		type="button"
		class="save-backdrop-button"
		aria-label={i18n.t('savePanel.dismiss')}
		onclick={onClose}
	></button>

	<div
		class="save-panel paper"
		role="dialog"
		aria-modal="true"
		aria-label={i18n.t('savePanel.dialog')}
	>
		<header>
			<div>
				<p class="eyebrow">{i18n.t('savePanel.eyebrow')}</p>
				<h2>{i18n.t('savePanel.title')}</h2>
			</div>
			<button type="button" class="close" aria-label={i18n.t('savePanel.close')} onclick={onClose}>
				{i18n.t('savePanel.close')}
			</button>
		</header>

		<section class="auto-save" aria-label={i18n.t('savePanel.autoSection')}>
			<div>
				<h3>
					{i18n.t('savePanel.autoSave')}
					<span class="auto-chip">{i18n.t('savePanel.autoChip')}</span>
				</h3>
				{#if autoSave}
					<p>{formatSlotDetails(autoSave)}</p>
				{:else}
					<p>{i18n.t('savePanel.noAutoSave')}</p>
				{/if}
			</div>
			<button type="button" disabled={!autoSave} onclick={() => void onResumeAutoSave()}
				>{i18n.t('savePanel.resume')}</button
			>
		</section>

		<section aria-label={i18n.t('savePanel.createSection')}>
			<h3>{i18n.t('savePanel.newSlot')}</h3>
			<div class="new-slot">
				<label>
					<span>{i18n.t('savePanel.slotName')}</span>
					<input bind:value={slotName} />
				</label>
				<button type="button" disabled={!canSaveNewSlot} onclick={saveNewSlot}
					>{i18n.t('savePanel.saveSlot')}</button
				>
			</div>
		</section>

		<section aria-label={i18n.t('savePanel.manualSection')}>
			<h3>{i18n.t('savePanel.manualSlots')}</h3>
			{#if slots.length > 0}
				<div class="slots">
					{#each slots as slot (slot.id)}
						<article>
							<span class="slot-seal" aria-hidden="true">{i18n.format.integer(slot.day)}</span>
							<div>
								<h4>{slot.name}</h4>
								<p>{formatManualSlotDetails(slot)}</p>
							</div>
							<div class="slot-actions">
								<button type="button" onclick={() => void onLoadSlot(slot.id)}
									>{i18n.t('savePanel.load')}</button
								>
								<button
									type="button"
									disabled={!activeGame}
									onclick={() => void onSaveSlot(slot.name, slot.id)}
								>
									{i18n.t('savePanel.overwrite')}
								</button>
								<button type="button" onclick={() => void onDeleteSlot(slot.id)}
									>{i18n.t('savePanel.delete')}</button
								>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<p class="empty">{i18n.t('savePanel.noManualSlots')}</p>
			{/if}
		</section>

		{#if status}
			<p class="status" role="status">{status}</p>
		{/if}
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</div>
</div>

<style>
	.save-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.74);
		backdrop-filter: blur(4px);
	}

	.save-backdrop-button {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.save-panel {
		position: relative;
		z-index: 1;
		display: grid;
		width: min(760px, 100%);
		max-height: calc(100vh - 2rem);
		gap: 1rem;
		overflow: auto;
		padding: 1.1rem 1.25rem;
		color: var(--ink-700);
	}

	header,
	.auto-save,
	article,
	.slot-actions,
	.new-slot {
		display: flex;
		gap: 0.75rem;
	}

	header,
	.auto-save,
	article {
		align-items: center;
		justify-content: space-between;
	}

	header {
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2,
	h3,
	h4,
	p {
		margin: 0;
	}

	h2,
	h3,
	h4 {
		font-family: var(--font-display);
		font-weight: 400;
		color: var(--ink-700);
	}

	h2 {
		font-size: 1.35rem;
	}

	h3 {
		font-size: 1rem;
	}

	h4 {
		font-size: 0.98rem;
	}

	section,
	article {
		display: grid;
		gap: 0.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.9rem;
	}

	.auto-save,
	article {
		display: flex;
	}

	.slots {
		display: grid;
		gap: 0.65rem;
	}

	.new-slot {
		align-items: end;
	}

	label {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.35rem;
	}

	label span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	input,
	button {
		font: inherit;
	}

	input {
		width: 100%;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.65rem 0.75rem;
		font-family: var(--font-ui);
	}

	button {
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.6rem 0.85rem;
		font-family: var(--font-ui);
		font-size: 0.86rem;
		text-align: center;
		white-space: nowrap;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		background: var(--paper-200);
		outline: none;
	}

	.close,
	.slot-actions button,
	.auto-save button,
	.new-slot button {
		flex: 0 0 auto;
	}

	.eyebrow {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.auto-chip {
		display: inline-flex;
		align-items: center;
		margin-left: 0.4rem;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--brass-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.18em;
	}

	.slot-seal {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		min-width: 2.4rem;
		height: 2.4rem;
		padding: 0 0.5rem;
		border-radius: 999px;
		background: var(--wax-red);
		color: var(--paper-50);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.78rem;
		font-weight: 700;
	}

	.status {
		color: var(--moss);
		font-family: var(--font-body);
	}

	.error {
		color: var(--wax-red);
		font-family: var(--font-body);
	}

	.empty,
	section p,
	article p,
	label span {
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	@media (max-width: 700px) {
		header,
		.auto-save,
		article,
		.slot-actions,
		.new-slot {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
