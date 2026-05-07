# Staff System Design

## Status

Approved for written-spec review on 2026-05-07.

## Goal

Add a named employee system to the retail simulation so stores have explicit staff assignments, payroll obligations, and staffing requirements by store type. The system should make staffing a visible management layer without turning the game into a detailed HR simulator.

## Player Experience

The player manages a chain-wide roster from the Control Tower. They review candidates, hire named employees, and assign or transfer them between stores. Each store shows whether it has enough managers and general staff for its archetype.

Stores can operate while understaffed. Understaffing creates business pressure instead of blocking play: lower service capacity, missed demand, reputation pressure, and staff morale drag. This keeps the daily loop moving while making hiring and assignment decisions matter.

The first store starts with its minimum required staff already hired and assigned so a new game is playable immediately. The hiring panel becomes important when the player expands, wants extra coverage, or needs to recover from staffing pressure.

## Scope

- Add named staff members with role, salary, skill, morale, hire day, and assignment state.
- Add a persisted hiring candidate list.
- Add store-type staffing requirements.
- Add pure game transitions for hiring, assigning, transferring, and unassigning staff.
- Add monthly payroll expenses.
- Make daily simulation respond to staffing coverage and employee quality.
- Add a Control Tower hiring/staff panel.
- Update reports, warnings, tests, and save validation for the new state shape.

## Out of Scope

- Firing, layoffs, promotions, training, and raises.
- Employee traits, personality events, and retention risk.
- Shift scheduling, overtime, benefits, labor law, and absence handling.
- Candidate refresh controls. Tests should use deterministic candidate state directly.
- Old save migration. The game is not live, so old local saves can be purged/reset when the schema changes.

## Domain Model

Add staff data to `src/lib/game/types.ts`.

`StaffRole`:

- `manager`
- `general`

`StaffMember`:

- `id`: stable deterministic id.
- `name`: generated display name.
- `role`: staff role.
- `monthlySalary`: payroll amount charged on monthly payroll days.
- `skill`: 0-100 quality score used by simulation.
- `morale`: 0-100 staff-specific morale.
- `assignedStoreId`: store id or `null`.
- `hiredOnDay`: in-game day the employee joined.

`HiringCandidate`:

- same core fields as a staff member, except not hired yet.
- generated and persisted in `GameState` so save/load preserves the visible hiring market.

`StaffingRequirement`:

- `manager`: required manager count.
- `general`: required general staff count.

`GameState` gains:

- `staff: StaffMember[]`
- `hiringCandidates: HiringCandidate[]`

Stores do not embed staff arrays. Store staffing is derived by filtering `game.staff` by `assignedStoreId`, which keeps assignment changes centralized and avoids duplicating roster state.

## Store Requirements

Each store archetype defines required staffing. Initial first-slice values:

- Convenience Store: 1 manager, 1 general staff.
- Boutique Goods: 1 manager, 2 general staff.
- Electronics & Games: 1 manager, 2 general staff.
- Grocery Market: 1 manager, 3 general staff.

Requirements should live in a new `src/lib/game/staffing.ts` rules module keyed by `ArchetypeId`. The simulation and UI should use that same source of truth.

Overstaffing is allowed. Extra general staff may provide a small capped service-capacity buffer, but it should not be strong enough to make overhiring an obvious exploit.

## Hiring And Assignment Flow

The Hiring panel is chain-wide.

Candidate flow:

1. The hiring panel shows persisted candidates with name, role, monthly salary, skill, and morale.
2. Hiring a candidate removes them from `hiringCandidates`.
3. The hired person is added to `staff` with `assignedStoreId: null`.
4. The player assigns the employee to a store from the same panel.

Roster flow:

- Assign: set `assignedStoreId` from `null` to a store id.
- Transfer: change `assignedStoreId` from one store id to another.
- Unassign: set `assignedStoreId` to `null`.

The first implementation should expose assignment through store-select controls. The panel should show:

- Candidate cards.
- Unassigned staff.
- Store staffing sections with required vs assigned counts.
- Each employee's role, salary, skill, morale, and current assignment.

## Candidate Generation

Candidate generation must be deterministic from game state. It should use the existing seeded RNG utilities and update `rngState` through pure transitions.

The first game should create:

- Minimum assigned staff for the founding store.
- Five hiring candidates.

Candidates should be varied enough to make choices meaningful:

- Managers generally cost more and affect manager coverage.
- General staff cost less and affect capacity coverage.
- Higher skill or morale should usually imply higher salary.

Names can come from local deterministic name pools. Network-backed or locale-backed generation is out of scope.

## Payroll

Payroll is monthly and charged on days where `game.day % 30 === 0`.

Rules:

- Payroll cost is the sum of `monthlySalary` for all hired staff.
- Payroll is charged as part of `simulateDay` for that day.
- The daily report records `payrollCost`.
- Cash after the day includes payroll.

Named staff payroll should replace the current main wage expense in daily operating costs so hiring choices clearly own salary cost. The first slice should not add a separate non-roster labor baseline.

## Daily Simulation

Daily store simulation should derive staffing from assigned employees:

- Count assigned managers and general staff per store.
- Compare those counts to the store archetype requirement.
- Compute a staffing coverage score.
- Use assigned employee skill and morale to adjust effective staffing quality.

Effects:

- Missing manager coverage reduces effective manager quality and hurts reputation/morale.
- Missing general staff reduces staff capacity and customers served.
- Low assigned-staff morale drags store staff morale.
- Higher assigned-staff skill improves effective service throughput.
- Understaffing generates warnings such as `Store #2 is short 1 general staff`.

Existing `store.staffMorale`, `store.staffCapacity`, and `store.managerQuality` should remain useful store-health fields. The new roster should feed those values through simulation rather than replacing every store metric at once.

## Reports

Add report fields that make staffing legible:

- `DailyReport.payrollCost`
- `DailyStoreReport.staffingCoverage`: 0-100 coverage score.
- `DailyStoreReport.staffingShortage`: role-specific shortage data for manager and general staff.

The reports panel can surface payroll on payroll days. Store overview and the hiring panel should show current staffing health even before a day advances.

## Persistence

Update save validation for the new `staff` and `hiringCandidates` arrays and the new report fields.

No migration is required for old saves. Because the game is not live, old incompatible local saves can be purged/reset when the save schema changes. Repository backends should treat `SaveDataError` while reading a persisted snapshot as an empty save store and overwrite it on the next save. Tests should verify the current staff/candidate shape and this reset behavior, not compatibility with earlier game-state shapes.

## UI Design

The first UI target is the Control Tower.

Add a Staff Panel near the existing store overview/policy/decision sections. It should be a work-focused management surface, not a modal-heavy flow:

- Candidate cards for hiring.
- Roster list for unassigned employees.
- Per-store staffing sections showing coverage against requirements.
- Role, salary, skill, morale, and assignment status visible at a glance.
- Hire buttons on candidate cards.
- Store-select controls for assign and transfer.
- Unassign buttons for assigned staff.

The route component should continue to own game state and autosave through `setGameAndAutosave`. New UI callbacks should call pure transition helpers and then autosave the returned game state.

Svelte components must use runes mode patterns already present in the repo: `$props`, `$state`, `$derived`, keyed `{#each}` blocks, and callback props. Svelte snippets should be checked with `svelte-autofixer` during implementation.

## Error Handling

Pure transition helpers should return the original game state when an action references an unknown store, staff member, or candidate. The first slice should stay quiet for invalid UI calls because the UI should only render valid actions.

Assignment should allow overstaffing and transfers. It should not allow assignment to missing stores or hiring missing candidates.

Payroll can make cash negative. Existing cash-pressure decision behavior should continue to handle low or negative cash after simulation.

## Testing

Unit tests:

- New game creates the founding store's minimum assigned staff.
- New game creates deterministic hiring candidates for the same seed.
- Hiring moves a candidate into staff and removes them from candidates.
- Assign, transfer, and unassign transitions are immutable.
- Store staffing requirements differ by archetype.
- Understaffing reduces customers served and creates staffing warnings.
- Payroll days subtract monthly salary and populate `payrollCost`.
- Non-payroll days do not charge monthly salary.
- Save validation accepts valid staff/candidate shapes and rejects invalid ones.
- Unsupported/old save data is reset to an empty save store after `SaveDataError`.

Component tests:

- Hiring/staff panel renders candidates and roster status.
- Hiring callback is called with the selected candidate id.
- Assignment controls call the expected callback with employee and store ids.
- Store sections show required vs assigned staffing counts.

E2E tests:

- Start a new game.
- Open the Control Tower.
- Hire a candidate.
- Assign the employee to a store.
- Verify the store staffing display updates.

## Implementation Notes

Likely files:

- `src/lib/game/types.ts`
- `src/lib/game/staffing.ts`
- `src/lib/game/state.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/persistence/saveCodec.ts`
- `src/lib/components/game/StaffPanel.svelte`
- `src/routes/+page.svelte`
- focused specs next to changed modules
- `src/routes/retail-sim.e2e.ts`

Keep the model deterministic and pure. UI components should not generate candidates or mutate nested game state directly.
