# Task 8 report — final audit and verification

## Outcome

HPA-554 closes as a deletion-heavy simplification with no replacement compatibility framework.
Task 8 changes tests and this audit record only; it does not change production, UI, or active-city
source. Valid city-local inventory behavior remains covered by the existing focused and end-to-end
suite.

## Audit scope and removal rationale

| Area | Audit result |
| --- | --- |
| `ReportsPanel.svelte.spec.ts` | Removed unsafe schema-invalid display fixtures: missing city attribution, a missing production-close inventory list, a stale current inventory owner, a null replenishment context paired with a refill, and omitted required report fields. Retained valid duplicate-city aggregation, valid current-inventory overflow, and a canonical zero-stock inventory record. |
| `productChainGraph.spec.ts` | Removed the unsafe-cast legacy production rows without a `cityId`; current historical movement validation requires a typed known city. |
| `productChainTree.spec.ts` | Removed the unsafe-cast unscoped historical import fixture and its now-unused opened-retail helper. |
| `saveCodec.railValidation.spec.ts` | Replaced obsolete whole-save rejection expectations with a supported structurally-valid history ordering regression. |
| `saveCodec.spec.ts` | Retained duplicate malformed-row coverage in the decoder's structural-malformation matrix: duplicate store-report IDs and duplicate product category IDs now prove that only the bad historical row is dropped. |

No production code was changed. In particular, the active-city test and source behavior were left
untouched.

## Task 5 historical-report contract linkage

Task 5 deliberately changed report decoding from history replay / whole-save rejection to
independent row decoding. `decodeHistoricalReports` keeps structurally valid historical rows in
their input order and drops malformed rows with one
`console.warn('Dropping malformed historical report', { index, error })` per row.

The three stale `saveCodec.railValidation.spec.ts` tests asserted the removed behavior:

- non-increasing report days threw for the entire save;
- duplicate store-report IDs threw for the entire save; and
- duplicate product category IDs threw for the entire save.

The replacement proves the supported case: structurally valid historical reports retain their
original input order without chronology replay. The two duplicate cases remain covered in
`saveCodec.spec.ts` with the supported outcome: each structurally malformed row is discarded,
not allowed to reject the current authoritative game state. The existing bad/good/bad and
all-bad codec regressions still cover survivor ordering, warning emission, and playability.

## Required symbol audits

Both exact audits were run against `src` at the beginning of this task. The forbidden-symbol audit
returned ripgrep exit status 1 with no output, which means no matches:

```text
rtk rg -n "MIGRATABLE_SCHEMA_VERSIONS|migrateV[0-9]|LegacyV|allocateLegacyWarehouseMaterials|recalculateCityInventoryPressure|synchronizeCityInventoryCapacity|synchronizeAllCityInventoryCapacities|normalizeCityInventoryDerivedState|RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE|configuration-unavailable" src
```

This confirms no forbidden migration, legacy allocation, pressure synchronization, or missing-
configuration recovery symbols remain in production source.

The narrow persisted-reference audit below also returned ripgrep exit status 1 with no output:

```text
rtk rg -n "replenishmentOutcome\s*:|\.replenishmentOutcome" src
```

That pattern only matches property-access and typed-declaration forms, so it does not cover every
persisted reference. A broader search for `replenishmentOutcome` across `src` found only test
safeguards asserting the field is absent (`expect(...).not.toHaveProperty('replenishmentOutcome')`
in `retailSupply.spec.ts`, `simulateDay.spec.ts`, and `saveCodec.spec.ts`). Those test matches are
classified separately from production persisted references; no production source persists or reads
the field. The permitted `RetailReplenishmentOutcome` type and derived helper remain outside these
matches.

## Verification

| Command | Result |
| --- | --- |
| `rtk bun run check` | Passed with 0 errors and 0 warnings. |
| `rtk bun run lint` | Passed: Prettier and ESLint clean. |
| Focused Reports/product-chain tests | Passed: 3 files, 76 tests. |
| Focused rail validation | Passed: 1 file, 7 tests. |
| `rtk bun run test:unit -- --run --maxWorkers=1` | Passed serially: 139 files, 3,029 tests, exit 0. |
| `rtk bun run test:e2e -- --workers=1` | Passed serially: 47 tests, exit 0. This included `city-local inventory keeps multi-city supply, replenishment, reporting, and saves isolated`. |
| `rtk git diff --check` | Passed before the checkpoint commit. |

The full unit suite's Phaser-unavailable console entries are expected mocked-renderer diagnostics,
not test failures. The E2E build emitted the existing chunk-size and `NO_COLOR` warnings; the
Playwright run still exited 0.

## PR scope and statistics

At final review, `main...HEAD` contains 69 changed files with 3,042 insertions and 10,351
deletions. The implementation is therefore deletion-heavy by 7,309 lines. Its remaining source
changes are the planned removal of pre-release compatibility, duplicated derived state, and
invalid-state recovery paths; this audit found no replacement framework or new HPA-294 work.

## HPA boundaries and self-review

- HPA-292 behavior is retained. The serial E2E suite passed the city-local multi-city lifecycle:
  local supply selection, partial local refill with imports, cross-city isolation, reporting, and
  manual save/load.
- HPA-294 remains blocked until merge. The PR diff introduces no transfer/route implementation.
- Reviewed every Task 8 production-facing deletion. Removed cases all require unsafe casts,
  malformed current state, or historical-replay recovery no longer admitted by the current
  validator.
- Retained valid current-state aggregation, overflow, zero-inventory, city isolation, and
  historical-row behavior. Malformed authoritative state remains strict; only historical report
  rows are independently discardable.

## Checkpoint

The audit changes are committed as the narrow
`test(logistics): retain simplification behavior gates` checkpoint. The exact SHA and final
`main...HEAD` status are captured in the implementation handoff after this report is committed.

## Follow-up fixture correction

Independent Task 8 review found that the retained ReportsPanel "empty state" fixture used
`cityInventories: []`. That is not a supported schema-14 state: current validation requires one
inventory record for every opened, materialized industry city. The fixture therefore exercised the
component's defensive fallback rather than a valid zero-stock inventory state.

The test now supplies the canonical valid record
`{ cityId: 'industry-city', materials: {} }` and asserts the normal
`Industry City: 0 / 200 city inventory used.` display. No ReportsPanel, active-city, or other
production source changed; the defensive fallback remains unchanged.

### Follow-up verification

- The initial sandbox-focused command was blocked before tests ran by the known loopback
  `EPERM` restriction on `::1:63315`; this was environmental, not a product failure.
- The identical elevated focused command passed: `ReportsPanel.svelte.spec.ts`, 18/18 tests.
- `rtk bun run check` — passed with 0 errors and 0 warnings.
- `rtk bun run lint` — passed (Prettier and ESLint).
- `rtk bun run test:unit -- --run --maxWorkers=1` — passed serially: 139 files, 3,029 tests,
  exit 0.
- Existing serial E2E evidence remains valid because no application source changed.
