# Task 5 report — validate current state and filter historical reports

## Outcome

Current schema-14 game state remains authoritative and strict. City inventories and retail
supply assignments now normalize into world-catalog order after validating ownership,
uniqueness, material quantities, and live industry-inventory sources.

Historical daily reports now decode independently. A structurally malformed row is omitted and
emits exactly one `console.warn('Dropping malformed historical report', { index, error })`.
Valid historical rows retain their original order and values; they are no longer replayed against
the current city materialization, current source accessibility, or production-pressure equations.

## Production changes

- `saveCodec.ts`
  - Replaced canonical-order rejection for authoritative `cityInventories` and
    `retailSupplyAssignments` with deterministic world-catalog sorting.
  - Kept strict live ownership/uniqueness validation and added the missing guarantee that every
    non-null supply assignment references a current industry inventory.
  - Added independent historical report decoding with one warning per dropped row.
  - Deleted the current-state report attribution/replay and persisted pressure-equation
    validation paths. Historical rows retain static shape/type checks but no longer require
    current city membership or current store/source availability.
  - Retained event sequence validation for the surviving report evidence, including modifier
    impact and replacement sequences.
- `scenarioCodec.ts`
  - Removed the exact deep-equality guard after current-game validation. Current validation is
    allowed to normalize authoritative collection order and filter invalid historical rows.

## Test coverage changes

| Altered group | Old premise | New covered behavior |
| --- | --- | --- |
| New Task 5 codec regressions | N/A | Canonicalizes harmless current ordering, rejects an invalid live supply source, filters bad/good/bad rows in place, warns once per dropped row, allows every row to drop, and still rejects malformed authoritative inventory. |
| Replenishment and production-close controller-review cases | A historical mismatch rejected the entire save. | Structural bad values drop only that row; stale source attribution, missing current summaries, and unreconciled pressure snapshots survive unchanged. |
| Current-v14 report/store-report cases | Current city/store/source relationships were required during report decoding. | Required report fields/static IDs still cause row filtering when absent or invalid; stale current relationships and extra historical context survive unchanged. |
| Event report evidence cases | A malformed historical modifier row rejected the game. | The row is filtered while valid surviving event evidence still participates in current sequence validation. |
| Finance/day/scalar/report-field cases | Bad report finance/timeline fields rejected the save. | Structural invalid values/fields drop the row; timeline-only and non-replayed historical values survive unchanged. |
| Warning, rail, and production-report cases | A malformed historical warning or movement rejected the snapshot. | Each case now proves the malformed row is dropped with a warning; valid historical shapes still round-trip. |
| Historical defensive-path cases | Report summaries and replenishment context were reconciled to the current world. | Invalid shapes/types drop; duplicate/unsorted summaries and stale-but-typed context are preserved without repair. |
| `saveRepository.spec.ts`: invalid material movement | Snapshot rejection. | The manual-slot save remains readable with the invalid report row removed and one warning. |
| `saveRepository.spec.ts`: invalid warning array | Snapshot rejection. | The row is removed and the rest of the snapshot is readable. |
| `saveRepository.spec.ts`: invalid payroll cost | Snapshot rejection. | The row is removed and the rest of the snapshot is readable. |
| `saveRepository.spec.ts`: invalid production totals | Snapshot rejection. | The row is removed and the rest of the snapshot is readable. |
| `saveRepository.spec.ts`: missing warehouse units | Snapshot rejection. | The row is removed and the rest of the snapshot is readable. |
| `saveRepository.spec.ts`: invalid warehouse value | Snapshot rejection. | The row is removed and the rest of the snapshot is readable. |
| `saveRepository.spec.ts`: invalid staffing coverage | Snapshot rejection. | The row is removed and the rest of the snapshot is readable. |
| `saveRepository.spec.ts`: invalid general staffing shortage | Snapshot rejection. | The row is removed and the rest of the snapshot is readable. |
| Scenario embedded-game regression | A post-validation deep-equality guard rejected a game whose historical row was filtered. | Scenario validation accepts the normalized/filtered game and keeps it playable. |

The eight repository expectations were updated under the coordinator's green-checkpoint ruling;
they are test-only changes. No production file outside Task 5's four planned files was changed.

## RED → GREEN evidence

RED first:

```text
rtk bun run test:unit -- --run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/scenarioCodec.spec.ts --maxWorkers=1
```

The new ordering/source/filtering codec regressions failed under the old all-or-nothing decoder.

Focused GREEN after implementation:

```text
saveCodec targeted regressions: 5 passed, 349 skipped
scenario malformed-history regression: 1 passed, 117 skipped
```

Final required verification (exit 0):

```text
rtk bun run test:unit -- --run \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/lib/persistence/tauriSaveRepository.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  --maxWorkers=1
```

Focused JSON reporters also confirmed:

- `saveCodec.spec.ts`: 352/352 passed.
- `saveRepository.spec.ts`: 88/88 passed.
- `scenarioCodec.spec.ts` plus `tauriSaveRepository.spec.ts`: 123/123 passed.

Additional verification:

- `rtk bun run check` — passed, 0 errors and 0 warnings.
- `rtk bun run lint` — passed (Prettier and ESLint).
- `rtk git diff --check` — passed.

## Self-review

- Verified the deleted paths are only current-state report replay, pressure-equation aggregation,
  and historical outcome reconciliation.
- Restored and retained the report modifier-impact and modifier-replacement sequence checks after
  catching an accidental deletion during review.
- Confirmed malformed authoritative inventories and malformed live supply assignments continue to
  reject, rather than being treated as recoverable historical data.
