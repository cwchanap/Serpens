# Staff Leveling — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)

## Summary

Add a per-individual leveling progression to staff members so that working staff grow more
skilled over time, that growth feeds revenue, and each promotion costs money.

- **Hybrid progression:** assigned staff earn **XP by working**; the player **pays a training
  fee to promote** them one level at a time (player-driven transition, like hiring).
- **Single revenue channel:** each promotion **raises the member's existing `skill` stat**
  (clamped at 100), which flows through the *existing* `skillMultiplier` (`0.82 + skill/250`)
  into store throughput → revenue. No new revenue dial is introduced — no double-counting.
- **Two costs per promotion:** an up-front **training fee** (cash sink) **plus a permanent
  `monthlySalary` increase** (ongoing payroll pressure).
- Only staff **assigned to an open store** earn XP. Morale is untouched (still hire-set and
  evolved by store dynamics).

## Decisions (locked during brainstorming)

| Question | Decision |
| --- | --- |
| Level-up trigger | **Hybrid** — earn XP by working, then pay a training fee to promote |
| Level → revenue mechanism | **Single channel** — leveling raises `skill`; existing `skillMultiplier` carries revenue |
| Promotion cost | **Training fee (up-front cash) + permanent salary bump** |
| XP source | **Base per assigned day + activity bonus** (scaled by store utilization) |
| Who earns XP | **Only staff assigned to an open store** |
| Morale | **Unchanged** (out of scope) |
| Hiring candidates | **No level field** — implicitly level 1; level/xp added on hire |
| XP banking | **Capped at the next-level threshold** so progress cannot be stockpiled across levels |
| Legacy saves | **Normalize** — staff without `level`/`xp` default to `level: 1, xp: 0` |

## Domain model changes (`src/lib/game/types.ts`)

Add two fields to `StaffMember` only (`HiringCandidate` is unchanged — candidates are
implicitly level 1):

```ts
interface StaffMember extends HiringCandidate {
  assignedStoreId: string | null;
  hiredOnDay: number;
  level: number;   // 1..MAX_STAFF_LEVEL
  xp: number;      // progress toward next level, capped at the next-level threshold
}
```

`skill` remains the live, revenue-feeding value; promotion mutates it upward (clamped at 100).

## New module `src/lib/game/staffLeveling.ts`

Mirrors `leveling.ts` and keeps `staffing.ts` lean. Pure functions, individually unit-tested:

- `MAX_STAFF_LEVEL = 5`
- `STAFF_SKILL_GAIN_PER_LEVEL = 8`
- `STAFF_SALARY_BONUS_PER_LEVEL = 0.12`
- `STAFF_TRAINING_BASE_COST = 2_000`
- `STAFF_BASE_XP_PER_DAY = 5`
- `STAFF_ACTIVITY_XP_PER_DAY = 5` (max activity bonus, scaled by utilization)
- `STAFF_XP_BASE_PER_LEVEL = 100`

Functions:

- `getStaffXpForLevel(level)` → XP needed to advance `level → level+1` (`STAFF_XP_BASE_PER_LEVEL × level`).
- `getStaffTrainingFee(level)` → cash to promote **from** `level` (`STAFF_TRAINING_BASE_COST × level`,
  same pre-upgrade-level pattern as `getStoreUpgradeCost`).
- `getStaffSkillAfterPromotion(skill)` → `clampScore(skill + STAFF_SKILL_GAIN_PER_LEVEL)`.
- `getStaffSalaryAfterPromotion(salary)` → `round(salary × (1 + STAFF_SALARY_BONUS_PER_LEVEL))`.
- `getStaffDailyXp(utilization)` → `STAFF_BASE_XP_PER_DAY + STAFF_ACTIVITY_XP_PER_DAY × clamp(utilization, 0, 1)`.
- `canPromoteStaff(member)` → `member.level < MAX_STAFF_LEVEL && member.xp >= getStaffXpForLevel(member.level)`.

## Transitions (`src/lib/game/staffing.ts`)

- **`promoteStaff(game, staffId)`**: no-op (returns `game`) unless the member exists, is
  promotable (`canPromoteStaff`), and `game.cash >= getStaffTrainingFee(member.level)`. On
  success: deduct the fee from `cash`, increment `level`, **carry the XP remainder**
  (`xp -= getStaffXpForLevel(oldLevel)`), raise & clamp `skill`, raise `monthlySalary`. One level
  per call (even if XP — capped at one threshold — already meets it).
- **Starter staff** (`createStarterStaffForRole`) and **hired candidates** (`hireCandidate`)
  initialize `level: 1, xp: 0`.

## Daily tick (`src/lib/game/simulateDay.ts`)

After `storeReports` are built (`simulateDay.ts:131-137`) and before the final state is
assembled (`simulateDay.ts:189-207`):

1. For each store, derive **utilization** = `staffLimit > 0 ? clamp(customersServed / staffLimit, 0, 1) : 0`,
   using the per-store `DailyStoreReport` (customers served) and the store's
   `StoreOperationProfile` (`staffLimit`). The `staffLimit > 0` guard avoids division by zero.
2. For each staff member **assigned to that store**, add `getStaffDailyXp(utilization)` to `xp`,
   then **cap `xp` at `getStaffXpForLevel(level)`** so progress cannot be banked across levels.
3. Unassigned staff and staff at non-open stores are unchanged.
4. Inject the updated `staff` array into the returned `GameState`.

Deterministic: XP is a pure function of existing daily-report state; no new RNG draws.

## Persistence (`src/lib/persistence/saveCodec.ts`)

- `validateSavedStaffMember`: validate `level` is an integer in `1..MAX_STAFF_LEVEL` and `xp` is
  a number `>= 0`.
- **Legacy migration**: a staff record missing `level`/`xp` migrates to `level: 1, xp: 0`
  (mirrors the existing store-record migration around `saveCodec.ts:432-451`). No schema version
  bump.

## UI (`StaffPanel.svelte` + `+page.svelte`)

- Show a **Level** badge and **XP progress** (`xp / getStaffXpForLevel(level)`, or "Max" at the
  cap) on each staff card (candidates, unassigned, and assigned store rows).
- Render a **Promote** button when `canPromoteStaff(member)` is true, labeled with the training
  fee (`getStaffTrainingFee(level)`); disabled when `game.cash` is insufficient.
- New `onPromote(staffId)` prop on `StaffPanel`; `+page.svelte` wires it to `promoteStaff` then
  `setGameAndAutosave`. Pass `cash` into the panel for the affordability check.
- Run the Svelte MCP `svelte-autofixer` on the modified component until clean.

## Balance defaults (tunable)

| Lever | Default | Effect at max (L5) |
| --- | --- | --- |
| Max level | 5 | — |
| Skill gain / level | +8 (clamp 100) | +32 skill → ~+13% throughput via `skillMultiplier` |
| XP / day | 5–10 (base + utilization bonus) | ~13 days for L1→2; ~130 days to max |
| Training fee | `2,000 × level` | 20,000 total to max one staffer |
| Salary bump / level | +12% | ~+57% payroll over five levels |

**Known tradeoff:** a high-skill hire (e.g. skill 80) reaches the skill-100 cap after ~2–3
promotions, so over-promoting elite staff wastes the fee and salary increase with no skill gain.
This is intentional strategic depth (don't over-level already-elite staff), not a bug.

## Testing

- **New `staffLeveling.spec.ts`** — curve/helper functions: XP thresholds, training fee,
  skill-gain clamp at 100, salary bump rounding, daily-XP utilization scaling, `canPromoteStaff`
  edge cases (at max level, below/at threshold).
- **`staffing.spec.ts`** — `promoteStaff`: deducts fee, increments level, carries XP remainder,
  raises & clamps skill, raises salary; rejects when ineligible (not promotable / at max /
  insufficient cash); starter staff and hires start at `level: 1, xp: 0`.
- **`simulateDay.spec.ts`** — assigned staff gain XP (base + activity), unassigned do not, XP is
  capped at the next threshold, and results are deterministic across identical seeds.
- **`saveCodec.spec.ts`** — round-trip with `level`/`xp`; legacy staff migrate to `level: 1,
  xp: 0`; validation rejects out-of-range `level` and negative `xp`.
- **`StaffPanel.svelte.spec.ts`** — renders level/XP, shows/hides Promote by eligibility and
  affordability, fires `onPromote` with the staff id.

## Out of scope

- Changes to morale mechanics.
- A dedicated level-based revenue multiplier (explicitly rejected in favor of the single
  skill channel).
- Leveling for hiring candidates before they are hired.
- Auto-promotion (promotion is always player-initiated).
