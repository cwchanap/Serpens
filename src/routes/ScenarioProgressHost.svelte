<script lang="ts">
	import ScenarioStatusStrip from '$lib/components/game/ScenarioStatusStrip.svelte';
	import ScenarioObjectivePanel from '$lib/components/game/ScenarioObjectivePanel.svelte';
	import type { I18nBundle } from '$lib/i18n';
	import type { createScenarioUi } from './scenarioUi.svelte';
	let { ui, i18n }: { ui: ReturnType<typeof createScenarioUi>; i18n: I18nBundle } = $props();
</script>

{#if ui.showProgress && ui.progress}
	<ScenarioStatusStrip
		view={ui.progress}
		{i18n}
		expanded={ui.objectivesExpanded}
		pending={ui.pending}
		error={ui.error}
		onToggle={ui.toggleObjectives}
		onRetry={ui.retry}
		onDismissError={ui.dismissError}
	/>
	{#if ui.objectivesExpanded}
		<ScenarioObjectivePanel view={ui.progress} {i18n} />
	{/if}
{/if}
