import { describe, expect, test } from 'vitest';
import {
	createInitialVisitedMapViews,
	markMapViewVisited,
	shouldRenderMapView
} from './mapViewKeepAlive';

describe('map view keep-alive state', () => {
	test('renders only the initial active map before any map switches', () => {
		expect.assertions(3);
		const visited = createInitialVisitedMapViews('retail');

		expect(shouldRenderMapView(visited, 'retail')).toBe(true);
		expect(shouldRenderMapView(visited, 'industry')).toBe(false);
		expect(shouldRenderMapView(visited, 'world')).toBe(false);
	});

	test('keeps previously visited maps renderable when switching away', () => {
		expect.assertions(3);
		let visited = createInitialVisitedMapViews('retail');

		visited = markMapViewVisited(visited, 'industry');

		expect(shouldRenderMapView(visited, 'retail')).toBe(true);
		expect(shouldRenderMapView(visited, 'industry')).toBe(true);
		expect(shouldRenderMapView(visited, 'world')).toBe(false);
	});

	test('markMapViewVisited returns the same reference when the map is already visited', () => {
		expect.assertions(2);
		const visited = createInitialVisitedMapViews('retail');
		const marked = markMapViewVisited(visited, 'retail');

		expect(marked).toBe(visited);
		expect(shouldRenderMapView(marked, 'retail')).toBe(true);
	});

	test('marks the world map visited from an industry-only initial state', () => {
		expect.assertions(2);
		let visited = createInitialVisitedMapViews('industry');

		visited = markMapViewVisited(visited, 'world');

		expect(shouldRenderMapView(visited, 'world')).toBe(true);
		expect(shouldRenderMapView(visited, 'industry')).toBe(true);
	});
});
