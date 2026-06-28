/**
 * Shared helpers for footprint modules. Extracted from storeFootprint.ts and
 * industryFootprint.ts to avoid duplication; a third footprint module should
 * import from here rather than redefining `toCoordinateKey`.
 */

/**
 * Builds a stable string key for a tile coordinate, used as the `byCoordinate`
 * map key in city/industry tile lookups.
 */
export function toCoordinateKey(x: number, y: number): string {
	return `${x},${y}`;
}
