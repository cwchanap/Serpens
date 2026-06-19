# City Layout Land Cost Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the retail city larger, keep existing shop placement freedom, charge higher setup costs on residential/commercial land, and render connected roads and rivers smoothly.

**Architecture:** The pure game layer continues to own city generation and placement economics. Map render snapshots derive connection variants from neighboring feature tiles, and Phaser only renders the snapshot with image assets or fallback drawing.

**Tech Stack:** TypeScript, Vitest, SvelteKit, Phaser, Playwright, bun.

---

## Task 1: Land Cost Premium

**Files:**

- Modify: `src/lib/game/placement.spec.ts`
- Modify: `src/lib/game/state.ts`

**Step 1: Write the failing test**

Add a test proving residential and commercial tiles remain buildable but cost more than a neutral non-road/non-river comparison tile.

```ts
test('keeps residential and commercial tiles buildable with setup cost premiums', () => {
	expect.assertions(5);
	const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 303 });
	const residentialTile = city.tiles.find((tile) => isTileBuildable(tile) && tile.terrain === 'residential')!;
	const commercialTile = city.tiles.find((tile) => isTileBuildable(tile) && tile.terrain === 'commercial')!;
	const neutralTile = city.tiles.find((tile) => isTileBuildable(tile) && tile.terrain === 'green')!;

	expect(isTileBuildable(residentialTile)).toBe(true);
	expect(isTileBuildable(commercialTile)).toBe(true);
	expect(forecastOpening(residentialTile, 'grocery').setupCost).toBeGreaterThan(forecastOpening(neutralTile, 'grocery').setupCost);
	expect(forecastOpening(commercialTile, 'boutique').setupCost).toBeGreaterThan(forecastOpening(neutralTile, 'boutique').setupCost);
	expect(() => createFoundingGameAtTile({ archetypeId: 'grocery', city, tileId: residentialTile.id, seed: 303 })).not.toThrow();
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/placement.spec.ts --run`

Expected: FAIL because residential/commercial setup costs do not yet include the new premium.

**Step 3: Implement minimal code**

Add a small terrain premium table in `src/lib/game/state.ts` and include it in `getExpansionSetupCost`.

```ts
const TERRAIN_SETUP_COST_PREMIUM: Partial<Record<CityTile['terrain'], number>> = {
	commercial: 3_500,
	residential: 2_000
};

return Math.round(
	9_000 +
		tile.rent * 2.5 +
		archetype.baseRent * 18 +
		demandScore * 24 +
		(TERRAIN_SETUP_COST_PREMIUM[tile.terrain] ?? 0)
);
```

**Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/placement.spec.ts --run`

Expected: PASS.

## Task 2: Larger Connected City

**Files:**

- Modify: `src/lib/game/city.spec.ts`
- Modify: `src/lib/game/city.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/world.ts`

**Step 1: Write failing tests**

Add tests that the default city size is larger than 20 by 20, buildable slot count increases, and generated road/river feature tiles are contiguous by four-way neighbors.

**Step 2: Run tests to verify failure**

Run: `bun run test:unit -- src/lib/game/city.spec.ts src/lib/game/state.spec.ts --run`

Expected: FAIL because defaults are still 20 by 20 and the river path includes diagonal steps.

**Step 3: Implement minimal code**

- Change retail city dimensions in `createNewGame` and `ensureWorldCityMap` to `56` by `48`.
- Replace road generation with connected horizontal and vertical divider rows and columns with intersections.
- Replace river generation with an orthogonal path that never steps diagonally.
- Keep border locking and deterministic economic traits unchanged.

**Step 4: Run tests to verify pass**

Run: `bun run test:unit -- src/lib/game/city.spec.ts src/lib/game/state.spec.ts --run`

Expected: PASS.

## Task 3: Road And River Render Variants

**Files:**

- Modify: `src/lib/game/mapRender.spec.ts`
- Modify: `src/lib/game/mapRender.ts`
- Modify: `src/lib/phaser/cityMapScene.spec.ts`
- Modify: `src/lib/phaser/cityMapScene.ts`

**Step 1: Write failing tests**

Add snapshot tests asserting road and river tiles expose neighbor connection strings such as `vertical`, `horizontal`, `corner-ne`, `corner-sw`, `tee-nes`, and `intersection`.

**Step 2: Run tests to verify failure**

Run: `bun run test:unit -- src/lib/game/mapRender.spec.ts src/lib/phaser/cityMapScene.spec.ts --run`

Expected: FAIL because river variants do not exist and road variants are too coarse for turns/tees.

**Step 3: Implement minimal code**

- Replace `CityMapRoadVariant` with a shared feature-connection variant type.
- Add `riverVariant` to `CityMapTileRender`.
- Derive variants from north/east/south/west neighbor booleans.
- Update Phaser texture selection and fallback drawing to rotate/draw feature paths by variant.

**Step 4: Run tests to verify pass**

Run: `bun run test:unit -- src/lib/game/mapRender.spec.ts src/lib/phaser/cityMapScene.spec.ts --run`

Expected: PASS.

## Task 4: E2e Count Updates And Full Verification

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`

**Step 1: Update e2e expectations**

Update `expectTerrainAssets` for the new base tile count (`56 * 48` = 2688) and feature count from the final generated road/river paths.

**Step 2: Run focused unit tests**

Run: `bun run test:unit -- src/lib/game/city.spec.ts src/lib/game/placement.spec.ts src/lib/game/mapRender.spec.ts src/lib/phaser/cityMapScene.spec.ts --run`

Expected: PASS.

**Step 3: Run project checks**

Run: `bun run check`

Expected: PASS.

**Step 4: Run focused e2e**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "city map renders terrain assets"`

Expected: PASS.

**Step 5: Final status**

Review `git diff`, report changed files, commands run, and any remaining risk.
