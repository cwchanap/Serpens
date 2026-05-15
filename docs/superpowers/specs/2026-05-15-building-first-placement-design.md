# Building-First Placement Design

## Status

Approved for written-spec review on 2026-05-15.

## Goal

Change both city maps from a tile-first construction flow to a building-first placement flow.

Current flow:

1. Select a tile.
2. Choose a store type or industrial building inside the tile inspector.
3. Confirm the build.

New flow:

1. Open the active map's building menu.
2. Choose the store type or industrial building.
3. Click an appropriate tile to build immediately.

The selected building should behave like a standard game placement tool: valid tiles show a transparent green overlay, invalid tiles show a transparent red overlay, and clicking a valid tile commits the build immediately.

## Accepted Decisions

- Add a dedicated `Build` button in the map HUD, separate from the existing hamburger menu.
- The build menu is active-map aware:
  - retail map shows store archetypes;
  - industry map shows industrial buildings.
- After the player chooses a building, the map enters placement mode.
- In placement mode, valid tiles render with a transparent green overlay and invalid tiles render with a transparent red overlay.
- Clicking a valid tile builds immediately and exits placement mode.
- Clicking an invalid tile keeps placement mode active and shows the placement block reason.
- When no building is selected, tile clicks still open the existing inspector, but only for tile or building details.
- Tile inspectors should no longer contain construction choices.
- Escape and an explicit cancel control exit placement mode without building.

## Scope

Included:

- Add route-level placement mode for retail and industry construction.
- Add a HUD `Build` control that opens the active map's building picker.
- Move retail store-type selection out of `TileInspector`.
- Move industry building selection and product-chain filter/search out of `IndustryTileInspector`.
- Keep both inspectors as detail-only surfaces outside placement mode.
- Add placement preview metadata to retail and industry map snapshots.
- Render valid/invalid transparent placement overlays in both Phaser scenes.
- Commit valid tile clicks immediately through existing game transition helpers.
- Keep invalid feedback visible while preserving the armed building.
- Update tests and e2e coverage for the new flow.

Deferred:

- Drag placement, brush placement, or multi-build tools.
- Rotateable or multi-tile buildings.
- New building categories or new production rules.
- Reworking Control Tower or save-slot UX.
- New art beyond simple placement overlays and any icons already registered.

## Player Experience

### Retail Map

The player clicks `Build` in the HUD. A build menu opens with retail store archetypes. Each option should show the existing storefront art, setup cost, and projected daily revenue.

Choosing a store type arms placement mode. The retail map overlays buildable, affordable, empty tiles in green and blocked tiles in red. Clicking a valid tile immediately founds the first store or opens an expansion store, depending on whether a game already exists. The build menu closes, placement mode exits, invalid feedback clears, and autosave runs after the transition.

Clicking an invalid tile does not cancel the selected store type. The UI shows the reason, such as `Road location`, `River location`, `Occupied location`, `Store limit reached`, or `Requires 1,200 cash`, and lets the player choose another tile.

When no store type is armed, clicking a retail tile opens the current tile/store inspector for details only. Occupied stores still show details, stock, and staff controls.

### Industry Map

The player clicks `Build` in the HUD. A build menu opens with industrial buildings. It preserves the existing product-chain filter and search behavior so the player can narrow buildings by finished product chain.

Choosing an industrial building arms placement mode. The industry map overlays valid tiles in green and invalid tiles in red based on the selected building's placement rules. Raw producers require matching resource tiles. Processors, factories, and warehouses require industrial tiles where applicable. Occupied and locked tiles are invalid.

Clicking a valid tile immediately builds the industrial building, charges cash, exits placement mode, clears invalid feedback, and autosaves.

Clicking an invalid tile keeps the selected building armed and shows the exact block reason, such as `Requires grain field`, `Requires industrial tile`, `Occupied industrial tile`, or the selected building's cash requirement.

When no industrial building is armed, clicking an industry tile opens the current industry inspector for tile/building details only. Built tiles still show status, last production, material movement, warehouse capacity, and warehouse material details.

## Architecture

Placement state should live in `src/routes/+page.svelte` because the route already coordinates active map view, selected tiles, game transitions, autosave, and modal/panel state.

Add an active placement state shaped around the active map:

- retail placement stores the selected `ArchetypeId`;
- industry placement stores the selected `IndustrialBuildingTypeId`;
- both modes track the latest invalid placement feedback;
- cancelling placement clears the selected building and feedback.

The route decides what a map click means:

- if placement mode is inactive, the click selects the tile and opens the detail inspector;
- if retail placement mode is active, the click validates the selected archetype against the clicked retail tile and either commits `createFoundingGameAtTile`/`openStoreAtTile` or records feedback;
- if industry placement mode is active, the click validates the selected industrial building against the clicked industry tile and either commits `buildIndustrialBuilding` or records feedback.

The game domain helpers remain the source of truth for construction rules. UI preview helpers may compose these rules, but they should not invent separate placement behavior.

## Components

Add a focused build-menu component rather than expanding the tile inspectors.

The new component should be responsible for picker UI only:

- render retail store options for the retail map;
- render industrial building options for the industry map;
- keep the industry product-chain filter/search behavior from the current industry inspector;
- call route callbacks when a store archetype or industrial building is selected;
- expose a close action.

`TileInspector.svelte` should remove construction-choice UI and confirmation UI. It remains responsible for retail tile stats, store art, stock, staff, and store details.

`IndustryTileInspector.svelte` should remove construction-choice UI, product-chain picker UI, and build confirmation UI. It remains responsible for industry tile stats, building details, production log, and warehouse detail display.

The map HUD adds:

- a `Build` icon/button;
- placement status while a building is armed;
- a cancel placement control;
- latest invalid placement feedback.

## Map Preview Data

`createCityMapSnapshot` and `createIndustryMapSnapshot` should accept optional placement-preview input.

The preview should expose enough data for Phaser rendering without moving rules into Phaser. A compact shape is acceptable, for example:

- `validPlacementTileIds`;
- `invalidPlacementTileIds`;
- optional `selectedPlacementTileId` or latest invalid tile id for emphasis.

The Phaser scenes render these preview ids as transparent tile overlays above terrain and below store/building sprites when possible. Green means clicking will build immediately. Red means clicking is blocked.

The overlay should be visible but not obscure the map art. It should be deterministic and testable through canvas `data-*` attributes, similar to existing renderer-settled attributes.

## Error Handling

Invalid clicks should be recoverable:

- keep placement mode active;
- keep the selected building armed;
- select or remember the invalid tile enough to show the block reason;
- do not autosave;
- do not open the detail inspector unless placement mode is cancelled.

Successful builds should:

- commit exactly one building/store;
- clear placement mode;
- close the build menu;
- clear invalid feedback;
- clear the opposite map selection as current flows do;
- run autosave through `setGameAndAutosave`.

If no game exists:

- retail placement can found the first store;
- industry construction remains locked, and the build menu should explain that a retail store is required before construction.

If a domain transition still returns a delayed decision after the UI thought the tile was valid, keep the resulting game state. This preserves the current feedback path for race-like or bypassed invalid calls.

## Testing

Unit and component coverage:

- retail placement preview marks valid and invalid tiles for a selected archetype;
- industry placement preview marks valid and invalid tiles for selected raw, factory, and warehouse buildings;
- build menu renders retail store options and calls the retail placement callback;
- build menu renders industry building options, product-chain filters, search, and calls the industry placement callback;
- retail inspector no longer renders store construction choices;
- industry inspector no longer renders industrial construction choices;
- invalid tile click preserves the armed placement choice and feedback;
- successful tile click builds immediately and clears placement mode.

Map/render coverage:

- retail map snapshots include preview metadata when retail placement is armed;
- industry map snapshots include preview metadata when industry placement is armed;
- Phaser scenes expose testable `data-*` attributes for placement overlay counts;
- green/red overlay rendering does not disturb existing store/building sprite counts.

Playwright coverage:

- retail founding flow: `Build -> store type -> valid tile` creates the first store without a confirmation dialog;
- retail invalid flow: selected store type plus blocked tile shows red preview/feedback and remains armed;
- industry build flow: `Build -> industrial building -> valid tile` creates a building without a confirmation dialog;
- industry invalid flow: selected building plus incompatible tile shows red preview/feedback and remains armed;
- no armed building: tile click opens the retail or industry detail inspector only.

## Implementation Notes

Keep this as an interaction refactor, not a simulation rewrite. Existing helpers such as `forecastOpening`, `openStoreAtTile`, `getIndustrialPlacementBlockReason`, and `buildIndustrialBuilding` should continue to own business behavior.

Because this project forces Svelte 5 runes mode, new Svelte component state should use `$state`, `$derived`, and `$effect` rather than legacy reactivity. Svelte changes require the official Svelte MCP docs/autofixer workflow before implementation is delivered.
