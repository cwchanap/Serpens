import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const OUT = 'static/assets/game/products';

const P = {
	outline: [50, 57, 65, 255],
	shadow: [36, 42, 48, 90],
	cream: [244, 223, 170, 255],
	white: [250, 250, 240, 255],
	metal: [127, 140, 148, 255],
	brown: [145, 91, 52, 255],
	orange: [218, 129, 55, 255],
	red: [192, 74, 68, 255],
	yellow: [232, 190, 73, 255],
	blue: [65, 120, 189, 255],
	green: [91, 157, 95, 255],
	leaf: [65, 139, 84, 255],
	concrete: [181, 184, 176, 255],
	plastic: [104, 196, 202, 255]
};

function makePng(size, fill = [0, 0, 0, 0]) {
	const png = new PNG({ width: size, height: size });
	for (let i = 0; i < png.data.length; i += 4) {
		png.data[i] = fill[0];
		png.data[i + 1] = fill[1];
		png.data[i + 2] = fill[2];
		png.data[i + 3] = fill[3];
	}
	return png;
}

function setPixel(png, x, y, c) {
	if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
	const i = (Math.floor(y) * png.width + Math.floor(x)) * 4;
	png.data[i] = c[0];
	png.data[i + 1] = c[1];
	png.data[i + 2] = c[2];
	png.data[i + 3] = c[3];
}

function rect(png, x, y, w, h, c) {
	for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPixel(png, xx, yy, c);
}

function circle(png, cx, cy, r, c) {
	const r2 = r * r;
	for (let y = cy - r; y <= cy + r; y++)
		for (let x = cx - r; x <= cx + r; x++)
			if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) setPixel(png, x, y, c);
}

function thickLine(png, x0, y0, x1, y1, c, w = 2) {
	for (let o = -Math.floor(w / 2); o <= Math.floor(w / 2); o++) {
		line(png, x0 + o, y0, x1 + o, y1, c);
		line(png, x0, y0 + o, x1, y1 + o, c);
	}
}

function line(png, x0, y0, x1, y1, c) {
	const dx = Math.abs(x1 - x0),
		sx = x0 < x1 ? 1 : -1;
	const dy = -Math.abs(y1 - y0),
		sy = y0 < y1 ? 1 : -1;
	let err = dx + dy,
		x = x0,
		y = y0;
	while (true) {
		setPixel(png, x, y, c);
		if (x === x1 && y === y1) break;
		const e2 = err * 2;
		if (e2 >= dy) {
			err += dy;
			x += sx;
		}
		if (e2 <= dx) {
			err += dx;
			y += sy;
		}
	}
}

function ellipseShadow(png) {
	for (let y = 66; y <= 78; y++)
		for (let x = 22; x <= 74; x++) {
			const dx = (x - 48) / 27,
				dy = (y - 72) / 7;
			if (dx * dx + dy * dy <= 1) setPixel(png, x, y, P.shadow);
		}
}

function save(png, name) {
	mkdirSync(OUT, { recursive: true });
	writeFileSync(join(OUT, name + '.png'), PNG.sync.write(png));
}

// bakery — warm brown/orange tones: loaf of bread on a board
const bakery = makePng(96);
ellipseShadow(bakery);
// cutting board
rect(bakery, 26, 52, 44, 12, P.brown);
rect(bakery, 30, 54, 36, 8, [179, 123, 73, 255]);
// bread loaf — rounded rectangle shape
rect(bakery, 32, 32, 32, 22, P.orange);
circle(bakery, 48, 34, 16, [232, 168, 75, 255]);
circle(bakery, 48, 36, 13, [244, 200, 130, 255]);
// score lines on top
thickLine(bakery, 38, 28, 58, 28, [200, 140, 60, 255], 1);
thickLine(bakery, 40, 33, 56, 33, [200, 140, 60, 255], 1);
// steam wisps
thickLine(bakery, 40, 20, 42, 12, [220, 220, 220, 140], 1);
thickLine(bakery, 50, 18, 48, 10, [220, 220, 220, 140], 1);
save(bakery, 'bakery');

// household — blue/grey tones: bucket with bubbles
const household = makePng(96);
ellipseShadow(household);
// bucket body
rect(household, 28, 36, 40, 32, P.blue);
rect(household, 28, 36, 40, 5, [90, 150, 210, 255]);
// bucket handle
thickLine(household, 32, 36, 32, 26, P.metal, 2);
thickLine(household, 64, 36, 64, 26, P.metal, 2);
thickLine(household, 32, 26, 64, 26, P.metal, 2);
// bucket base accent
rect(household, 30, 62, 36, 4, [50, 100, 160, 255]);
// bubbles
circle(household, 38, 44, 5, [180, 210, 240, 200]);
circle(household, 52, 42, 7, [170, 200, 235, 200]);
circle(household, 45, 52, 4, [190, 215, 245, 200]);
// bubble highlights
circle(household, 36, 42, 2, P.white);
circle(household, 50, 39, 2, P.white);
save(household, 'household');

// peripherals — grey/dark tones: keyboard/mouse
const peripherals = makePng(96);
ellipseShadow(peripherals);
// keyboard base
rect(peripherals, 18, 42, 52, 24, [80, 85, 92, 255]);
rect(peripherals, 20, 44, 48, 20, [100, 105, 112, 255]);
// key rows
for (let row = 0; row < 3; row++) {
	for (let col = 0; col < 8; col++) {
		rect(peripherals, 22 + col * 5, 46 + row * 6, 4, 4, [140, 145, 150, 255]);
	}
}
// mouse
rect(peripherals, 58, 48, 16, 22, [90, 95, 100, 255]);
circle(peripherals, 66, 52, 8, [110, 115, 120, 255]);
// mouse buttons
thickLine(peripherals, 66, 45, 66, 54, [80, 85, 90, 255], 1);
// scroll wheel
rect(peripherals, 64, 48, 4, 5, [130, 135, 140, 255]);
// cable
thickLine(peripherals, 66, 42, 66, 36, [70, 75, 80, 255], 2);
save(peripherals, 'peripherals');

console.log('Generated 3 product PNGs: bakery, household, peripherals');
