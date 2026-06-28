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
});
