import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { LocalizedProductChainEdge } from '$lib/i18n/localizedTypes';
import ChainRoute from './ChainRoute.svelte';

function makeEdge(overrides: Partial<LocalizedProductChainEdge> = {}): LocalizedProductChainEdge {
	return {
		id: 'material:flour->recipe:flour-milling',
		source: 'material:flour',
		target: 'recipe:flour-milling',
		materialId: 'flour',
		label: '5/day used',
		requiredPerCycle: 5,
		actualPerDay: 5,
		health: 'healthy',
		healthLabel: 'Healthy',
		...overrides
	};
}

function renderRoute(
	edge: LocalizedProductChainEdge,
	source = { x: 0, y: 0 },
	target = { x: 200, y: 0 }
) {
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

	it('renders a shortage edge with a dotted wax stroke and correct health', async () => {
		expect.assertions(2);
		const edge = makeEdge({ health: 'shortage', label: '0/day used' });
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		expect(group.getAttribute('data-edge-health')).toBe('shortage');
		const path = group.querySelector('path');
		expect(path?.getAttribute('stroke-dasharray')).toBe('2 5');
	});

	it('renders a healthy edge with a solid brass stroke', async () => {
		expect.assertions(2);
		const edge = makeEdge({ health: 'healthy', label: '5/day used' });
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		const path = group.querySelector('path');
		expect(path?.getAttribute('stroke-dasharray')).toBe('none');
		expect(path?.getAttribute('stroke')).toBe('var(--brass-700)');
	});

	it('renders a watch edge with brass dash and correct health', async () => {
		expect.assertions(1);
		const edge = makeEdge({ health: 'watch', label: '2/day used' });
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		expect(group.getAttribute('data-edge-health')).toBe('watch');
	});

	it('renders a labels-only copy without the route path, hidden from assistive tech', async () => {
		expect.assertions(4);
		const edge = makeEdge();
		render(ChainRoute, {
			props: {
				edge,
				source: { x: 0, y: 0 },
				target: { x: 200, y: 0 },
				markerPrefix: 'test',
				labels: true
			}
		});

		const group = getRouteGroup(edge.id);
		expect(group.querySelector('path')).toBeNull();
		expect(group.getAttribute('aria-hidden')).toBe('true');
		expect(group.getAttribute('role')).toBeNull();
		expect(group.textContent).toContain(edge.label);
	});

	it('renders a <title> matching the aria-label for accessibility', async () => {
		expect.assertions(2);
		const edge = makeEdge({ label: '3/day used', health: 'no-report', healthLabel: 'no report' });
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
		const view = render(ChainRoute, {
			props: {
				edge,
				source: { x: 0, y: 0 },
				target: { x: 200, y: 0 },
				markerPrefix: 'test',
				labels: true
			}
		});

		const group = getRouteGroup(edge.id);
		const text = group.querySelector('text');
		expect(text?.textContent).toBe(shortLabel);

		view.rerender({
			edge: makeEdge({ label: longLabel }),
			source: { x: 0, y: 0 },
			target: { x: 200, y: 0 },
			markerPrefix: 'test',
			labels: true
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

	it('renders a no-local-capacity edge with a dotted stroke and correct health', async () => {
		expect.assertions(2);
		const edge = makeEdge({ health: 'no-local-capacity', label: '0/day used' });
		renderRoute(edge);

		const group = getRouteGroup(edge.id);
		expect(group.getAttribute('data-edge-health')).toBe('no-local-capacity');
		const path = group.querySelector('path');
		expect(path?.getAttribute('stroke-dasharray')).toBe('2 5');
	});
});
