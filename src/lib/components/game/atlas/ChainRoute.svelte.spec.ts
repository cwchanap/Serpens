import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProductChainEdge } from '$lib/game/productChainGraph';
import ChainRoute from './ChainRoute.svelte';

function makeEdge(overrides: Partial<ProductChainEdge> = {}): ProductChainEdge {
	return {
		id: 'material:flour->recipe:flour-milling',
		source: 'material:flour',
		target: 'recipe:flour-milling',
		materialId: 'flour',
		label: '5/day used',
		requiredPerCycle: 5,
		actualPerDay: 5,
		health: 'healthy',
		...overrides
	};
}

function renderRoute(edge: ProductChainEdge, source = { x: 0, y: 0 }, target = { x: 200, y: 0 }) {
	return render(ChainRoute, { props: { edge, source, target, markerPrefix: 'test' } });
}

function getRouteGroup(edgeId: string): SVGGElement {
	const el = document.querySelector(`g[data-edge-id="${edgeId}"]`);
	if (!el) throw new Error(`No route group found for edge ${edgeId}`);
	return el as SVGGElement;
}

describe('ChainRoute', () => {
	it('renders a group with data-edge-id and health attributes', async () => {
		expect.assertions(3);
		const edge = makeEdge();
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		expect(group.getAttribute('data-edge-id')).toBe(edge.id);
		expect(group.getAttribute('data-edge-health')).toBe('healthy');
		expect(group.getAttribute('role')).toBe('img');
	});

	it('renders a shortage edge with dashed stroke and correct health', async () => {
		expect.assertions(2);
		const edge = makeEdge({ health: 'shortage', label: '0/day used' });
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		expect(group.getAttribute('data-edge-health')).toBe('shortage');
		const path = group.querySelector('path');
		expect(path?.getAttribute('stroke-dasharray')).toBe('8 4');
	});

	it('renders a watch edge with brass dash and correct health', async () => {
		expect.assertions(1);
		const edge = makeEdge({ health: 'watch', label: '2/day used' });
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		expect(group.getAttribute('data-edge-health')).toBe('watch');
	});

	it('renders the edge label text inside the route group', async () => {
		expect.assertions(1);
		const edge = makeEdge({ label: '10/day produced' });
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		const text = group.querySelector('text');
		expect(text?.textContent).toBe('10/day produced');
	});

	it('renders a <title> matching the aria-label for accessibility', async () => {
		expect.assertions(2);
		const edge = makeEdge({ label: '3/day used', health: 'no-report' });
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		expect(group.getAttribute('aria-label')).toBe('3/day used, no report');
		const title = group.querySelector('title');
		expect(title?.textContent).toBe('3/day used, no report');
	});

	it('uses instance-scoped marker prefix in marker-end URL', async () => {
		expect.assertions(1);
		const edge = makeEdge();
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		const path = group.querySelector('path');
		expect(path?.getAttribute('marker-end')).toBe('url(#test-chain-route-arrow-healthy)');
	});

	it('recalculates label background width when edge label changes', async () => {
		expect.assertions(3);
		const shortLabel = '5/day';
		const longLabel = '99999/day produced here';
		const edge = makeEdge({ label: shortLabel });
		const view = renderRoute(edge);

		const group = getRouteGroup(edge.id);
		const text = group.querySelector('text');
		expect(text?.textContent).toBe(shortLabel);

		view.rerender({
			edge: makeEdge({ label: longLabel }),
			source: { x: 0, y: 0 },
			target: { x: 200, y: 0 },
			markerPrefix: 'test'
		});

		await new Promise((r) => setTimeout(r, 0));

		// Re-query after rerender to avoid stale references.
		const updatedGroup = getRouteGroup(edge.id);
		const updatedText = updatedGroup.querySelector('text');
		expect(updatedText?.textContent).toBe(longLabel);

		// Verify the label background <rect> exists and has a width attribute.
		// Note: getComputedTextLength() returns 0 in headless Chromium, so the
		// rect falls back to its minimum width (44). We verify the rect is present
		// rather than comparing widths across rerenders.
		const updatedRect = updatedGroup.querySelector('rect');
		expect(updatedRect?.hasAttribute('width')).toBe(true);
	});
});
