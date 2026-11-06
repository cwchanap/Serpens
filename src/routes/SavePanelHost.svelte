<script lang="ts">
	import SavePanel from '$lib/components/game/SavePanel.svelte';
	import type { GameState } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import type { createSaveUi } from './saveUi.svelte';

	let {
		ui,
		game,
		i18n
	}: {
		ui: ReturnType<typeof createSaveUi>;
		game: GameState | null;
		i18n: I18nBundle;
	} = $props();
</script>

{#if ui.isOpen}
	<SavePanel
		activeGame={game}
		autoSave={ui.autoSave}
		slots={ui.manualSlots}
		diagnostics={ui.diagnostics}
		status={ui.status}
		error={ui.error}
		{i18n}
		onResumeAutoSave={ui.resumeAutoSave}
		onSaveSlot={ui.saveManualSlot}
		onLoadSlot={ui.loadManualSlot}
		onDeleteSlot={ui.deleteManualSlot}
		onClose={ui.close}
	/>
{/if}
