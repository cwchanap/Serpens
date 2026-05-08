# Store Stock System Design

## Status

Approved for written-spec review on 2026-05-07.

## Goal

Add a category-level stock system for individual stores. Each owned store should have a stock table for the products it sells, and the player should be able to tune selling price, reorder threshold, and target stock per product category.

The system should make product availability and pricing matter without introducing SKU-level micromanagement. Demand is city-wide, shared by stores in the same city, and only turns into sales when stores have stock and can serve that demand.

## Player Experience

The player selects an owned store on the city map and manages that store's stock table in the tile inspector.

Each row represents one fixed product category from that store's archetype, such as Snacks, Drinks, Apparel, or Produce. The player can see current stock, fixed import cost, recent sales/missed demand, and stock status. The player can edit:

- Selling price.
- Reorder threshold.
- Target stock.

Import cost is fixed by product type for this slice. The player cannot edit current stock directly, and cannot add or remove categories from a store yet.

Weekly imports use the player's threshold and target settings. If stock is below threshold, the game imports enough units to reach target stock. Imports can drive company cash negative.

## Scope

- Add store-owned product stock rows initialized from each store's archetype categories.
- Add fixed product category definitions with import cost, default selling price, price sensitivity, and demand weight.
- Add pure transitions for updating a store product's selling price, reorder threshold, and target stock.
- Replace the stock slice of daily sales with category-level product sales.
- Model city-wide category demand pools shared by stores in the same city.
- Make selling price affect per-category demand.
- Run weekly imports from threshold to target stock.
- Add product-level report detail for sales, missed demand, ending stock, and imports.
- Add a tile-inspector stock table for owned stores.
- Update save validation and focused tests for the new state and report shape.

## Out of Scope

- Individual SKU/item management.
- Player-edited import costs.
- Adding or removing product categories from a store.
- Warehouses, supplier lead times, supplier reliability, shipping capacity, and multi-city logistics.
- Per-tile or per-store `localDemand` for this stock slice.
- Old save migration. The game is still a prototype, so incompatible old saves may reset through the existing save-validation behavior.

## Domain Model

Extend `ProductCategory` so archetype categories carry stock-system defaults:

- `id`: stable category id.
- `name`: display name.
- `demandWeight`: relative share of city demand for the category. This replaces product-specific base demand in the stock simulation.
- `importCost`: fixed cost per imported unit.
- `defaultSellingPrice`: starting selling price and price comparison baseline.
- `priceSensitivity`: how strongly demand reacts to selling price.

The stock simulation should not use product-level `baseDemand`. Existing legacy category fields can stay temporarily if needed by surrounding code, but new sales behavior should get demand from the city-wide pool.

Add `StoreProduct`:

- `categoryId`: stable reference to the archetype category.
- `stock`: current units available.
- `reorderThreshold`: import trigger threshold.
- `targetStock`: weekly import target.
- `sellingPrice`: player-editable sale price per unit.

Add `products: StoreProduct[]` to `Store`.

Store product rows are initialized when a store is created. The row list is fixed to the store archetype's starting categories. That keeps assortment design out of this first slice while still making each store's stock state independent.

## City-Wide Demand

Demand for product categories is city-wide, not store-local.

For each simulated day, the simulation builds a category demand pool per city. Stores in the same city draw from the same pool. If one store captures demand for a category, that demand is no longer available to another store that sells the same category on the same day.

The demand pool should be deterministic and based on current city data and category definitions. The first implementation can derive category demand from the city's tile demand/foot-traffic/customer-fit values aggregated across buildable tiles, then split that demand using product category weights and policy multipliers.

This new stock system should not introduce or depend on `store.localDemand`. Existing fields can be kept temporarily for compatibility with surrounding code, but new stock/demand behavior should use city-wide category demand.

## Sales Simulation

Daily simulation should sell by product category.

For each city:

1. Build category demand pools for the day.
2. Rank or score stores deterministically for each category they sell.
3. Let stores draw units from the shared category pool according to price, stock, reputation, staffing/service capacity, marketing, and deterministic variance.
4. Subtract sold units from each store product row.
5. Aggregate product reports into the existing store-level report fields.

Selling price affects demand. A product priced above its default selling price should capture fewer units, while a lower price should capture more units, bounded by available city demand, current stock, and service capacity.

Cost of goods should be based on the fixed category `importCost` multiplied by units sold. Revenue should be `sellingPrice * unitsSold`.

`stockHealth` remains as a store-level readable health signal, but it should be derived from product stock ratios after sales and imports rather than being the only stock model.

## Weekly Imports

Imports happen every week.

For each store product row on an import day:

1. If `stock < reorderThreshold`, compute `targetStock - stock`.
2. If the computed amount is positive, import that many units.
3. Increase stock by imported units.
4. Subtract `importedUnits * importCost` from company cash.
5. Record import units and import spend in the daily report.

Cash can go negative. The import pass should not skip or partially reduce orders for affordability.

The exact import-day helper should be explicit and testable, for example `isImportDay(day)`, so weekly behavior is not hidden inside UI code.

## UI Design

The first UI target is the selected owned store's tile inspector.

Add a stock table to `TileInspector.svelte` when `store` is present. Each fixed product category row should show:

- Product/category name.
- Current stock.
- Fixed import cost.
- Editable selling price.
- Editable reorder threshold.
- Editable target stock.
- Compact stock status, such as `Out of stock`, `Needs import`, or `Healthy`.
- Recent units sold and missed demand when a latest product report exists for that store/category.

The Control Tower store overview can continue showing a summary stock metric. Detailed stock management belongs in the tile inspector for this slice.

The route component should continue to own game state and autosave. It should pass a callback such as `onUpdateStoreProduct(storeId, categoryId, patch)` to `TileInspector`, call a pure transition helper, and autosave the returned state.

Svelte implementation must follow the repo's rune-mode patterns and use the official Svelte MCP workflow during implementation.

## Validation And Error Handling

Pure transition helpers should validate and clamp player input:

- Selling price must be greater than 0.
- Reorder threshold must be at least 0.
- Target stock must be at least reorder threshold.
- Numeric inputs should be finite numbers.

If a transition references an unknown store or category, return the original game state. The UI should only render valid controls, so invalid calls can stay quiet in the first slice.

Current stock and import cost are not directly editable by the player.

## Reports

Add product-level report detail without removing current store-level summaries.

Add `DailyProductReport`:

- `categoryId`.
- `name`.
- `unitsSold`.
- `demandMissed`.
- `revenue`.
- `costOfGoods`.
- `grossMargin`.
- `endingStock`.
- `importedUnits`.
- `importCost`.
- `importSpend`.

Add `productReports: DailyProductReport[]` to `DailyStoreReport`.

Add `importSpend` to `DailyStoreReport` and `DailyReport`.

Store-level `revenue`, `costOfGoods`, `grossMargin`, `customersServed`, `demandMissed`, `importSpend`, and `stockHealth` should be aggregated from product reports so existing panels still have stable summary data.

Use one clear cash formula so imports are not double-counted:

- `costOfGoods` is a product-performance/reporting measure based on sold units.
- `importSpend` is the actual cash expense for weekly restocks.
- `operatingCosts` should remain rent, marketing, staffing/payroll, and other non-inventory operating costs.
- `cashAfter` should subtract `importSpend` once.
- `netIncome` should be aligned with the chosen game cash model and covered by tests; for the first slice, prefer cash-based net income: `revenue - operatingCosts - importSpend`.

## Persistence

Update save validation for:

- `Store.products`.
- `DailyStoreReport.productReports`.
- Any new daily import-spend fields added during implementation.

No old-save migration is required. Existing save validation can reject old state, and repository backends can reset invalid save data to an empty save store as they do for other prototype schema changes.

## Testing

Unit tests:

- Store creation initializes fixed product rows from the selected archetype.
- Expansion store creation initializes rows for the selected archetype, not the founding archetype.
- Product setting updates are immutable.
- Product setting updates clamp invalid values.
- City-wide category demand is shared by stores in the same city.
- Higher selling price reduces category units sold compared with default price under otherwise stable conditions.
- Weekly imports refill rows below threshold to target stock.
- Weekly imports can drive company cash negative.
- Product reports aggregate into store-level revenue, cost of goods, gross margin, customers served, missed demand, and stock health.
- Save validation accepts valid product rows and rejects invalid rows.

Component tests:

- `TileInspector` renders the stock table for an owned store.
- Product inputs call the update callback with store id, category id, and the edited field.
- Import cost renders as read-only.
- Current stock is not directly editable.
- Latest product report data appears when provided.

E2E tests:

- Start a game.
- Select the owned store tile.
- Edit a product selling price, reorder threshold, or target stock in the tile inspector.
- Advance to a weekly import day.
- Verify the stock table and/or report surface reflects sales/import changes.

## Implementation Notes

Likely files:

- `src/lib/game/types.ts`
- `src/lib/game/archetypes.ts`
- `src/lib/game/state.ts`
- `src/lib/game/placement.ts`
- `src/lib/game/simulateDay.ts`
- a new focused stock rules module such as `src/lib/game/stock.ts`
- `src/lib/persistence/saveCodec.ts`
- `src/lib/components/game/TileInspector.svelte`
- `src/routes/+page.svelte`
- focused specs next to changed modules
- `src/routes/retail-sim.e2e.ts`

Keep the stock logic pure and deterministic. UI components should not calculate demand, mutate nested store state directly, or own weekly import behavior.
