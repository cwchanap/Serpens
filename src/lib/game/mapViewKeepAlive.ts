export type MapViewId = 'world' | 'retail' | 'industry';

export type VisitedMapViews = Record<MapViewId, boolean>;

export function createInitialVisitedMapViews(activeMapView: MapViewId): VisitedMapViews {
	return {
		world: activeMapView === 'world',
		retail: activeMapView === 'retail',
		industry: activeMapView === 'industry'
	};
}

export function markMapViewVisited(
	visitedMapViews: VisitedMapViews,
	mapView: MapViewId
): VisitedMapViews {
	if (visitedMapViews[mapView]) {
		return visitedMapViews;
	}

	return {
		...visitedMapViews,
		[mapView]: true
	};
}

export function shouldRenderMapView(visitedMapViews: VisitedMapViews, mapView: MapViewId): boolean {
	return visitedMapViews[mapView];
}
