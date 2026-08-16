<script lang="ts">
	import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
	import type { WorldCityDefinition } from '$lib/game/types';

	interface Props {
		routes: readonly RouteOperationalSummary[];
		cities: readonly WorldCityDefinition[];
		selectedRouteId: string | null;
		onSelectRoute?: (routeId: string) => void;
	}

	interface RouteConnection {
		summary: RouteOperationalSummary;
		origin: WorldCityDefinition;
		destination: WorldCityDefinition;
	}

	let { routes, cities, selectedRouteId, onSelectRoute }: Props = $props();

	const connections = $derived.by<RouteConnection[]>(() => {
		return routes.flatMap((summary) => {
			const origin = cities.find((city) => city.id === summary.route.originCityId);
			const destination = cities.find((city) => city.id === summary.route.destinationCityId);

			return origin && destination ? [{ summary, origin, destination }] : [];
		});
	});

	function directionLabel(connection: RouteConnection): string {
		return `${connection.origin.id}-to-${connection.destination.id}`;
	}

	function selectFromPointer(routeId: string): void {
		onSelectRoute?.(routeId);
	}

	function handleKeydown(event: KeyboardEvent, routeId: string): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		selectFromPointer(routeId);
	}
</script>

<svg
	class="world-logistics-routes"
	viewBox="0 0 100 100"
	preserveAspectRatio="none"
	aria-hidden="true"
	data-testid="world-logistics-routes"
>
	<defs>
		<marker
			id="world-logistics-route-arrow"
			viewBox="0 0 10 10"
			refX="8"
			refY="5"
			markerWidth="5"
			markerHeight="5"
			orient="auto-start-reverse"
		>
			<!-- `context-stroke` makes each arrowhead inherit the stroke color of the
				line that references this marker, so arrows match per-route state colors
				(active/paused/selected). `currentColor` would resolve in the marker's
				own `<defs>` context and paint every arrowhead the same. Support:
				Firefox, Chrome 109+, Safari 17.4+; older WebKit falls back to the
				default fill, acceptable for this pre-release build. -->
			<path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
		</marker>
	</defs>

	{#each connections as connection (connection.summary.route.id)}
		{@const routeId = connection.summary.route.id}
		{@const paused = connection.summary.route.state === 'paused'}
		{@const selected = selectedRouteId === routeId}
		{@const disrupted = connection.summary.effective.contributions.length > 0}
		<g
			class={{
				'world-logistics-route': true,
				active: !paused,
				paused,
				selected
			}}
			data-testid={`world-logistics-route-${routeId}`}
			data-route-id={routeId}
			data-state={connection.summary.route.state}
			data-selected={selected ? 'true' : 'false'}
			data-disrupted={disrupted ? 'true' : 'false'}
			data-direction={directionLabel(connection)}
			role="button"
			tabindex="-1"
			aria-label={`${connection.origin.name} to ${connection.destination.name}`}
			onclick={() => selectFromPointer(routeId)}
			onkeydown={(event) => handleKeydown(event, routeId)}
		>
			<title>{connection.origin.name} to {connection.destination.name}</title>
			<line
				x1={connection.origin.worldX}
				y1={connection.origin.worldY}
				x2={connection.destination.worldX}
				y2={connection.destination.worldY}
				class="world-logistics-route-line"
				stroke="currentColor"
				stroke-width={selected ? '1.25' : '0.75'}
				stroke-dasharray={paused ? '6 4' : undefined}
				fill="none"
				marker-end="url(#world-logistics-route-arrow)"
			/>
		</g>
	{/each}
</svg>

<style>
	.world-logistics-routes {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.world-logistics-route {
		color: var(--moss);
		pointer-events: auto;
		outline: none;
	}

	.world-logistics-route.paused {
		color: var(--brass-700);
	}

	.world-logistics-route.selected {
		color: var(--wax-red);
	}

	.world-logistics-route:focus-visible .world-logistics-route-line,
	.world-logistics-route:hover .world-logistics-route-line {
		filter: drop-shadow(0 0 0.18rem var(--paper-50));
	}
</style>
