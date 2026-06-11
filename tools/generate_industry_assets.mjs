import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TERRAIN = {
	farmland: '/assets/game/industry/terrain/farmland-tile.png',
	forest: '/assets/game/industry/terrain/forest-tile.png',
	water: '/assets/game/industry/terrain/water-tile.png',
	deposit: '/assets/game/industry/terrain/deposit-tile.png',
	industrial: '/assets/game/industry/terrain/industrial-tile.png',
	blocked: '/assets/game/industry/terrain/blocked-tile.png'
};

const RESOURCES = {
	'grain-field': '/assets/game/industry/resources/grain-field.png',
	'salt-deposit': '/assets/game/industry/resources/salt-deposit.png',
	'oilseed-field': '/assets/game/industry/resources/oilseed-field.png',
	'water-source': '/assets/game/industry/resources/water-source.png',
	'fruit-orchard': '/assets/game/industry/resources/fruit-orchard.png',
	'sugar-field': '/assets/game/industry/resources/sugar-field.png',
	'pulpwood-forest': '/assets/game/industry/resources/pulpwood-forest.png',
	'chemical-feedstock': '/assets/game/industry/resources/chemical-feedstock.png'
};

const MATERIALS = {
	grain: '/assets/game/industry/materials/grain.png',
	salt: '/assets/game/industry/materials/salt.png',
	oilseeds: '/assets/game/industry/materials/oilseeds.png',
	water: '/assets/game/industry/materials/water.png',
	fruit: '/assets/game/industry/materials/fruit.png',
	sugar: '/assets/game/industry/materials/sugar.png',
	pulpwood: '/assets/game/industry/materials/pulpwood.png',
	'chemical-feedstock': '/assets/game/industry/materials/chemical-feedstock.png',
	flour: '/assets/game/industry/materials/flour.png',
	'cooking-oil': '/assets/game/industry/materials/cooking-oil.png',
	'filtered-water': '/assets/game/industry/materials/filtered-water.png',
	syrup: '/assets/game/industry/materials/syrup.png',
	'paper-pulp': '/assets/game/industry/materials/paper-pulp.png',
	plastic: '/assets/game/industry/materials/plastic.png',
	packaging: '/assets/game/industry/materials/packaging.png',
	'cleaning-base': '/assets/game/industry/materials/cleaning-base.png',
	snacks: '/assets/game/industry/materials/snacks.png',
	drinks: '/assets/game/industry/materials/drinks.png',
	essentials: '/assets/game/industry/materials/essentials.png',
	'bottled-water': '/assets/game/industry/materials/bottled-water.png',
	produce: '/assets/game/industry/materials/produce.png',
	pantry: '/assets/game/industry/materials/pantry.png'
};

const BUILDINGS = {
	'grain-farm': '/assets/game/industry/buildings/grain-farm.png',
	'salt-mine': '/assets/game/industry/buildings/salt-mine.png',
	'oilseed-farm': '/assets/game/industry/buildings/oilseed-farm.png',
	'water-pump': '/assets/game/industry/buildings/water-pump.png',
	'fruit-farm': '/assets/game/industry/buildings/fruit-farm.png',
	'sugar-farm': '/assets/game/industry/buildings/sugar-farm.png',
	'pulpwood-grove': '/assets/game/industry/buildings/pulpwood-grove.png',
	'chemical-feedstock-well': '/assets/game/industry/buildings/chemical-feedstock-well.png',
	'flour-mill': '/assets/game/industry/buildings/flour-mill.png',
	'oil-press': '/assets/game/industry/buildings/oil-press.png',
	'water-filtration-plant': '/assets/game/industry/buildings/water-filtration-plant.png',
	'syrup-plant': '/assets/game/industry/buildings/syrup-plant.png',
	'pulp-mill': '/assets/game/industry/buildings/pulp-mill.png',
	'plastic-plant': '/assets/game/industry/buildings/plastic-plant.png',
	'packaging-plant': '/assets/game/industry/buildings/packaging-plant.png',
	'chemical-plant': '/assets/game/industry/buildings/chemical-plant.png',
	'snack-factory': '/assets/game/industry/buildings/snack-factory.png',
	'drink-bottling-plant': '/assets/game/industry/buildings/drink-bottling-plant.png',
	'household-goods-factory': '/assets/game/industry/buildings/household-goods-factory.png',
	'water-bottler': '/assets/game/industry/buildings/water-bottler.png',
	'produce-packhouse': '/assets/game/industry/buildings/produce-packhouse.png',
	'pantry-works': '/assets/game/industry/buildings/pantry-works.png',
	warehouse: '/assets/game/industry/buildings/warehouse.png'
};

const PRODUCTS = {
	'bottled-water': '/assets/game/products/bottled-water.png'
};

const PALETTE = {
	outline: [50, 57, 65, 255],
	shadow: [36, 42, 48, 90],
	field: [183, 207, 92, 255],
	leaf: [65, 139, 84, 255],
	darkLeaf: [38, 96, 67, 255],
	water: [79, 151, 191, 255],
	waterLight: [153, 211, 222, 255],
	soil: [139, 107, 69, 255],
	stone: [135, 130, 120, 255],
	salt: [238, 237, 223, 255],
	metal: [127, 140, 148, 255],
	concrete: [181, 184, 176, 255],
	yellow: [232, 190, 73, 255],
	orange: [218, 129, 55, 255],
	red: [192, 74, 68, 255],
	pink: [223, 117, 130, 255],
	blue: [65, 120, 189, 255],
	green: [91, 157, 95, 255],
	cream: [244, 223, 170, 255],
	white: [250, 250, 240, 255],
	plastic: [104, 196, 202, 255],
	chemical: [126, 91, 172, 255],
	brown: [145, 91, 52, 255]
};

function makePng(size, fill = [0, 0, 0, 0]) {
	const png = new PNG({ width: size, height: size });
	for (let index = 0; index < png.data.length; index += 4) {
		png.data[index] = fill[0];
		png.data[index + 1] = fill[1];
		png.data[index + 2] = fill[2];
		png.data[index + 3] = fill[3];
	}
	return png;
}

function setPixel(png, x, y, color) {
	if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
		return;
	}
	const index = (Math.floor(y) * png.width + Math.floor(x)) * 4;
	png.data[index] = color[0];
	png.data[index + 1] = color[1];
	png.data[index + 2] = color[2];
	png.data[index + 3] = color[3];
}

function rect(png, x, y, width, height, color) {
	for (let yy = y; yy < y + height; yy += 1) {
		for (let xx = x; xx < x + width; xx += 1) {
			setPixel(png, xx, yy, color);
		}
	}
}

function circle(png, cx, cy, radius, color) {
	const radiusSquared = radius * radius;
	for (let y = cy - radius; y <= cy + radius; y += 1) {
		for (let x = cx - radius; x <= cx + radius; x += 1) {
			const dx = x - cx;
			const dy = y - cy;
			if (dx * dx + dy * dy <= radiusSquared) {
				setPixel(png, x, y, color);
			}
		}
	}
}

function line(png, x0, y0, x1, y1, color) {
	const dx = Math.abs(x1 - x0);
	const sx = x0 < x1 ? 1 : -1;
	const dy = -Math.abs(y1 - y0);
	const sy = y0 < y1 ? 1 : -1;
	let error = dx + dy;
	let x = x0;
	let y = y0;

	while (true) {
		setPixel(png, x, y, color);
		if (x === x1 && y === y1) {
			break;
		}
		const doubleError = error * 2;
		if (doubleError >= dy) {
			error += dy;
			x += sx;
		}
		if (doubleError <= dx) {
			error += dx;
			y += sy;
		}
	}
}

function thickLine(png, x0, y0, x1, y1, color, width = 2) {
	for (let offset = -Math.floor(width / 2); offset <= Math.floor(width / 2); offset += 1) {
		line(png, x0 + offset, y0, x1 + offset, y1, color);
		line(png, x0, y0 + offset, x1, y1 + offset, color);
	}
}

function diamond(png, cx, cy, radius, color) {
	for (let y = cy - radius; y <= cy + radius; y += 1) {
		for (let x = cx - radius; x <= cx + radius; x += 1) {
			if (Math.abs(x - cx) + Math.abs(y - cy) <= radius) {
				setPixel(png, x, y, color);
			}
		}
	}
}

function triangle(png, ax, ay, bx, by, cx, cy, color) {
	const minX = Math.min(ax, bx, cx);
	const maxX = Math.max(ax, bx, cx);
	const minY = Math.min(ay, by, cy);
	const maxY = Math.max(ay, by, cy);
	const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
			const w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
			const w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
			if (area >= 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0) {
				setPixel(png, x, y, color);
			}
		}
	}
}

function save(png, publicPath) {
	const relativePath = publicPath.replace(/^\//, '');
	const target = join(ROOT, 'static', relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, PNG.sync.write(png));
}

function drawTerrainBackground(png, color, accent) {
	rect(png, 0, 0, 64, 64, color);
	for (let y = 0; y < 64; y += 8) {
		for (let x = (y / 8) % 2 === 0 ? 0 : 4; x < 64; x += 8) {
			rect(png, x, y, 4, 4, accent);
		}
	}
}

function drawTerrain(id) {
	const png = makePng(64, PALETTE.field);
	if (id === 'farmland') {
		drawTerrainBackground(png, [177, 197, 91, 255], [205, 219, 117, 255]);
		for (let x = -16; x < 80; x += 12) {
			thickLine(png, x, 64, x + 32, 0, [133, 151, 76, 255], 2);
		}
	}
	if (id === 'forest') {
		drawTerrainBackground(png, [69, 124, 78, 255], [53, 102, 72, 255]);
		for (const [x, y] of [
			[12, 18],
			[28, 12],
			[47, 21],
			[20, 43],
			[42, 45]
		]) {
			circle(png, x, y, 9, PALETTE.darkLeaf);
			circle(png, x - 3, y - 2, 7, PALETTE.leaf);
			rect(png, x - 2, y + 5, 4, 9, PALETTE.brown);
		}
	}
	if (id === 'water') {
		drawTerrainBackground(png, [74, 144, 184, 255], [67, 132, 171, 255]);
		for (let y = 13; y < 64; y += 14) {
			thickLine(png, 5, y, 24, y - 4, PALETTE.waterLight, 2);
			thickLine(png, 35, y + 2, 58, y - 2, PALETTE.waterLight, 2);
		}
	}
	if (id === 'deposit') {
		drawTerrainBackground(png, [130, 119, 95, 255], [153, 143, 118, 255]);
		for (const [x, y, r] of [
			[15, 21, 7],
			[33, 35, 11],
			[50, 18, 6],
			[50, 50, 8]
		]) {
			diamond(png, x, y, r, PALETTE.stone);
			diamond(png, x - 2, y - 2, Math.max(2, r - 4), PALETTE.salt);
		}
	}
	if (id === 'industrial') {
		drawTerrainBackground(png, [161, 164, 159, 255], [143, 148, 149, 255]);
		rect(png, 7, 42, 50, 8, [101, 108, 113, 255]);
		for (let x = 8; x < 60; x += 13) {
			rect(png, x, 15, 8, 28, PALETTE.concrete);
			rect(png, x + 2, 19, 4, 5, PALETTE.metal);
		}
	}
	if (id === 'blocked') {
		drawTerrainBackground(png, [91, 92, 92, 255], [76, 78, 80, 255]);
		for (let offset = -18; offset < 72; offset += 14) {
			thickLine(png, offset, 64, offset + 64, 0, [124, 83, 64, 255], 3);
		}
	}
	return png;
}

function drawSheaf(png, cx, cy, color = PALETTE.yellow) {
	for (let offset = -10; offset <= 10; offset += 5) {
		thickLine(png, cx, cy + 22, cx + offset, cy - 14, PALETTE.brown, 2);
		circle(png, cx + offset, cy - 14, 4, color);
	}
}

function drawTree(png, cx, cy, fruitColor = null) {
	rect(png, cx - 4, cy + 11, 8, 20, PALETTE.brown);
	circle(png, cx, cy, 19, PALETTE.darkLeaf);
	circle(png, cx - 8, cy + 3, 13, PALETTE.leaf);
	circle(png, cx + 9, cy + 1, 13, PALETTE.leaf);
	if (fruitColor) {
		for (const [x, y] of [
			[cx - 10, cy - 1],
			[cx + 7, cy - 7],
			[cx + 2, cy + 9]
		]) {
			circle(png, x, y, 4, fruitColor);
		}
	}
}

function drawResource(id) {
	const png = makePng(96);
	ellipseShadow(png);
	if (id === 'grain-field') {
		drawSheaf(png, 48, 43);
	}
	if (id === 'salt-deposit') {
		rockCluster(png, PALETTE.salt, PALETTE.stone);
	}
	if (id === 'oilseed-field') {
		drawSheaf(png, 48, 43, [54, 62, 58, 255]);
		for (let x = 33; x <= 63; x += 10) circle(png, x, 31, 3, PALETTE.yellow);
	}
	if (id === 'water-source') {
		circle(png, 48, 50, 25, PALETTE.water);
		circle(png, 39, 42, 11, PALETTE.waterLight);
		thickLine(png, 30, 57, 66, 44, PALETTE.blue, 3);
	}
	if (id === 'fruit-orchard') {
		drawTree(png, 48, 39, PALETTE.red);
	}
	if (id === 'sugar-field') {
		for (let x = 31; x <= 61; x += 10) {
			thickLine(png, x, 69, x + 3, 25, [108, 153, 83, 255], 3);
			thickLine(png, x + 2, 41, x + 10, 33, PALETTE.leaf, 2);
		}
	}
	if (id === 'pulpwood-forest') {
		drawTree(png, 37, 43);
		drawTree(png, 59, 43);
	}
	if (id === 'chemical-feedstock') {
		diamond(png, 48, 51, 27, [74, 72, 80, 255]);
		circle(png, 49, 43, 13, PALETTE.chemical);
		circle(png, 58, 53, 7, [176, 120, 220, 255]);
	}
	return png;
}

function ellipseShadow(png) {
	for (let y = 66; y <= 78; y += 1) {
		for (let x = 22; x <= 74; x += 1) {
			const dx = (x - 48) / 27;
			const dy = (y - 72) / 7;
			if (dx * dx + dy * dy <= 1) {
				setPixel(png, x, y, PALETTE.shadow);
			}
		}
	}
}

function rockCluster(png, primary, secondary) {
	diamond(png, 35, 56, 19, secondary);
	diamond(png, 55, 49, 24, primary);
	diamond(png, 62, 62, 14, secondary);
	diamond(png, 50, 42, 8, PALETTE.white);
}

function drawMaterial(id) {
	const png = makePng(96);
	ellipseShadow(png);
	const bags = ['flour', 'packaging', 'essentials'];
	if (['grain', 'oilseeds', 'snacks'].includes(id)) {
		circle(png, 48, 48, 25, id === 'oilseeds' ? [62, 70, 63, 255] : PALETTE.yellow);
		for (let i = 0; i < 8; i += 1) circle(png, 30 + i * 5, 48 + (i % 2) * 6, 4, PALETTE.cream);
		if (id === 'grain') {
			for (let x = 38; x <= 58; x += 5) thickLine(png, x, 67, x - 6, 29, PALETTE.brown, 2);
		}
		if (id === 'snacks') {
			rect(png, 29, 34, 38, 30, PALETTE.red);
			triangle(png, 29, 34, 48, 25, 67, 34, PALETTE.orange);
			rect(png, 38, 42, 20, 12, PALETTE.cream);
		}
	}
	if (id === 'salt') rockCluster(png, PALETTE.salt, [212, 214, 205, 255]);
	if (id === 'water' || id === 'filtered-water' || id === 'drinks') {
		rect(png, 35, 27, 26, 44, id === 'drinks' ? PALETTE.orange : PALETTE.water);
		rect(png, 39, 20, 18, 9, PALETTE.waterLight);
		rect(png, 39, 36, 18, 18, PALETTE.white);
		if (id === 'water') {
			thickLine(png, 39, 61, 57, 43, PALETTE.blue, 2);
		}
		if (id === 'filtered-water') {
			rect(png, 31, 33, 34, 8, PALETTE.metal);
			circle(png, 48, 56, 5, PALETTE.white);
		}
		if (id === 'drinks') {
			circle(png, 48, 47, 7, PALETTE.yellow);
		}
	}
	if (id === 'fruit') {
		circle(png, 43, 51, 17, PALETTE.red);
		circle(png, 56, 49, 16, PALETTE.orange);
		rect(png, 48, 28, 5, 12, PALETTE.brown);
	}
	if (id === 'sugar') {
		rect(png, 30, 42, 36, 29, PALETTE.white);
		for (let x = 33; x < 64; x += 8) rect(png, x, 35, 5, 8, PALETTE.cream);
	}
	if (id === 'pulpwood') {
		for (let y = 37; y <= 61; y += 10) {
			rect(png, 28, y, 40, 8, PALETTE.brown);
			circle(png, 28, y + 4, 5, [179, 123, 73, 255]);
		}
	}
	if (id === 'chemical-feedstock' || id === 'cleaning-base') {
		circle(png, 48, 52, 24, id === 'cleaning-base' ? PALETTE.plastic : PALETTE.chemical);
		circle(png, 39, 42, 6, PALETTE.white);
		circle(png, 58, 56, 8, [173, 121, 219, 255]);
	}
	if (bags.includes(id)) {
		rect(png, 30, 29, 36, 44, id === 'packaging' ? PALETTE.brown : PALETTE.cream);
		rect(png, 36, 37, 24, 12, PALETTE.white);
		if (id === 'flour') {
			drawSheaf(png, 48, 52, PALETTE.yellow);
		}
		if (id === 'packaging') {
			thickLine(png, 30, 29, 66, 73, PALETTE.outline, 2);
			thickLine(png, 66, 29, 30, 73, PALETTE.outline, 2);
		}
		if (id === 'essentials') {
			rect(png, 43, 32, 10, 34, PALETTE.blue);
			rect(png, 36, 44, 24, 10, PALETTE.blue);
		}
	}
	if (id === 'cooking-oil' || id === 'syrup') {
		rect(png, 37, 24, 22, 49, id === 'syrup' ? PALETTE.orange : PALETTE.yellow);
		rect(png, 41, 18, 14, 8, PALETTE.metal);
		circle(png, 48, 49, 9, PALETTE.white);
	}
	if (id === 'paper-pulp') {
		for (let y = 34; y < 63; y += 7) rect(png, 28, y, 40, 5, [219, 218, 198, 255]);
	}
	if (id === 'plastic') {
		diamond(png, 48, 49, 27, PALETTE.plastic);
		diamond(png, 48, 49, 15, [151, 224, 225, 255]);
	}
	if (id === 'bottled-water') {
		rect(png, 39, 25, 18, 46, PALETTE.waterLight);
		rect(png, 43, 17, 10, 9, PALETTE.blue);
		rect(png, 42, 40, 12, 16, PALETTE.white);
		circle(png, 48, 62, 5, PALETTE.water);
	}
	if (id === 'produce') {
		circle(png, 40, 52, 14, PALETTE.green);
		circle(png, 57, 54, 12, PALETTE.orange);
		circle(png, 49, 38, 10, PALETTE.red);
		rect(png, 47, 27, 4, 9, PALETTE.brown);
	}
	if (id === 'pantry') {
		rect(png, 28, 32, 40, 40, PALETTE.cream);
		rect(png, 33, 40, 30, 8, PALETTE.brown);
		rect(png, 33, 54, 30, 8, PALETTE.yellow);
		rect(png, 40, 24, 16, 8, PALETTE.metal);
	}
	return png;
}

function drawFactoryBase(png, body = PALETTE.concrete, roof = PALETTE.red) {
	ellipseShadow(png);
	rect(png, 23, 43, 50, 30, body);
	triangle(png, 20, 43, 48, 22, 76, 43, roof);
	rect(png, 29, 54, 9, 10, PALETTE.blue);
	rect(png, 45, 54, 9, 10, PALETTE.blue);
	rect(png, 61, 28, 8, 18, PALETTE.metal);
	rect(png, 58, 22, 14, 7, PALETTE.outline);
}

function drawBuilding(id) {
	const png = makePng(96);
	const farmBuildings = {
		'grain-farm': PALETTE.yellow,
		'oilseed-farm': PALETTE.green,
		'fruit-farm': PALETTE.red,
		'sugar-farm': PALETTE.cream,
		'pulpwood-grove': PALETTE.darkLeaf
	};
	if (id in farmBuildings) {
		drawFactoryBase(png, [218, 190, 119, 255], farmBuildings[id]);
		if (id === 'pulpwood-grove') drawTree(png, 27, 36);
	}
	if (id === 'salt-mine') {
		rockCluster(png, PALETTE.salt, PALETTE.stone);
		rect(png, 36, 32, 26, 34, [118, 101, 82, 255]);
	}
	if (id === 'water-pump') {
		ellipseShadow(png);
		rect(png, 35, 31, 12, 38, PALETTE.metal);
		circle(png, 54, 36, 15, PALETTE.water);
		thickLine(png, 45, 39, 64, 55, PALETTE.outline, 3);
	}
	if (id === 'chemical-feedstock-well') {
		ellipseShadow(png);
		rect(png, 44, 27, 8, 43, PALETTE.outline);
		thickLine(png, 31, 67, 48, 28, PALETTE.metal, 3);
		thickLine(png, 65, 67, 48, 28, PALETTE.metal, 3);
		circle(png, 48, 72, 8, PALETTE.chemical);
	}
	if (
		[
			'flour-mill',
			'oil-press',
			'water-filtration-plant',
			'syrup-plant',
			'pulp-mill',
			'plastic-plant',
			'packaging-plant',
			'chemical-plant',
			'snack-factory',
			'drink-bottling-plant',
			'household-goods-factory'
		].includes(id)
	) {
		const roof = id.includes('water') || id.includes('drink') ? PALETTE.blue : PALETTE.orange;
		const body =
			id.includes('chemical') || id.includes('plastic') ? [185, 172, 205, 255] : PALETTE.concrete;
		drawFactoryBase(png, body, roof);
		if (id === 'flour-mill') {
			circle(png, 48, 50, 13, PALETTE.white);
			for (let angle = 0; angle < 4; angle += 1) {
				const x = angle % 2 === 0 ? 48 : angle === 1 ? 64 : 32;
				const y = angle % 2 === 1 ? 50 : angle === 0 ? 34 : 66;
				thickLine(png, 48, 50, x, y, PALETTE.outline, 2);
			}
		}
		if (id === 'oil-press') {
			rect(png, 33, 34, 18, 8, PALETTE.yellow);
			circle(png, 40, 58, 10, [68, 74, 67, 255]);
			thickLine(png, 52, 63, 64, 63, PALETTE.yellow, 3);
		}
		if (id === 'water-filtration-plant') {
			rect(png, 33, 34, 18, 8, PALETTE.waterLight);
			rect(png, 31, 51, 34, 8, PALETTE.metal);
			circle(png, 48, 64, 5, PALETTE.water);
		}
		if (id === 'syrup-plant') {
			rect(png, 33, 34, 18, 8, PALETTE.yellow);
			rect(png, 57, 48, 8, 19, PALETTE.orange);
			circle(png, 61, 44, 5, PALETTE.orange);
		}
		if (id === 'pulp-mill') {
			circle(png, 48, 50, 13, [219, 218, 198, 255]);
			for (let y = 58; y <= 68; y += 5) rect(png, 29, y, 21, 3, PALETTE.brown);
		}
		if (id === 'plastic-plant') {
			rect(png, 33, 34, 18, 8, PALETTE.plastic);
			for (const [x, y] of [
				[37, 57],
				[48, 62],
				[59, 55]
			]) {
				diamond(png, x, y, 5, PALETTE.plastic);
			}
		}
		if (id === 'packaging-plant') {
			rect(png, 33, 34, 18, 8, PALETTE.yellow);
			rect(png, 34, 52, 15, 13, PALETTE.brown);
			rect(png, 52, 49, 12, 17, PALETTE.cream);
		}
		if (id === 'chemical-plant') {
			rect(png, 33, 34, 18, 8, PALETTE.chemical);
			circle(png, 40, 60, 7, PALETTE.chemical);
			circle(png, 56, 55, 5, [176, 120, 220, 255]);
			thickLine(png, 40, 53, 56, 50, PALETTE.outline, 2);
		}
		if (id === 'snack-factory') {
			rect(png, 33, 34, 18, 8, PALETTE.yellow);
			rect(png, 35, 52, 24, 13, PALETTE.red);
			triangle(png, 35, 52, 47, 45, 59, 52, PALETTE.orange);
		}
		if (id === 'drink-bottling-plant') {
			rect(png, 33, 34, 18, 8, PALETTE.waterLight);
			for (let x = 35; x <= 58; x += 8) {
				rect(png, x, 49, 5, 17, PALETTE.orange);
				rect(png, x + 1, 45, 3, 5, PALETTE.waterLight);
			}
		}
		if (id === 'household-goods-factory') {
			rect(png, 33, 34, 18, 8, PALETTE.yellow);
			rect(png, 37, 48, 18, 20, PALETTE.blue);
			rect(png, 41, 40, 10, 28, PALETTE.blue);
			circle(png, 62, 59, 5, PALETTE.white);
		}
	}
	if (id === 'water-bottler') {
		drawFactoryBase(png, PALETTE.concrete, PALETTE.blue);
		rect(png, 33, 34, 18, 8, PALETTE.waterLight);
		rect(png, 37, 50, 6, 16, PALETTE.waterLight);
		rect(png, 50, 50, 6, 16, PALETTE.waterLight);
	}
	if (id === 'produce-packhouse') {
		drawFactoryBase(png, [218, 190, 119, 255], PALETTE.green);
		circle(png, 38, 58, 6, PALETTE.red);
		circle(png, 52, 60, 6, PALETTE.orange);
	}
	if (id === 'pantry-works') {
		drawFactoryBase(png, PALETTE.concrete, PALETTE.yellow);
		rect(png, 34, 52, 12, 14, PALETTE.cream);
		rect(png, 50, 52, 12, 14, PALETTE.brown);
	}
	if (id === 'warehouse') {
		ellipseShadow(png);
		rect(png, 20, 38, 56, 35, [168, 138, 97, 255]);
		triangle(png, 17, 38, 48, 20, 79, 38, [111, 95, 84, 255]);
		rect(png, 37, 51, 22, 22, [108, 91, 72, 255]);
		rect(png, 25, 45, 10, 9, PALETTE.cream);
	}
	return png;
}

function drawProduct(id) {
	const png = makePng(96);
	if (id === 'bottled-water') {
		ellipseShadow(png);
		rect(png, 36, 22, 24, 52, PALETTE.waterLight);
		rect(png, 41, 13, 14, 10, PALETTE.blue);
		rect(png, 40, 40, 16, 20, PALETTE.white);
		circle(png, 48, 66, 6, PALETTE.water);
	}
	return png;
}

for (const [id, path] of Object.entries(TERRAIN)) {
	save(drawTerrain(id), path);
}

for (const [id, path] of Object.entries(RESOURCES)) {
	save(drawResource(id), path);
}

for (const [id, path] of Object.entries(MATERIALS)) {
	save(drawMaterial(id), path);
}

for (const [id, path] of Object.entries(BUILDINGS)) {
	save(drawBuilding(id), path);
}

for (const [id, path] of Object.entries(PRODUCTS)) {
	save(drawProduct(id), path);
}

console.log(
	`Generated ${Object.keys(TERRAIN).length + Object.keys(RESOURCES).length + Object.keys(MATERIALS).length + Object.keys(BUILDINGS).length + Object.keys(PRODUCTS).length} industry assets.`
);
