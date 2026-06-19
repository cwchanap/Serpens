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
	getStoreArt
} from '../assets/gameArt';
import type { TerrainArt, TerrainConnectorVariant } from '../assets/gameArt';
import type { CityMapFeatureVariant, CityMapSnapshot, CityMapTileRender } from '../game/mapRender';

export type CityMapEvent = { type: 'tileSelected'; tileId: string };
export type CityMapEventHandler = (event: CityMapEvent) => void;

const TILE_SIZE = 32;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.2;
const STORE_SPRITE_SIZE = TILE_SIZE * 0.82;
const TERRAIN_BASE_DEPTH = 0;
const TERRAIN_OVERLAY_DEPTH = 1;
const TERRAIN_FEATURE_DEPTH = 2;
const TERRAIN_DECORATION_DEPTH = 3;
const TERRAIN_FEATURE_SIZE = TILE_SIZE;
const TREE_DECORATION_SIZE = TILE_SIZE * 0.72;
const STORE_MARKER_DEPTH = 10;
const PLACEMENT_PREVIEW_DEPTH = STORE_MARKER_DEPTH - 1;
const OUTLINE_DEPTH = 20;
const PLACEMENT_PREVIEW_VALID_COLOR = 0x6b7e3a;
const PLACEMENT_PREVIEW_INVALID_COLOR = 0x8e2a1f;
const PLACEMENT_PREVIEW_ALPHA = 0.28;
/** Classic prime multiplier (cf. Java's String.hashCode) used to derive a stable, well-distributed variant index per tile coordinate. */
const TERRAIN_VARIANT_HASH_PRIME = 31;

const TERRAIN_COLORS: Record<CityMapTileRender['terrain'], number> = {
	commercial: 0xc9d7f0,
	residential: 0xd8e8c5,
	green: 0x9fcf9a,
	transit: 0xd9d4c6,
	industrial: 0xc8c2ba
};

interface StoreSpriteRender {
	sprite: Phaser.GameObjects.Image;
	baseX: number;
	baseY: number;
	index: number;
}

export class CityMapScene extends Phaser.Scene {
	private snapshot: CityMapSnapshot | null = null;
	private eventHandler: CityMapEventHandler | null = null;
	private mapGraphics?: Phaser.GameObjects.Graphics;
	private placementPreviewGraphics?: Phaser.GameObjects.Graphics;
	private outlineGraphics?: Phaser.GameObjects.Graphics;
	private markerGraphics?: Phaser.GameObjects.Graphics;
	private tileZones: Phaser.GameObjects.Zone[] = [];
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

		if (!snapshot.tiles.some((tile) => tile.id === this.hoverTileId)) {
			this.hoverTileId = null;
		}

		this.renderSnapshot();
	}

	private renderSnapshot(): void {
		if (!this.mapGraphics || !this.snapshot) {
			this.placementPreviewGraphics?.clear();
			this.updateCanvasPlacementPreviewAttributes(0, 0);
			return;
		}

		this.mapGraphics.clear();
		this.placementPreviewGraphics?.clear();
		this.destroyStoreSprites();
		this.destroyTerrainSprites();
		this.destroyTileZones();
		this.setCameraBounds();

		for (const tile of this.snapshot.tiles) {
			this.drawTile(tile);
			this.createTileZone(tile);
		}

		this.drawPlacementPreview();
		this.createTerrainSprites();
		this.createStoreSprites();
		this.drawInteractionOutlines();
		this.drawStoreMarkers(0);
	}

	private drawTile(tile: CityMapTileRender): void {
		const graphics = this.mapGraphics;

		if (!graphics) {
			return;
		}

		const x = tile.x * TILE_SIZE;
		const y = tile.y * TILE_SIZE;
		const fillAlpha = tile.locked ? 0.38 : 1;

		if (!this.hasBaseTerrainTexture(tile)) {
			graphics.fillStyle(TERRAIN_COLORS[tile.terrain], fillAlpha);
			graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		}

		graphics.lineStyle(1, 0xffffff, 0.35);
		graphics.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

		if (tile.locked) {
			graphics.fillStyle(0x1f2933, 0.24);
			graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		}

		this.drawTerrainFeatureFallback(tile, x, y);

		if (tile.owned) {
			graphics.lineStyle(3, 0x1f8a70, 0.95);
			graphics.strokeRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
		}
	}

	private drawTerrainFeatureFallback(tile: CityMapTileRender, x: number, y: number): void {
		if (!this.mapGraphics || !tile.feature || this.hasSupportedTerrainTexture(tile)) {
			return;
		}

		if (tile.feature === 'road') {
			drawConnectedFeatureFallback({
				graphics: this.mapGraphics,
				variant: tile.roadVariant ?? 'isolated',
				x,
				y,
				fillColor: 0x50545a,
				lineColor: 0xd7d2c3,
				fillAlpha: 0.92,
				lineAlpha: 0.65,
				armWidth: TILE_SIZE * 0.36,
				lineWidth: 1
			});
			return;
		}

		if (tile.feature === 'river') {
			drawConnectedFeatureFallback({
				graphics: this.mapGraphics,
				variant: tile.riverVariant ?? 'isolated',
				x,
				y,
				fillColor: 0x3ca7d8,
				lineColor: 0xb9ecff,
				fillAlpha: 0.92,
				lineAlpha: 0.55,
				armWidth: TILE_SIZE * 0.5,
				lineWidth: 2
			});
		}
	}

	private createTileZone(tile: CityMapTileRender): void {
		const zone = this.add
			.zone(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
			.setOrigin(0)
			.setInteractive({ useHandCursor: true });

		zone.on('pointerover', () => {
			this.hoverTileId = tile.id;
			this.drawInteractionOutlines();
		});
		zone.on('pointerout', () => {
			if (this.hoverTileId === tile.id) {
				this.hoverTileId = null;
				this.drawInteractionOutlines();
			}
		});
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

			this.eventHandler?.({ type: 'tileSelected', tileId: tile.id });
		});

		this.tileZones.push(zone);
	}

	private isCanvasPointer(pointer: Phaser.Input.Pointer): boolean {
		return pointer.event.target === this.game.canvas;
	}

	private didPointerStartOnCanvas(pointer: Phaser.Input.Pointer): boolean {
		return pointer.downElement === this.game.canvas;
	}

	private handlePointerMove(pointer: Phaser.Input.Pointer): void {
		if (!this.isDragging || !this.lastDragPoint || !pointer.isDown) {
			return;
		}

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

			return;
		}

		this.snapshot.stores.forEach((store, index) => {
			const x = store.x * TILE_SIZE + TILE_SIZE / 2;
			const y = store.y * TILE_SIZE + TILE_SIZE / 2 + Math.sin(time / 350 + index) * 2;

			this.markerGraphics?.fillStyle(0x0f172a, 0.24);
			this.markerGraphics?.fillCircle(x + 2, y + 3, 8);
			this.markerGraphics?.fillStyle(0xf97316, 1);
			this.markerGraphics?.fillCircle(x, y, 7);
			this.markerGraphics?.lineStyle(2, 0xffffff, 0.95);
			this.markerGraphics?.strokeCircle(x, y, 7);
		});
	}

	private drawInteractionOutlines(): void {
		if (!this.outlineGraphics || !this.snapshot) {
			return;
		}

		this.outlineGraphics.clear();

		for (const tile of this.snapshot.tiles) {
			const x = tile.x * TILE_SIZE;
			const y = tile.y * TILE_SIZE;

			if (tile.id === this.hoverTileId) {
				this.outlineGraphics.lineStyle(3, 0xf5c542, 0.85);
				this.outlineGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
			}

			if (tile.selected) {
				this.outlineGraphics.lineStyle(4, 0x2563eb, 1);
				this.outlineGraphics.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
			}
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

		for (const tile of this.snapshot.tiles) {
			const isValid = validTileIds.has(tile.id);
			const isInvalid = invalidTileIds.has(tile.id);

			if (!isValid && !isInvalid) {
				continue;
			}

			const x = tile.x * TILE_SIZE;
			const y = tile.y * TILE_SIZE;
			const color = isValid ? PLACEMENT_PREVIEW_VALID_COLOR : PLACEMENT_PREVIEW_INVALID_COLOR;

			this.placementPreviewGraphics.fillStyle(color, PLACEMENT_PREVIEW_ALPHA);
			this.placementPreviewGraphics.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
			this.placementPreviewGraphics.lineStyle(2, color, 0.55);
			this.placementPreviewGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
		}

		this.updateCanvasPlacementPreviewAttributes(validTileIds.size, invalidTileIds.size);
	}

	private createStoreSprites(): void {
		if (!this.snapshot) {
			this.updateCanvasStoreMarkerAttributes('circle', 0);
			return;
		}

		const canRenderStorefronts = this.snapshot.stores.every((store) =>
			this.hasStorefrontTexture(getStoreArt(store.archetypeId).textureKey)
		);

		if (!canRenderStorefronts) {
			this.updateCanvasStoreMarkerAttributes('circle', 0);
			return;
		}

		this.storeSprites = this.snapshot.stores.map((store, index) => {
			const baseX = store.x * TILE_SIZE + TILE_SIZE / 2;
			const baseY = store.y * TILE_SIZE + TILE_SIZE / 2;
			const art = getStoreArt(store.archetypeId);
			const sprite = this.add
				.image(baseX, baseY, art.textureKey)
				.setOrigin(0.5)
				.setDisplaySize(STORE_SPRITE_SIZE, STORE_SPRITE_SIZE)
				.setDepth(STORE_MARKER_DEPTH);

			return {
				sprite,
				baseX,
				baseY,
				index
			};
		});

		this.updateCanvasStoreMarkerAttributes(
			this.storeSprites.length > 0 ? 'image' : 'circle',
			this.storeSprites.length
		);
	}

	private createTerrainSprites(): void {
		if (!this.snapshot) {
			this.updateCanvasTerrainAttributes('fallback', 0, 0, 0);
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
			getTerrainAssetMode(expectedFeatureTileCount, featureSpriteCount),
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

	private updateCanvasStoreMarkerAttributes(mode: 'circle' | 'image', spriteCount: number): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		canvas.dataset.storeMarkerMode = mode;
		canvas.dataset.storeSpriteCount = String(spriteCount);
	}

	private updateCanvasTerrainAttributes(
		mode: 'fallback' | 'image' | 'mixed',
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
		this.updateCanvasStoreMarkerAttributes('circle', 0);
	}

	private destroyTerrainSprites(): void {
		for (const terrainSprite of this.terrainSprites) {
			terrainSprite.destroy();
		}

		this.terrainSprites = [];
		this.terrainFeatureSpriteCount = 0;
		this.terrainDecorationSpriteCount = 0;
		this.updateCanvasTerrainAttributes('fallback', 0, 0, 0);
	}

	private destroyTileZones(): void {
		for (const zone of this.tileZones) {
			zone.destroy();
		}

		this.tileZones = [];
	}

	private destroySceneObjects(): void {
		this.destroyStoreSprites();
		this.destroyTerrainSprites();
		this.destroyTileZones();
		this.input.off('pointermove', this.handlePointerMove, this);
		this.input.off('pointerup', this.handlePointerUp, this);
		this.input.off('wheel', this.handleWheel, this);
		this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
		this.mapGraphics?.destroy();
		this.placementPreviewGraphics?.destroy();
		this.outlineGraphics?.destroy();
		this.markerGraphics?.destroy();
		this.mapGraphics = undefined;
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
	if (variant !== null && variant in ROAD_TERRAIN_CONNECTOR_ART) {
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

	if (tile.feature === 'river') {
		return variant === 'horizontal' || variant === 'end-e' || variant === 'end-w' ? 90 : 0;
	}

	return 0;
}

function getTerrainAssetMode(
	expectedFeatureTileCount: number,
	featureSpriteCount: number
): 'fallback' | 'image' | 'mixed' {
	if (expectedFeatureTileCount === 0 || featureSpriteCount === 0) {
		return 'fallback';
	}

	if (featureSpriteCount === expectedFeatureTileCount) {
		return 'image';
	}

	return 'mixed';
}

type FeatureDirection = 'n' | 'e' | 's' | 'w';

interface ConnectedFeatureFallbackInput {
	graphics: Phaser.GameObjects.Graphics;
	variant: CityMapFeatureVariant;
	x: number;
	y: number;
	fillColor: number;
	lineColor: number;
	fillAlpha: number;
	lineAlpha: number;
	armWidth: number;
	lineWidth: number;
}

function drawConnectedFeatureFallback(input: ConnectedFeatureFallbackInput): void {
	const centerX = input.x + TILE_SIZE / 2;
	const centerY = input.y + TILE_SIZE / 2;
	const halfArm = input.armWidth / 2;
	const directions = getVariantDirections(input.variant);

	input.graphics.fillStyle(input.fillColor, input.fillAlpha);
	input.graphics.fillRect(centerX - halfArm, centerY - halfArm, input.armWidth, input.armWidth);

	for (const direction of directions) {
		switch (direction) {
			case 'n':
				input.graphics.fillRect(centerX - halfArm, input.y, input.armWidth, TILE_SIZE / 2);
				break;
			case 'e':
				input.graphics.fillRect(centerX, centerY - halfArm, TILE_SIZE / 2, input.armWidth);
				break;
			case 's':
				input.graphics.fillRect(centerX - halfArm, centerY, input.armWidth, TILE_SIZE / 2);
				break;
			case 'w':
				input.graphics.fillRect(input.x, centerY - halfArm, TILE_SIZE / 2, input.armWidth);
				break;
		}
	}

	input.graphics.lineStyle(input.lineWidth, input.lineColor, input.lineAlpha);

	for (const direction of directions) {
		switch (direction) {
			case 'n':
				input.graphics.lineBetween(centerX, centerY, centerX, input.y + 4);
				break;
			case 'e':
				input.graphics.lineBetween(centerX, centerY, input.x + TILE_SIZE - 4, centerY);
				break;
			case 's':
				input.graphics.lineBetween(centerX, centerY, centerX, input.y + TILE_SIZE - 4);
				break;
			case 'w':
				input.graphics.lineBetween(centerX, centerY, input.x + 4, centerY);
				break;
		}
	}
}

function getVariantDirections(variant: CityMapFeatureVariant): FeatureDirection[] {
	switch (variant) {
		case 'end-n':
			return ['n'];
		case 'end-e':
			return ['e'];
		case 'end-s':
			return ['s'];
		case 'end-w':
			return ['w'];
		case 'horizontal':
			return ['e', 'w'];
		case 'vertical':
			return ['n', 's'];
		case 'corner-ne':
			return ['n', 'e'];
		case 'corner-es':
			return ['e', 's'];
		case 'corner-sw':
			return ['s', 'w'];
		case 'corner-wn':
			return ['w', 'n'];
		case 'tee-nes':
			return ['n', 'e', 's'];
		case 'tee-esw':
			return ['e', 's', 'w'];
		case 'tee-nsw':
			return ['n', 's', 'w'];
		case 'tee-new':
			return ['n', 'e', 'w'];
		case 'intersection':
			return ['n', 'e', 's', 'w'];
		case 'isolated':
			return [];
	}
}
