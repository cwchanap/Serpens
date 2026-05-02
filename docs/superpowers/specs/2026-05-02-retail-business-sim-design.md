# Retail Business Simulation Design

## Status

Approved for implementation planning on 2026-05-02.

## Goal

Build the first playable version of a strategic simulation game about running and growing a retail business. The game starts with a single store, then expands into a small local chain while shifting player focus from direct operating choices to high-level policies, exceptions, and growth decisions.

The MVP should feel approachable at the start, but it should not become more micromanagement-heavy as the company grows.

## Product Scope

The first implementation targets a local chain MVP:

- The player starts with one store.
- The player chooses a starting store archetype.
- The business can grow to a maximum of 3 stores.
- The player manages the company from a Control Tower interface.
- The simulation advances one day at a time.
- The game uses a balanced scorecard rather than a single win metric.

The design should leave room for a later full empire path, including regional expansion, logistics, franchising, acquisitions, and national competition, but those are out of scope for the first playable version.

## Player Experience

The player acts as the owner/operator of a growing retail company. They do not manually serve customers, place every product, or tune every small operational detail. Their job is to:

1. Read the current business health.
2. Set or adjust high-level company policies.
3. Resolve urgent or strategic decisions.
4. Decide when and where to expand.
5. Advance time and interpret the results.

The core loop is daily:

1. Review cash, scorecard, store health, and recent reports.
2. Adjust policies if needed.
3. Resolve zero or more high-impact decision queue items.
4. Advance one day.
5. Inspect the new daily result and rolling trends.

Most days should be fast. The player should not be forced to answer multiple prompts every day unless the business is in an unusual situation.

## Success Model

The game uses a balanced scorecard with four primary dimensions:

- Profit: cash flow, margin, and ability to fund growth.
- Customer satisfaction: availability, service quality, price perception, and reputation.
- Staff morale: staffing pressure, wages, manager quality, and burnout risk.
- Market position: local share, competitive strength, brand fit, and expansion momentum.

The player succeeds by keeping the business healthy across all four dimensions. Optimizing only one dimension should create tradeoffs. For example, aggressive pricing may improve sales and market position while reducing margin and staff morale if volume pressure rises.

## Store Archetypes

At the start of a new game, the player chooses one archetype. The MVP should support multiple archetypes through data-driven configuration rather than separate simulation code paths.

Initial archetype candidates:

- Convenience store: fast turnover, steady foot traffic, low margins, stockout sensitivity.
- Boutique/general goods: curated product fit, customer taste, reputation sensitivity.
- Electronics/game store: higher-ticket items, trend spikes, launches, theft or shrink risk.
- Grocery/supermarket path: recurring demand, freshness pressure, broader supply complexity.

Each archetype defines:

- Starting cash and debt posture.
- Starting product categories.
- Demand profile.
- Margin range.
- Customer expectations.
- Staffing needs.
- Event flavor and likely risks.

All archetypes use the same core store, policy, demand, and report model.

## Daily Economy

Each store produces a daily result from a transparent simulation model. The model should be legible enough that players can infer why results changed.

Inputs include:

- Local demand.
- Store archetype and product fit.
- Pricing policy.
- Inventory availability and stock health.
- Staff capacity and morale.
- Marketing posture.
- Customer satisfaction and reputation.
- Rent, wage accrual, and supplier costs.
- Competitive pressure.
- Random daily variance from seeded randomness.

Daily outputs include:

- Revenue.
- Cost of goods sold.
- Gross margin.
- Operating costs.
- Net income.
- Customer count or demand served.
- Stock health changes.
- Satisfaction changes.
- Staff morale changes.
- Market position changes.
- Warnings or notable events.

The interface should also show rolling 7-day and 30-day summaries so a daily cadence does not become noisy.

## Policies

Policies replace routine micromanagement. The MVP should include company-wide policies with optional per-store overrides only where they serve a clear strategic purpose.

Initial policy categories:

- Pricing posture: discount, competitive, standard, premium.
- Inventory buffer: lean, balanced, generous.
- Staffing posture: minimal, efficient, service-focused.
- Marketing focus: none, awareness, promotions, loyalty.
- Service priority: speed, balanced, high-touch.

Policies should affect daily simulation results through clear tradeoffs. For example:

- Lean inventory lowers carrying cost but raises stockout risk.
- Premium pricing improves margin but can reduce demand and satisfaction.
- Service-focused staffing improves satisfaction but increases wages.
- Promotions increase traffic while reducing margin or raising staffing pressure.

## Decision Queue

The decision queue surfaces high-impact exceptions, opportunities, and risks. It should stay sparse so the game does not become prompt-heavy.

Decision queue items can include:

- Supplier offers.
- Competitor moves.
- Staff issues.
- Expansion opportunities.
- Product trends.
- Cash crunches.
- Equipment or systems upgrades.
- Customer reputation events.
- Manager hiring or delegation decisions.

Most days can have no decision item. Normal business behavior should come from policies and simulation. Decision items should appear when they create an interesting tradeoff or explain a meaningful change in company state.

Each decision should include:

- Clear title and context.
- 2-3 response options.
- Short projected effects.
- Actual effects applied when resolved.
- Expiration timing when relevant.

## Growth and Delegation

The MVP supports growth from one store to a maximum of 3 local stores.

Opening a new store should require:

- Enough cash or financing capacity.
- A selected location or market profile.
- Setup cost.
- Added rent and wage commitments.
- Manager or staffing readiness.

Growth should create leverage and fragility:

- More stores increase revenue potential and market position.
- More stores increase fixed costs and operational complexity.
- Poor policies can compound across the chain.
- Managers and defaults reduce repetitive per-store work.
- The UI surfaces exceptions instead of requiring daily manual review of every store.

## Interface

The main interface is the Control Tower.

Primary areas:

- Top bar: current day, cash, net income trend, current objective, advance-day control.
- Balanced scorecard: profit, customer satisfaction, staff morale, market position.
- Store overview: compact status for each store, including revenue, margin, stock health, staffing pressure, local reputation, and warnings.
- Policy panel: company-wide defaults for pricing, inventory, staffing, marketing, and service posture.
- Decision queue: urgent or strategic decisions with tradeoffs and projected effects.
- Reports panel: latest daily result plus rolling 7-day and 30-day trends.

The player should be able to understand the business state within a few seconds, make one or two meaningful changes, and advance time.

## Technical Design

The project is a fresh SvelteKit app with TypeScript, Bun, Tailwind CSS, Vitest, and Playwright. The MVP can be implemented client-side.

Proposed module structure:

- `src/lib/game/types.ts`: domain types for game state, store, archetype, policy, decision, report, scorecard, and seeded RNG.
- `src/lib/game/archetypes.ts`: data-driven store archetype definitions.
- `src/lib/game/state.ts`: game creation, reset, policy updates, expansion helpers, and state update utilities.
- `src/lib/game/simulateDay.ts`: pure daily simulation function.
- `src/lib/game/events.ts`: decision queue generation and decision resolution.
- `src/lib/game/reports.ts`: daily, 7-day, and 30-day summary helpers.
- `src/lib/game/rng.ts`: deterministic seeded random utilities.
- `src/lib/components/`: Svelte components for the Control Tower UI.

The simulation should be deterministic for a given seed and sequence of player actions. This makes tuning, debugging, and testing practical.

Persistence can be added with local storage after the state shape is stable. A backend is not required for the MVP.

## Error Handling and Edge Cases

The game should handle:

- Running out of cash without immediately crashing the simulation.
- Store performance dropping due to stockouts, low morale, weak demand, or poor pricing.
- Decision items expiring or being ignored.
- Expansion being unavailable due to cash, debt, or operational risk.
- Daily reports with no prior history.
- Rolling summaries when fewer than 7 or 30 days have elapsed.

When the player hits trouble, the UI should explain the likely cause through warnings and report text rather than hidden penalties.

## Testing Strategy

Prioritize tests for pure TypeScript game logic:

- Creating a new game for each archetype.
- Advancing one day produces deterministic results for a fixed seed.
- Policies influence revenue, margin, satisfaction, morale, and stock health in expected directions.
- Rolling 7-day and 30-day reports work with partial and full histories.
- Decision generation is sparse and deterministic enough to test.
- Resolving decisions applies the intended effects.
- Expansion rules enforce the 3-store MVP limit.
- Scorecard values stay within expected bounds.

UI tests should cover:

- Starting a game and selecting an archetype.
- Viewing the Control Tower.
- Changing company policies.
- Advancing a day.
- Resolving a decision queue item.
- Opening a second store when requirements are met.

## Out of Scope for MVP

- Backend services.
- Multiplayer.
- National or international expansion.
- Warehouses and detailed logistics.
- Franchise systems.
- Acquisitions.
- Detailed shelf layout or customer pathfinding.
- Manual customer service gameplay.
- Deep product SKU-level inventory.
- Real-money payments or monetization.

## Open Implementation Notes

- The first implementation should favor clear tuning constants over a complex economic model.
- Archetypes should be data-driven from the start so new retail formats can be added later.
- Decision text should be flavorful enough to give stores identity, but event mechanics should remain small and testable.
- The UI should avoid overwhelming charts early; compact numbers, trend badges, warnings, and concise reports are enough for the MVP.
