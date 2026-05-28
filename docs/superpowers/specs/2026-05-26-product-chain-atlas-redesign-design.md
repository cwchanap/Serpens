# Product Chain Atlas Redesign Design

## Status

Approved for written-spec review on 2026-05-26.

## Goal

Redesign the product chain visualization across both surfaces (Control Tower's `Product Chains` panel and the store-inspector chain tab) so it:

1. Expresses the parchment-ledger / atlas personality of the rest of the app instead of generic boxes-and-arrows.
2. Surfaces the bottleneck and the action-to-take faster (diagnose), while preserving readability of structure (explore) and daily numbers (monitor).
3. Uses the real product / building PNGs already registered in `src/lib/assets/gameArt.ts` instead of plain text labels.

This redesign replaces the rendering layer only. The graph builders in `src/lib/game/productChainGraph.ts` are unchanged; the data contract (`ProductChainGraph`, `ProductChainNode`, `ProductChainEdge`, summaries, warnings) is unchanged.

## Accepted Decisions

- Visual direction is **The Atlas Sheet**: an illustrated atlas page with engraved chrome, three node typologies (circle / octagon / slab), curved SVG routes, animated dashed flow, status-pin stamps, compass rose, and legend cartouche.
- Both the full Control Tower panel and the compact store-inspector chain panel are in scope and share the same component vocabulary, distinguished by a `compact` prop.
- Every node renders a real PNG icon sourced from `INDUSTRY_MATERIAL_ART` / `INDUSTRY_BUILDING_ART` (and a new recipe→building lookup), with a stylized SVG fallback if no PNG is registered.
- Status is encoded redundantly (color + border style + pin label + route stroke pattern) so the UI is color-blind safe.
- The `@xyflow/svelte` dependency is removed from this surface. Routes and node positions are rendered with our own SVG + absolutely-positioned DOM, driven by the existing `layer` / `row` coordinates on `ProductChainNode`.
- No data-model changes. No changes to which graphs exist, which categories are shown, or how rates are computed.
- Motion (animated dashed routes) honors `prefers-reduced-motion: reduce`.

## Scope

Included:

- Replace `ProductChainGraph.svelte` with a new `ProductChainAtlas.svelte` plus child components.
- Refit `ProductChainsPanel.svelte` chrome (sheet head, stamp index, broadside detail card, legend, warnings strip).
- Refit `StoreProductChainPanel.svelte` to use `<ProductChainAtlas compact />` and the same node vocabulary.
- Replace `ProductChainNodeDetail.svelte` with `NodeBroadside.svelte` (same data, redesigned chrome).
- Add a `chainNodeArt` helper that resolves `ProductChainNode` → icon path + alt.
- Add a recipe-id → building-art mapping (recipes reference a building type today; surface it in `gameArt.ts`).
- Update unit specs to follow the renderer rewrite.
- Add one e2e assertion that clicking a stamp in the index updates the atlas sheet title.

Excluded:

- No changes to `productChainGraph.ts` data shape or computation.
- No new graph algorithms; layout still uses `layer * xStep` + `row * yStep`.
- No keyboard-arrow node navigation (Tab order is sufficient for v1).
- No drill-down navigation from nodes to maps or build actions (out of scope, matches prior decision).
- No Sankey-style edge weighting; route stroke width is constant.

## Visual System

Existing tokens from `src/lib/styles/tokens.css` are used as-is. No new tokens introduced.

**Three node typologies** encode kind:

| `node.kind` | Frame shape                  | Inner decoration     | Icon source                                                                  |
| ----------- | ---------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `material`  | circle, 90×90                | dashed inner ring    | `INDUSTRY_MATERIAL_ART[node.materialId]`                                     |
| `recipe`    | octagon, 100×100 (clip-path) | dashed inner octagon | building art for the recipe's primary building type (new map; see Data Flow) |
| `warehouse` | slab, 98×82 with 4 px radius | thin inner rule      | `/assets/game/industry/buildings/warehouse.png`                              |

Each node carries:

- A **status pin** (top-right, rotated 2–4°): moss `Healthy`, brass `Watch`, wax-red `Shortage`, etc. Background color and label both derive from `node.health` / `node.healthLabel`.
- A **cartouche label** under the frame: display-serif name on a top-rule + double-rule bottom (`--brass-700`).
- A **stat line** under the cartouche: mono throughput / capacity, e.g. `38 /d · cap 40`.

**Routes** are SVG `<path>` curves between source / target node centers, with bezier control points offset horizontally from each end (`±xStep / 2`) so routes flow left-to-right. Stroke styles:

| `edge.health`                    | Stroke                                 | Pattern                | Animation  |
| -------------------------------- | -------------------------------------- | ---------------------- | ---------- |
| `healthy`                        | `var(--moss)`                          | solid + dash-animation | 1.4 s loop |
| `watch`                          | `var(--brass-700)`                     | solid + dash-animation | 1.4 s loop |
| `shortage` / `no-local-capacity` | `var(--wax-red)`                       | dashed (8 4)           | 0.8 s loop |
| imports (special)                | `var(--royal-ink)`                     | dotted (2 4)           | none       |
| `no-report`                      | `color-mix(brass-700, 50% paper-edge)` | solid, no animation    | none       |

Animation is suppressed under `prefers-reduced-motion: reduce`.

**Atlas chrome (full panel only):**

- Sheet header: eyebrow `· Folio II · Production Chain ·`, display-serif title, right-aligned meta block with `Atlas` mode chip and day / status summary.
- Stamp index above the map: one stamp per category from `buildStoreCategoryChainSummaries(game)`, with status seal, name, mini icon row, and daily summary line. Active stamp shows brass inset glow.
- Compass rose top-right of map (decorative, `aria-hidden`).
- Lat/long hatching across the map (decorative, `aria-hidden`).
- Legend cartouche bottom-left: route key (healthy / shortage / imports).
- Warnings strip below the map: existing `graph.warnings` rendered with a wax-red left rule.
- Broadside detail card pinned top-right of the map area, showing the inspected node (replaces the side-column `ProductChainNodeDetail`).

**Compact variant (`compact={true}`):**

- No sheet header chrome, no stamp index, no compass, no legend cartouche, no broadside (the existing `NodeBroadside` is rendered below the map by the parent, matching the current `StoreProductChainPanel` layout).
- Node frames are reduced (~60 px), icons ~40 px, cartouche/stat type sizes scaled down.
- Map height target: 17 rem (matches today).

## Architecture

```text
src/lib/components/game/
├─ ProductChainsPanel.svelte          (refit)
├─ StoreProductChainPanel.svelte      (refit)
├─ atlas/
│  ├─ ProductChainAtlas.svelte        (new — replaces ProductChainGraph.svelte rendering)
│  ├─ ChainNode.svelte                (new — material | recipe | warehouse variants)
│  ├─ ChainRoute.svelte               (new — single SVG path + marker)
│  ├─ ChainMap.svelte                 (new — wraps the absolute-positioned canvas, routes layer, compass, lat-grid, legend)
│  ├─ CategoryStampIndex.svelte       (new — replaces the .summary-grid)
│  ├─ NodeBroadside.svelte            (new — replaces ProductChainNodeDetail.svelte)
│  ├─ CompassRose.svelte              (new — small decorative SVG, aria-hidden)
│  └─ LegendCartouche.svelte          (new — route key)
└─ (ProductChainGraph.svelte and ProductChainNodeDetail.svelte deleted)

src/lib/assets/
└─ gameArt.ts                         (extended — add recipe→building art map and chainNodeArt helper)
```

`ProductChainSelectionBridge.svelte` (today's `xyflow` selection adapter) is deleted with the dependency.

### `ProductChainAtlas.svelte`

```ts
interface Props {
	graph: ProductChainGraph;
	selectedNodeId: string | null;
	compact?: boolean;
	onSelectNode: (nodeId: string | null) => void;
}
```

Same props shape as today's `ProductChainGraph`. Internals:

- Computes layout bounds from `max(layer) * xStep` and `max(row) * yStep` (xStep / yStep differ by `compact`).
- Renders one `<ChainRoute>` per `graph.edges`, one `<ChainNode>` per `graph.nodes`.
- Hosts `<ChainMap>` chrome (compass, lat-grid, legend) when `compact === false`.
- Resets selection when `graph.id` changes (port from existing `$effect` in `ProductChainGraph.svelte`).
- Emits `onSelectNode(node.id | null)` when a node is clicked or focused-then-Enter; clicking the empty canvas clears.

### `ChainNode.svelte`

```ts
interface Props {
	node: ProductChainNode;
	selected: boolean;
	compact: boolean;
	position: { x: number; y: number }; // pre-computed by parent
	onSelect: (nodeId: string) => void;
}
```

Renders the appropriate frame (circle / octagon / slab), the icon resolved via `chainNodeArt(node)`, the status pin, cartouche, and stat line. The element is a `<button type="button">` with `aria-pressed={selected}` and `aria-label="${node.label}, ${node.healthLabel}"`. Absolute-positioned by `position`.

### `ChainRoute.svelte`

```ts
interface Props {
	edge: ProductChainEdge;
	source: { x: number; y: number }; // pixel-space center of the source node
	target: { x: number; y: number };
}
```

Renders one `<path>` with computed bezier control points and an SVG marker arrowhead. Edge label is rendered as `<text>` with a `<rect>` background, midway along the path (approximate midpoint for a simple bezier is sufficient — we don't need geometric exactness).

### `CategoryStampIndex.svelte`

Replaces today's `.summary-grid` block. Props:

```ts
interface Props {
	summaries: ProductChainCategorySummary[];
	activeCategoryId: string | null;
	mode: 'store-categories' | 'warehouse-flow';
	onSelectCategory: (categoryId: string) => void;
}
```

Renders one stamp per summary. The stamp's status seal background and label come from `summary.health` / `summary.healthLabel`. Icon row shows a single finished-material icon sourced from `INDUSTRY_MATERIAL_ART[summary.categoryId]`. Showing the upstream chain as a row of icons inside the stamp is out of scope for v1 (would require running `buildProductChainGraph` per summary on every render).

### `NodeBroadside.svelte`

Same data inputs as `ProductChainNodeDetail.svelte`, redesigned chrome (engraved double-border, status sub-eyebrow, verdict block citing the bottleneck text). No new metrics. A non-functional `Build another →` action button is **not** included in v1 (the broadside is read-only; matches prior decision that node selection doesn't navigate to build actions).

## Data Flow

No changes to `productChainGraph.ts`.

**New helper in `gameArt.ts`:**

```ts
interface ChainNodeArt {
  src: string | null;
  alt: string;
  fallbackGlyph: 'material' | 'recipe' | 'warehouse';
}

export function chainNodeArt(node: ProductChainNode): ChainNodeArt;
```

Resolution rules:

- `kind === 'material'` and `node.materialId` is set → `INDUSTRY_MATERIAL_ART[node.materialId]`.
- `kind === 'recipe'` and `node.recipeId` is set → look up the recipe's primary building type, then `INDUSTRY_BUILDING_ART[buildingTypeId]`.
- `kind === 'warehouse'` → `INDUSTRY_BUILDING_ART['warehouse']` (a constant).
- Anything missing → fallback glyph (no `src`, the component renders an inline SVG keyed by `fallbackGlyph`).

**Recipe → building art map:** building types already reference recipe IDs in `industry.ts` (`INDUSTRIAL_BUILDING_TYPES`). Surface a derived map in `gameArt.ts`:

```ts
export const RECIPE_BUILDING_ART: Readonly<Record<ProductionRecipeId, string>>;
```

This map is computed at module load by iterating `INDUSTRIAL_BUILDING_TYPES` and reading each building's associated `recipeId` and art from `INDUSTRIAL_BUILDING_ART`. If a building type has no registered art entry, its recipe is omitted (the resolver falls back to glyph).

The existing `gameArt.spec.ts` invariant ("every PNG under `static/assets/game/` is wired up") is extended: every `ProductionRecipeId` either has a `RECIPE_BUILDING_ART` entry or the corresponding recipe is documented as glyph-only.

## Layout & Positioning

The Atlas accepts the graph's existing `node.layer` / `node.row` coordinate space. Pixel positions are computed inside `ProductChainAtlas`:

```ts
const xStep = compact ? 155 : 210;
const yStep = compact ? 92 : 124;
const x = node.layer * xStep + xPad;
const y = node.row * yStep + yPad;
```

Defaults match the current `ProductChainGraph.svelte` spacing (the compact path uses slightly more vertical room because nodes are taller). Map container width auto-fills; height is clamped to `max(420 px, computed height)` for the full panel and `max(17 rem, computed height)` for compact.

Routes connect source-node-center → target-node-center. The control points offset is `xStep / 2` horizontally; this gives clean left-to-right s-curves for the existing layered layouts.

## Accessibility

- Nodes are `<button>` elements with `aria-pressed`, `aria-label="${label}, ${healthLabel}"`, and visible focus rings (`outline: 3px solid var(--brass-300); outline-offset: 4px;`).
- Decorative SVG (compass, lat-grid, legend frame, status pin background shape) is `aria-hidden="true"`. The status text itself is announced via the node's `aria-label`.
- Each route has an `<title>` child describing `"${source.label} to ${target.label}, ${edge.label}"` so screen readers can read it; this preserves the today's `ariaLabel` semantics from `ProductChainGraph.svelte`.
- Color is never the sole signal: frame border style, pin label text, and route dash pattern all encode health.
- All animations are wrapped in `@media (prefers-reduced-motion: reduce) { ... }` to disable.

## Testing

**Unit (Vitest, `client` project):**

- `ProductChainAtlas.svelte.spec.ts` (replaces `ProductChainGraph.svelte.spec.ts`):
  - Renders one `<button>` per `graph.nodes` with correct icon `src`, cartouche label, status pin text.
  - Renders one `<path>` per `graph.edges` with stroke color matching `edge.health`.
  - Clicking a node calls `onSelectNode(nodeId)`; clicking again clears.
  - Selecting an unknown node id (e.g. left over after graph swap) clears via the `graph.id` effect.
  - Empty graph (`graph.emptyReason` set) renders the empty message instead of the canvas.
  - Honors `compact` prop (smaller frames, no compass / legend).
- `ChainNode.svelte.spec.ts`: variant rendering per `kind`, fallback glyph when art is missing.
- `NodeBroadside.svelte.spec.ts`: metric formatting (Intl.NumberFormat), verdict block presence when bottleneck is set.
- `CategoryStampIndex.svelte.spec.ts`: stamps rendered per summary, active state mirrors `activeCategoryId`, click calls `onSelectCategory`.
- `gameArt.spec.ts` (extended): `chainNodeArt` resolves correctly for sample nodes; every `RECIPE_BUILDING_ART` value points to a registered PNG.

**Unit (Vitest, `server` project):**

- No changes — `productChainGraph.ts` specs stay green.

**E2E (Playwright):**

- `retail-sim.e2e.ts`: extend the existing flow to open the Product Chains panel, click a category stamp, assert the atlas sheet header text updates to the selected category name.

**Manual:**

- Start `bun run dev`, place stores covering Snacks / Drinks / Essentials, place enough buildings to trigger a shortage on one, and verify: stamp index shows the shortage seal, the atlas highlights the broken route in dashed wax-red, and the broadside reads correctly when the bottleneck node is selected.

## Dependencies

- Removed: `@xyflow/svelte` (from this surface — verify with `bun run check` that nothing else depends on it before deleting from `package.json`).
- Added: none.

## Migration / Rollout

Single PR. No persistence change. No save-format change. The `data-*` attributes used by e2e on the map renderer are unrelated and unaffected.

## Open Questions

None at this point. The data shape is unchanged, the visual system is locked, and the icon-resolution rules are deterministic.
