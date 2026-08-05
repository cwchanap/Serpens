# Task 6 report — remove duplicate scenario inventory validation

## Outcome

Scenario setup now owns the state-dependent inventory checks at the point where it applies
authored overrides, then delegates the final authoritative state validation to the existing Task 5
validator exactly once. The duplicate scenario inventory validator and its malformed-state matrix
are deleted.

Authored retail supply assignments may now be listed in any valid order. Setup sorts them into
world-catalog order before the single final state validation, rather than rejecting harmless
ordering differences.

## Production changes

- Deleted `src/lib/scenarios/validation/cityInventory.ts` and its 736-line spec. Its public
  `validateCityInventoryCapacities` and `validateRetailSupplyAssignments` entry points are no
  longer exported from `validation.ts`.
- Reordered `buildScenarioGame` to:
  1. validate the definition;
  2. materialize cities and stores;
  3. materialize all industrial buildings;
  4. install rails;
  5. apply general overrides (including store upgrades);
  6. apply city inventory materials;
  7. compare totals with capacity derived from the materialized warehouses;
  8. apply and normalize retail supply assignments; and
  9. assign the result of one `validateCurrentGameState(game)` call.
- Moved city-capacity and supply-source availability checks into their respective override
  application paths. Their diagnostics retain the authored override path and value.
- Removed the schema-level canonical-order rejection for retail supply assignments while keeping
  duplicate, missing, invalid-reference, closed-city, and invalid-kind definition checks.
- Removed the duplicate post-setup rail, city-inventory, and supply-assignment invariant pass.

## Test coverage

- Added a setup regression whose authored retail supply assignments are deliberately reversed;
  `buildScenarioGame` now succeeds and returns world-catalog ordering.
- Retained integration coverage for city-capacity and invalid-source diagnostics, including their
  value fields.
- Removed tests that mocked malformed game state solely to exercise the now-deleted duplicate
  post-setup validator.
- Audited `scenarioCodec.spec.ts` without changing it: Task 5 already covers normalization at the
  authoritative codec boundary, and the required Task 6 run includes that regression suite.

## RED → GREEN evidence

RED first:

```text
rtk bun run test:unit -- --run src/lib/scenarios/setup.spec.ts -t "normalizes authored retail supply assignments to world catalog order" --maxWorkers=1
```

The new regression failed under the old canonical-order rejection (`expected false to be true`).

Focused GREEN after implementation:

```text
1 passed, 20 skipped
```

Final required verification (exit 0):

```text
rtk bun run test:unit -- --run \
  src/lib/scenarios/setup.spec.ts \
  src/lib/scenarios/validation.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  --maxWorkers=1
```

Result: 3 files and 336 tests passed.

Additional verification:

- `rtk bun run check` — passed with 0 errors and 0 warnings.
- `rtk bun run lint` — passed (Prettier and ESLint).
- `rtk git diff --check 0b42cf1` — passed.

## Self-review

- Confirmed `setup.ts` contains one `validateCurrentGameState(game)` invocation and assigns its
  normalized result.
- Confirmed all capacity arithmetic occurs after industrial-building materialization and city
  inventory materials are applied.
- Confirmed no deleted `cityInventory` validator import or public export remains.
- Reviewed the base-to-working-tree diff for scope: it is deletion-heavy and limited to Task 6
  scenario setup/validation files and this report; no Task 7 or HPA-294 behavior changed.

The checkpoint commit SHA is captured in the implementation handoff after this report is committed.
