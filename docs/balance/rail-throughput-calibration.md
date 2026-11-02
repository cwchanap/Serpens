# HPA-679 rail-throughput calibration (Step 6 blocking gate)

**Status: measured.** This report captures the multi-seed economy, cost and
progression calibration for the rail-throughput rebalance
(`RAIL_UNITS_PER_LEVEL = 10`, the free-warehouse-space rail surplus-push cap,
the final→process→raw push-phase order, and the Step 4 scenario re-pins),
measured on HEAD `d28cb32d` of
`docs/hpa-679-rail-throughput-balance`. It is the comparison partner for
`baseline.md` and `after.md` (both untouched, measured-only HPA-502 records).

- **Gate A overall: PASS (5/5)** at both k=1 (control) and k=10 (candidate) on
  the full approved matrix — 50 seeds × 9 bot/archetype combos × 365 days.
- **All 400 non-advisor runs are byte-identical between the two factors** —
  the k factor cannot be reached without building rail, so every
  idle/retail-steady measurement is an unchanged control.
- **Provisional ≥3% local-to-import target: met** — 4.34% aggregate,
  3.70%–5.78% per seed, on the historical-compatible
  post-rail-local / whole-run-all-product-imports definition only.
- **Profitability, honestly:** k=10 does not make the advisor's convenience
  operation profitable (median end cash ≈ −46k both factors). The isolated
  rail-supply effect is modestly cash-*positive* (+$1,680/seed), but
  expansion-timing side effects (earlier store-3 openings) dominate end-cash
  deltas exactly as the review warned — see §5.
- **Progression: hard pass** — zero idle claims, zero earned-unclaimed at both
  factors; bidirectional pacing shifts spanning −105…+98 days on nine
  material runs fully disclosed with trace-probe mechanism evidence in §7
  for review accept/reject.
## 1. Runs, exact commands, determinism — full reproduction recipe

Every fenced block in this section is executable as written from a clean
checkout of this commit: no placeholders, no comment-only steps, and the
whole sequence parses under `bash -n`. The committed harness is
`tests/balance/`; every scratch collector/analyzer is embedded verbatim in
**Appendix A** (save them under the `$STEP6` path below — or any directory
exactly four levels below the repo root — so the `../../../../tests/balance/*`
imports resolve; `.superpowers/` is git-ignored). Evidence paths shown are
the recorded ones; any equivalent destination works — see the *recorded vs
equivalent* note in §1.6.

```bash
# Environment for everything below — captured, quoted repo root (no
# placeholders): run from anywhere inside this worktree.
ROOT="$(git rev-parse --show-toplevel)" && cd "$ROOT"
SEEDS=20260501,20260502,20260503,20260504,20260505,20260506,20260507,20260508,20260509,20260510,20260511,20260512,20260513,20260514,20260515,20260516,20260517,20260518,20260519,20260520,20260521,20260522,20260523,20260524,20260525,20260526,20260527,20260528,20260529,20260530,20260531,20260532,20260533,20260534,20260535,20260536,20260537,20260538,20260539,20260540,20260541,20260542,20260543,20260544,20260545,20260546,20260547,20260548,20260549,20260550
STEP6=.superpowers/sdd/2026-10-31-rail-throughput-balance/step6
EV=$STEP6/evidence
RAIL=src/lib/game/rail.ts
mkdir -p "$EV" "$STEP6/trace-probes"
```

### 1.1 k=1 control factor — guarded switch, auto-revert

Both factors use the **same committed harness** (`tests/balance/`),
unchanged HPA-502 bot code, and the same warehouse-cap code path; the only
difference is the single committed literal `RAIL_UNITS_PER_LEVEL` in
`src/lib/game/rail.ts` (line 8). The control window below is executable: a
guard refuses to run over a dirty `rail.ts` or unexpected source, the
subshell restores the committed literal on **any** failure or
interruption, and a post-window check proves the tree is clean and stops
the recipe if the window exited nonzero:

```bash
# no-preexisting-change guard: refuse if rail.ts is already dirty
# (unstaged or staged) or the expected committed literal is absent.
git diff --quiet -- "$RAIL" && git diff --cached --quiet -- "$RAIL" \
  || { echo "ABORT: $RAIL has pre-existing changes"; exit 1; }
grep -q 'RAIL_UNITS_PER_LEVEL = 10;' "$RAIL" \
  || { echo "ABORT: expected 'RAIL_UNITS_PER_LEVEL = 10;' in $RAIL"; exit 1; }

set_factor() { # set_factor <1|10>: rewrite the one literal, then verify it
	perl -pi -e "s/RAIL_UNITS_PER_LEVEL = (?:1|10);/RAIL_UNITS_PER_LEVEL = $1;/" "$RAIL" \
	  && grep -q "RAIL_UNITS_PER_LEVEL = $1;" "$RAIL"
}

(                                           # subshell: failures stay inside
	set -e                                  # abort the window on first error
	trap 'set_factor 10' EXIT               # auto-revert on ANY exit reason
	# Bash 3.2 can skip the EXIT trap on untrapped-signal death and defers a
	# trapped signal until a FOREGROUND child exits — so catch HUP/INT/TERM
	# explicitly, TERM the in-flight job, and exit nonzero (invoking EXIT).
	# Commands run as "& wait" so the trap fires DURING the wait, not after
	# the child finishes. Verified under system bash 3.2.57: SIGINT/SIGTERM/
	# SIGHUP to the subshell or its process group each revert in ~1s and
	# propagate exit 130/143/129 respectively; a mid-window command failure
	# propagates its own nonzero status the same way.
	trap 'kill -TERM "$!" 2>/dev/null; exit 129' HUP
	trap 'kill -TERM "$!" 2>/dev/null; exit 130' INT
	trap 'kill -TERM "$!" 2>/dev/null; exit 143' TERM
	set_factor 1
	bun tests/balance/run.ts --seeds $SEEDS --days 365 --bots idle,retail-steady,advisor --output "$EV/sweep-k1" &
	wait "$!"
	bun tests/balance/progressionRun.ts --seeds $SEEDS --days 365 --output "$EV/progression-k1" &
	wait "$!"
	bun "$STEP6/bucket-probe.ts" "$EV/buckets-k1.json" &
	wait "$!"
	# k=1 side of the §7 trace-probe set (one invocation per seed/archetype):
	bun tests/balance/progressionRun.ts --seeds 20260539 --days 365 --archetypes convenience --trace "$STEP6/trace-probes/20260539-convenience-k1.json" &
	wait "$!"
	bun tests/balance/progressionRun.ts --seeds 20260537 --days 365 --archetypes convenience --trace "$STEP6/trace-probes/20260537-convenience-k1.json" &
	wait "$!"
	bun tests/balance/progressionRun.ts --seeds 20260508 --days 365 --archetypes convenience --trace "$STEP6/trace-probes/20260508-convenience-k1.json" &
	wait "$!"
	bun tests/balance/progressionRun.ts --seeds 20260504 --days 365 --archetypes grocery --trace "$STEP6/trace-probes/20260504-grocery-k1.json" &
	wait "$!"
)
k1_status=$?    # nonzero => window interrupted or a command failed
# trap already restored the committed literal — prove it, then stop the
# recipe so an aborted window can't spill into §1.2's candidate steps:
grep -q 'RAIL_UNITS_PER_LEVEL = 10;' "$RAIL" && git diff --quiet -- "$RAIL" \
  || { echo "REVERT FAILED: $RAIL still modified"; exit 1; }
[ "$k1_status" -eq 0 ] \
  || { echo "ABORT: k=1 window exited $k1_status — fix and rerun the window"; exit "$k1_status"; }
```

The recorded run used exactly this window (edit applied, three artifact
generators + the k=1 trace probes, inverse edit verified); `git diff` was
empty and HEAD `d28cb32d` throughout — the tracked tree contains no control
hack. Output-side discriminator: k=1 artifacts show
`advisorChain.localDeliveryUnits` = 336/seed (3,360 at k=10).

### 1.2 k=10 candidate factor (committed tree as-is)

```bash
grep -q 'RAIL_UNITS_PER_LEVEL = 10;' "$RAIL" \
  || { echo "ABORT: committed factor is not 10 — k=1 window residue"; exit 1; }
bun tests/balance/run.ts --seeds $SEEDS --days 365 --bots idle,retail-steady,advisor --output "$EV/sweep-k10"
bun tests/balance/progressionRun.ts --seeds $SEEDS --days 365 --output "$EV/progression-k10"
bun "$STEP6/bucket-probe.ts" "$EV/buckets-k10.json"
# k=10 side of the §7 trace-probe set:
bun tests/balance/progressionRun.ts --seeds 20260539 --days 365 --archetypes convenience --trace "$STEP6/trace-probes/20260539-convenience-k10.json"
bun tests/balance/progressionRun.ts --seeds 20260537 --days 365 --archetypes convenience --trace "$STEP6/trace-probes/20260537-convenience-k10.json"
bun tests/balance/progressionRun.ts --seeds 20260508 --days 365 --archetypes convenience --trace "$STEP6/trace-probes/20260508-convenience-k10.json"
bun tests/balance/progressionRun.ts --seeds 20260504 --days 365 --archetypes grocery --trace "$STEP6/trace-probes/20260504-grocery-k10.json"

# determinism check — first outputs aside, rerun the IDENTICAL command, cmp:
cp "$EV/sweep-k10.json" "$EV/sweep-k10-run1.json"
cp "$EV/sweep-k10.md" "$EV/sweep-k10-run1.md"
bun tests/balance/run.ts --seeds $SEEDS --days 365 --bots idle,retail-steady,advisor --output "$EV/sweep-k10"
cmp "$EV/sweep-k10-run1.json" "$EV/sweep-k10.json" \
  && cmp "$EV/sweep-k10-run1.md" "$EV/sweep-k10.md" \
  && echo "determinism: sweep JSON + MD byte-identical"
```

Each sweep emits `<output>.json` + `<output>.md` (450 runs: 400
idle/retail-steady + 50 advisor); each progression run emits only
`<output>.json` (200 progression + 200 idle controls — progressionRun.ts
writes no Markdown); the
bucket probe emits one JSON with 50 per-seed advisor cost buckets
(payroll, gross revenue, retail/industrial `importSpend`, production
`operatingCost`/`overflowCost`/`overflowUnits`, opening days, cash/debt
extrema — the §§5.2–5.4 inputs the sweep JSON does not persist; its
optional `[seedsCsv]` arg exists only for lightweight checks, see A.1).

### 1.3 Legacy frozen-artifact reconstruction (for §2 comparisons)

Non-worktree snapshots inside the ignored plan workspace — no branch, no
worktree, no checkout of real history. Both recorded invocations:

```bash
for SHA in 0ce5db7e 5a13a1e8; do
	SNAP="$STEP6/legacy-$SHA"
	rm -rf -- "$SNAP"
	mkdir -p "$SNAP"
	git archive "$SHA" | tar -x -C "$SNAP"
	ln -sfn "$ROOT/node_modules" "$SNAP/node_modules"
	mkdir -p "$SNAP/.svelte-kit"
	cat > "$SNAP/.svelte-kit/tsconfig.json" <<'TSEOF'
{
	"compilerOptions": {
		"paths": { "$lib": ["../src/lib"], "$lib/*": ["../src/lib/*"] },
		"moduleResolution": "bundler",
		"module": "esnext",
		"target": "esnext",
		"verbatimModuleSyntax": true,
		"isolatedModules": true,
		"noEmit": true,
		"types": ["node"]
	},
	"include": ["../src/**/*.ts", "../tests/**/*.ts"]
}
TSEOF
	(cd "$SNAP" && bun tests/balance/run.ts --seeds $SEEDS --days 365 --bots idle,retail-steady,advisor --output "$ROOT/$EV/legacy-$SHA-sweep")
done
```

(The snapshot's harness imports only `src/lib/game/*` + `tests/balance/*`,
so the `.svelte-kit` shim exists solely to satisfy the `$lib` path alias —
no Svelte/`$app` module is loaded.)

### 1.4 Analysis and comparison commands

All six analyzers are embedded in Appendix A at the `$STEP6` paths used
below:

```bash
# Analyzer failures must not hide behind tee's exit 0: -e stops the recipe
# on the first failure and pipefail makes each | tee pipeline return the
# analyzer's own nonzero status.
set -e -o pipefail
# §3 non-advisor byte-identity + §4 Gate A verdicts + §5.1 advisor aggregates:
bun "$STEP6/analyze-sweep.ts" "$EV/sweep-k1.json" "$EV/sweep-k10.json" | tee "$EV/analyze-k1-vs-k10.txt"
# §2/§4 gate evaluation incl. the legacy 0ce5db7e schema:
bun "$STEP6/gate-eval.ts" "$EV/legacy-0ce5db7e-sweep.json" "$EV/legacy-5a13a1e8-sweep.json" "$EV/sweep-k1.json" | tee "$EV/gate-eval-legacy-k1.txt"
# §2 legacy-vs-new field projection diff:
bun "$STEP6/legacy-compare.ts" "$EV/legacy-0ce5db7e-sweep.json" "$EV/sweep-k1.json" | tee "$EV/legacy-0ce5db7e-vs-k1.diff.txt"
bun "$STEP6/legacy-compare.ts" "$EV/legacy-5a13a1e8-sweep.json" "$EV/sweep-k1.json" | tee "$EV/legacy-5a13a1e8-vs-k1.diff.txt"
# §7 progression paired-delta table:
bun "$STEP6/progression-compare.ts" "$EV/progression-k1.json" "$EV/progression-k10.json" | tee "$EV/progression-compare.txt"
# §§5.2–5.4 cost-bucket aggregate table + opening-days + per-seed pivot:
bun "$STEP6/buckets-compare.ts" "$EV/buckets-k1.json" "$EV/buckets-k10.json" | tee "$EV/buckets-compare.txt"
# artifact hashes (must match §1.6):
shasum -a 256 "$EV/sweep-k1.json" "$EV/sweep-k10.json" "$EV/legacy-0ce5db7e-sweep.json" "$EV/legacy-5a13a1e8-sweep.json"
```

### 1.5 Scenario suite and affected E2E (committed k=10 tree only)

```bash
bun run test:unit -- src/lib/scenarios/runtime.spec.ts --run
bunx playwright test src/routes/retail-sim.e2e.ts -g "player builds convenience production and refills from city inventory|rail-fed production connects two industrial buildings|challenge completes Two-City Supply Run|challenge fails at the deadline and shows objective evidence"
```

### 1.6 Determinism and artifact hashes

The executable determinism check is in §1.2: the k=10 sweep ran **twice
under byte-identical CLI arguments** (including the `--output`
destination); the first outputs were copied aside to
`sweep-k10-run1.{json,md}` and `cmp` found both the JSON and the Markdown
byte-identical. Artifact SHA-256:

| artifact | SHA-256 |
| --- | --- |
| k=1 sweep JSON | `1e5db455efb75eb8a818f9c3e2ed57c064775a00470f89ee14682d7e24c804ca` |
| k=10 sweep JSON (both runs) | `4316864215fa3a071515deebf7d8acd5d48cca3065e96a4c620ac0eb50f36f6c` |
| regenerated HPA-502 after-sweep @ `0ce5db7e` | `c1b627bca4cbc5dff359ae7f599aa6e1107556cd269bc130a4aebc8761c1b426` |
| regenerated sweep @ `5a13a1e8` (HPA-502 tip) | `3cf0fbdf10fe235df27a5659c0a1779eaee738dc67e06bd4e5bdec951296e11e` |

**Recorded args vs equivalent destinations:** the sweep/progression JSON
embeds only `config.seeds`/`config.days`/`config.archetypes` — never the
output path — so **any `--output` destination yields byte-identical JSON**
and the hashes above are reproducible from §1.1–1.3 verbatim. The sweep
`.md` sidecar, by contrast, interpolates the literal `--output` argument
into its "Regenerate" line, so reproducing the recorded `.md` bytes
requires the recorded destination (`$EV/sweep-k10`); a different
destination produces a `.md` differing only in that line.

Artifacts (git-ignored) under
`.superpowers/sdd/2026-10-31-rail-throughput-balance/step6/` —
`evidence/sweep-k1.{json,md}`, `evidence/sweep-k10.{json,md}` +
`evidence/sweep-k10-run1.{json,md}`, `evidence/buckets-{k1,k10}.json`,
`evidence/progression-{k1,k10}.json`, `evidence/legacy-0ce5db7e-sweep.*`,
`evidence/legacy-5a13a1e8-sweep.*`, comparison outputs
(`evidence/analyze-k1-vs-k10.txt`, `evidence/buckets-compare.txt`,
`evidence/progression-compare.txt`, `evidence/gate-eval-legacy-k1.txt`,
`evidence/legacy-*-vs-k1.diff.txt`), and the §7 mechanism probes
`trace-probes/20260504-grocery-k{1,10}.json`,
`trace-probes/20260{508,537,539}-convenience-k{1,10}.json`.
## 2. Historical-comparison method (legacy projection)

The HPA-502 after-sweep JSON was **regenerated and hash-verified**: `git
archive 0ce5db7e` into a scratch snapshot inside the ignored plan workspace
(no branch/worktree, no checkout of real history, `node_modules` symlinked),
then the same sweep command. The output's SHA-256 equals the `c1b627bc…`
value documented in `after.md` — the regenerated file **is** the frozen
legacy per-run artifact, not an approximation.

Two schema-era comparisons were then computed field-by-field:

| comparison | result |
| --- | --- |
| new-schema k=1 control vs `5a13a1e8`-era sweep (legacy projection: drop the five Step-5 `advisorChain` fields) | **450/450 runs identical, 0 value mismatches** |
| new-schema k=1 control vs documented `0ce5db7e` artifact (additionally projects `operatingIncomeByDay`, `postRailObservedDays`, and the pre-`5a13a1e8` `localDeliveryUnits` definition) | 315/450 identical; **135 managed runs differ** — all HPA-502 *post-docs review fixes* landed between `0ce5db7e` and `5a13a1e8` (`e4a928f8` capped-availability yield, `cf79f5c0` staffing/forecast, `1c5244e9`, etc.). Deltas are small (e.g. cumulative import spend +38 on ~101k, cash ±100–300, missedDemandShare ~±0.0002); **no gate item flips**. |

**Disclosed consequence:** the current-HEAD k=1 control reproduces the
HPA-502 *branch-tip* measured economy exactly, and reproduces the *documented*
`after.md` economy modulo HPA-502's own post-docs review fixes — nothing in
HPA-318 or the HPA-679 implementation itself moved any shared measured field.
Raw cross-schema JSON bytes were never compared; every claim above projects
the legacy field set explicitly.

## 3. Non-advisor byte-identity (the control's validity check)

Per the plan: the 400 idle/retail-steady runs (no bot builds rail) were
compared run-object-by-run-object between the k=1 and k=10 sweep JSONs under
the identical new schema.

**Result: 400/400 byte-identical, zero mismatches.** Every Gate A input that
is not rail-adjacent is provably unchanged; all differences below are
confined to the 50 convenience/advisor runs.

## 4. Gate A repeat (HPA-502 5/5) — both factors

| # | item | k=1 control | k=10 candidate | rail-sensitive? |
| --- | --- | --- | --- | --- |
| 1 | viability (30d positive operating-income window ending ≤ day 90, retail-steady) | PASS — convenience 42/50 (84.0%), boutique 50/50, electronics 41/50 (82.0%), grocery 50/50 | **identical** | no — byte-identical inputs |
| 2 | boundedness (<1e9 on max \|cash\|, principal, cumulative imports, waste) | PASS — max \|cash\| 722,959; principal 14,000; imports 1,582,909; waste 5,336u/5,336 (seed 20260532 electronics/retail-steady worst) | **identical** | no |
| 3 | managed-vs-idle (days 61–90 operating income) | PASS — 200/200 pairs (50/50 each archetype) | **identical** | no |
| 4 | forecast ±25% of realized | PASS — 712/712/716 eligible (excl. 4 incomplete, 200 idle) | PASS — **714/714/717** eligible (excl. 3 incomplete, 200 idle) | yes — advisor openings only; detail below |
| 5 | advisor served-chain composite | PASS — 50/50; 50 construction-sequencing pauses days 18–29; 0 repeated unapplied | PASS — **identical shape** (50/50; same pause windows; 0 unapplied) | yes — see §5 |
| 6 | scenario guardrails | measured by scenario suite | **79/79 spec tests** — all 14 reference/no-action intents | yes — see §6 |

Gate-A item-level notes:

- **Forecast (item 4) is the only metric whose counts moved:** advisor store-3
  openings shifted earlier — seed 20260526 day 360→329 and 20260533 day
  357→328 now complete the 14-day observation window (+2 complete), and seed
  20260532 gained a store-3 opening day 357 (+1 eligible, still incomplete).
  Pass share stays 100%.
- **Advisor (item 5) legs are unchanged in verdict:** every run still builds
  producer day 1 / day 8, warehouse day 15, applies `connect-rail` days 22
  and 29 (`lastRailDay` uniformly 29 at both factors), produces with **0
  zero-output days after the last rail** over uniformly 336 post-rail
  observed days, delivers ≥1 local unit, and repeats 0 unapplied
  recommendations. What changed is delivery *volume* (§5), not the composite.
- **First positive 30-day windows (advisor runs, informational only — this is
  not the Gate A item-1 metric, which is retail-steady-only and unchanged
  above):** **42/50 advisor runs reach a positive 30-day window at each
  factor**; the same eight seeds — 20260511, 20260513, 20260515, 20260521,
  20260523, 20260525, 20260546, 20260548 — never reach one at either factor
  (the weak-city convenience set already documented as the viability misses
  in `after.md`). Among the 42 reached windows, **39 keep identical window
  days** (with operating income ~$72–144 lower — the extra production
  operating cost sits inside `operatingIncome` while `operatingCashFlow`
  rises ~$136–240 on the import savings) and **3 slide exactly one day
  later**: 20260506 (28–57→29–58), 20260508 (27–56→28–57), 20260544
  (27–56→28–57). No window becomes negative and no unreached window becomes
  reached; the two factors have identical reach sets.

## 5. Advisor rail share and cost buckets

### 5.1 Local deliveries vs the three import denominators

| measure | k=1 | k=10 |
| --- | --- | --- |
| post-rail local bottled-water deliveries (summed over 50 advisor runs) | 16,800u (336/seed, uniform) | **168,000u (3,360/seed, uniform)** |
| retail imported units — all products, whole run | 4,018,937u | 3,874,400u (−144,537) |
| retail imported units — bottled water, whole run | 2,498,622u | 2,339,807u (−158,815) |
| retail imported units — bottled water, post-rail window | 2,380,054u | 2,221,239u (−158,815) |
| **local-to-all-import ratio** (historical-compatible: local / all-product imports) | 0.4180% | **4.3362%** |
| **matched post-rail bottled-water local fraction** (local / (local + post-rail water imports)) | 0.7009% | **7.0315%** |
| rail shipments (count / units) | 33,650 / 33,650u | 33,650 / **336,500u** |

Per-seed spread (all 50 advisor runs): `localDeliveryUnits` is uniform
3,360/seed (exactly the level-1 bottler's 10/day recipe over 336 post-rail
days — the chain is output-capped, not rail-capped, at k=10). Per-seed
local-to-all-import ratio **3.70%–5.78%** (median 4.28%); per-seed matched
water fraction **6.44%–11.11%** (median 6.69%). The named review seed
20260503 reproduces exactly: 336→3,360 local units, all-product imports
80,233→77,207, water imports 52,725→49,734, post-rail 50,317→47,326 —
byte-equal to the Step-0 probe values.

**Provisional ≥3% target: met on the aggregate and on every seed.** Note the
scope per the plan ruling: the ratio is post-rail local units over
*whole-run all-product imports* — an import-only denominator, never total
supply; the honest matched-window water fraction is 7.03%. Side effect worth
disclosing: non-water imports *rose* ~14.3k units at k=10 (all-product drop
144,537 < water drop 158,815); every produced unit is still consumed and no
run overflowed.

### 5.2 Cost buckets, same seed/window (50 advisor runs, summed)

| bucket (365d sum) | k=1 | k=10 | Δ |
| --- | --- | --- | --- |
| gross retail revenue | 26,804,152 | 26,868,228 | +64,076 |
| retail `importSpend` | 5,539,252 | 5,408,993 | −130,259 |
| industrial `importSpend` | 5,000 | 5,000 | 0 |
| `productionReport.operatingCost` | 272,700 | 339,900 | +67,200 |
| `productionReport.overflowCost` / units | 0 / 0u | 0 / 0u | 0 |
| payroll | 14,746,745 | 14,895,196 | +148,451 |
| operating income | −1,266,733 | −1,490,290 | −223,557 |
| interest accrued | 10,654 | 10,603 | −50 |
| end cash (sum of final-day cash) | −2,080,686 | −2,176,648 | −95,962 |
| end debt (outstanding principal) | 41,429 | 41,033 | −396 |
| first negative-cash day | identical on all 50 seeds | | |
| produced bottled water | 21,800u | 173,000u | +151,200 |
| warehouse-overflow cost | 0 | 0 | 0 |

### 5.3 Timing attribution — the review's F5 trap, at scale

End-cash deltas are **not** a clean rail-savings signal, and are decomposed
here exactly as the review required:

- **23/50 seeds: identical opening days.** Every one of them improves end
  cash by **+$1,548…+$1,681** (dominantly +$1,680) — the *isolated* rail
  economy effect: −$3,024 retail import spend vs +$1,344 production
  operating cost per seed (payroll Δ = 0). This is the "~+$1.7k" effect the
  review predicted, and it is **positive**, not a deficit.
- **27/50 seeds: store-3 opens earlier at k=10** (1–31 days; e.g. 20260503
  300→299, 20260517 143→119, 20260526 360→329), and **20260532 opens a
  store-3 that never existed at k=1** (day 357). Earlier openings add
  payroll days immediately (per-seed payroll deltas −8,393…+21,674;
  +$10–11k on the common −1-day cases like 20260503 +11,108), which swamps
  the +$1.7k: per-seed end-cash deltas on shifted seeds span
  **−32,376 (20260532, the new opening) to +8,043**. 36 seeds end better, 14
  worse; median Δ +1,680, mean Δ −1,919.
- Cause: the ~$3k/yr import saving lifts the cash trajectory just enough for
  the expansion playbook's cash-safety check to pass earlier — a real
  pacing side effect, priced here honestly. On the named review seed:
  end cash −35,970→−45,611 (−9,641) = payroll +11,108 (day-299 opening) +
  operating −12,670 vs import savings −3,061 — matching the review's
  day-299-vs-300 mechanism exactly.

### 5.4 Profitability verdict (volume, not assumed profit)

- **Import replacement vs production cost:** the extra 151,200 delivered
  local units displace 158,815 imported water units (−$130,259 net import
  spend after the +14.3k-unit non-water rise) against +$67,200 production
  operating cost — net external-spend effect ≈ **+$63k over 50 runs**, i.e.
  local supply is cheaper at the margin in this configuration.
- **But k=10 does not make the operation profitable:** median advisor end
  cash −46,386 → −46,750; aggregate operating income −1,266,733 → −1,490,290
  (driven by expansion timing + payroll, not by the chain itself; on
  unchanged-timing seeds the chain's operating-income delta is −$1,344/seed
  while operatingCashFlow improves). The ticket promised local-supply
  volume; it did not promise a profitable industry chain, and the measured
  deficit-vs-savings split is recorded here rather than inferred from end
  cash.

## 6. Scenario guardrails (14 intents) and affected E2E

`bun run test:unit -- src/lib/scenarios/runtime.spec.ts --run` → **79/79
pass** on the committed tree: all seven scenarios' reference traces stay
gold, all seven no-action traces stay below silver, and both no-action
failures fire on the authored `dayLimit` with `negative-cash` inactive (no
early runaway-overflow failure). The two Step-4 re-pins are load-bearing and
verified again here: local-lifeline reference completes day 8, score 1,000,
gold; two-city no-action fails at the day-21 deadline with **$0 overflow and
0 pushes** (the seeded-full warehouse blocks every push under the cap — vs
the k=1-era $2,100 trickle). Unrelated scenarios are unchanged.

Focused Playwright re-verification of the four rail-sensitive journeys →
**4/4 pass** (Two-City logistics-panel gold 960; local-lifeline deadline
journey; sandbox production-and-refill; rail-fed pull-producer journey with
`postRailImportedFlour = 0` and `Produced` status).

## 7. Progression matrix (hard pass + disclosed pacing shift)

50 seeds × 4 archetypes × {progression, idle} = 400 runs per factor.

The final→process→raw push-phase order was added after the first recorded
matrix and both factors were re-measured under it: sweep advisor runs, cost
buckets and all eight §7 trace probes are byte-identical to the earlier
record, while the progression artifacts differ only in boutique scalar fields
(`finalCash`, `finalLocalUnits`, `finalBookValue`, `peakBookValue`,
`totalBorrowed`, `totalRepaid` — 46/50 boutique runs at each factor). Claim
sets, claim days, reach-status flips and every named outlier below are
unchanged; only the credit summary moved.

**Hard gates (both factors):**
- idle: **200/200 zero-claim runs, 0 earned-unclaimed** (the control's real
  check), identical peak book value max 42,218.
- tier-1 non-decorative: idle peak 42,218 < 70,000 target at both factors.
- Every progression run's claims are contiguous, unique, in tier order with
  nondecreasing claim days at both factors (0 violations in 400 runs).
- Claim/save invariants unchanged — no claim-count anomalies.

**Per-tier claim distributions (reached runs; unreached reported
distinctly):**

| tier | reached k1→k10 | p10 | median | p90 | max |
| --- | --- | --- | --- | --- | --- |
| local-shop | 184/200 → 184/200 | 30 → 30 | 56.5 → 56.5 | 240 → 238.7 | 360 → 358 |
| neighborhood-chain | 161/200 → **163/200** | 43 → 43 | 50 → 52 | 295 → 267 | 358 → 358 |
| regional-supplier | 61/200 → **63/200** | 85 → 85 | 204 → 204 | 330 → 328.6 | 358 → 358 |
| multi-city-operator | 0/200 → 0/200 (never claimed) | — | — | — | — |
| market-leader | 0/200 → 0/200 (never claimed) | — | — | — | — |

Never-claimed by archetype: local-shop convenience 16 (unchanged);
neighborhood-chain convenience 35→33, grocery 4→4; regional-supplier
convenience 35→33, boutique 50→50, electronics 50→50, grocery 4→4; tiers 4–5
never claimed by any run at either factor (365-day ceiling, unchanged).

**Disclosed pacing shift (for reviewer accept/reject):** 48/200 runs have
claim-day differences. **The paired reached-tier delta range is −105 to
+98 days**, not a uniformly small jitter — and it is bidirectional:

- **Nine runs shift a reached tier by more than 30 days.** Every one is the
  neighborhood-chain + regional-supplier pair moving together (claims form
  a contiguous prefix, so the pair always shares a claim day):
  convenience 20260539 (323→218, −105), 20260519 (323→225, −98),
  20260544 (295→197, −98), 20260547 (204→149, −55), 20260517 (204→170, −34)
  on the favorable side; convenience 20260537 (232→330, **+98**),
  20260508 (232→323, **+91**) and grocery 20260504, 20260509 (both
  85→120, **+35**) on the adverse side.
- **Reach-status changes (reached ↔ unreached):** four runs gain the pair —
  grocery 20260501@232, convenience 20260502@239, 20260504@260,
  20260516@281 — and two lose it — grocery 20260538 (358→unreached),
  convenience 20260550 (260→unreached). Both losses are blocked on
  `neighborhood-chain-store-count` alone at k=10 (store-3 was never opened;
  `regional-supplier`'s goal list is empty on those runs — its 4-city and
  25-local-unit goals all pass, it is held only by the contiguous-prefix
  rule). Net reached counts: 161→163 and 61→63.
- The remaining 33 diffed runs are ±1–28-day movements, mostly tier-1
  `local-shop` claim days (56.5 median at both factors).

**Mechanism — observed, not hypothesized:** paired `--trace` probes were run
on four extreme seeds at both factors (artifacts
`step6/trace-probes/<seed>-<archetype>-k{1,10}.json`, generated by the
probe invocations inside the §1.1/§1.2 factor windows; seeds 20260539,
20260537, 20260508 convenience and 20260504 grocery). In every
trace, the NC+RS pair claims on the **same in-game day the bot's
`openStore` action for store-3 (campus-junction, ~$22.5–23.4k) applies** —
tier-2's binding goal is `neighborhood-chain-store-count ≥ 3`, while
tier-3's goals (4 opened cities, ≥25 local units) are already satisfied by
that day, so the pair claims in one tick. The k=1↔k=10 divergence is a
different **purchase ordering**: `openWorldCity garden-borough` costs
$28,000 and competes with store-3 for the same credit window.

- **Later claims (k=10 adverse):** at k=10 the bot buys garden-borough
  *before* store-3 (20260537: city @239 → store @330; 20260508: city @232 →
  store @323; grocery 20260504: city @85 → store @120). At k=1 the same
  seeds open store-3 first and the pair claims ~35–98 days earlier.
- **Earlier claims (k=10 favorable):** at k=1 the bot buys the extra city
  first (20260539: garden-borough @232 → store-3 @323); at k=10 it never
  buys the city (opened-city count 5→4) and store-3 lands @218. All five
  favorable >30-day seeds show the 5→4 cities signature; the adverse seeds
  show the bought-the-city-first signature — 4→5 city count on 20260537,
  20260508 and 20260509, and a same-count ordering swap verified in the
  20260504 trace (city @85 → store @120 vs store @85 → city @120).
- The two lost-pair runs (20260538-grocery, 20260550-convenience) show the
  same signature taken further: at k=10 the bot's purchases never reach
  store-3 at all within 365 days (`storeCount` 3→2).

**Correction of the previously implied cause:** *no* tier-2 goal consumes
local deliveries — tier 2 checks store-count ≥3, max-store-level ≥2 and
opened-city-count ≥3 (`src/lib/game/progression.ts` goals), and the only
rail-fed goal in the ladder, tier-3 `regional-supplier-local-units` ≥25u,
is met early at **both** factors (336u and 3,360u cumulative — it is the
recorded blocker only for the 100 boutique/electronics runs, identically at
both factors). **The pacing deltas are therefore a second-order cash-side
effect, not goals being fed faster by rail volume.** The observed
perturbation path is consistent with §5.3: the ~+$1.7k/yr rail margin
(changed import spend vs production operating cost) shifts weekly cash by
tens of dollars, which moves which of the bot's 7-day-cadence reserve
checks passes first — i.e., whether the $28k city or the ~$23k store-3 is
bought first. That upstream link (margin → weekly reserve → buy order) is
*interpretation consistent with the measured buckets*; the purchase-order
differences themselves are directly observed in the paired traces.
Tier-1 `local-shop` (store-count ≥2 + peak-book-value ≥$70k) shifts are
peak-book-value crossing dates moving under the altered debt/asset path —
observed via `peakBookValue` field changes; the exact decomposition is not
claimed.

Credit usage is materially unchanged (2,144→2,143 borrows;
$26.78M→$26.76M). No progression threshold, goal, or bot policy was
touched — the shift is the unchanged authored ladder read by the unchanged
progression bot under a perturbed cash trajectory.

**Assessment for fresh review (accept/reject input):** hard gates all pass;
the effect is confined to expansion *ordering* on 9 >30-day reached shifts
+ 6 reach-status flips + 33 smaller shifts of 200 runs, is bidirectional
with both favorable (−105d) and adverse (+98d) named outliers, and no
threshold/bot was retuned. The adverse cases are
fully explained by the bot choosing a $28k city opening before store-3 —
the same discrete choice the margin perturbation can push either way.
Whether this magnitude of bidirectional pacing shift is acceptable for the
authored 365-day matrix is deferred to the reviewer.

## 8. Limitations and disclosures

1. The frozen `0ce5db7e` artifact predates HPA-502's own post-docs review
   fixes; comparisons to `after.md`'s documented numbers use it, while the
   authoritative same-schema control is the HEAD k=1 run (identical to the
   `5a13a1e8`-era economy on every shared field).
2. `localDeliveryUnits` changed definition at `5a13a1e8` (all-products
   whole-run → bottled-water post-rail); measured values coincide on this
   matrix (only post-rail bottled water is ever delivered), so projected
   comparisons remain valid and are labeled.
3. The import denominator is import-only; neither ratio claims a share of
   total supply. The 3% bar is provisional for that single definition.
4. Advisor findings are one chain shape (convenience bottled water on the
   authored advisor policy): an output-capped level-1 chain where k=10
   saturates the recipe. The +$1,680/seed margin effect is measured, not
   extrapolated to other chains.
5. End-cash deltas are reported with timing attribution per F5; no profit
   claim was inferred from them.
6. Progression pacing deltas are recorded for independent reviewer
   acceptance; no thresholds or bots were retuned, and tiers 4–5 remain
   unreached at both factors under the 365-day matrix.


## Appendix A — Executable helper recipes (verbatim sources)

The six scratch helpers §1 references are reproduced below **verbatim**
(the exact sources on disk in the recorded workspace; `bucket-probe` gained
an optional `[seedsCsv]` argument for lightweight checks — its no-argument
behavior and output are unchanged). Save each under
`.superpowers/sdd/2026-10-31-rail-throughput-balance/step6/` — or any
directory **exactly four levels below the repo root**, since four of the
six resolve the committed harness via `../../../../tests/balance/*`
(`legacy-compare` and `buckets-compare` are path-agnostic). Anything
under `.superpowers/` is git-ignored, so placing them there keeps the
tracked tree clean. No committed file is added or modified; a clean
checkout plus these six files reproduces §§2–7 end-to-end via §1.1–1.6.

Validation: each block below was re-extracted from this document into a
fresh ignored scratch dir
(`.superpowers/sdd/2026-10-31-rail-throughput-balance/recipe-check/`, four
levels deep) and executed against the recorded artifacts —
`analyze-sweep`, `gate-eval`, `legacy-compare` and `progression-compare`
outputs were byte-identical to the recorded `.txt` evidence;
`buckets-compare` on the recorded buckets reproduced
`buckets-compare.txt` byte-for-byte; a fresh `bucket-probe` run at k=10
reproduced `buckets-k10.json` byte-for-byte; and a single-seed sweep inside
the §1.3 `5a13a1e8` snapshot reproduced all 9 of that seed's run rows from
the recorded full artifact with 0 mismatches. Round 2 additionally ran the
documented shell sequence end-to-end on one seed in a fresh ignored
scratch dir (`.superpowers/sdd/2026-10-31-rail-throughput-balance/recipe-check2/`):
`rail.ts` returned to
the committed literal with `git diff` clean, the k=1 outputs show the
control factor (336 local units/seed), the k=10 outputs the candidate
factor (3,360/seed), and a deliberately failed control window still
auto-reverted cleanly. **Correction to that round's earlier "all
analyzers" claim:** in the recorded lite run the two `legacy-compare`
invocations failed with `Module not found` — the A.4 helper had not been
extracted into that scratch dir — and the `| tee` pipelines masked the
nonzero exits, leaving both lite `.diff.txt` outputs empty; §1.4 now sets
`errexit`/`pipefail` so analyzer failures propagate. Both omitted
comparisons have since been executed against the lite artifacts with the
A.4 helper extracted from this document (byte-identical to the recorded
helper): `5a13a1e8` vs k=1 → 9/9 runs identical, 0 value mismatches — the
lite rows are byte-identical to the recorded artifact's rows for that
seed, so this is the recorded 450/450 result's one-seed slice; and
`0ce5db7e` vs k=1 → 5/9 identical, 43 field mismatches confined to the
seed's four managed runs — the same post-`0ce5db7e` review-fix deltas the
full comparison records.
### A.1 `bucket-probe.ts` — the §§5.2–5.4 cost-bucket collector: runs the committed `advisor` convenience bot over `SWEEP_SEEDS` × 365 days and dumps per-seed cost buckets (payroll, gross revenue, retail/industrial import spend, production operating/overflow cost, opening days, cash/debt extrema, rail-shipment and post-rail delivery/imported water units). Usage: `bun <dir>/bucket-probe.ts <output.json> [seedsCsv]` — run once per factor inside/outside the §1.1 edit window. The optional `seedsCsv` argument exists only for lightweight single-seed checks; the recorded artifacts used the no-argument form (its output is unchanged by the addition).

```ts
/**
 * Step 6 scratch probe (HPA-679): runs the committed convenience `advisor`
 * bot over the 50 Gate A seeds for 365 days and dumps the same-seed cost
 * buckets the calibration needs — retail/industrial import spend, production
 * operating + overflow cost, gross retail revenue, payroll, store opening
 * days, end/min cash and debt — plus bottled-water production, rail-shipment
 * and post-rail local-delivery units for volume context.
 *
 *   bun .superpowers/sdd/2026-10-31-rail-throughput-balance/step6/bucket-probe.ts <output.json> [seedsCsv]
 *
 * Run once per rail factor; outputs are compared same-seed offline.
 * The optional `seedsCsv` (comma-separated) overrides SWEEP_SEEDS and exists
 * only for lightweight single-seed checks; the recorded artifacts used the
 * no-argument form.
 */

import { writeFileSync } from 'node:fs';
import { runBot } from '../../../../tests/balance/bots';
import { SWEEP_SEEDS } from '../../../../tests/balance/measure';

const output = process.argv[2];
if (!output) throw new Error('usage: bucket-probe.ts <output.json> [seedsCsv]');
const seeds = process.argv[3]
	? process.argv[3].split(',').map((part) => Number(part.trim()))
	: SWEEP_SEEDS;

const DAYS = 365;

interface SeedBuckets {
	seed: number;
	openingDays: number[];
	firstNegativeCashDay: number | null;
	minCash: number;
	minCashDay: number;
	endCash: number;
	endDebt: number;
	grossRetailRevenue: number;
	payrollCost: number;
	operatingIncome: number;
	operatingCosts: number;
	totalImportSpend: number;
	retailImportSpend: number;
	industryImportSpend: number;
	productionOperatingCost: number;
	productionOverflowUnits: number;
	productionOverflowCost: number;
	interestAccrued: number;
	producedWaterUnits: number;
	producedAllUnits: number;
	railShipmentCount: number;
	railShipmentUnits: number;
	pushWarehouseWaterUnits: number;
	pullProducerWaterUnits: number;
	pullWarehouseWaterUnits: number;
	postRailLocalWaterUnits: number;
	postRailImportedWaterUnits: number;
	firstRailShipmentDay: number | null;
	lastRailShipmentDay: number | null;
}

const runs: SeedBuckets[] = [];
for (const seed of seeds) {
	const { game, ledger } = runBot('advisor', 'convenience', seed, DAYS);
	const advisorRailDays = ledger.actions
		.filter(
			(a) =>
				a.bot === 'advisor' && a.action === 'advisor:connect-rail' && a.outcome === 'applied'
		)
		.map((a) => a.day)
		.sort((a, b) => a - b);
	const lastRailDay = advisorRailDays.length > 0 ? advisorRailDays[advisorRailDays.length - 1]! : null;

	const bucket: SeedBuckets = {
		seed,
		openingDays: ledger.openings.map((o) => o.day).sort((a, b) => a - b),
		firstNegativeCashDay: null,
		minCash: ledger.foundingCash,
		minCashDay: 0,
		endCash: 0,
		endDebt: 0,
		grossRetailRevenue: 0,
		payrollCost: 0,
		operatingIncome: 0,
		operatingCosts: 0,
		totalImportSpend: 0,
		retailImportSpend: 0,
		industryImportSpend: 0,
		productionOperatingCost: 0,
		productionOverflowUnits: 0,
		productionOverflowCost: 0,
		interestAccrued: 0,
		producedWaterUnits: 0,
		producedAllUnits: 0,
		railShipmentCount: 0,
		railShipmentUnits: 0,
		pushWarehouseWaterUnits: 0,
		pullProducerWaterUnits: 0,
		pullWarehouseWaterUnits: 0,
		postRailLocalWaterUnits: 0,
		postRailImportedWaterUnits: 0,
		firstRailShipmentDay: null,
		lastRailShipmentDay: null
	};
	for (const report of game.reports) {
		if (report.cashAfter < 0 && bucket.firstNegativeCashDay === null)
			bucket.firstNegativeCashDay = report.day;
		if (report.cashAfter < bucket.minCash) {
			bucket.minCash = report.cashAfter;
			bucket.minCashDay = report.day;
		}
		bucket.endCash = report.cashAfter;
		bucket.endDebt = report.outstandingPrincipalAfter;
		bucket.grossRetailRevenue += report.revenue;
		bucket.payrollCost += report.payrollCost;
		bucket.operatingIncome += report.operatingIncome;
		bucket.operatingCosts += report.operatingCosts;
		bucket.totalImportSpend += report.importSpend;
		bucket.interestAccrued += report.interestAccrued;
		const production = report.productionReport;
		bucket.industryImportSpend += production.importSpend;
		bucket.productionOperatingCost += production.operatingCost;
		bucket.productionOverflowUnits += production.overflowUnits;
		bucket.productionOverflowCost += production.overflowCost;
		for (const movement of production.produced) {
			bucket.producedAllUnits += movement.quantity;
			if (movement.materialId === 'bottled-water') bucket.producedWaterUnits += movement.quantity;
		}
		for (const shipment of production.railShipments) {
			bucket.railShipmentCount += 1;
			bucket.railShipmentUnits += shipment.quantity;
			if (bucket.firstRailShipmentDay === null) bucket.firstRailShipmentDay = report.day;
			bucket.lastRailShipmentDay = report.day;
			if (shipment.materialId !== 'bottled-water') continue;
			if (shipment.kind === 'push-warehouse') bucket.pushWarehouseWaterUnits += shipment.quantity;
			else if (shipment.kind === 'pull-producer')
				bucket.pullProducerWaterUnits += shipment.quantity;
			else bucket.pullWarehouseWaterUnits += shipment.quantity;
		}
		const postRail = lastRailDay !== null && report.day > lastRailDay;
		for (const store of report.storeReports) {
			bucket.retailImportSpend += store.importSpend;
			for (const product of store.productReports) {
				if (product.productId !== 'bottled-water') continue;
				if (!postRail) continue;
				bucket.postRailLocalWaterUnits += product.warehouseUnits;
				bucket.postRailImportedWaterUnits += product.importedUnits;
			}
		}
	}
	runs.push(bucket);
}

writeFileSync(output, `${JSON.stringify({ days: DAYS, runs }, null, 2)}\n`);
console.log(`bucket-probe: wrote ${runs.length} advisor seed buckets to ${output}`);
```
### A.2 `analyze-sweep.ts` — the §3 non-advisor byte-identity check, §4 Gate A verdicts (`evaluateGateA` from the committed harness) and §5.1 advisor aggregates/ratios. Usage: `bun <dir>/analyze-sweep.ts <k1.json> <k10.json>`.

```ts
/**
 * Step 6 scratch analysis (HPA-679): loads two same-schema sweep JSONs
 * (k=1 control, k=10 candidate) and reports:
 *  1. byte-identity of the 400 non-advisor runs between the two files,
 *  2. Gate A verdict items for each file,
 *  3. advisor-run aggregates + per-seed table for the rail-share evidence.
 *
 *   bun .superpowers/sdd/2026-10-31-rail-throughput-balance/step6/analyze-sweep.ts <k1.json> <k10.json>
 */

import { readFileSync } from 'node:fs';
import { evaluateGateA, type RunMeasurement, type SweepReport } from '../../../../tests/balance/measure';

const [k1Path, k10Path] = process.argv.slice(2);
if (!k1Path || !k10Path) throw new Error('usage: analyze-sweep.ts <k1.json> <k10.json>');

const load = (path: string): SweepReport => JSON.parse(readFileSync(path, 'utf8')) as SweepReport;
const k1 = load(k1Path);
const k10 = load(k10Path);

// --- 1. non-advisor byte identity -------------------------------------------
const nonAdvisor = (report: SweepReport): RunMeasurement[] =>
	report.runs.filter((run) => run.bot !== 'advisor');
const key = (run: RunMeasurement): string => `${run.seed}|${run.archetypeId}|${run.bot}`;
const map = (runs: RunMeasurement[]): Map<string, string> =>
	new Map(runs.map((run) => [key(run), JSON.stringify(run)]));
const m1 = map(nonAdvisor(k1));
const m10 = map(nonAdvisor(k10));
const allKeys = [...new Set([...m1.keys(), ...m10.keys()])].sort();
let mismatches = 0;
for (const k of allKeys) {
	if (m1.get(k) !== m10.get(k)) {
		mismatches += 1;
		console.log(`NON-ADVISOR MISMATCH: ${k}`);
	}
}
console.log(
	`non-advisor runs: k1=${m1.size} k10=${m10.size} shared-keys=${allKeys.length} byte-identical=${mismatches === 0} (mismatches ${mismatches})`
);
// The §1.4 recipe runs this under `set -e -o pipefail`: a failed byte-identity
// check must abort the recipe, not just print `byte-identical=false`.
if (mismatches > 0) process.exitCode = 1;

// --- 2. Gate A verdicts ------------------------------------------------------
for (const [label, report] of [
	['k1', k1],
	['k10', k10]
] as const) {
	const verdict = evaluateGateA(report);
	console.log(`\nGate A ${label}: allPassed=${verdict.allPassed} coverage=${verdict.coverage.detail}`);
	for (const item of verdict.items) {
		console.log(`  ${item.id}: ${item.passed ? 'PASS' : 'FAIL'} — ${item.detail}`);
	}
}

// --- 3. advisor evidence ------------------------------------------------------
for (const [label, report] of [
	['k1', k1],
	['k10', k10]
] as const) {
	const advisor = report.runs
		.filter((run) => run.bot === 'advisor')
		.sort((a, b) => a.seed - b.seed);
	const sum = (pick: (run: RunMeasurement) => number): number =>
		advisor.reduce((total, run) => total + pick(run), 0);
	const local = sum((r) => r.advisorChain.localDeliveryUnits);
	const allImports = sum((r) => r.advisorChain.retailImportedUnitsAllProducts);
	const waterImports = sum((r) => r.advisorChain.retailImportedUnitsBottledWater);
	const postRailWaterImports = sum((r) => r.advisorChain.postRailRetailImportedUnitsBottledWater);
	const served = advisor.filter((r) => r.advisorChain.served).length;
	const localUnitsList = advisor.map((r) => r.advisorChain.localDeliveryUnits).sort((a, b) => a - b);
	// Per-seed ratios are derived from the stored raw counts — the same
	// definitions renderSweepMarkdown uses for the aggregate evidence lines.
	const perSeedRatio = (run: RunMeasurement): number | null =>
		run.advisorChain.retailImportedUnitsAllProducts === 0
			? null
			: run.advisorChain.localDeliveryUnits / run.advisorChain.retailImportedUnitsAllProducts;
	const perSeedFraction = (run: RunMeasurement): number | null => {
		const matched =
			run.advisorChain.localDeliveryUnits +
			run.advisorChain.postRailRetailImportedUnitsBottledWater;
		return matched === 0 ? null : run.advisorChain.localDeliveryUnits / matched;
	};
	const ratios = advisor
		.map(perSeedRatio)
		.filter((r): r is number => r !== null)
		.sort((a, b) => a - b);
	const fractions = advisor
		.map(perSeedFraction)
		.filter((r): r is number => r !== null)
		.sort((a, b) => a - b);
	const q = (xs: number[], p: number): number | null =>
		xs.length === 0 ? null : xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
	console.log(`\nAdvisor ${label}: ${advisor.length} runs, served ${served}`);
	console.log(
		`  totals: local ${local}u; all-product imports ${allImports}u; water imports ${waterImports}u; post-rail water imports ${postRailWaterImports}u`
	);
	console.log(
		`  aggregate ratios: local/all-import ${allImports === 0 ? 'n/a' : ((local / allImports) * 100).toFixed(4) + '%'}; matched post-rail water local fraction ${local + postRailWaterImports === 0 ? 'n/a' : ((local / (local + postRailWaterImports)) * 100).toFixed(4) + '%'}`
	);
	console.log(
		`  localDeliveryUnits per-seed: min ${localUnitsList[0] ?? 'n/a'} p10 ${q(localUnitsList, 0.1)} median ${q(localUnitsList, 0.5)} p90 ${q(localUnitsList, 0.9)} max ${localUnitsList[localUnitsList.length - 1] ?? 'n/a'}`
	);
	console.log(
		`  per-seed local/all-import ratio: min ${((ratios[0] ?? 0) * 100).toFixed(3)}% median ${(((q(ratios, 0.5) ?? 0) * 100)).toFixed(3)}% max ${((ratios[ratios.length - 1] ?? 0) * 100).toFixed(3)}%`
	);
	console.log(
		`  per-seed matched water fraction: min ${((fractions[0] ?? 0) * 100).toFixed(3)}% median ${(((q(fractions, 0.5) ?? 0) * 100)).toFixed(3)}% max ${((fractions[fractions.length - 1] ?? 0) * 100).toFixed(3)}%`
	);
	console.log('  per-seed table (seed | lastRailDay | localU | allImports | waterImp | postRailWaterImp | ratio% | frac% | served | stallShape):');
	for (const run of advisor) {
		const c = run.advisorChain;
		const ratio = perSeedRatio(run);
		const fraction = perSeedFraction(run);
		console.log(
			`  ${run.seed} | ${c.lastRailDay ?? '-'} | ${c.localDeliveryUnits} | ${c.retailImportedUnitsAllProducts} | ${c.retailImportedUnitsBottledWater} | ${c.postRailRetailImportedUnitsBottledWater} | ${ratio === null ? '-' : (ratio * 100).toFixed(3)} | ${fraction === null ? '-' : (fraction * 100).toFixed(3)} | ${c.served} | ${c.stallShape ?? '-'}`
		);
	}
}
```
### A.3 `gate-eval.ts` — the §2/§4 gate evaluator that also accepts the legacy `0ce5db7e` schema (no `operatingIncomeByDay`), mirroring `evaluateGateA` item-for-item on stored fields. Usage: `bun <dir>/gate-eval.ts <sweep.json> [...]`.

```ts
/**
 * Step 6 scratch analysis (HPA-679): evaluates the HPA-502 Gate A items on
 * any sweep JSON, including legacy schemas that predate
 * `operatingIncomeByDay` (0ce5db7e). Mirrors evaluateGateA logic exactly:
 * viability uses the first complete contiguous positive 30-day window ending
 * <= day 90; when `operatingIncomeByDay` is absent the stored
 * `firstPositiveWindow30` (computed by the era's own identical helper) is
 * used instead. Managed-vs-idle uses days 61-90 operating income — equal to
 * the stored `operatingIncomeDays61To90` field by its own definition.
 *
 *   bun .superpowers/sdd/2026-10-31-rail-throughput-balance/step6/gate-eval.ts <sweep.json> [sweep2.json ...]
 */

import { readFileSync } from 'node:fs';
import {
	botsForArchetype,
	evaluateGateA,
	SWEEP_ARCHETYPES,
	SWEEP_SEEDS,
	type RunMeasurement,
	type SweepReport
} from '../../../../tests/balance/measure';

interface LegacyRun {
	seed: number;
	archetypeId: string;
	bot: string;
	daysSimulated: number;
	firstPositiveWindow30: { startDay: number; endDay: number; operatingIncome: number } | null;
	operatingIncomeDays61To90?: number;
	operatingIncomeByDay?: { day: number; operatingIncome: number }[];
	maxAbsCash: number;
	maxOutstandingPrincipal: number;
	cumulativeImportSpend: number;
	wasteUnits: number;
	wasteValue: number;
	forecastOutcomes: {
		complete: boolean;
		forecastDailyRevenue: number;
		observedMeanDailyRevenue: number | null;
	}[];
	advisorChain: { served: boolean };
	advisorRepeatedNoOp: unknown;
	producerStall: { startDay: number; endDay: number; days: number } | null;
}

const paths = process.argv.slice(2);
if (paths.length === 0) throw new Error('usage: gate-eval.ts <sweep.json> [...]');

for (const path of paths) {
	const report = JSON.parse(readFileSync(path, 'utf8')) as SweepReport;
	console.log(`\n== ${path}`);
	// An empty report has no schema to detect and nothing to evaluate — skip
	// with a clear line instead of crashing on `runs[0]` (TypeError under set -e).
	if (report.runs.length === 0) {
		console.log('   empty report — no runs');
		continue;
	}
	const hasByDay = (report.runs[0] as unknown as LegacyRun).operatingIncomeByDay !== undefined;
	console.log(`   runs ${report.runs.length}, schema has operatingIncomeByDay: ${hasByDay}`);
	if (hasByDay) {
		const verdict = evaluateGateA(report);
		for (const item of verdict.items) {
			console.log(`   ${item.id}: ${item.passed ? 'PASS' : 'FAIL'} — ${item.detail}`);
		}
		console.log(`   overall: ${verdict.allPassed ? 'PASS' : 'FAIL'} (coverage ${verdict.coverage.detail})`);
		// A failed gate must not read as a clean run under `set -e -o pipefail`.
		if (!verdict.allPassed) process.exitCode = 1;
		continue;
	}
	// Legacy-schema manual evaluation mirroring the same five items.
	const runs = report.runs as unknown as LegacyRun[];
	const byCombo = (bot: string, arch: string) =>
		runs.filter((r) => r.bot === bot && r.archetypeId === arch);
	// Item 1 viability
	const parts: string[] = [];
	let viabilityPass = true;
	for (const arch of SWEEP_ARCHETYPES) {
		const rs = byCombo('retail-steady', arch);
		// Mirror evaluateGateA's missing-run guard: an absent archetype fails
		// instead of passing vacuously on a 0/0 ratio.
		if (rs.length === 0) {
			viabilityPass = false;
			parts.push(`${arch} no runs`);
			continue;
		}
		const viable = rs.filter(
			(r) => r.firstPositiveWindow30 !== null && r.firstPositiveWindow30.endDay <= 90
		).length;
		if (viable / rs.length < 0.8) viabilityPass = false;
		parts.push(`${arch} ${viable}/${rs.length} (${((viable / rs.length) * 100).toFixed(1)}%)`);
	}
	console.log(`   viability: ${viabilityPass ? 'PASS' : 'FAIL'} — ${parts.join(', ')}`);
	// Item 2 boundedness
	const maxima = { cash: 0, principal: 0, imports: 0, wasteU: 0, wasteV: 0 };
	for (const r of runs) {
		maxima.cash = Math.max(maxima.cash, r.maxAbsCash);
		maxima.principal = Math.max(maxima.principal, r.maxOutstandingPrincipal);
		maxima.imports = Math.max(maxima.imports, r.cumulativeImportSpend);
		maxima.wasteU = Math.max(maxima.wasteU, r.wasteUnits);
		maxima.wasteV = Math.max(maxima.wasteV, r.wasteValue);
	}
	const boundPass =
		maxima.cash < 1e9 &&
		maxima.principal < 1e9 &&
		maxima.imports < 1e9 &&
		maxima.wasteU < 1e9 &&
		maxima.wasteV < 1e9;
	console.log(
		`   boundedness: ${boundPass ? 'PASS' : 'FAIL'} — max |cash| ${maxima.cash}, principal ${maxima.principal}, cumImports ${maxima.imports}, waste ${maxima.wasteU}u/${maxima.wasteV}`
	);
	// Item 3 managed-vs-idle via stored operatingIncomeDays61To90
	const mParts: string[] = [];
	let mviPass = true;
	for (const arch of SWEEP_ARCHETYPES) {
		const managed = new Map(byCombo('retail-steady', arch).map((r) => [r.seed, r]));
		const idle = new Map(byCombo('idle', arch).map((r) => [r.seed, r]));
		const paired = [...managed.keys()].filter((s) => idle.has(s)).sort();
		// Same guard as viability: zero paired seeds must fail, not vacuously pass.
		if (paired.length === 0) {
			mviPass = false;
			mParts.push(`${arch} no paired seeds`);
			continue;
		}
		const wins = paired.filter(
			(s) =>
				(managed.get(s)!.operatingIncomeDays61To90 ?? 0) >
				(idle.get(s)!.operatingIncomeDays61To90 ?? 0)
		).length;
		if (wins / paired.length < 0.8) mviPass = false;
		mParts.push(`${arch} ${wins}/${paired.length} (${((wins / paired.length) * 100).toFixed(1)}%)`);
	}
	console.log(`   managed-vs-idle: ${mviPass ? 'PASS' : 'FAIL'} — ${mParts.join(', ')}`);
	// Item 4 forecast
	const outcomes = runs.filter((r) => r.bot !== 'idle').flatMap((r) => r.forecastOutcomes);
	const complete = outcomes.filter((o) => o.complete);
	const within = complete.filter((o) => {
		const obs = o.observedMeanDailyRevenue;
		if (obs === null || obs <= 0) return false;
		return Math.abs(o.forecastDailyRevenue - obs) / obs <= 0.25;
	}).length;
	const idleOpenings = runs
		.filter((r) => r.bot === 'idle')
		.reduce((t, r) => t + r.forecastOutcomes.length, 0);
	// Zero completed forecasts is an explicit fail, not a NaN-driven one.
	const forecastPass = complete.length > 0 && within / complete.length >= 0.8;
	console.log(
		`   forecast: ${forecastPass ? 'PASS' : 'FAIL'} — ${within}/${complete.length}/${outcomes.length} eligible within ±25%; excluded ${outcomes.length - complete.length} incomplete, ${idleOpenings} idle`
	);
	// Item 5 advisor
	const adv = runs.filter((r) => r.bot === 'advisor');
	const served = adv.filter((r) => r.advisorChain.served).length;
	const advisorPass = adv.length > 0 && served / adv.length >= 0.8;
	console.log(
		`   advisor: ${advisorPass ? 'PASS' : 'FAIL'} — ${served}/${adv.length} served (${adv.length === 0 ? 'no runs' : ((served / adv.length) * 100).toFixed(1) + '%'})`
	);
	// Coverage: PASS requires the observed run keys to equal the approved
	// matrix exactly — unique keys, no unexpected rows, and the same count.
	// A Set-based missing check alone would wave through duplicated or
	// off-matrix rows as long as every approved key appeared once.
	const expected = SWEEP_ARCHETYPES.flatMap((a) =>
		botsForArchetype(a).map((b) => `${a}/${b}`)
	);
	const approved = new Set<string>();
	for (const seed of SWEEP_SEEDS) for (const combo of expected) approved.add(`${seed} ${combo}`);
	const observed = runs.map((r) => `${r.seed} ${r.archetypeId}/${r.bot}`);
	const seen = new Set<string>();
	const duplicated = new Set<string>();
	for (const key of observed) {
		if (seen.has(key)) duplicated.add(key);
		seen.add(key);
	}
	const missing = [...approved].filter((key) => !seen.has(key));
	const unexpected = observed.filter((key) => !approved.has(key));
	const exactMatrix =
		missing.length === 0 &&
		duplicated.size === 0 &&
		unexpected.length === 0 &&
		observed.length === approved.size;
	const coverageParts: string[] = [];
	if (missing.length > 0) coverageParts.push(`${missing.length} missing`);
	if (duplicated.size > 0) coverageParts.push(`${duplicated.size} duplicated`);
	if (unexpected.length > 0) coverageParts.push(`${unexpected.length} unexpected`);
	if (observed.length !== approved.size)
		coverageParts.push(`${observed.length}/${approved.size} runs`);
	console.log(
		`   coverage: ${coverageParts.length === 0 ? 'complete approved matrix' : coverageParts.join(', ')}`
	);
	// Mirror evaluateGateA's allPassed: item verdicts only count on the complete
	// approved matrix — a partial sweep is diagnostic, never an official PASS.
	const itemsPassed =
		viabilityPass && boundPass && mviPass && forecastPass && advisorPass;
	console.log(
		`   overall: ${itemsPassed && exactMatrix ? 'PASS' : 'FAIL'} — all items pass only on the complete approved matrix`
	);
	// A failed gate must not read as a clean run under `set -e -o pipefail`.
	if (!itemsPassed || !exactMatrix) process.exitCode = 1;
}
```
### A.4 `legacy-compare.ts` — the §2 legacy-vs-new field-by-field projection diff (projects new-only `advisorChain` keys away, reports every value mismatch). Usage: `bun <dir>/legacy-compare.ts <legacy.json> <new.json>`.

```ts
/**
 * Step 6 scratch analysis (HPA-679): deep-diff of a legacy-schema sweep JSON
 * (regenerated HPA-502 artifact) against a new-schema sweep JSON. Compares
 * paired runs field-by-field; advisorChain keys only present in the new
 * schema are projected away and counted, and `localDeliveryUnits` is
 * reported separately because its definition was re-scoped in 5a13a1e8
 * (all-products whole-run -> bottled-water strictly-after-last-rail).
 *
 *   bun .superpowers/sdd/2026-10-31-rail-throughput-balance/step6/legacy-compare.ts <legacy.json> <new.json>
 */

import { readFileSync } from 'node:fs';

const [legacyPath, newPath] = process.argv.slice(2);
if (!legacyPath || !newPath) throw new Error('usage: legacy-compare.ts <legacy.json> <new.json>');

type Json = Record<string, unknown>;
const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as { runs: Json[] };
const current = JSON.parse(readFileSync(newPath, 'utf8')) as { runs: Json[] };

const key = (run: Json): string => `${run.seed}|${run.archetypeId}|${run.bot}`;
// A Map silently collapses duplicated run keys to the last row — reject
// duplicates before pairing so a duplicated report can't skew the diff.
const hasDuplicateKeys = (runs: Json[]): boolean =>
	new Set(runs.map(key)).size !== runs.length;
if (hasDuplicateKeys(legacy.runs) || hasDuplicateKeys(current.runs)) {
	console.error('legacy-compare: duplicate run rows in a report');
	process.exit(1);
}
const legacyMap = new Map(legacy.runs.map((run) => [key(run), run]));
const newMap = new Map(current.runs.map((run) => [key(run), run]));

const diffs: string[] = [];
const projectedOnlyKeys = new Set<string>();
let compared = 0;
let identicalAfterProjection = 0;

function deepDiff(path: string, a: unknown, b: unknown): void {
	if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
		diffs.push(`${path}: TYPE ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
		return;
	}
	if (a !== null && b !== null && typeof a === 'object') {
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) {
				diffs.push(`${path}: length ${a.length} vs ${b.length}`);
				return;
			}
			for (let i = 0; i < a.length; i += 1) deepDiff(`${path}[${i}]`, a[i], b[i]);
			return;
		}
		const ao = a as Json;
		const bo = b as Json;
		const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
		for (const k of [...keys].sort()) {
			if (!(k in ao)) {
				projectedOnlyKeys.add(`${path}.${k}`);
				continue;
			}
			if (!(k in bo)) {
				diffs.push(`${path}.${k}: missing in new`);
				continue;
			}
			deepDiff(`${path}.${k}`, ao[k], bo[k]);
		}
		return;
	}
	if (a !== b) {
		diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
	}
}

for (const [k, legacyRun] of legacyMap) {
	const newRun = newMap.get(k);
	if (!newRun) {
		diffs.push(`${k}: missing in new`);
		continue;
	}
	compared += 1;
	const before = diffs.length;
	// Project new run's advisorChain to the legacy key set by deep-diffing
	// only shared keys; new-only keys are collected, not diffed.
	const legacyChain = legacyRun.advisorChain as Json | undefined;
	const newChain = newRun.advisorChain as Json | undefined;
	if (legacyChain && newChain) {
		for (const ck of Object.keys(newChain)) {
			if (!(ck in legacyChain)) projectedOnlyKeys.add(`advisorChain.${ck}`);
		}
		const projectedChain: Json = {};
		for (const ck of Object.keys(legacyChain)) projectedChain[ck] = newChain[ck];
		const projectedRun = { ...newRun, advisorChain: projectedChain };
		deepDiff(k, legacyRun, projectedRun);
	} else {
		deepDiff(k, legacyRun, newRun);
	}
	if (diffs.length === before) identicalAfterProjection += 1;
}

console.log(`paired runs compared: ${compared}/${legacyMap.size} (new total ${newMap.size})`);
console.log(`runs identical after legacy projection: ${identicalAfterProjection}`);
console.log(`new-schema-only keys (projected away, not diffed): ${[...projectedOnlyKeys].sort().join(', ') || 'none'}`);
console.log(`value mismatches: ${diffs.length}`);
for (const line of diffs.slice(0, 400)) console.log(`  ${line}`);
if (diffs.length > 400) console.log(`  ... +${diffs.length - 400} more`);
```
### A.5 `progression-compare.ts` — the §7 paired progression comparator: per-tier reached/p10/median/p90, idle-control invariants, credit totals, and every per-run claim-day diff. Usage: `bun <dir>/progression-compare.ts <k1.json> <k10.json>`.

```ts
/**
 * Step 6 scratch analysis (HPA-679): compares two progression-calibration
 * JSONs (k=1 control vs k=10 candidate). Per-tier reached counts,
 * p10/median/p90 claim days (never-claimed distinct), per-seed claim-day
 * diffs and outliers, and idle-control invariants.
 *
 *   bun .superpowers/sdd/2026-10-31-rail-throughput-balance/step6/progression-compare.ts <k1.json> <k10.json>
 */

import { readFileSync } from 'node:fs';

const [k1Path, k10Path] = process.argv.slice(2);
if (!k1Path || !k10Path) throw new Error('usage: progression-compare.ts <k1.json> <k10.json>');

interface TierStat {
	tierId: string;
	total: number;
	reached: number;
	neverClaimed: number;
	claimDayMin: number | null;
	claimDayP10: number | null;
	claimDayMedian: number | null;
	claimDayP90: number | null;
	claimDayMax: number | null;
	neverClaimedByArchetype: Record<string, number>;
	blockerGoalCounts: Record<string, number>;
	outliers: { seed: number; archetypeId: string; claimedOnDay: number }[];
}
interface RunSummary {
	seed: number;
	archetypeId: string;
	claims: { tierId: string; claimedOnDay: number }[];
	finalCash: number;
	finalDebt: number;
	finalBookValue: number;
	peakBookValue: number;
	storeCount: number;
	openedCityCount: number;
	maxStoreLevel: number;
	finalLocalUnits: number;
}
interface Report {
	progressionRuns: number;
	idleRuns: number;
	tiers: TierStat[];
	credit: {
		runsUsingCredit: number;
		borrowCount: number;
		totalBorrowed: number;
		maxSingleBorrow: number;
		repaidCount: number;
		totalRepaid: number;
	};
	idle: {
		runs: number;
		zeroClaimRuns: number;
		totalClaims: number;
		totalEarnedUnclaimed: number;
		peakReportBookValue: { min: number; median: number; max: number };
	};
	tier1NonDecorative: {
		idlePeakReportBookValueMax: number;
		tier1PeakTarget: number;
		passes: boolean;
	};
	finalBookValue: { min: number; median: number; max: number };
	finalStoreCount: { min: number; median: number; max: number };
	runs: RunSummary[];
}

const load = (path: string): Report => JSON.parse(readFileSync(path, 'utf8')) as Report;
const a = load(k1Path);
const b = load(k10Path);

// Deltas require identical populations — a missing or duplicated k10 row must
// fail the comparison, not silently shrink or reweight it.
const keyList = (runs: RunSummary[]): string[] =>
	runs.map((r) => `${r.seed}|${r.archetypeId}`).sort();
const tierList = (tiers: TierStat[]): string[] => tiers.map((t) => t.tierId).sort();
// Sorted-list equality lets an identical duplicate on both sides slip
// through — reject duplicated keys before pairing rows for diffs.
const hasDuplicates = (keys: readonly string[]): boolean => new Set(keys).size !== keys.length;
if (hasDuplicates(keyList(a.runs)) || hasDuplicates(keyList(b.runs))) {
	console.error('progression-compare: duplicate run rows in a report');
	process.exit(1);
}
if (hasDuplicates(tierList(a.tiers)) || hasDuplicates(tierList(b.tiers))) {
	console.error('progression-compare: duplicate tier rows in a report');
	process.exit(1);
}
if (
	JSON.stringify(keyList(a.runs)) !== JSON.stringify(keyList(b.runs)) ||
	JSON.stringify(tierList(a.tiers)) !== JSON.stringify(tierList(b.tiers))
) {
	console.error('progression-compare: k1 and k10 reports cover different runs or tiers');
	process.exit(1);
}

const fmt = (v: number | null): string => (v === null ? '-' : String(Math.round(v * 10) / 10));

console.log('=== per-tier (k1 -> k10) ===');
console.log('tier | reached k1->k10 | p10 | median | p90 | min | max | neverClaimedByArchetype');
const tierB = new Map(b.tiers.map((t) => [t.tierId, t]));
for (const ta of a.tiers) {
	const tb = tierB.get(ta.tierId);
	if (!tb) {
		console.log(`${ta.tierId}: missing in k10`);
		continue;
	}
	console.log(
		`${ta.tierId} | ${ta.reached}/${ta.total} -> ${tb.reached}/${tb.total} | ${fmt(ta.claimDayP10)} -> ${fmt(tb.claimDayP10)} | ${fmt(ta.claimDayMedian)} -> ${fmt(tb.claimDayMedian)} | ${fmt(ta.claimDayP90)} -> ${fmt(tb.claimDayP90)} | ${fmt(ta.claimDayMin)} -> ${fmt(tb.claimDayMin)} | ${fmt(ta.claimDayMax)} -> ${fmt(tb.claimDayMax)} | never ${JSON.stringify(ta.neverClaimedByArchetype)} -> ${JSON.stringify(tb.neverClaimedByArchetype)}`
	);
}

console.log('\n=== idle control (k1 -> k10) ===');
for (const [label, r] of [
	['k1', a],
	['k10', b]
] as const) {
	console.log(
		`  ${label}: idle runs ${r.idle.runs}, zero-claim ${r.idle.zeroClaimRuns}, totalClaims ${r.idle.totalClaims}, totalEarnedUnclaimed ${r.idle.totalEarnedUnclaimed}, peakBV max ${r.idle.peakReportBookValue.max}; tier1NonDecorative passes=${r.tier1NonDecorative.passes} (idlePeak ${r.tier1NonDecorative.idlePeakReportBookValueMax} < ${r.tier1NonDecorative.tier1PeakTarget})`
	);
}

console.log('\n=== credit (k1 -> k10) ===');
console.log(
	`  runsUsingCredit ${a.credit.runsUsingCredit} -> ${b.credit.runsUsingCredit}; borrows ${a.credit.borrowCount} -> ${b.credit.borrowCount}; totalBorrowed ${a.credit.totalBorrowed} -> ${b.credit.totalBorrowed}; maxSingle ${a.credit.maxSingleBorrow} -> ${b.credit.maxSingleBorrow}; repaid ${a.credit.repaidCount}/${a.credit.totalRepaid} -> ${b.credit.repaidCount}/${b.credit.totalRepaid}`
);
console.log(
	`  finalBookValue min/med/max ${a.finalBookValue.min}/${a.finalBookValue.median}/${a.finalBookValue.max} -> ${b.finalBookValue.min}/${b.finalBookValue.median}/${b.finalBookValue.max}; finalStoreCount ${a.finalStoreCount.min}/${a.finalStoreCount.median}/${a.finalStoreCount.max} -> ${b.finalStoreCount.min}/${b.finalStoreCount.median}/${b.finalStoreCount.max}`
);

console.log('\n=== per-run diffs (claim counts/days, unreached distinct) ===');
const bRuns = new Map(b.runs.map((r) => [`${r.seed}|${r.archetypeId}`, r]));
let diffRuns = 0;
for (const ra of a.runs) {
	// Non-null: the key-set check above guarantees every k1 run exists in k10.
	const rb = bRuns.get(`${ra.seed}|${ra.archetypeId}`)!;
	const claimsA = new Map(ra.claims.map((c) => [c.tierId, c.claimedOnDay]));
	const claimsB = new Map(rb.claims.map((c) => [c.tierId, c.claimedOnDay]));
	const tierIds = [...new Set([...claimsA.keys(), ...claimsB.keys()])].sort();
	const parts: string[] = [];
	for (const t of tierIds) {
		const da = claimsA.get(t);
		const db = claimsB.get(t);
		if (da === db) continue;
		parts.push(`${t} ${da ?? 'unreached'} -> ${db ?? 'unreached'}`);
	}
	if (parts.length === 0) continue;
	diffRuns += 1;
	console.log(
		`  ${ra.seed} ${ra.archetypeId}: ${parts.join('; ')} | cash ${ra.finalCash} -> ${rb.finalCash} | stores ${ra.storeCount} -> ${rb.storeCount} | localUnits ${ra.finalLocalUnits} -> ${rb.finalLocalUnits}`
	);
}
console.log(`  runs with claim-day diffs: ${diffRuns}/${a.runs.length}`);

console.log('\n=== tier outliers (runs past own-factor p90) ===');
for (const [label, r] of [
	['k1', a],
	['k10', b]
] as const) {
	for (const t of r.tiers) {
		if (t.outliers.length === 0) continue;
		console.log(
			`  ${label} ${t.tierId}: ${t.outliers.map((o) => `${o.seed}/${o.archetypeId}@${o.claimedOnDay}`).join(', ')}`
		);
	}
}
```
### A.6 `buckets-compare.ts` — the §§5.2–5.4 cost-bucket comparator: aggregate field sums, the opening-days-diff seed list, and the per-seed F5 pivot used for §5.3. Usage: `bun <dir>/buckets-compare.ts <buckets-k1.json> <buckets-k10.json>` — its output on the recorded buckets is byte-identical to the recorded `buckets-compare.txt`.

```ts
/**
 * Step 6 scratch analysis (HPA-679): pivots two bucket-probe outputs
 * (k=1 control vs k=10 candidate) into the recorded comparison table —
 * an aggregate field-sum table, the opening-days-diff seed list, and a
 * per-seed pivot of the F5 timing-attribution buckets.
 *
 *   bun <dir>/buckets-compare.ts <buckets-k1.json> <buckets-k10.json>
 */

import { readFileSync } from 'node:fs';

const [k1Path, k10Path] = process.argv.slice(2);
if (!k1Path || !k10Path) throw new Error('usage: buckets-compare.ts <k1.json> <k10.json>');

interface SeedBuckets {
	seed: number;
	openingDays: number[];
	firstNegativeCashDay: number | null;
	minCash: number;
	minCashDay: number;
	endCash: number;
	endDebt: number;
	grossRetailRevenue: number;
	payrollCost: number;
	operatingIncome: number;
	operatingCosts: number;
	totalImportSpend: number;
	retailImportSpend: number;
	industryImportSpend: number;
	productionOperatingCost: number;
	productionOverflowUnits: number;
	productionOverflowCost: number;
	interestAccrued: number;
	producedWaterUnits: number;
	producedAllUnits: number;
	railShipmentCount: number;
	railShipmentUnits: number;
	pushWarehouseWaterUnits: number;
	pullProducerWaterUnits: number;
	pullWarehouseWaterUnits: number;
	postRailLocalWaterUnits: number;
	postRailImportedWaterUnits: number;
	firstRailShipmentDay: number | null;
	lastRailShipmentDay: number | null;
}

const load = (path: string): SeedBuckets[] =>
	(JSON.parse(readFileSync(path, 'utf8')) as { runs: SeedBuckets[] }).runs;
const a = load(k1Path);
const b = load(k10Path);

// Deltas require identical seed populations — a missing k10 row must fail the
// comparison, not silently shrink it.
const seedList = (runs: SeedBuckets[]): number[] =>
	runs.map((r) => r.seed).sort((x, y) => x - y);
// Sorted-list equality lets an identical duplicate on both sides slip
// through — reject duplicated seeds before pairing rows for diffs.
const hasDuplicates = (seeds: readonly number[]): boolean => new Set(seeds).size !== seeds.length;
if (hasDuplicates(seedList(a)) || hasDuplicates(seedList(b))) {
	console.error('buckets-compare: duplicate seed rows in a probe');
	process.exit(1);
}
if (JSON.stringify(seedList(a)) !== JSON.stringify(seedList(b))) {
	console.error('buckets-compare: k1 and k10 probes cover different seeds');
	process.exit(1);
}

const bBySeed = new Map(b.map((run) => [run.seed, run]));

const SUM_FIELDS: readonly (keyof SeedBuckets)[] = [
	'grossRetailRevenue',
	'payrollCost',
	'operatingIncome',
	'operatingCosts',
	'totalImportSpend',
	'retailImportSpend',
	'industryImportSpend',
	'productionOperatingCost',
	'productionOverflowUnits',
	'productionOverflowCost',
	'interestAccrued',
	'producedWaterUnits',
	'producedAllUnits',
	'railShipmentCount',
	'railShipmentUnits',
	'pushWarehouseWaterUnits',
	'pullProducerWaterUnits',
	'pullWarehouseWaterUnits',
	'postRailLocalWaterUnits',
	'postRailImportedWaterUnits',
	'endCash',
	'endDebt',
	'minCash'
];

console.log(`${'field'.padEnd(38)}${'k1 total'.padStart(8)}${'k10 total'.padStart(16)}${'delta'.padStart(16)}`);
for (const field of SUM_FIELDS) {
	const v1 = a.reduce((total, run) => total + (run[field] as number), 0);
	const v10 = b.reduce((total, run) => total + (run[field] as number), 0);
	console.log(
		`${field.padEnd(38)}${String(Math.trunc(v1)).padStart(8)}${String(Math.trunc(v10)).padStart(16)}${String(Math.trunc(v10 - v1)).padStart(16)}`
	);
}

const fmtDays = (days: readonly number[]): string => `[${days.join(', ')}]`;
console.log('\nseeds where openingDays differ:');
for (const run of a) {
	// Non-null: the seed-set check above guarantees every k1 seed exists in k10.
	const other = bBySeed.get(run.seed)!;
	if (JSON.stringify(run.openingDays) !== JSON.stringify(other.openingDays)) {
		console.log(`  ${run.seed} ${fmtDays(run.openingDays)} -> ${fmtDays(other.openingDays)}`);
	}
}

const PIVOT_FIELDS: readonly (keyof SeedBuckets)[] = [
	'endCash',
	'payrollCost',
	'operatingIncome',
	'productionOperatingCost',
	'retailImportSpend',
	'industryImportSpend',
	'grossRetailRevenue'
];
console.log(
	'\nseed | openDays | endCash1->10 | dCash | payroll1->10 | dPay | opInc1->10 | prodOp1->10 | retImp1->10 | indImp1->10 | rev1->10'
);
for (const run of a) {
	const other = bBySeed.get(run.seed)!;
	const cols = PIVOT_FIELDS.map(
		(field) => `${run[field]} -> ${other[field]} ${(other[field] as number) - (run[field] as number)}`
	);
	console.log(`${run.seed} ${fmtDays(run.openingDays)} -> ${fmtDays(other.openingDays)} | ${cols.join(' | ')}`);
}
```
