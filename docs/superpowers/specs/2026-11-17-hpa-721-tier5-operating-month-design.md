# HPA-721: Tier 5 Operating Month

## Decision

Market Leader should recognize an expanded company that has operated profitably,
not just one that has accumulated assets. Retain the seven-store and 150,000
reported peak company book-value goals. Add one requirement: **complete a
30-report operating window after claiming Multi-City Operator (Tier 4), with
positive operating cash flow and positive COGS-based operating income**.

The 30-report window spans the existing payroll cycle. It explicitly sets a
30-game-day minimum Tier 4-to-5 gap for new claims. A losing month does not
qualify. The existing pacing evaluator and thresholds stay unchanged, but
meeting the minimum gap under this rule is not evidence of improved economic
pacing. The Approved Gates section of `docs/balance/economy-pass.md` records
the distinction: the new floor is enforced by rule, Tier 5 reach remains a
measured gate, and Gate A is separate. Use of this rule for official progression
acceptance is pending explicit sign-off on that treatment in PR #73. Separately,
the owner decided in the PR #73 review thread (2026-11-21 UTC) to ship this
implemented rule in the PR; that ship decision is not acceptance sign-off.

## Alternatives

- **Selected: positive operating month.** Uses actual operating results over a
  payroll cycle, with inventory cost recognized as well as cash movements.
- **Cumulative cash hurdle.** Rejected: at a 19,000 hurdle, the four premium
  R2 runs would have cleared it in one or two days, before a full payroll cycle.
- **Calendar-only cooldown.** Rejected: it would release a loss-making company.
  Keeping the ladder unchanged would leave spacing entirely to the economy
  model, but the frozen evidence did not support another broad price bundle.

## Eligibility And Evidence

- Use existing `DailyReport.operatingCashFlow` and `DailyReport.operatingIncome`.
  Sum each independently across the **same** 30 consecutive closing days.
  Both sums must be strictly greater than zero. Negative individual days are
  allowed. Do not count financing or use balance, revenue, or COGS alone.
- If Tier 4 is claimed on game day `D`, the first eligible report closes on
  day `D`. The report closing on `D - 1` predates the claim. The first possible
  qualifying window, `D` through `D + 29`, can release Tier 5 on `D + 30`.
- Try each complete eligible window, not just the first month or the latest
  month. A missing day or a day with duplicate reports cannot complete a window.
  Use decoded financial fields; the save codec drops malformed reports.
  A later clean window may qualify. Once a valid month is evidenced, later
  losses do not erase it, even if seven stores or peak value are reached later.
- Do not infer Tier 4 from its goals or from an impending same-call receipt.
  Use its existing receipt. New claims consider only reports before the
  current game day. For a recorded Tier 5 receipt, evidence must also predate
  its claim day. The save decoder checks report shape but does not constrain
  report days to before the saved game day; later profits cannot validate an
  early receipt. This does not authenticate the Tier 4 receipt's timestamp.
- Show the new requirement alongside the other Market Leader goals in the
  existing sandbox objective panel. Report zero or one qualifying month;
  identify the first and last report days of the earliest passing window.
  No existing scenario acquires this goal. Shared scenario validation and
  evidence decoding recognize the metric, but it always returns zero in
  scenario play because scenarios have no Tier 4 receipt. Do not add a
  scenario-specific authoring restriction in this change.

## Boundaries

Keep Tiers 1-4, the other two Tier-5 goals, claim order, rewards, finance,
manager/bot policy, economy values, manufacturing, scenario rules/scoring and
all acceptance thresholds unchanged. Use existing reports and receipts; no new
save fields or migration. Preserve the sandbox save loader's earned-claim
checks. Under the repository's pre-release save policy, a pre-change Tier 5
receipt without a qualifying window before its claim day may fail to load.
Do not strip receipts, grant a bypass, or claim save compatibility.

The frozen R2 report overlay places Tier 5 on days 227/255 for boutique and
171/185 for electronics; the qualifying grocery run stays on day 295, still
waiting for store seven. The three runs without Tier 4 remain blocked. These
are held-path observations: no replay of delayed rewards and no proof of
matched cash payback or local sales.

Implement and verify this rule in isolation. Convenience/grocery expansion
affordability, boutique gift delivery, and any new balance trial require
separate proposals. Do not reuse R2 as an accepted source or as certification
of the rule.
