# HPA-721 Opening Spending Order Design

Status: proposal for review. No bot change or new simulation is approved by this document.

## Decision

Test an operating-cash reserve in the progression bot **after a two-store opening**, not a cheaper upgrade or a larger credit line. Protect the cash needed to buy stock, operate, and pay salaries and debt before discretionary purchases. Keep the existing purchase priority among actions the bot can afford. This is a diagnostic about timing, not a proposed new official bot or a test of store-two payback.

The current planner checks near-term debt when upgrading or expanding, borrows toward a 2,000 working-cash floor, and attempts supply and city spending before upgrades and expansion. The successful Harbor trial, in contrast, spent 2,500 on the first paid restock and did not spend 8,000 upgrading the founder. Even granting the observed level-2 revenue bonus and charging only the first pump, applying the 8,000 upgrade to the frozen trial's sales would leave both seeds negative at the first order and payroll.

A flat reserve would hide why actions are rejected. The proposed first-day reserve uses actual obligations: 2,500 for the first full refill, 2,604 for seven days of store costs, 666 for the current next-installment quote, and either 21,437 or 21,756 for the first payroll. That is 27,207 or 27,526 against available cash of 9,309 or 9,760. So applying this rule **before** store two opens is not supported by the trial. It could simply prevent the opening. Also reject a blanket upgrade discount: a uniformly cheap curve can redirect savings into the next upgrade almost immediately.

## Matched Diagnostic

- Use disposable, source-pinned copies. Reuse the two verified day-one snapshots from the Harbor snack trial: two stores, same staff, stock lots and debt, inventory threshold/target pairs 450 water and 400 snacks per store, Harbor snack demand 1.2. Give both arms the same source and inputs; no free stock or extra opening cash. Allow the real bot to re-enable its manager in both arms, and record any resulting changes to the targets. Do not manipulate the manager to match the prior trial.
- Control uses the existing progression planner. Treatment uses the same planner and uses the additional spending check below only through the first payroll close, day 30. Both arms allow normal staffing, scheduled servicing, sales, charges, claims and replenishment. Let each arm make its own city, store and supply choices; record the effects, do not script its footprint after the fork.
- From day 31 both arms use the existing planner, including its existing finance behavior. Follow through the second payroll on day 60 and the next paid refill check on day 63. Run four trajectories total: control and treatment for `20260503` and `20260515`. No retry, third arm, official progression or idle matrix.

### Treatment Check

On each weekly planner turn before day 31, before **each** discretionary cash commitment, recompute the reserve using the current state:

1. One full import refill for eligible products at current targets, assuming shelves are empty and giving no advance credit for warehouse stock. Use native brand quotes and active import-cost modifiers for the next refill check. For a candidate opening, include the new store's refill and staffing obligations as well.
2. Seven closing days of current store rent and marketing, plus fixed running costs of active industry and recurring transport already committed. Include any additional fixed charges the candidate would introduce. Do not forecast sales and do not assume a future credit draw.
3. The full day-30 payroll for current staff, plus the quoted monthly pay for eligible hires needed to staff a candidate new store or upgrade; if a candidate's obligations cannot be quoted, defer it and record that reason. Do not add a hypothetical payroll for a proposed action that does not add any required staff.
4. Current next-installment quotes for outstanding loans, plus already due arrears not included in those quotes. A voluntary payoff removes only the reserve attributed to the loan it fully pays off. Use native finance fields so principal already included in another amount is not counted twice.

Allow a commitment only if cash after the native quoted debit still covers this reserve. Apply this to supply construction and rails, city purchases, store upgrades and openings, and voluntary principal payoff. Do not borrow to satisfy this guard, finance a discretionary purchase, or top up the working-cash floor while the guard is active. Record skips; do not stop the week or skip legally scheduled servicing when one action fails. Allow hiring needed for existing stores; log its salary and recompute the reserve. Do not change any player-facing purchase, finance, inventory, or payroll transition.

## Decision Rule

- Verify equal starting state, identical runtime source except the scratch bot branch, unchanged scenario inputs, and unchanged control action logic. Before the four runs, prove the guard defers the unaffordable 8,000 day-one purchase with the measured inputs, permits an affordable purchase, recomputes after a debit, and cannot be bypassed by the planner's working-capital top-up, purchase loan, or voluntary payoff.
- Require both treatment seeds to fund actual paid replenishment, stay nonnegative through first payroll, pay all scheduled installments in-window, and reach day 63 with nonnegative cash, zero arrears and positive COGS-based operating income over days 31–60. At day 63 require improved cash less outstanding principal and unpaid interest versus each control. Publish realized sales, weekly payments, post-payroll cash, finance and capital ledgers, closing stock, the day-60 and day-63 results, and whether optional investment actually resumed. Don't credit inventory, borrowed principal or book value as return. If the gap is entirely deferred investment, say so; this is not proof that growth pays back.
- A pass merits a separate before-opening adoption and investment/payback design. If either seed fails, or no optional investment can resume without reopening the cash gap, keep the Harbor change player-led. Do not lower the reserve or the acceptance thresholds to rescue this comparison. No live tuning, scenario changes, policy adoption, merge, or acceptance claim follows.

## Evidence Pins

Paths are relative to `docs/balance/generated/`.

| Artifact | SHA-256 |
| --- | --- |
| `hpa-721-harbor-snack-trial/result.json` | `208358d61bcc25bae3f9ea4a3aa13ede4587563a0557b56e2d045241c93e9016` |
| `hpa-721-harbor-snack-native-reach/result.json` | `bde252b4c5d505813f88f47c3a8c9f350ebec6f6fa8c3114cabc650cba956819` |
| `hpa-721-harbor-snack-opening-budget/result.json` | `8945e3a8ee75fb529c58d321a59a8d4b2f99c974ee36bc08f1fc602301cb1008` |
