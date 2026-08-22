import { asset } from '$app/paths';
import Phaser from 'phaser';
import {
	GREEN_TERRAIN_ART_VARIANTS,
	NEIGHBORHOOD_TERRAIN_ART,
	RESIDENTIAL_TERRAIN_ART_VARIANTS,
	ROAD_TERRAIN_CONNECTOR_ART,
	RIVER_TERRAIN_CONNECTOR_ART,
	STORE_ART_LIST,
	TERRAIN_ART,
	TERRAIN_ART_LIST,
	TERRAIN_CONNECTOR_VARIANTS,
	getStoreArt
} from '../assets/gameArt';
import type { TerrainArt, TerrainConnectorVariant } from '../assets/gameArt';
import type {
	CityMapFeatureVariant,
	CityMapSnapshot,
	CityMapStoreRender,
	CityMapTileRender
} from '../game/mapRender';
import {
	RETAIL_STORE_FOOTPRINT_HEIGHT,
	RETAIL_STORE_FOOTPRINT_WIDTH
} from '../game/storeFootprint';

export type CityMapEvent = { type: 'tileSelected'; tileId: string };
export type CityMapEventHandler = (event: CityMapEvent) => void;

const TILE_SIZE = 32;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.2;
const TERRAIN_BASE_DEPTH = 0;
const TERRAIN_OVERLAY_DEPTH = 1;
const TERRAIN_FEATURE_DEPTH = 2;
const TERRAIN_DECORATION_DEPTH = 3;
const OWNERSHIP_OUTLINE_DEPTH = TERRAIN_DECORATION_DEPTH + 1;
const TERRAIN_FEATURE_SIZE = TILE_SIZE;
const TREE_DECORATION_SIZE = TILE_SIZE * 0.72;
const STORE_MARKER_DEPTH = 10;
const COMPETITOR_MARKER_COLOR = 0xd97706;
const COMPETITOR_MARKER_RADIUS = 8;
const PLACEMENT_PREVIEW_DEPTH = STORE_MARKER_DEPTH - 1;
const OUTLINE_DEPTH = 20;
const PLACEMENT_PREVIEW_VALID_COLOR = 0x6b7e3a;
const PLACEMENT_PREVIEW_INVALID_COLOR = 0x8e2a1f;
const PLACEMENT_PREVIEW_ALPHA = 0.28;
/** Classic prime multiplier (cf. Java's String.hashCode) used to derive a stable, well-distributed variant index per tile coordinate. */
const TERRAIN_VARIANT_HASH_PRIME = 31;

interface StoreSpriteRender {
	sprite: Phaser.GameObjects.Image;
	baseX: number;
	baseY: number;
	index: number;
}

interface TileFootprint {
	x: number;
	y: number;
	width: number;
	height: number;
}

export class CityMapScene extends Phaser.Scene {
	private snapshot: CityMapSnapshot | null = null;
	private eventHandler: CityMapEventHandler | null = null;
	private mapGraphics?: Phaser.GameObjects.Graphics;
	private placementPreviewGraphics?: Phaser.GameObjects.Graphics;
	private ownershipGraphics?: Phaser.GameObjects.Graphics;
	private outlineGraphics?: Phaser.GameObjects.Graphics;
	private markerGraphics?: Phaser.GameObjects.Graphics;
	private tileZones: Phaser.GameObjects.Zone[] = [];
	private tileGrid = new Map<string, CityMapTileRender>();
	private tileById = new Map<string, CityMapTileRender>();
	private selectedTile: CityMapTileRender | null = null;
	private terrainKey: string | null = null;
	private lastCameraKey: string | null = null;
	private storeSprites: StoreSpriteRender[] = [];
	private terrainSprites: Phaser.GameObjects.Image[] = [];
	private terrainFeatureSpriteCount = 0;
	private terrainDecorationSpriteCount = 0;
	private hoverTileId: string | null = null;
	private isDragging = false;
	private hasDragged = false;
	private dragStartPoint: { x: number; y: number } | null = null;
	private lastDragPoint: { x: number; y: number } | null = null;
	private hasUserAdjustedCamera = false;

	constructor() {
		super({ key: 'CityMapScene' });
	}

	preload(): void {
		for (const art of STORE_ART_LIST) {
			this.load.image(art.textureKey, asset(art.path));
		}

		for (const art of TERRAIN_ART_LIST) {
			this.load.image(art.textureKey, asset(art.path));
		}
	}

	create(): void {
		this.mapGraphics = this.add.graphics().setDepth(TERRAIN_OVERLAY_DEPTH);
		this.ownershipGraphics = this.add.graphics().setDepth(OWNERSHIP_OUTLINE_DEPTH);
		this.placementPreviewGraphics = this.add.graphics().setDepth(PLACEMENT_PREVIEW_DEPTH);
		this.outlineGraphics = this.add.graphics().setDepth(OUTLINE_DEPTH);
		this.markerGraphics = this.add.graphics().setDepth(STORE_MARKER_DEPTH);
		this.cameras.main.setZoom(1);
		this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
		this.input.on('pointermove', this.handlePointerMove, this);
		this.input.on('pointerup', this.handlePointerUp, this);
		this.input.on('wheel', this.handleWheel, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroySceneObjects, this);
		this.renderSnapshot();
	}

	update(time: number): void {
		this.drawStoreMarkers(time);
		this.updateCanvasCameraAttributes();
	}

	setEventHandler(handler: CityMapEventHandler | null): void {
		this.eventHandler = handler;
	}

	updateSnapshot(snapshot: CityMapSnapshot): void {
		this.snapshot = snapshot;
		this.renderSnapshot();
	}

	private renderSnapshot(): void {
		if (!this.mapGraphics || !this.snapshot) {
			this.ownershipGraphics?.clear();
			this.placementPreviewGraphics?.clear();
			this.updateCanvasPlacementPreviewAttributes(0, 0);
			this.updateCanvasCompetitorMarkerAttributes(0);
			return;
		}

		// Compute a key that captures all terrain-affecting fields. If this
		// key hasn't changed since the last render, we skip the expensive
		// O(tiles) terrain sprite recreation and mapGraphics redraw — only
		// stores, selection, and placement preview need updating.
		const newTerrainKey = this.computeTerrainKey();
		const terrainChanged = newTerrainKey !== this.terrainKey;

		if (terrainChanged) {
			this.mapGraphics.clear();
			this.destroyTerrainSprites();
			this.destroyTileZones();
			// The terrain key combines cityId|widthxheight with every tile's
			// terrain/feature/road-river variant/neighborhood/locked fields. All
			// of those are generated once at city creation and are immutable for
			// a city's lifetime, so a key change unambiguously means we switched
			// cities (city swap, world-city open, or save load) — re-frame the
			// camera to the new city instead of honoring the user's pan/zoom
			// from the previous city. CAUTION: if a field that can mutate
			// mid-session is ever folded into this key (e.g. a runtime terrain
			// edit), this reframe would fire spuriously and reset the user's
			// pan/zoom, so keep the key immutable-per-city.
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
			this.createTerrainSprites();
			this.terrainKey = newTerrainKey;
		} else {
			// Terrain unchanged — update selection from the new snapshot.
			this.selectedTile = this.snapshot.selectedTileId
				? (this.snapshot.tiles.find((tile) => tile.id === this.snapshot?.selectedTileId) ?? null)
				: null;
		}

		// Always update these — they change frequently between snapshots.
		this.drawOwnershipOutlines();
		this.placementPreviewGraphics?.clear();
		this.destroyStoreSprites();
		this.drawPlacementPreview();
		this.createStoreSprites();
		this.drawInteractionOutlines();
		this.drawStoreMarkers(0);
	}

	private computeTerrainKey(): string {
		if (!this.snapshot) {
			return '';
		}

		let key = `${this.snapshot.cityId}|${this.snapshot.width}x${this.snapshot.height}`;

		for (const tile of this.snapshot.tiles) {
			key += `|${tile.terrain},${tile.feature},${tile.roadVariant},${tile.riverVariant},${tile.neighborhood},${tile.locked}`;
		}

		return key;
	}

	private drawTile(tile: CityMapTileRender): void {
		const graphics = this.mapGraphics;

		if (!graphics) {
			return;
		}

		const x = tile.x * TILE_SIZE;
		const y = tile.y * TILE_SIZE;

		graphics.lineStyle(1, 0xffffff, 0.35);
		graphics.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

		if (tile.locked) {
			graphics.fillStyle(0x1f2933, 0.24);
			graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		}
	}

	private drawOwnershipOutlines(): void {
		if (!this.ownershipGraphics || !this.snapshot) {
			return;
		}

		this.ownershipGraphics.clear();
		this.ownershipGraphics.lineStyle(3, 0x1f8a70, 0.95);

		for (const store of this.snapshot.stores) {
			this.strokeFootprintRect(this.ownershipGraphics, this.getStoreFootprint(store), 3);
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
			if (this.isCanvasPointer(pointer) && pointer.leftButtonDown()) {
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

	private getTileAtPointer(pointer: Phaser.Input.Pointer): CityMapTileRender | null {
		const worldX = pointer.worldX ?? pointer.x;
		const worldY = pointer.worldY ?? pointer.y;
		const tileX = Math.floor(worldX / TILE_SIZE);
		const tileY = Math.floor(worldY / TILE_SIZE);

		return this.tileGrid.get(`${tileX},${tileY}`) ?? null;
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

		// Hover detection — only when the pointer is over the canvas (not an
		// overlay). This replaces 2688 per-tile interactive Zones with a single
		// O(1) grid lookup, eliminating per-pointermove input hit-testing.
		if (this.isCanvasPointer(pointer)) {
			const tile = this.getTileAtPointer(pointer);
			const newHoverId = tile?.id ?? null;

			if (newHoverId !== this.hoverTileId) {
				this.hoverTileId = newHoverId;
				this.drawInteractionOutlines();
			}
		}
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
		const zoom = Phaser.Math.Clamp(
			Math.max(viewportWidth / worldWidth, viewportHeight / worldHeight),
			MIN_ZOOM,
			MAX_ZOOM
		);

		this.cameras.main.setZoom(zoom);
		this.cameras.main.setScroll(0, 0);
		this.updateCanvasCameraAttributes();
	}

	private drawStoreMarkers(time: number): void {
		if (!this.markerGraphics || !this.snapshot) {
			return;
		}

		this.markerGraphics.clear();

		if (this.storeSprites.length > 0) {
			for (const storeSprite of this.storeSprites) {
				storeSprite.sprite.setPosition(
					storeSprite.baseX,
					storeSprite.baseY + Math.sin(time / 350 + storeSprite.index) * 2
				);
			}
		}

		const activeCompetitors = this.snapshot.competitors;
		this.markerGraphics.lineStyle(2, COMPETITOR_MARKER_COLOR, 0.95);
		for (const competitor of activeCompetitors) {
			const x = competitor.x * TILE_SIZE + TILE_SIZE / 2;
			const y = competitor.y * TILE_SIZE + TILE_SIZE / 2;
			this.markerGraphics.fillStyle(COMPETITOR_MARKER_COLOR, 0.9);
			this.markerGraphics.fillCircle(x, y, COMPETITOR_MARKER_RADIUS);
			this.markerGraphics.strokeCircle(x, y, COMPETITOR_MARKER_RADIUS);
		}
		this.updateCanvasCompetitorMarkerAttributes(activeCompetitors.length);
	}

	private drawInteractionOutlines(): void {
		if (!this.outlineGraphics || !this.snapshot) {
			return;
		}

		this.outlineGraphics.clear();

		// O(1) lookup instead of iterating all tiles every hover change.
		const hoveredTile = this.hoverTileId ? this.tileById.get(this.hoverTileId) : null;

		if (hoveredTile) {
			this.outlineGraphics.lineStyle(3, 0xf5c542, 0.85);
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

	private drawPlacementPreview(): void {
		if (!this.placementPreviewGraphics || !this.snapshot?.placementPreview) {
			this.placementPreviewGraphics?.clear();
			this.updateCanvasPlacementPreviewAttributes(0, 0);
			return;
		}

		this.placementPreviewGraphics.clear();
		const validTileIds = new Set(this.snapshot.placementPreview.validTileIds);
		const invalidTileIds = new Set(this.snapshot.placementPreview.invalidTileIds);

		// Draw invalid spans first so a valid 2x2 footprint that abuts an
		// invalid anchor paints over the shared cells. The click resolver maps
		// any cell inside a valid footprint back to that valid anchor, so the
		// topmost color must match the click outcome (valid = green).
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
			.filter((tile): tile is CityMapTileRender => tile !== undefined)
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

	private drawPlacementPreviewSpan(startTile: CityMapTileRender, endTile: CityMapTileRender): void {
		if (!this.placementPreviewGraphics) {
			return;
		}

		const x = startTile.x * TILE_SIZE;
		const y = startTile.y * TILE_SIZE;
		const width = (endTile.x - startTile.x + RETAIL_STORE_FOOTPRINT_WIDTH) * TILE_SIZE;
		const height = RETAIL_STORE_FOOTPRINT_HEIGHT * TILE_SIZE;

		this.placementPreviewGraphics.fillRect(x + 2, y + 2, width - 4, height - 4);
		this.placementPreviewGraphics.strokeRect(x + 2, y + 2, width - 4, height - 4);
	}

	private createStoreSprites(): void {
		if (!this.snapshot) {
			this.updateCanvasStoreMarkerAttributes('missing', 0);
			return;
		}

		if (this.snapshot.stores.length === 0) {
			this.updateCanvasStoreMarkerAttributes('empty', 0);
			return;
		}

		const canRenderStorefronts = this.snapshot.stores.every((store) =>
			this.hasStorefrontTexture(getStoreArt(store.archetypeId).textureKey)
		);

		if (!canRenderStorefronts) {
			this.updateCanvasStoreMarkerAttributes('missing', 0);
			return;
		}

		this.storeSprites = this.snapshot.stores.map((store, index) => {
			const footprintWidth = getStoreFootprintWidth(store);
			const footprintHeight = getStoreFootprintHeight(store);
			const baseX = store.x * TILE_SIZE + (footprintWidth * TILE_SIZE) / 2;
			const baseY = store.y * TILE_SIZE + (footprintHeight * TILE_SIZE) / 2;
			const art = getStoreArt(store.archetypeId);
			const sprite = this.add
				.image(baseX, baseY, art.textureKey)
				.setOrigin(0.5)
				.setDisplaySize(footprintWidth * TILE_SIZE, footprintHeight * TILE_SIZE)
				.setDepth(STORE_MARKER_DEPTH);

			return {
				sprite,
				baseX,
				baseY,
				index
			};
		});

		this.updateCanvasStoreMarkerAttributes('image', this.storeSprites.length);
	}

	private createTerrainSprites(): void {
		if (!this.snapshot) {
			this.updateCanvasTerrainAttributes('missing', 0, 0, 0);
			return;
		}

		let featureSpriteCount = 0;
		let expectedFeatureTileCount = 0;
		let baseSpriteCount = 0;
		let decorationSpriteCount = 0;

		for (const tile of this.snapshot.tiles) {
			const baseTerrainArt = getBaseTerrainArt(tile);

			if (this.hasBaseTerrainTexture(tile)) {
				this.terrainSprites.push(
					this.add
						.image(
							tile.x * TILE_SIZE + TILE_SIZE / 2,
							tile.y * TILE_SIZE + TILE_SIZE / 2,
							baseTerrainArt.textureKey
						)
						.setOrigin(0.5)
						.setDisplaySize(TILE_SIZE, TILE_SIZE)
						.setDepth(TERRAIN_BASE_DEPTH)
				);
				baseSpriteCount += 1;
			}

			if (tile.feature) {
				expectedFeatureTileCount += 1;

				if (this.hasSupportedTerrainTexture(tile)) {
					const sprite = this.add
						.image(
							tile.x * TILE_SIZE + TILE_SIZE / 2,
							tile.y * TILE_SIZE + TILE_SIZE / 2,
							getTerrainTextureKey(tile)
						)
						.setOrigin(0.5)
						.setDisplaySize(TERRAIN_FEATURE_SIZE, TERRAIN_FEATURE_SIZE)
						.setDepth(TERRAIN_FEATURE_DEPTH);

					sprite.setAngle(getTerrainTextureAngle(tile));

					this.terrainSprites.push(sprite);
					featureSpriteCount += 1;
				}
			}

			if (
				this.shouldDrawTreeDecoration(tile) &&
				this.textures.exists(TERRAIN_ART.tree.textureKey)
			) {
				this.terrainSprites.push(
					this.add
						.image(
							tile.x * TILE_SIZE + TILE_SIZE / 2,
							tile.y * TILE_SIZE + TILE_SIZE / 2,
							TERRAIN_ART.tree.textureKey
						)
						.setOrigin(0.5)
						.setDisplaySize(TREE_DECORATION_SIZE, TREE_DECORATION_SIZE)
						.setDepth(TERRAIN_DECORATION_DEPTH)
				);
				decorationSpriteCount += 1;
			}
		}

		this.terrainFeatureSpriteCount = featureSpriteCount;
		this.terrainDecorationSpriteCount = decorationSpriteCount;
		this.updateCanvasTerrainAttributes(
			getTerrainAssetMode(
				this.snapshot.tiles.length,
				baseSpriteCount,
				expectedFeatureTileCount,
				featureSpriteCount
			),
			baseSpriteCount,
			featureSpriteCount,
			decorationSpriteCount
		);
	}

	private shouldDrawTreeDecoration(tile: CityMapTileRender): boolean {
		return tile.feature === null && tile.terrain === 'green' && (tile.x + tile.y) % 3 === 0;
	}

	private hasTerrainTexture(tile: CityMapTileRender): boolean {
		return tile.feature !== null && this.textures.exists(getTerrainTextureKey(tile));
	}

	private hasSupportedTerrainTexture(tile: CityMapTileRender): boolean {
		return this.hasTerrainTexture(tile) && isTerrainTextureVariantSupported(tile);
	}

	private hasBaseTerrainTexture(tile: CityMapTileRender): boolean {
		return this.textures.exists(getBaseTerrainArt(tile).textureKey);
	}

	private hasStorefrontTexture(textureKey: string): boolean {
		return this.textures.exists(textureKey);
	}

	private getInteractionFootprint(tile: CityMapTileRender): TileFootprint {
		const store = this.getStoreForTile(tile);

		if (store) {
			return this.getStoreFootprint(store);
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

	private getStoreForTile(tile: CityMapTileRender): CityMapStoreRender | null {
		return (
			this.snapshot?.stores.find((store) => {
				const width = getStoreFootprintWidth(store);
				const height = getStoreFootprintHeight(store);

				return (
					tile.x >= store.x &&
					tile.x < store.x + width &&
					tile.y >= store.y &&
					tile.y < store.y + height
				);
			}) ?? null
		);
	}

	private getStoreFootprint(store: CityMapStoreRender): TileFootprint {
		return {
			x: store.x,
			y: store.y,
			width: getStoreFootprintWidth(store),
			height: getStoreFootprintHeight(store)
		};
	}

	private getPlacementFootprint(tile: CityMapTileRender): TileFootprint {
		return {
			x: tile.x,
			y: tile.y,
			width: RETAIL_STORE_FOOTPRINT_WIDTH,
			height: RETAIL_STORE_FOOTPRINT_HEIGHT
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

	private updateCanvasStoreMarkerAttributes(
		mode: 'empty' | 'image' | 'missing',
		spriteCount: number
	): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		canvas.dataset.storeMarkerMode = mode;
		canvas.dataset.storeSpriteCount = String(spriteCount);
	}

	private updateCanvasCompetitorMarkerAttributes(markerCount: number): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		canvas.dataset.competitorMarkerCount = String(markerCount);
	}

	private updateCanvasTerrainAttributes(
		mode: 'image' | 'missing',
		baseSpriteCount: number,
		featureSpriteCount: number,
		decorationSpriteCount: number
	): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		canvas.dataset.terrainAssetMode = mode;
		canvas.dataset.terrainBaseSpriteCount = String(baseSpriteCount);
		canvas.dataset.terrainFeatureSpriteCount = String(featureSpriteCount);
		canvas.dataset.terrainDecorationSpriteCount = String(decorationSpriteCount);
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

	private destroyStoreSprites(): void {
		for (const storeSprite of this.storeSprites) {
			storeSprite.sprite.destroy();
		}

		this.storeSprites = [];
		this.updateCanvasStoreMarkerAttributes('empty', 0);
	}

	private destroyTerrainSprites(): void {
		for (const terrainSprite of this.terrainSprites) {
			terrainSprite.destroy();
		}

		this.terrainSprites = [];
		this.terrainFeatureSpriteCount = 0;
		this.terrainDecorationSpriteCount = 0;
		this.updateCanvasTerrainAttributes('missing', 0, 0, 0);
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

	private destroySceneObjects(): void {
		this.destroyStoreSprites();
		this.destroyTerrainSprites();
		this.destroyTileZones();
		this.terrainKey = null;
		this.lastCameraKey = null;
		this.input.off('pointermove', this.handlePointerMove, this);
		this.input.off('pointerup', this.handlePointerUp, this);
		this.input.off('wheel', this.handleWheel, this);
		this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
		this.mapGraphics?.destroy();
		this.ownershipGraphics?.destroy();
		this.placementPreviewGraphics?.destroy();
		this.outlineGraphics?.destroy();
		this.markerGraphics?.destroy();
		this.mapGraphics = undefined;
		this.ownershipGraphics = undefined;
		this.placementPreviewGraphics = undefined;
		this.outlineGraphics = undefined;
		this.markerGraphics = undefined;
	}
}

function getTerrainTextureKey(tile: CityMapTileRender): string {
	return getFeatureTerrainArt(tile)?.textureKey ?? '';
}

function getBaseTerrainArt(tile: CityMapTileRender): TerrainArt {
	if (tile.terrain === 'residential') {
		return getTerrainArtVariant(RESIDENTIAL_TERRAIN_ART_VARIANTS, tile);
	}

	if (tile.terrain === 'green') {
		return getTerrainArtVariant(GREEN_TERRAIN_ART_VARIANTS, tile);
	}

	const neighborhoodVariants = NEIGHBORHOOD_TERRAIN_ART[tile.neighborhood];

	return neighborhoodVariants
		? getTerrainArtVariant(neighborhoodVariants, tile)
		: TERRAIN_ART[tile.terrain];
}

function getTerrainArtVariant(
	variants: readonly TerrainArt[],
	tile: CityMapTileRender
): TerrainArt {
	const index = Math.abs(tile.x + tile.y * TERRAIN_VARIANT_HASH_PRIME) % variants.length;

	return variants[index]!;
}

function getFeatureTerrainArt(tile: CityMapTileRender): TerrainArt | null {
	if (tile.feature === 'road') {
		const connectorVariant = getTerrainConnectorVariant(tile.roadVariant);

		return connectorVariant ? ROAD_TERRAIN_CONNECTOR_ART[connectorVariant] : TERRAIN_ART.road;
	}

	if (tile.feature === 'river') {
		const connectorVariant = getTerrainConnectorVariant(tile.riverVariant);

		return connectorVariant ? RIVER_TERRAIN_CONNECTOR_ART[connectorVariant] : TERRAIN_ART.river;
	}

	return null;
}

function getTerrainConnectorVariant(
	variant: CityMapFeatureVariant | null
): TerrainConnectorVariant | null {
	// Check membership against the shared TERRAIN_CONNECTOR_VARIANTS
	// catalog instead of a feature-specific registry (e.g.
	// ROAD_TERRAIN_CONNECTOR_ART). Both road and river registries are
	// built from the same array so they share identical keys, but
	// coupling the check to one registry is a latent fragility.
	if (variant !== null && TERRAIN_CONNECTOR_VARIANTS.includes(variant as TerrainConnectorVariant)) {
		return variant as TerrainConnectorVariant;
	}

	return null;
}

function isTerrainTextureVariantSupported(tile: CityMapTileRender): boolean {
	return getFeatureTerrainArt(tile) !== null;
}

function getTerrainTextureAngle(tile: CityMapTileRender): number {
	const variant = tile.feature === 'river' ? tile.riverVariant : tile.roadVariant;

	if (getTerrainConnectorVariant(variant)) {
		return 0;
	}

	if (tile.feature === 'road') {
		return variant === 'vertical' || variant === 'end-n' || variant === 'end-s' ? 90 : 0;
	}

	// Only road and river tiles reach the textured-sprite path (callers gate on
	// tile.feature), so the remaining case is a river.
	return variant === 'horizontal' || variant === 'end-e' || variant === 'end-w' ? 90 : 0;
}

function getTerrainAssetMode(
	expectedBaseTileCount: number,
	baseSpriteCount: number,
	expectedFeatureTileCount: number,
	featureSpriteCount: number
): 'image' | 'missing' {
	if (
		baseSpriteCount === expectedBaseTileCount &&
		featureSpriteCount === expectedFeatureTileCount
	) {
		return 'image';
	}

	return 'missing';
}

function getStoreFootprintWidth(store: CityMapStoreRender): number {
	return Math.max(1, store.width ?? RETAIL_STORE_FOOTPRINT_WIDTH);
}

function getStoreFootprintHeight(store: CityMapStoreRender): number {
	return Math.max(1, store.height ?? RETAIL_STORE_FOOTPRINT_HEIGHT);
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
