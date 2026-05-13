import { asset } from '$app/paths';
import {
	INDUSTRIAL_BUILDING_ART,
	INDUSTRIAL_BUILDING_ART_LIST,
	INDUSTRY_RESOURCE_ART,
	INDUSTRY_RESOURCE_ART_LIST,
	INDUSTRY_TERRAIN_ART,
	INDUSTRY_TERRAIN_ART_LIST
} from '$lib/assets/gameArt';
import Phaser from 'phaser';
import type {
	IndustryMapBuildingRender,
	IndustryMapSnapshot,
	IndustryMapTileRender
} from '../game/industryMapRender';
import type { IndustryResourceId } from '../game/types';

export type IndustryMapEvent = { type: 'tileSelected'; tileId: string };
export type IndustryMapEventHandler = (event: IndustryMapEvent) => void;

const TILE_SIZE = 32;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.2;
const TERRAIN_DEPTH = 0;
const MARKER_DEPTH = 10;
const OUTLINE_DEPTH = 20;

const TERRAIN_COLORS: Record<IndustryMapTileRender['terrain'], number> = {
	farmland: 0xb8d889,
	forest: 0x6fab73,
	water: 0x69b7cf,
	deposit: 0xb9aa8e,
	industrial: 0xb8bec9,
	blocked: 0x343a40
};

const RESOURCE_COLORS: Record<IndustryResourceId, number> = {
	'grain-field': 0xfacc15,
	'salt-deposit': 0xe5e7eb,
	'oilseed-field': 0xf59e0b,
	'water-source': 0x38bdf8,
	'fruit-orchard': 0xfb7185,
	'sugar-field': 0xfef08a,
	'pulpwood-forest': 0x166534,
	'chemical-feedstock': 0xa855f7
};

const STATUS_COLORS: Record<IndustryMapBuildingRender['status'], number> = {
	idle: 0x94a3b8,
	produced: 0x22c55e,
	'imported-inputs': 0xf59e0b,
	blocked: 0xef4444
};

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
	private markerGraphics?: Phaser.GameObjects.Graphics;
	private outlineGraphics?: Phaser.GameObjects.Graphics;
	private tileZones: Phaser.GameObjects.Zone[] = [];
	private terrainSprites: Phaser.GameObjects.Image[] = [];
	private resourceSprites: Phaser.GameObjects.Image[] = [];
	private buildingSprites: Phaser.GameObjects.Image[] = [];
	private buildingSpriteEntries: BuildingSpriteEntry[] = [];
	private buildingSpriteById = new Map<string, Phaser.GameObjects.Image>();
	private hoverTileId: string | null = null;
	private isDragging = false;
	private hasDragged = false;
	private dragStartPoint: { x: number; y: number } | null = null;
	private lastDragPoint: { x: number; y: number } | null = null;
	private hasUserAdjustedCamera = false;

	constructor() {
		super({ key: 'IndustryMapScene' });
	}

	preload(): void {
		for (const path of [
			...INDUSTRY_TERRAIN_ART_LIST,
			...INDUSTRY_RESOURCE_ART_LIST,
			...INDUSTRIAL_BUILDING_ART_LIST
		]) {
			preloadIndustryAsset(this, path);
		}
	}

	create(): void {
		this.mapGraphics = this.add.graphics().setDepth(TERRAIN_DEPTH + 1);
		this.markerGraphics = this.add.graphics().setDepth(MARKER_DEPTH + 1);
		this.outlineGraphics = this.add.graphics().setDepth(OUTLINE_DEPTH);
		this.cameras.main.setZoom(1);
		this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
		this.input.on('pointermove', this.handlePointerMove, this);
		this.input.on('pointerup', this.handlePointerUp, this);
		this.input.on('wheel', this.handleWheel, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroySceneObjects, this);
		this.renderSnapshot();
	}

	update(time: number): void {
		this.updateBuildingSprites(time);
		this.drawMarkerGraphics(time);
		this.updateCanvasCameraAttributes();
	}

	setEventHandler(handler: IndustryMapEventHandler | null): void {
		this.eventHandler = handler;
	}

	updateSnapshot(snapshot: IndustryMapSnapshot): void {
		this.snapshot = snapshot;

		if (!snapshot.tiles.some((tile) => tile.id === this.hoverTileId)) {
			this.hoverTileId = null;
		}

		this.renderSnapshot();
	}

	private renderSnapshot(): void {
		if (!this.mapGraphics || !this.snapshot) {
			this.updateCanvasIndustryAttributes();
			return;
		}

		this.mapGraphics.clear();
		this.destroyTileZones();
		this.destroyTerrainSprites();
		this.setCameraBounds();

		for (const tile of this.snapshot.tiles) {
			this.drawTile(tile);
			this.createTileZone(tile);
		}

		this.rebuildMarkerSprites();
		this.drawMarkerGraphics(0);
		this.drawInteractionOutlines();
	}

	private drawTile(tile: IndustryMapTileRender): void {
		const graphics = this.mapGraphics;

		if (!graphics) {
			return;
		}

		const x = tile.x * TILE_SIZE;
		const y = tile.y * TILE_SIZE;
		const fillAlpha = tile.locked ? 0.38 : 0.98;
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
		} else {
			graphics.fillStyle(TERRAIN_COLORS[tile.terrain], fillAlpha);
			graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		}

		graphics.lineStyle(1, 0xffffff, 0.3);
		graphics.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

		if (tile.locked) {
			graphics.fillStyle(0x111827, 0.34);
			graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		}

		if (tile.occupied) {
			graphics.lineStyle(3, 0x0f766e, 0.95);
			graphics.strokeRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
		}
	}

	private createTileZone(tile: IndustryMapTileRender): void {
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

	private drawMarkerGraphics(time: number): void {
		if (!this.markerGraphics) {
			return;
		}

		this.markerGraphics.clear();

		if (!this.snapshot) {
			this.updateCanvasIndustryAttributes();
			return;
		}

		for (const tile of this.snapshot.tiles) {
			if (tile.resource && !this.hasResourceTexture(tile.resource)) {
				this.drawResourceMarkerFallback(tile);
			}
		}

		this.snapshot.buildings.forEach((building, index) => {
			if (this.buildingSpriteById.has(building.id)) {
				this.drawBuildingStatusRing(building, index, time);
			} else {
				this.drawBuildingMarkerFallback(building, index, time);
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

	private drawResourceMarkerFallback(tile: IndustryMapTileRender): void {
		if (!tile.resource || !this.markerGraphics) {
			return;
		}

		const x = tile.x * TILE_SIZE + TILE_SIZE * 0.72;
		const y = tile.y * TILE_SIZE + TILE_SIZE * 0.28;
		const color = RESOURCE_COLORS[tile.resource];

		this.markerGraphics.fillStyle(0x0f172a, 0.3);
		this.drawResourceShape(tile.resource, x + 1, y + 1, 5, 0x0f172a, 0x0f172a, 0.15);
		this.drawResourceShape(tile.resource, x, y, 5, color, 0xffffff, 0.9);
	}

	private drawResourceShape(
		resource: IndustryResourceId,
		x: number,
		y: number,
		radius: number,
		fillColor: number,
		outlineColor: number,
		alpha: number
	): void {
		if (!this.markerGraphics) {
			return;
		}

		this.markerGraphics.fillStyle(fillColor, alpha);
		this.markerGraphics.lineStyle(1, outlineColor, alpha);

		switch (resource) {
			case 'water-source':
				this.markerGraphics.fillCircle(x, y, radius);
				this.markerGraphics.strokeCircle(x, y, radius);
				break;
			case 'salt-deposit':
			case 'chemical-feedstock':
				this.drawDiamond(x, y, radius, true);
				break;
			case 'pulpwood-forest':
				this.markerGraphics.fillRect(x - radius, y - radius, radius * 2, radius * 2);
				this.markerGraphics.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
				break;
			default:
				this.markerGraphics.fillTriangle(
					x,
					y - radius,
					x - radius,
					y + radius,
					x + radius,
					y + radius
				);
				this.markerGraphics.strokeTriangle(
					x,
					y - radius,
					x - radius,
					y + radius,
					x + radius,
					y + radius
				);
		}
	}

	private createBuildingSprite(building: IndustryMapBuildingRender): void {
		const buildingPath = INDUSTRIAL_BUILDING_ART[building.typeId];
		const buildingTextureKey = industryTextureKey(buildingPath);

		if (!this.textures.exists(buildingTextureKey)) {
			return;
		}

		const x = building.x * TILE_SIZE + TILE_SIZE / 2;
		const y = building.y * TILE_SIZE + TILE_SIZE / 2;
		const buildingSprite = this.add
			.image(x, y, buildingTextureKey)
			.setDisplaySize(28, 28)
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

	private drawBuildingMarkerFallback(
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

		this.markerGraphics.fillStyle(0x0f172a, 0.22);
		this.markerGraphics.fillCircle(position.x + 2, position.y + 3, 10);
		this.markerGraphics.fillStyle(fillColor, 0.98);
		this.markerGraphics.lineStyle(3, outlineColor, 0.95);
		this.drawBuildingShape(stage, position.x, position.y, 9);
		this.markerGraphics.lineStyle(1, 0xffffff, 0.85);
		this.markerGraphics.strokeCircle(position.x, position.y, 12);
	}

	private getBuildingMarkerPosition(
		building: IndustryMapBuildingRender,
		index: number,
		time: number
	): { x: number; y: number } {
		return {
			x: building.x * TILE_SIZE + TILE_SIZE / 2,
			y: building.y * TILE_SIZE + TILE_SIZE / 2 + Math.sin(time / 360 + index) * 1.8
		};
	}

	private hasResourceTexture(resource: IndustryResourceId): boolean {
		return this.textures.exists(industryTextureKey(INDUSTRY_RESOURCE_ART[resource]));
	}

	private drawBuildingShape(stage: BuildingStage, x: number, y: number, radius: number): void {
		if (!this.markerGraphics) {
			return;
		}

		switch (stage) {
			case 'raw':
				this.markerGraphics.fillCircle(x, y, radius);
				this.markerGraphics.strokeCircle(x, y, radius);
				break;
			case 'process':
				this.drawDiamond(x, y, radius, true);
				break;
			case 'final':
				this.markerGraphics.fillRect(x - radius, y - radius, radius * 2, radius * 2);
				this.markerGraphics.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
				break;
			case 'warehouse':
				this.markerGraphics.fillRect(
					x - radius - 2,
					y - radius + 2,
					radius * 2 + 4,
					radius * 2 - 2
				);
				this.markerGraphics.strokeRect(
					x - radius - 2,
					y - radius + 2,
					radius * 2 + 4,
					radius * 2 - 2
				);
				this.markerGraphics.lineBetween(x - radius - 2, y - radius + 2, x, y - radius - 5);
				this.markerGraphics.lineBetween(x, y - radius - 5, x + radius + 2, y - radius + 2);
				break;
		}
	}

	private drawDiamond(x: number, y: number, radius: number, closePath: boolean): void {
		if (!this.markerGraphics) {
			return;
		}

		this.markerGraphics.beginPath();
		this.markerGraphics.moveTo(x, y - radius);
		this.markerGraphics.lineTo(x + radius, y);
		this.markerGraphics.lineTo(x, y + radius);
		this.markerGraphics.lineTo(x - radius, y);
		this.markerGraphics.closePath();
		this.markerGraphics.fillPath();

		if (closePath) {
			this.markerGraphics.strokePath();
		}
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
				this.outlineGraphics.lineStyle(3, 0xfacc15, 0.85);
				this.outlineGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
			}

			if (tile.selected) {
				this.outlineGraphics.lineStyle(4, 0x2563eb, 1);
				this.outlineGraphics.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
			}
		}
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
				: 'fallback';
		canvas.dataset.industryTerrainSpriteCount = String(this.terrainSprites.length);
		canvas.dataset.industryResourceSpriteCount = String(this.resourceSprites.length);
		canvas.dataset.industryBuildingSpriteCount = String(this.buildingSprites.length);
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

	private destroyTileZones(): void {
		for (const zone of this.tileZones) {
			zone.destroy();
		}

		this.tileZones = [];
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

	private destroySceneObjects(): void {
		this.destroyTileZones();
		this.destroyTerrainSprites();
		this.destroyResourceSprites();
		this.destroyBuildingSprites();
		this.input.off('pointermove', this.handlePointerMove, this);
		this.input.off('pointerup', this.handlePointerUp, this);
		this.input.off('wheel', this.handleWheel, this);
		this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
		this.mapGraphics?.destroy();
		this.markerGraphics?.destroy();
		this.outlineGraphics?.destroy();
		this.mapGraphics = undefined;
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
