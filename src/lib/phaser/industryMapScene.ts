import { asset } from '$app/paths';
import {
	INDUSTRIAL_BUILDING_ART,
	INDUSTRIAL_BUILDING_ART_LIST,
	INDUSTRY_RESOURCE_ART,
	INDUSTRY_RESOURCE_ART_LIST,
	INDUSTRY_TERRAIN_ART,
	INDUSTRY_TERRAIN_ART_LIST,
	RAIL_ART,
	RAIL_ART_LIST
} from '$lib/assets/gameArt';
import type { RailArtKind } from '$lib/assets/gameArt';
import Phaser from 'phaser';
import type {
	IndustryMapBuildingRender,
	IndustryMapRailRender,
	IndustryMapSnapshot,
	IndustryMapTileRender
} from '../game/industryMapRender';
import {
	INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
	INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH
} from '../game/industryFootprint';

export type IndustryMapEvent =
	| { type: 'tileSelected'; tileId: string }
	| { type: 'buildCancelled' };
export type IndustryMapEventHandler = (event: IndustryMapEvent) => void;

/**
 * Maps a rail cell's N/E/S/W connection bitmask (N=1, E=2, S=4, W=8) to the
 * RAIL_ART variant and rotation that render it. The four base sprites have
 * fixed native orientations (straight=horizontal E+W, corner=E+S,
 * tee=E+S+W stem south, cross=4-way), so 3-bit tees are rotated so the
 * missing direction faces away from the stem, and 2-bit corners/straights
 * are rotated onto the pair of connected directions they represent.
 * 0/1-bit masks (dead ends / isolated cells) fall back to a straight piece:
 * horizontal for masks 0/2/8, vertical for masks 1/4.
 */
export function railArtForConnections(connections: number): {
	kind: RailArtKind;
	rotationDeg: 0 | 90 | 180 | 270;
} {
	switch (connections) {
		case 15:
			return { kind: 'cross', rotationDeg: 0 };
		case 14:
			return { kind: 'tee', rotationDeg: 0 };
		case 13:
			return { kind: 'tee', rotationDeg: 90 };
		case 11:
			return { kind: 'tee', rotationDeg: 180 };
		case 7:
			return { kind: 'tee', rotationDeg: 270 };
		case 10:
			return { kind: 'straight', rotationDeg: 0 };
		case 5:
			return { kind: 'straight', rotationDeg: 90 };
		case 6:
			return { kind: 'corner', rotationDeg: 0 };
		case 12:
			return { kind: 'corner', rotationDeg: 90 };
		case 9:
			return { kind: 'corner', rotationDeg: 180 };
		case 3:
			return { kind: 'corner', rotationDeg: 270 };
		case 1:
		case 4:
			return { kind: 'straight', rotationDeg: 90 };
		default:
			// Masks 0/2/8 (no connections, or a single E/W stub) plus any
			// unexpected combination fall back to a horizontal straight piece.
			return { kind: 'straight', rotationDeg: 0 };
	}
}

const RAIL_UTILIZATION_HIGH_TINT = 0xef4444;
const RAIL_UTILIZATION_MEDIUM_TINT = 0xf59e0b;
const RAIL_UTILIZATION_HIGH_THRESHOLD = 1.0;
const RAIL_UTILIZATION_MEDIUM_THRESHOLD = 0.75;
const RAIL_PREVIEW_REUSED_COLOR = 0x94a3b8;

const TILE_SIZE = 32;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.2;
/* Mock-parity default framing: same closer-than-cover default as the retail
   city scene, applied only when the viewport fits the whole map at native
   zoom (cover zoom >= 1); smaller viewports keep pure cover-fit framing. */
const DEFAULT_FRAMING_ZOOM_MULTIPLIER = 1.4;
const KEYBOARD_PAN_SPEED = 420;
const TERRAIN_DEPTH = 0;
const OCCUPANCY_OUTLINE_DEPTH = TERRAIN_DEPTH + 2;
const MARKER_DEPTH = 10;
const PLACEMENT_PREVIEW_DEPTH = MARKER_DEPTH - 1;
const OUTLINE_DEPTH = 20;
const PLACEMENT_PREVIEW_VALID_COLOR = 0x6b7e3a;
const PLACEMENT_PREVIEW_INVALID_COLOR = 0x8e2a1f;
const PLACEMENT_PREVIEW_ALPHA = 0.28;

const STATUS_COLORS: Record<IndustryMapBuildingRender['status'], number> = {
	idle: 0x94a3b8,
	produced: 0x22c55e,
	'imported-inputs': 0xf59e0b,
	stalled: 0xa855f7,
	blocked: 0xef4444
};

type CameraPanKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
type BuildingStage = 'raw' | 'process' | 'final' | 'warehouse';

const STAGE_OUTLINE_COLORS: Record<BuildingStage, number> = {
	raw: 0x14532d,
	process: 0x1d4ed8,
	final: 0x7c2d12,
	warehouse: 0x4c1d95
};

interface BuildingSpriteEntry {
	id: string;
	sprite: Phaser.GameObjects.Image;
}

interface TileFootprint {
	x: number;
	y: number;
	width: number;
	height: number;
}

function industryTextureKey(path: string): string {
	return `industry:${path}`;
}

function preloadIndustryAsset(scene: Phaser.Scene, path: string): void {
	const key = industryTextureKey(path);

	if (!scene.textures.exists(key)) {
		scene.load.image(key, asset(path));
	}
}

export class IndustryMapScene extends Phaser.Scene {
	private snapshot: IndustryMapSnapshot | null = null;
	private eventHandler: IndustryMapEventHandler | null = null;
	private mapGraphics?: Phaser.GameObjects.Graphics;
	private placementPreviewGraphics?: Phaser.GameObjects.Graphics;
	private occupancyGraphics?: Phaser.GameObjects.Graphics;
	private markerGraphics?: Phaser.GameObjects.Graphics;
	private outlineGraphics?: Phaser.GameObjects.Graphics;
	private tileZones: Phaser.GameObjects.Zone[] = [];
	private tileGrid = new Map<string, IndustryMapTileRender>();
	private tileById = new Map<string, IndustryMapTileRender>();
	private selectedTile: IndustryMapTileRender | null = null;
	private terrainKey: string | null = null;
	private lastCameraKey: string | null = null;
	private terrainSprites: Phaser.GameObjects.Image[] = [];
	private resourceSprites: Phaser.GameObjects.Image[] = [];
	private railSprites: Phaser.GameObjects.Image[] = [];
	private buildingSprites: Phaser.GameObjects.Image[] = [];
	private buildingSpriteEntries: BuildingSpriteEntry[] = [];
	private buildingSpriteById = new Map<string, Phaser.GameObjects.Image>();
	private hoverTileId: string | null = null;
	private isDragging = false;
	private hasDragged = false;
	private dragStartPoint: { x: number; y: number } | null = null;
	private lastDragPoint: { x: number; y: number } | null = null;
	private hasUserAdjustedCamera = false;
	private panKeys: CameraPanKeys | null = null;
	// When false, the always-on keydown-ESC listener is suppressed so Escape
	// presses that close a page-level overlay (save panel, build menu, etc.)
	// do not also fire buildCancelled behind the overlay and silently pop a
	// rail waypoint or exit rail mode.
	private keyboardEnabled = true;

	constructor() {
		super({ key: 'IndustryMapScene' });
	}

	preload(): void {
		for (const path of [
			...INDUSTRY_TERRAIN_ART_LIST,
			...INDUSTRY_RESOURCE_ART_LIST,
			...INDUSTRIAL_BUILDING_ART_LIST,
			...RAIL_ART_LIST
		]) {
			preloadIndustryAsset(this, path);
		}
	}

	create(): void {
		this.mapGraphics = this.add.graphics().setDepth(TERRAIN_DEPTH + 1);
		this.occupancyGraphics = this.add.graphics().setDepth(OCCUPANCY_OUTLINE_DEPTH);
		this.placementPreviewGraphics = this.add.graphics().setDepth(PLACEMENT_PREVIEW_DEPTH);
		this.markerGraphics = this.add.graphics().setDepth(MARKER_DEPTH + 1);
		this.outlineGraphics = this.add.graphics().setDepth(OUTLINE_DEPTH);
		this.cameras.main.setZoom(1);
		this.panKeys =
			(this.input.keyboard?.addKeys?.('W,A,S,D', false) as CameraPanKeys | undefined) ?? null;
		this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
		this.input.on('pointermove', this.handlePointerMove, this);
		this.input.on('pointerup', this.handlePointerUp, this);
		this.input.on('wheel', this.handleWheel, this);
		this.input.keyboard?.on('keydown-ESC', this.handleBuildCancelKey, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroySceneObjects, this);
		this.renderSnapshot();
	}

	update(time: number, delta = 0): void {
		this.updateKeyboardPan(delta);
		this.updateBuildingSprites(time);
		this.drawMarkerGraphics(time);
		this.updateCanvasCameraAttributes();
	}

	setEventHandler(handler: IndustryMapEventHandler | null): void {
		this.eventHandler = handler;
	}

	/**
	 * Enables or disables the scene's keyboard controls (WASD camera pan and
	 * Escape-to-cancel-build). Called by IndustryMap.svelte based on
	 * whether a page-level overlay is open, so Escape that closes an overlay
	 * does not also fire buildCancelled behind it.
	 */
	setKeyboardEnabled(enabled: boolean): void {
		this.keyboardEnabled = enabled;
	}

	updateSnapshot(snapshot: IndustryMapSnapshot): void {
		this.snapshot = snapshot;
		this.renderSnapshot();
	}

	private renderSnapshot(): void {
		// Scene services (textures, add, cameras, game.canvas) are not
		// injected until create() runs. updateSnapshot can be called right
		// after `new Phaser.Game()` and before the scene boots (see
		// IndustryMap.svelte's startPhaser), so defer ALL rendering here —
		// drawRails/createRailSprite dereference this.textures, which would
		// throw and mark the map unavailable. create() calls renderSnapshot
		// once booted, and updateSnapshot stores the latest snapshot in the
		// meantime.
		if (!this.mapGraphics) {
			return;
		}

		if (!this.snapshot) {
			this.occupancyGraphics?.clear();
			this.placementPreviewGraphics?.clear();
			this.updateCanvasPlacementPreviewAttributes(0, 0);
			this.updateCanvasIndustryAttributes();
			this.drawRails();
			return;
		}

		// Compute a key that captures all terrain-affecting fields. If this
		// key hasn't changed since the last render, we skip the expensive
		// O(tiles) terrain sprite recreation and mapGraphics redraw.
		const newTerrainKey = this.computeTerrainKey();
		const terrainChanged = newTerrainKey !== this.terrainKey;

		if (terrainChanged) {
			this.mapGraphics.clear();
			this.destroyTileZones();
			this.destroyTerrainSprites();
			// The terrain key combines cityId|widthxheight with every tile's
			// terrain/variant/locked fields. All of those are generated once at
			// city creation and are immutable for a city's lifetime, so a key
			// change unambiguously means we switched cities (city swap,
			// world-city open, or save load) — re-frame the camera to the new
			// city instead of honoring the user's pan/zoom from the previous
			// city. CAUTION: if a field that can mutate mid-session is ever
			// folded into this key, this reframe would fire spuriously and
			// reset the user's pan/zoom, so keep the key immutable-per-city.
			this.hasUserAdjustedCamera = false;
			this.setCameraBounds();

			this.tileGrid.clear();
			this.tileById.clear();
			this.selectedTile = null;

			for (const tile of this.snapshot.tiles) {
				this.drawTile(tile);
				this.tileGrid.set(`${tile.x},${tile.y}`, tile);
				this.tileById.set(tile.id, tile);

				if (tile.selected) {
					this.selectedTile = tile;
				}
			}

			if (this.hoverTileId && !this.tileById.has(this.hoverTileId)) {
				this.hoverTileId = null;
			}

			this.createMapInteractionZone();
			this.terrainKey = newTerrainKey;
		} else {
			// Terrain unchanged — update selection from the new snapshot.
			this.selectedTile = this.snapshot.selectedTileId
				? (this.snapshot.tiles.find((tile) => tile.id === this.snapshot?.selectedTileId) ?? null)
				: null;
		}

		// Always update these — they change frequently between snapshots.
		this.drawOccupancyOutlines();
		this.placementPreviewGraphics?.clear();
		this.drawPlacementPreview();
		this.drawRailPreview();
		this.rebuildMarkerSprites();
		this.drawRails();
		this.drawMarkerGraphics(0);
		this.drawInteractionOutlines();
	}

	private computeTerrainKey(): string {
		if (!this.snapshot) {
			return '';
		}

		let key = `${this.snapshot.cityId}|${this.snapshot.width}x${this.snapshot.height}`;

		for (const tile of this.snapshot.tiles) {
			key += `|${tile.terrain},${tile.locked},${tile.resource ?? ''}`;
		}

		return key;
	}

	private drawTile(tile: IndustryMapTileRender): void {
		const graphics = this.mapGraphics;

		if (!graphics) {
			return;
		}

		const x = tile.x * TILE_SIZE;
		const y = tile.y * TILE_SIZE;
		const terrainPath = INDUSTRY_TERRAIN_ART[tile.terrain];
		const terrainTextureKey = industryTextureKey(terrainPath);
		const hasTerrainTexture = this.textures.exists(terrainTextureKey);

		if (hasTerrainTexture) {
			const terrainSprite = this.add
				.image(x + TILE_SIZE / 2, y + TILE_SIZE / 2, terrainTextureKey)
				.setDisplaySize(TILE_SIZE, TILE_SIZE)
				.setDepth(TERRAIN_DEPTH);

			if (tile.locked) {
				terrainSprite.setAlpha(0.62).setTint(0x64748b);
			}

			this.terrainSprites.push(terrainSprite);
		}

		graphics.lineStyle(1, 0xffffff, 0.3);
		graphics.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

		if (tile.locked) {
			graphics.fillStyle(0x111827, 0.34);
			graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		}
	}

	private drawOccupancyOutlines(): void {
		if (!this.occupancyGraphics || !this.snapshot) {
			return;
		}

		this.occupancyGraphics.clear();
		this.occupancyGraphics.lineStyle(3, 0x0f766e, 0.95);

		for (const building of this.snapshot.buildings) {
			this.strokeFootprintRect(this.occupancyGraphics, this.getBuildingFootprint(building), 3);
		}
	}

	private createMapInteractionZone(): void {
		if (!this.snapshot) {
			return;
		}

		const width = Math.max(TILE_SIZE, this.snapshot.width * TILE_SIZE);
		const height = Math.max(TILE_SIZE, this.snapshot.height * TILE_SIZE);
		const zone = this.add
			.zone(0, 0, width, height)
			.setOrigin(0)
			.setInteractive({ useHandCursor: true });

		zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
			if (!this.isCanvasPointer(pointer)) {
				return;
			}

			if (pointer.button === 2) {
				this.eventHandler?.({ type: 'buildCancelled' });
				return;
			}

			if (pointer.leftButtonDown()) {
				this.isDragging = true;
				this.hasDragged = false;
				this.dragStartPoint = { x: pointer.x, y: pointer.y };
				this.lastDragPoint = { x: pointer.x, y: pointer.y };
			}
		});

		zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
			if (!this.didPointerStartOnCanvas(pointer)) {
				return;
			}

			// Only left-click completes tile selection; right-click cancel is
			// handled on pointerdown and must never emit tileSelected on up.
			if (pointer.button !== 0) {
				return;
			}

			if (this.didDrag(pointer)) {
				return;
			}

			const tile = this.getTileAtPointer(pointer);

			if (tile) {
				this.eventHandler?.({ type: 'tileSelected', tileId: tile.id });
			}
		});

		zone.on('pointerout', () => {
			if (this.hoverTileId !== null) {
				this.hoverTileId = null;
				this.drawInteractionOutlines();
			}
		});

		this.tileZones = [zone];
	}

	private getTileAtPointer(pointer: Phaser.Input.Pointer): IndustryMapTileRender | null {
		const worldX = pointer.worldX ?? pointer.x;
		const worldY = pointer.worldY ?? pointer.y;
		const tileX = Math.floor(worldX / TILE_SIZE);
		const tileY = Math.floor(worldY / TILE_SIZE);

		return this.tileGrid.get(`${tileX},${tileY}`) ?? null;
	}

	private rebuildMarkerSprites(): void {
		this.destroyResourceSprites();
		this.destroyBuildingSprites();

		if (!this.snapshot) {
			this.updateCanvasIndustryAttributes();
			return;
		}

		for (const tile of this.snapshot.tiles) {
			if (tile.resource) {
				this.createResourceSprite(tile);
			}
		}

		for (const building of this.snapshot.buildings) {
			this.createBuildingSprite(building);
		}

		this.updateBuildingSprites(0);
		this.updateCanvasIndustryAttributes();
	}

	private drawRails(): void {
		this.destroyRailSprites();

		if (!this.snapshot) {
			this.updateCanvasRailAttributes();
			return;
		}

		for (const rail of this.snapshot.rails) {
			this.createRailSprite(rail);
		}

		this.updateCanvasRailAttributes();
	}

	private createRailSprite(rail: IndustryMapRailRender): void {
		const { kind, rotationDeg } = railArtForConnections(rail.connections);
		const railPath = RAIL_ART[kind];
		const railTextureKey = industryTextureKey(railPath);

		if (!this.textures.exists(railTextureKey)) {
			return;
		}

		const x = rail.x * TILE_SIZE + TILE_SIZE / 2;
		const y = rail.y * TILE_SIZE + TILE_SIZE / 2;
		const railSprite = this.add
			.image(x, y, railTextureKey)
			.setDisplaySize(TILE_SIZE, TILE_SIZE)
			.setDepth(OCCUPANCY_OUTLINE_DEPTH + 1)
			.setAngle(rotationDeg);

		if (rail.utilization >= RAIL_UTILIZATION_HIGH_THRESHOLD) {
			railSprite.setTint(RAIL_UTILIZATION_HIGH_TINT);
		} else if (rail.utilization >= RAIL_UTILIZATION_MEDIUM_THRESHOLD) {
			railSprite.setTint(RAIL_UTILIZATION_MEDIUM_TINT);
		} else {
			railSprite.clearTint();
		}

		this.railSprites.push(railSprite);
	}

	private drawRailPreview(): void {
		if (!this.placementPreviewGraphics || !this.snapshot?.railPreview) {
			return;
		}

		const graphics = this.placementPreviewGraphics;

		for (const cell of this.snapshot.railPreview.cells) {
			const color = cell.isNew ? PLACEMENT_PREVIEW_VALID_COLOR : RAIL_PREVIEW_REUSED_COLOR;
			const x = cell.x * TILE_SIZE;
			const y = cell.y * TILE_SIZE;

			graphics.fillStyle(color, PLACEMENT_PREVIEW_ALPHA);
			graphics.fillRect(x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - 12);
		}
	}

	private drawPlacementPreview(): void {
		if (!this.placementPreviewGraphics || !this.snapshot?.placementPreview) {
			this.placementPreviewGraphics?.clear();
			this.updateCanvasPlacementPreviewAttributes(0, 0);
			return;
		}

		const graphics = this.placementPreviewGraphics;
		graphics.clear();
		const validTileIds = new Set(this.snapshot.placementPreview.validTileIds);
		const invalidTileIds = new Set(this.snapshot.placementPreview.invalidTileIds);

		// Draw invalid spans first so a valid 2x2 industrial footprint that
		// abuts an invalid anchor paints over the shared cells. The click
		// resolver maps any cell inside a valid footprint back to that valid
		// anchor, so the topmost color must match the click outcome.
		this.drawPlacementPreviewSpans(invalidTileIds, PLACEMENT_PREVIEW_INVALID_COLOR);
		this.drawPlacementPreviewSpans(validTileIds, PLACEMENT_PREVIEW_VALID_COLOR);

		this.updateCanvasPlacementPreviewAttributes(validTileIds.size, invalidTileIds.size);
	}

	private drawPlacementPreviewSpans(tileIds: ReadonlySet<string>, color: number): void {
		if (!this.placementPreviewGraphics || tileIds.size === 0) {
			return;
		}

		const tiles = [...tileIds]
			.map((tileId) => this.tileById.get(tileId))
			.filter((tile): tile is IndustryMapTileRender => tile !== undefined)
			.sort((first, second) => first.y - second.y || first.x - second.x);

		if (tiles.length === 0) {
			return;
		}

		this.placementPreviewGraphics.fillStyle(color, PLACEMENT_PREVIEW_ALPHA);
		this.placementPreviewGraphics.lineStyle(2, color, 0.55);

		let runStart = tiles[0]!;
		let previous = runStart;

		for (const tile of tiles.slice(1)) {
			if (tile.y === previous.y && tile.x === previous.x + 1) {
				previous = tile;
				continue;
			}

			this.drawPlacementPreviewSpan(runStart, previous);
			runStart = tile;
			previous = tile;
		}

		this.drawPlacementPreviewSpan(runStart, previous);
	}

	private drawPlacementPreviewSpan(
		startTile: IndustryMapTileRender,
		endTile: IndustryMapTileRender
	): void {
		if (!this.placementPreviewGraphics) {
			return;
		}

		const x = startTile.x * TILE_SIZE;
		const y = startTile.y * TILE_SIZE;
		const width = (endTile.x - startTile.x + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH) * TILE_SIZE;
		const height = INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT * TILE_SIZE;

		this.placementPreviewGraphics.fillRect(x + 2, y + 2, width - 4, height - 4);
		this.placementPreviewGraphics.strokeRect(x + 2, y + 2, width - 4, height - 4);
	}

	private drawMarkerGraphics(time: number): void {
		if (!this.markerGraphics) {
			return;
		}

		this.markerGraphics.clear();

		if (!this.snapshot) {
			this.updateCanvasIndustryAttributes();
			return;
		}

		this.snapshot.buildings.forEach((building, index) => {
			if (this.buildingSpriteById.has(building.id)) {
				this.drawBuildingStatusRing(building, index, time);
			}
		});

		this.updateCanvasIndustryAttributes();
	}

	private createResourceSprite(tile: IndustryMapTileRender): void {
		if (!tile.resource) {
			return;
		}

		const x = tile.x * TILE_SIZE + TILE_SIZE * 0.72;
		const y = tile.y * TILE_SIZE + TILE_SIZE * 0.28;
		const resourcePath = INDUSTRY_RESOURCE_ART[tile.resource];
		const resourceTextureKey = industryTextureKey(resourcePath);

		if (!this.textures.exists(resourceTextureKey)) {
			return;
		}

		const resourceSprite = this.add
			.image(x, y, resourceTextureKey)
			.setDisplaySize(22, 22)
			.setDepth(MARKER_DEPTH);

		this.resourceSprites.push(resourceSprite);
	}

	private createBuildingSprite(building: IndustryMapBuildingRender): void {
		const buildingPath = INDUSTRIAL_BUILDING_ART[building.typeId];
		const buildingTextureKey = industryTextureKey(buildingPath);

		if (!this.textures.exists(buildingTextureKey)) {
			return;
		}

		const position = this.getBuildingMarkerPosition(building, 0, 0);
		const footprintWidth = getBuildingFootprintWidth(building);
		const footprintHeight = getBuildingFootprintHeight(building);
		const buildingSprite = this.add
			.image(position.x, position.y, buildingTextureKey)
			.setDisplaySize(footprintWidth * TILE_SIZE, footprintHeight * TILE_SIZE)
			.setDepth(MARKER_DEPTH);

		this.applyBuildingSpriteStatus(buildingSprite, building);
		this.buildingSprites.push(buildingSprite);
		this.buildingSpriteEntries.push({ id: building.id, sprite: buildingSprite });
		this.buildingSpriteById.set(building.id, buildingSprite);
	}

	private updateBuildingSprites(time: number): void {
		if (!this.snapshot) {
			return;
		}

		this.snapshot.buildings.forEach((building, index) => {
			const sprite = this.buildingSpriteById.get(building.id);

			if (!sprite) {
				return;
			}

			const position = this.getBuildingMarkerPosition(building, index, time);
			sprite.setPosition(position.x, position.y);
			this.applyBuildingSpriteStatus(sprite, building);
		});
	}

	private applyBuildingSpriteStatus(
		sprite: Phaser.GameObjects.Image,
		building: IndustryMapBuildingRender
	): void {
		sprite.clearTint();
		sprite.setAlpha(1);

		if (building.status === 'idle') {
			sprite.setAlpha(0.68).setTint(0x94a3b8);
		}
	}

	private drawBuildingStatusRing(
		building: IndustryMapBuildingRender,
		index: number,
		time: number
	): void {
		if (!this.markerGraphics) {
			return;
		}

		const stage = getBuildingStage(building.typeId);
		const position = this.getBuildingMarkerPosition(building, index, time);
		const fillColor = STATUS_COLORS[building.status];
		const outlineColor = STAGE_OUTLINE_COLORS[stage];

		this.markerGraphics.lineStyle(3, outlineColor, 0.95);
		this.markerGraphics.strokeCircle(position.x, position.y, 15);
		this.markerGraphics.lineStyle(2, fillColor, 0.98);
		this.markerGraphics.strokeCircle(position.x, position.y, 12);
		this.markerGraphics.fillStyle(fillColor, 0.98);
		this.markerGraphics.fillCircle(position.x + 10, position.y - 10, 4);
		this.markerGraphics.lineStyle(1, 0xffffff, 0.9);
		this.markerGraphics.strokeCircle(position.x + 10, position.y - 10, 4);
	}

	private getBuildingMarkerPosition(
		building: IndustryMapBuildingRender,
		index: number,
		time: number
	): { x: number; y: number } {
		return {
			x: building.x * TILE_SIZE + (getBuildingFootprintWidth(building) * TILE_SIZE) / 2,
			y:
				building.y * TILE_SIZE +
				(getBuildingFootprintHeight(building) * TILE_SIZE) / 2 +
				Math.sin(time / 360 + index) * 1.8
		};
	}

	private drawInteractionOutlines(): void {
		if (!this.outlineGraphics || !this.snapshot) {
			return;
		}

		this.outlineGraphics.clear();

		const hoveredTile = this.hoverTileId ? this.tileById.get(this.hoverTileId) : null;

		if (hoveredTile) {
			this.outlineGraphics.lineStyle(3, 0xfacc15, 0.85);
			this.strokeFootprintRect(this.outlineGraphics, this.getInteractionFootprint(hoveredTile), 2);
		}

		if (this.selectedTile) {
			this.outlineGraphics.lineStyle(4, 0x2563eb, 1);
			this.strokeFootprintRect(
				this.outlineGraphics,
				this.getInteractionFootprint(this.selectedTile),
				1
			);
		}
	}

	private getInteractionFootprint(tile: IndustryMapTileRender): TileFootprint {
		const building = this.getBuildingForTile(tile);

		if (building) {
			return this.getBuildingFootprint(building);
		}

		if (this.snapshot?.placementPreview) {
			return this.getPlacementFootprint(tile);
		}

		return {
			x: tile.x,
			y: tile.y,
			width: 1,
			height: 1
		};
	}

	private getBuildingForTile(tile: IndustryMapTileRender): IndustryMapBuildingRender | null {
		return (
			this.snapshot?.buildings.find((building) => {
				const width = getBuildingFootprintWidth(building);
				const height = getBuildingFootprintHeight(building);

				return (
					tile.x >= building.x &&
					tile.x < building.x + width &&
					tile.y >= building.y &&
					tile.y < building.y + height
				);
			}) ?? null
		);
	}

	private getBuildingFootprint(building: IndustryMapBuildingRender): TileFootprint {
		return {
			x: building.x,
			y: building.y,
			width: getBuildingFootprintWidth(building),
			height: getBuildingFootprintHeight(building)
		};
	}

	private getPlacementFootprint(tile: IndustryMapTileRender): TileFootprint {
		return {
			x: tile.x,
			y: tile.y,
			width: INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
			height: INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT
		};
	}

	private strokeFootprintRect(
		graphics: Phaser.GameObjects.Graphics,
		footprint: TileFootprint,
		inset: number
	): void {
		const rect = getFootprintPixelRect(footprint, inset);
		graphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
	}

	private isCanvasPointer(pointer: Phaser.Input.Pointer): boolean {
		return pointer.event.target === this.game.canvas;
	}

	private didPointerStartOnCanvas(pointer: Phaser.Input.Pointer): boolean {
		return pointer.downElement === this.game.canvas;
	}

	private handlePointerMove(pointer: Phaser.Input.Pointer): void {
		if (this.isDragging && this.lastDragPoint && pointer.isDown) {
			const camera = this.cameras.main;
			const zoom = camera.zoom || 1;
			this.hasUserAdjustedCamera = true;
			camera.scrollX -= (pointer.x - this.lastDragPoint.x) / zoom;
			camera.scrollY -= (pointer.y - this.lastDragPoint.y) / zoom;
			this.updateCanvasCameraAttributes();

			if (this.dragStartPoint && this.didMoveBeyondClickSlop(pointer, this.dragStartPoint)) {
				this.hasDragged = true;
			}

			this.lastDragPoint = { x: pointer.x, y: pointer.y };
			return;
		}

		if (this.isCanvasPointer(pointer)) {
			const tile = this.getTileAtPointer(pointer);
			const newHoverId = tile?.id ?? null;

			if (newHoverId !== this.hoverTileId) {
				this.hoverTileId = newHoverId;
				this.drawInteractionOutlines();
			}
		}
	}

	private updateKeyboardPan(deltaMs: number): void {
		if (!this.keyboardEnabled || !this.panKeys || deltaMs <= 0) {
			return;
		}

		const horizontal = Number(this.panKeys.D.isDown) - Number(this.panKeys.A.isDown);
		const vertical = Number(this.panKeys.S.isDown) - Number(this.panKeys.W.isDown);
		if (horizontal === 0 && vertical === 0) {
			return;
		}

		const magnitude = Math.hypot(horizontal, vertical);
		const camera = this.cameras.main;
		const distance = (KEYBOARD_PAN_SPEED * (deltaMs / 1000)) / (camera.zoom || 1);
		this.hasUserAdjustedCamera = true;
		camera.scrollX += (horizontal / magnitude) * distance;
		camera.scrollY += (vertical / magnitude) * distance;
		this.updateCanvasCameraAttributes();
	}

	private handlePointerUp(): void {
		this.isDragging = false;
		this.dragStartPoint = null;
		this.lastDragPoint = null;
	}

	private handleWheel(
		pointer: Phaser.Input.Pointer,
		gameObjects: Phaser.GameObjects.GameObject[],
		deltaX: number,
		deltaY: number
	): void {
		void pointer;
		void gameObjects;
		void deltaX;

		const camera = this.cameras.main;
		const nextZoom = Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, MIN_ZOOM, MAX_ZOOM);
		this.hasUserAdjustedCamera = true;
		camera.setZoom(nextZoom);
		this.updateCanvasCameraAttributes();
	}

	private handleResize(): void {
		this.fitCameraToViewport();
	}

	private handleBuildCancelKey(): void {
		if (!this.keyboardEnabled) return;
		this.eventHandler?.({ type: 'buildCancelled' });
	}

	private didDrag(pointer: Phaser.Input.Pointer): boolean {
		return (
			this.hasDragged ||
			(this.dragStartPoint ? this.didMoveBeyondClickSlop(pointer, this.dragStartPoint) : false)
		);
	}

	private didMoveBeyondClickSlop(
		pointer: Phaser.Input.Pointer,
		startPoint: { x: number; y: number }
	): boolean {
		return Math.abs(pointer.x - startPoint.x) > 4 || Math.abs(pointer.y - startPoint.y) > 4;
	}

	private setCameraBounds(): void {
		const width = Math.max(TILE_SIZE, (this.snapshot?.width ?? 0) * TILE_SIZE);
		const height = Math.max(TILE_SIZE, (this.snapshot?.height ?? 0) * TILE_SIZE);
		this.cameras.main.setBounds(0, 0, width, height);
		this.fitCameraToViewport();
	}

	private fitCameraToViewport(): void {
		if (!this.snapshot || this.hasUserAdjustedCamera) {
			this.updateCanvasCameraAttributes();
			return;
		}

		const worldWidth = Math.max(TILE_SIZE, this.snapshot.width * TILE_SIZE);
		const worldHeight = Math.max(TILE_SIZE, this.snapshot.height * TILE_SIZE);
		const viewportWidth = Math.max(1, this.scale.width);
		const viewportHeight = Math.max(1, this.scale.height);
		const coverZoom = Math.max(viewportWidth / worldWidth, viewportHeight / worldHeight);
		const zoom = Phaser.Math.Clamp(
			coverZoom >= 1 ? coverZoom * DEFAULT_FRAMING_ZOOM_MULTIPLIER : coverZoom,
			MIN_ZOOM,
			MAX_ZOOM
		);

		this.cameras.main.setZoom(zoom);
		// Phaser 4 bounds are center-clamped: scrollX = world coordinate of the
		// viewport CENTER, and clamping keeps it in [(viewW - canvasW)/2, ...].
		// Scroll to the top-left anchor of the visible world rect so the city
		// opens at tile (0,0) at every zoom (a plain setScroll(0,0) leaves the
		// north-west corner off-screen whenever zoom > 1).
		this.cameras.main.setScroll(
			(viewportWidth / zoom - viewportWidth) / 2,
			(viewportHeight / zoom - viewportHeight) / 2
		);
		this.updateCanvasCameraAttributes();
	}

	private updateCanvasIndustryAttributes(): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		canvas.dataset.industryBuildingCount = String(this.snapshot?.buildings.length ?? 0);
		canvas.dataset.industryResourceCount = String(
			this.snapshot?.tiles.filter((tile) => tile.resource !== null).length ?? 0
		);
		canvas.dataset.industryTerrainAssetMode =
			this.snapshot && this.terrainSprites.length === this.snapshot.tiles.length
				? 'image'
				: 'missing';
		canvas.dataset.industryTerrainSpriteCount = String(this.terrainSprites.length);
		canvas.dataset.industryResourceSpriteCount = String(this.resourceSprites.length);
		canvas.dataset.industryBuildingSpriteCount = String(this.buildingSprites.length);
	}

	private updateCanvasPlacementPreviewAttributes(validCount: number, invalidCount: number): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		canvas.dataset.placementPreviewMode = validCount + invalidCount > 0 ? 'active' : 'inactive';
		canvas.dataset.placementValidTileCount = String(validCount);
		canvas.dataset.placementInvalidTileCount = String(invalidCount);
	}

	private updateCanvasRailAttributes(): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		canvas.dataset.railCellCount = String(this.snapshot?.rails.length ?? 0);
		canvas.dataset.railSpriteCount = String(this.railSprites.length);
	}

	private updateCanvasCameraAttributes(): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		const zoom = this.cameras.main.zoom || 1;
		const worldWidth = Math.max(TILE_SIZE, (this.snapshot?.width ?? 1) * TILE_SIZE);
		const worldHeight = Math.max(TILE_SIZE, (this.snapshot?.height ?? 1) * TILE_SIZE);
		const worldView = this.cameras.main.worldView;
		const viewWidth = Math.max(1, worldView.width || this.scale.width / zoom);
		const viewHeight = Math.max(1, worldView.height || this.scale.height / zoom);
		const viewX = Phaser.Math.Clamp(worldView.x || 0, 0, Math.max(0, worldWidth - viewWidth));
		const viewY = Phaser.Math.Clamp(worldView.y || 0, 0, Math.max(0, worldHeight - viewHeight));

		// Throttle: skip DOM writes when nothing changed since last frame.
		const cameraKey = `${zoom.toFixed(4)}|${this.cameras.main.scrollX.toFixed(4)}|${this.cameras.main.scrollY.toFixed(4)}|${worldWidth.toFixed(4)}|${worldHeight.toFixed(4)}|${viewX.toFixed(4)}|${viewY.toFixed(4)}|${viewWidth.toFixed(4)}|${viewHeight.toFixed(4)}`;

		if (cameraKey === this.lastCameraKey) {
			return;
		}

		this.lastCameraKey = cameraKey;

		canvas.dataset.mapZoom = zoom.toFixed(4);
		canvas.dataset.mapTileSize = (TILE_SIZE * zoom).toFixed(4);
		canvas.dataset.mapScrollX = this.cameras.main.scrollX.toFixed(4);
		canvas.dataset.mapScrollY = this.cameras.main.scrollY.toFixed(4);
		canvas.dataset.mapWorldWidth = worldWidth.toFixed(4);
		canvas.dataset.mapWorldHeight = worldHeight.toFixed(4);
		canvas.dataset.mapViewX = viewX.toFixed(4);
		canvas.dataset.mapViewY = viewY.toFixed(4);
		canvas.dataset.mapViewWidth = viewWidth.toFixed(4);
		canvas.dataset.mapViewHeight = viewHeight.toFixed(4);
	}

	private destroyTileZones(): void {
		for (const zone of this.tileZones) {
			zone.destroy();
		}

		this.tileZones = [];
		this.tileGrid.clear();
		this.tileById.clear();
		this.selectedTile = null;
	}

	private destroyTerrainSprites(): void {
		for (const sprite of this.terrainSprites) {
			sprite.destroy();
		}

		this.terrainSprites = [];
	}

	private destroyResourceSprites(): void {
		for (const sprite of this.resourceSprites) {
			sprite.destroy();
		}

		this.resourceSprites = [];
	}

	private destroyBuildingSprites(): void {
		for (const { sprite } of this.buildingSpriteEntries) {
			sprite.destroy();
		}

		this.buildingSprites = [];
		this.buildingSpriteEntries = [];
		this.buildingSpriteById.clear();
	}

	private destroyRailSprites(): void {
		for (const sprite of this.railSprites) {
			sprite.destroy();
		}

		this.railSprites = [];
	}

	private destroySceneObjects(): void {
		this.destroyTileZones();
		this.destroyTerrainSprites();
		this.destroyResourceSprites();
		this.destroyBuildingSprites();
		this.destroyRailSprites();
		this.terrainKey = null;
		this.lastCameraKey = null;
		this.input.off('pointermove', this.handlePointerMove, this);
		this.input.off('pointerup', this.handlePointerUp, this);
		this.input.off('wheel', this.handleWheel, this);
		this.input.keyboard?.off('keydown-ESC', this.handleBuildCancelKey, this);
		this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
		this.mapGraphics?.destroy();
		this.occupancyGraphics?.destroy();
		this.placementPreviewGraphics?.destroy();
		this.markerGraphics?.destroy();
		this.outlineGraphics?.destroy();
		this.mapGraphics = undefined;
		this.occupancyGraphics = undefined;
		this.placementPreviewGraphics = undefined;
		this.markerGraphics = undefined;
		this.outlineGraphics = undefined;
	}
}

function getBuildingStage(typeId: IndustryMapBuildingRender['typeId']): BuildingStage {
	switch (typeId) {
		case 'warehouse':
			return 'warehouse';
		case 'snack-factory':
		case 'drink-bottling-plant':
		case 'household-goods-factory':
			return 'final';
		case 'grain-farm':
		case 'salt-mine':
		case 'oilseed-farm':
		case 'water-pump':
		case 'fruit-farm':
		case 'sugar-farm':
		case 'pulpwood-grove':
		case 'chemical-feedstock-well':
			return 'raw';
		default:
			return 'process';
	}
}

function getBuildingFootprintWidth(building: IndustryMapBuildingRender): number {
	return Math.max(1, building.width ?? INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH);
}

function getBuildingFootprintHeight(building: IndustryMapBuildingRender): number {
	return Math.max(1, building.height ?? INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT);
}

function getFootprintPixelRect(
	footprint: TileFootprint,
	inset: number
): { x: number; y: number; width: number; height: number } {
	return {
		x: footprint.x * TILE_SIZE + inset,
		y: footprint.y * TILE_SIZE + inset,
		width: Math.max(1, footprint.width * TILE_SIZE - inset * 2),
		height: Math.max(1, footprint.height * TILE_SIZE - inset * 2)
	};
}
