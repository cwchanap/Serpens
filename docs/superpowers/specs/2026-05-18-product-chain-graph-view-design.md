# Product Chain Graph View Design

## Status

Approved for written-spec review on 2026-05-18.

## Goal

Add read-only graph views that help the player understand product-chain flow, production rate, consumption rate, warehouse stock, and bottlenecks.

The graph should visualize the existing industry and stock simulation. It must not change production rules, store stock rules, weekly refill behavior, import fallback, warehouse overflow behavior, or save format in this first slice.

## Accepted Decisions

- Add product-chain visualization to both selected-store detail and Control Tower.
- Add a new `Product Chain` tab under store detail.
- In the store tab, show one selected product category at a time with a category switcher.
- Control Tower gets a full `Product Chains` view.
- Control Tower supports two modes:
  - `Store category chains` with compact owned-category cards and an expanded selected chain graph.
  - `Warehouse flow` with a warehouse-centered material-flow graph.
- Default category visibility should be based on categories relevant to owned stores.
- Graphs are hybrid: nodes represent material or recipe steps, while showing aggregate placed-building counts.
- Bottleneck diagnosis is the primary reading order.
- Use both node health and edge labels to explain bottlenecks.
- Rates use latest-day data only, not rolling averages.
- Show actual latest-day movement as the headline.
- Show theoretical daily capacity from placed buildings and recipes as supporting context.
- Node selection opens a detail panel.
- Node selection does not navigate to maps, stores, buildings, or build actions in this first slice.
- Use a graph library. The chosen first implementation direction is `@xyflow/svelte`.
- Use simple deterministic layouts first. Keep graph data isolated so automatic layout can be introduced in a later feature.

## Scope

Included:

- Add a pure graph data builder for product-chain and warehouse-flow diagnostics.
- Add a store-detail `Product Chain` tab for owned stores.
- Add a Control Tower `Product Chains` panel.
- Add `@xyflow/svelte` as the graph renderer dependency.
- Render store-category chain graphs with node health, edge labels, latest-day movement, theoretical capacity, stock, import exposure, and bottleneck text.
- Render Control Tower compact category cards for all owned-store categories supported by the current production definitions.
- Render a Control Tower warehouse-flow graph centered on warehouse stock and latest-day material movements.
- Add node selection detail panels for both store and Control Tower graph surfaces.
- Add empty states for missing reports, missing buildings, unsupported categories, and missing warehouse capacity.
- Add focused unit, component, and e2e coverage.

Deferred:

- Changing production simulation, stock simulation, imports, or warehouse capacity rules.
- Player actions from graph nodes, such as building factories or jumping to map tiles.
- Per-building graph nodes for every individual industrial building.
- Rolling 7-day or 30-day rates.
- Route/logistics modeling, delivery times, or transport bottlenecks.
- Auto-layout dependencies such as ELK or Dagre. The graph data shape should allow this later.
- New product-chain content beyond current material and recipe definitions.
- Save-schema changes.
- Persisted graph UI preferences.

## Player Experience

### Store Detail

When the player selects an owned store, the tile inspector gains a `Product Chain` tab alongside the existing detail, stock, and staff surfaces.

The tab shows one product category at a time. A compact category selector lets the player switch between categories sold by that store. Categories without a supported finished-material chain are omitted from the selector. If no store categories are supported, the tab shows the unsupported-category empty state.

The graph answers:

- what upstream materials are needed for this store product;
- what buildings can produce each step;
- how many matching buildings the company has placed;
- actual latest-day production, consumption, warehouse pulls, shop imports, and production imports;
- current warehouse stock for each material;
- where local capacity is missing or insufficient;
- where the chain relied on imports.

Selecting a node opens a detail panel in the tab. The detail panel shows inputs, outputs, building count, theoretical daily capacity, actual latest-day movement, current warehouse stock, import exposure, and a short bottleneck explanation.

### Control Tower

Control Tower gains a company-wide `Product Chains` view.

The default `Store category chains` mode shows compact cards for owned-store categories that map to supported finished-material chains. Each card summarizes health, current stock, latest output or consumption, import exposure, and the current bottleneck. Selecting a card opens the expanded chain graph.

The `Warehouse flow` mode shows a larger graph centered on the warehouse. It visualizes all material inflow and outflow represented in the latest `DailyProductionReport` plus current warehouse stock pressure. This mode is for answering whether the warehouse is filling, draining, overflowing, or depending on imports.

The Control Tower node detail panel appears beside the graph on desktop-sized layouts and below the graph on narrow layouts.

## Graph Model

Add a UI-neutral graph builder in `src/lib/game/productChainGraph.ts`.

The builder should consume existing simulation data:

- `MATERIALS`;
- `PRODUCTION_RECIPES`;
- `INDUSTRIAL_BUILDING_TYPES`;
- `game.industrialBuildings`;
- `game.warehouse`;
- the latest `DailyProductionReport`, if one exists;
- relevant latest `DailyProductReport` rows, if they exist.

The builder returns plain data, not Svelte or `@xyflow/svelte` objects:

- supported chain summaries;
- graph nodes;
- graph edges;
- node health;
- edge health;
- actual latest-day metrics;
- theoretical capacity metrics;
- warehouse stock metrics;
- import-exposure metrics;
- node detail payloads;
- non-blocking warnings.

Svelte components adapt this graph data into `@xyflow/svelte` nodes and edges.

No graph metric should be computed directly inside `TileInspector`, Control Tower route markup, or graph-renderer components. Those surfaces should choose filters, call pure graph helpers, and render the result.

## Chain Discovery

Define a small explicit catalog mapping finished product categories to upstream recipe trees.

The first supported categories should be based on currently implemented materials and recipes. The expected initial supported finished goods are the current finished materials that have production recipes and store-category wiring:

- `snacks`;
- `drinks`;
- `essentials`;
- `gifts`.

The graph should not show future planned categories as active chains unless the required material and recipe definitions exist in code.

For a selected store, visible chains come from that store's product categories filtered through this supported-chain catalog. For Control Tower, visible category cards come from the union of all owned-store categories filtered through the same catalog.

## Node And Edge Semantics

Nodes represent material or recipe steps, not individual buildings.

Each node should include:

- display name;
- material id or recipe id;
- material kind when applicable;
- recipe stage when applicable;
- aggregate placed-building count;
- theoretical daily output capacity;
- theoretical daily input requirement;
- actual latest-day produced quantity;
- actual latest-day consumed quantity;
- actual latest-day imported input quantity;
- actual latest-day warehouse-pulled quantity;
- current warehouse stock;
- health status;
- bottleneck explanation.

Edges represent material dependencies and movement between chain steps.

Each edge should include:

- source node id;
- target node id;
- material id;
- required quantity per production cycle or per day where relevant;
- actual latest-day flow;
- shortage or import-dependence label when relevant;
- health status.

## Bottleneck Rules

Bottleneck status should be deterministic and testable.

Use a small status set:

- `healthy`: local capacity and stock are enough for the latest chain need.
- `watch`: stock or flow is positive but below the next downstream requirement.
- `shortage`: latest-day movement required imports or downstream need exceeded local stock/flow.
- `no-local-capacity`: no placed building can produce the node's output.
- `no-report`: no daily report exists yet; show definitions and current stock only.

Node color provides the quick scan. Edge labels explain the limiting material or import dependency.

When there is no latest report, the graph should still render chain structure, warehouse stock, and theoretical capacity. Actual latest-day flow should read as unavailable rather than zero where that distinction matters.

## Layout And Rendering

Use `@xyflow/svelte` for rendering graph nodes and edges.

For the first implementation:

- store chain graphs use deterministic layered positions based on recipe stage and dependency depth;
- Control Tower expanded chain graphs use the same layout with more room for details;
- warehouse-flow mode uses a simple warehouse-centered layout with inflows and outflows grouped by material kind or source;
- use built-in controls only where they help at the available size;
- avoid a minimap in the narrow store-detail tab unless testing shows the graph is difficult to navigate without it.

The graph renderer should receive a stable graph view model. It should not know about `GameState`, recipes, stores, or reports.

## UI Structure

### Store Product Chain Tab

`TileInspector.svelte` should gain a new tab and delegate graph content to a focused component, for example `StoreProductChainPanel.svelte`.

The store panel should receive:

- selected store;
- latest store report, if available;
- game or the minimal graph input data needed by the builder;
- selected category state owned by the panel or inspector;
- optional callback for clearing invalid node selection.

The panel renders:

- category selector;
- graph canvas;
- selected-node detail;
- empty state or warning text.

### Control Tower Product Chains

Control Tower should delegate graph content to a focused component, for example `ProductChainsPanel.svelte`.

The panel renders:

- mode toggle;
- category cards in `Store category chains` mode;
- expanded selected chain graph;
- warehouse-flow graph in `Warehouse flow` mode;
- selected-node detail;
- empty states and warnings.

The panel should use existing Mercantile Ledger styling tokens and component framing.

## Visual Design

The feature should fit the current Mercantile Ledger UI direction:

- parchment panels;
- brass rules and compact section labels;
- tabular mono numerals for rates, stock, capacity, and currency;
- moss for healthy/local flow;
- brass or amber for watch states;
- wax-red for shortages, blocked nodes, and import dependence;
- no new decorative palette.

Graph nodes should be compact and scannable. Avoid large explanatory copy inside nodes. Put detailed explanations in the selected-node detail panel.

## Error Handling And Empty States

The graph must not crash when the player's industry system is incomplete.

Empty states:

- Store has no graph-supported categories: show `No local production chain available for this store's categories yet.`
- No latest report: show current warehouse stock and theoretical capacity, with actual latest-day flow marked as `No report yet`.
- No placed industrial buildings: render the chain structure and mark production nodes as `No local capacity`.
- No warehouse capacity: render the graph and mark warehouse context as `No warehouse capacity`.
- Missing material or recipe definition: omit that branch and show a non-blocking graph warning.
- Stale selected category: fall back to the first supported category.
- Stale selected node: clear node detail.

Unsupported product categories should not block the rest of the graph view.

## Accessibility

Graph controls must remain keyboard and screen-reader usable where practical.

Requirements:

- Each graph surface has an accessible name.
- Category cards and category selectors are keyboard reachable.
- Node selection can be triggered through keyboard focus or an equivalent list/detail fallback if the library's node focus behavior is insufficient.
- Node health is not color-only; include text status in the node or detail panel.
- Empty states and warnings use plain text, not only icons.

## Testing

Unit tests:

- Builds a chain graph for a supported category such as `snacks`.
- Filters selected-store categories to supported chains.
- Computes latest-day actual movement from `DailyProductionReport`.
- Computes theoretical capacity from placed building counts and recipe outputs.
- Marks missing inputs, import dependence, no local capacity, no report, and healthy nodes correctly.
- Builds warehouse-flow graph from warehouse stock plus latest produced, consumed, imported, warehouse-pulled, and shop-import movement.
- Handles no reports, no buildings, no warehouse capacity, and unsupported categories without throwing.

Component tests:

- `TileInspector` shows the `Product Chain` tab for owned stores.
- Store category selector switches the displayed chain.
- Node selection opens a detail panel.
- Control Tower graph panel renders.
- Control Tower toggles between `Store category chains` and `Warehouse flow`.
- Empty states render for unsupported categories and no latest report.

E2E tests:

- Start or load a game, select an owned store, switch to `Product Chain`, and verify a graph surface appears.
- Open Control Tower, verify the `Product Chains` panel and mode toggle.
- Advance a day, verify latest-day metrics appear.
- Preserve existing map/canvas readiness assertions.

Verification commands:

- `bun run check`;
- focused unit and component specs for the graph builder and new panels;
- relevant `src/routes/retail-sim.e2e.ts` coverage.

## Implementation Notes

Install `@xyflow/svelte` during implementation and import its stylesheet from the graph-rendering layer or a single graph component entry point.

Keep the first implementation as a diagnostic UI feature. Do not turn the graph into a build menu, navigation system, or production-control surface.

Because this project forces Svelte 5 runes mode, new Svelte component state should use `$state`, `$derived`, and `$effect` rather than legacy reactivity. Svelte changes require the official Svelte MCP docs and autofixer workflow before implementation is delivered.
