import { asset } from '$app/paths';
import Phaser from 'phaser';
import { STORE_ART_LIST, getStoreArt } from '../assets/gameArt';
import type { CityMapSnapshot, CityMapTileRender } from '../game/mapRender';

export type CityMapEvent = { type: 'tileSelected'; tileId: string };
export type CityMapEventHandler = (event: CityMapEvent) => void;

const TILE_SIZE = 32;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.2;
const STORE_SPRITE_SIZE = TILE_SIZE * 0.82;
const TERRAIN_DEPTH = 0;
const STORE_MARKER_DEPTH = 10;
const OUTLINE_DEPTH = 20;

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
	private outlineGraphics?: Phaser.GameObjects.Graphics;
	private markerGraphics?: Phaser.GameObjects.Graphics;
	private tileZones: Phaser.GameObjects.Zone[] = [];
	private storeSprites: StoreSpriteRender[] = [];
	private hoverTileId: string | null = null;
	private isDragging = false;
	private hasDragged = false;
	private dragStartPoint: { x: number; y: number } | null = null;
	private lastDragPoint: { x: number; y: number } | null = null;

	constructor() {
		super({ key: 'CityMapScene' });
	}

	preload(): void {
		for (const art of STORE_ART_LIST) {
			this.load.image(art.textureKey, asset(art.path));
		}
	}

	create(): void {
		this.mapGraphics = this.add.graphics().setDepth(TERRAIN_DEPTH);
		this.outlineGraphics = this.add.graphics().setDepth(OUTLINE_DEPTH);
		this.markerGraphics = this.add.graphics().setDepth(STORE_MARKER_DEPTH);
		this.cameras.main.setZoom(1);
		this.input.on('pointermove', this.handlePointerMove, this);
		this.input.on('pointerup', this.handlePointerUp, this);
		this.input.on('wheel', this.handleWheel, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroySceneObjects, this);
		this.renderSnapshot();
	}

	update(time: number): void {
		this.drawStoreMarkers(time);
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
			return;
		}

		this.mapGraphics.clear();
		this.destroyStoreSprites();
		this.destroyTileZones();
		this.setCameraBounds();

		for (const tile of this.snapshot.tiles) {
			this.drawTile(tile);
			this.createTileZone(tile);
		}

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

		graphics.fillStyle(TERRAIN_COLORS[tile.terrain], fillAlpha);
		graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		graphics.lineStyle(1, 0xffffff, 0.35);
		graphics.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

		if (tile.locked) {
			graphics.fillStyle(0x1f2933, 0.24);
			graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		}

		if (tile.owned) {
			graphics.lineStyle(3, 0x1f8a70, 0.95);
			graphics.strokeRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
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
			if (pointer.leftButtonDown()) {
				this.isDragging = true;
				this.hasDragged = false;
				this.dragStartPoint = { x: pointer.x, y: pointer.y };
				this.lastDragPoint = { x: pointer.x, y: pointer.y };
			}
		});
		zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
			if (this.didDrag(pointer)) {
				return;
			}

			this.eventHandler?.({ type: 'tileSelected', tileId: tile.id });
		});

		this.tileZones.push(zone);
	}

	private handlePointerMove(pointer: Phaser.Input.Pointer): void {
		if (!this.isDragging || !this.lastDragPoint || !pointer.isDown) {
			return;
		}

		const camera = this.cameras.main;
		const zoom = camera.zoom || 1;
		camera.scrollX -= (pointer.x - this.lastDragPoint.x) / zoom;
		camera.scrollY -= (pointer.y - this.lastDragPoint.y) / zoom;

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
		camera.setZoom(nextZoom);
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

	private destroyStoreSprites(): void {
		for (const storeSprite of this.storeSprites) {
			storeSprite.sprite.destroy();
		}

		this.storeSprites = [];
		this.updateCanvasStoreMarkerAttributes('circle', 0);
	}

	private destroyTileZones(): void {
		for (const zone of this.tileZones) {
			zone.destroy();
		}

		this.tileZones = [];
	}

	private destroySceneObjects(): void {
		this.destroyStoreSprites();
		this.destroyTileZones();
		this.input.off('pointermove', this.handlePointerMove, this);
		this.input.off('pointerup', this.handlePointerUp, this);
		this.input.off('wheel', this.handleWheel, this);
		this.mapGraphics?.destroy();
		this.outlineGraphics?.destroy();
		this.markerGraphics?.destroy();
		this.mapGraphics = undefined;
		this.outlineGraphics = undefined;
		this.markerGraphics = undefined;
	}
}
