<script lang="ts">
	import { useOnSelectionChange } from '@xyflow/svelte';

	interface Props {
		onSelect: (nodeId: string | null) => void;
	}

	let { onSelect }: Props = $props();

	useOnSelectionChange(({ nodes }) => {
		onSelect(nodes[0]?.id ?? null);
	});
</script>
