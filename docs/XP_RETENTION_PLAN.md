# SVJ: daily streaks and earned Plus

Status: implementation staged for review, 2 September 2026. The crash fixes, task editor, server-validated reward code and Earn Plus UI are in this release. Daily check-in XP and XP-to-Plus redemption remain **disabled** until the pending SQL is reviewed and applied to the intended project. No live database migration or membership change has been performed.

The implementation is in `supabase/pending/20260902_earned_plus.sql`, with earning-only activation prepared in `supabase/pending/20260902_enable_earned_plus.sql`. These files are deliberately outside `supabase/migrations`; Lovable will not apply them automatically.

## Product goal

Give members a reason to return, make a useful daily plan, record their work, and see sustained progress. Reward activity across days. Opening the app for hours, adding hundreds of custom tasks, or repeatedly checking the same item must not unlock membership.

Use two clearly labeled balances:

| Balance    | Purpose                                       | Spending                                      |
| ---------- | --------------------------------------------- | --------------------------------------------- |
| Profile XP | Progress, level and profile history           | Never reduced by a subscription redemption    |
| Reward XP  | Newly earned, server-validated mission credit | Deducted atomically when claiming earned Plus |

Existing XP, including Founder totals, remains historical profile progress. Reward XP starts at zero at launch; local-storage totals, welcome grants, admin grants, imports and historical activity cannot be converted into Reward XP.

## Proposed launch rules

These are configurable product defaults, not an existing promise to members.

| Rule                      | Initial value                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Earned benefit            | One month: 30 days of SVJ Plus, with no automatic charge                                            |
| Cost                      | 3,000 Reward XP                                                                                     |
| Activity requirement      | At least 21 distinct qualifying activity days since feature launch                                  |
| Account age               | At least 21 full days, measured by the server                                                       |
| Daily mission credit      | 50 Reward XP for each of up to 3 eligible missions                                                  |
| Daily cap                 | 150 Reward XP per account                                                                           |
| Qualifying activity day   | At least one eligible mission completed that day                                                    |
| Redemption frequency      | Once per verified account for launch; no repeating monthly free subscription                        |
| Daily check-in            | 10 Profile XP once per reward day                                                                   |
| Seven-day login milestone | An extra 30 Profile XP on each seventh consecutive check-in                                         |
| Reward day                | Server-defined Asia/Kolkata calendar day for the initial launch; one globally configured policy     |
| Missing a day             | Current login streak restarts on return; best streak, earned credit and qualifying-day count remain |

At three eligible missions daily, reaching the XP threshold takes 20 days, but redemption still requires 21 distinct active days. Two missions daily take 30 days. These are illustrations, not guarantees of retention or revenue.

Daily login XP does **not** increase the redeemable balance or qualifying activity days. Reopening, signing out and in, refreshing, changing device time or using a second device cannot create another check-in for that server day. Display the next reset time from the server in the user's local time.

## Eligible actions and prevention of instant farming

| Action                                                                        | Profile XP                                           | Reward XP at launch          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| Server-issued daily mission with validated session/completion                 | Server-calculated amount                             | 50, subject to the daily cap |
| User-created personal task                                                    | Capped server-calculated progress XP after migration | 0                            |
| Manual meal or workout entry                                                  | Capped progress XP after migration                   | 0                            |
| Daily login check-in                                                          | 10; eligible streak bonus separately                 | 0                            |
| Editing, deleting, undoing, redoing, importing or retrying an existing action | No new grant                                         | 0                            |
| Founder/admin/welcome/legacy adjustments                                      | Preserve legitimate historical display values        | 0                            |

For an eligible mission:

1. The server assigns its immutable definition, version, date, target, minimum elapsed duration and reward. A client cannot submit arbitrary difficulty, XP, eligibility or completion timestamps.
2. Starting creates a server-timestamped session. Allow one timed eligible session at a time and resume it after reconnecting; creating a task cannot create a completed session.
3. Completion checks the authenticated account, assigned mission, server day, start time, target and remaining cap. Only the server decides the outcome.
4. A unique `(user_id, mission_assignment_id)` completion prevents repeat grants even when a caller supplies new request IDs. A separate `(user_id, request_id)` key makes retries return the original receipt.
5. A row lock on the wallet serializes simultaneous completions and claims. Enforce the cap within the same transaction that creates the ledger entry.
6. Keep completion receipts and deduplication identities after edits or deletions; deleting a log must never recreate reward eligibility.

Timers and server checks prevent instant bulk submission and replay. They cannot prove that a person actually exercised, read or ate a meal. Describe these as **server-validated missions**, not guaranteed proof of real-world behavior. The finite launch reward, daily cap and multi-day requirement limit abuse without collecting intrusive proof photos or tracking unrelated device activity.

One verified account can still be one of several accounts controlled by a person. Use existing verified identity, reasonable account/rate limits and review of exceptional patterns; do not promise complete resistance to fake accounts or penalize ordinary shared devices automatically.

## Task editing

The accompanying fix adds editing to personal tasks using one dark, keyboard-accessible dialog. Title, category and difficulty can change before completion. A completed task can be renamed; changing its category or difficulty requires marking it incomplete first. Its recorded XP is preserved so an undo subtracts what was actually awarded. Cancel discards edits.

For the server migration, preserve task IDs and audit revisions. Editing must never insert a second completion, retroactively raise its credit, or restart eligibility. Personal tasks remain ineligible for Reward XP even if a user selects “Elite.”

## The free access path must remain usable

The current app has a seven-day trial and a restricted shell in `src/app/App.tsx` and `src/lib/trial.functions.ts`. A 21-day earned reward cannot depend on features that disappear after day seven.

When this feature launches, make the three eligible daily missions, check-in, personal progress and the “Earn Plus” screen accessible in the restricted shell. Keep premium benefits gated. Retain the existing 60-Day Challenge and its separate two-month code reward; do not silently replace it with this offer.

Founder and lifetime Plus accounts keep lifetime access and see “Lifetime access already active.” Never debit their balance or replace a null lifetime expiry with a finite date. If a timed Plus member is eligible, extend from `max(server_now, current_valid_expiry) + 30 days`, with the same once-per-account launch limit. After expiration, the ordinary access rules apply. This reward must not enroll anyone in billing.

## Server design and migration

Current ordinary task, meal and workout records are device-local in `SVJContext.tsx`. Only the 60-day flow has existing server-side completion/reward operations. Do not connect the current local `totalXP` or `awardXp` callback directly to a subscription unlock.

Proposed tables (adapt names to the verified deployed schema):

| Table                                                            | Required responsibility                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `user_tasks`, `workout_logs`, `meal_logs`                        | Account-owned, validated records with server IDs/timestamps and revision data            |
| `daily_checkins`                                                 | One row per account and policy day; streak and login XP receipt                          |
| `mission_definitions`, `mission_assignments`, `mission_sessions` | Approved, versioned mission rules, assignments and immutable start times                 |
| `activity_completions`                                           | Unique completion receipt, source identity and validation result                         |
| `xp_ledger`                                                      | Append-only earn, adjustment and redemption entries; source and idempotency constraints  |
| `reward_wallets`                                                 | Server-only redeemable balance, synchronized with the ledger under a lock                |
| `reward_redemptions`                                             | One launch claim per account, debit, membership dates and receipt                        |
| `reward_policy`                                                  | Server-only thresholds, timezone, campaign identity and disabled-by-default feature flag |

Keep an audit identifier for the **launch reward entitlement**, separate from mutable policy versions, so changing the threshold or policy version does not allow a second claim.

Use Supabase row-level security and column privileges: members may read only their own logs, wallet and receipts. The browser must not write ledger entries, balances, verification flags, streak counters or membership fields directly. Sensitive operations use the existing server credential gate in `src/integrations/supabase/client.server.ts`. Never put privileged credentials in client bundles or logs. Existing profile entitlement-protection triggers must remain intact. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Suggested server API:

- `getEngagementState`: authoritative balances, limits, check-in state, next reset, qualifying days, eligibility reasons and active entitlement.
- `claimDailyCheckin`: derive identity/day from the verified session/server; return an existing receipt on retries.
- `createTask`, `updateTask`, `completeTask`, `logWorkout`, `logMeal`: validate ownership and return saved data plus authoritative balances.
- `startDailyMission`, `completeDailyMission`: validate assignment/session and apply the capped grant.
- `redeemEarnedPlus`: accept only a request identity; derive account, price and benefit server-side.

Implement redemption as **one PostgreSQL transaction**, not a series of independent Supabase REST writes:

1. Verify the authenticated user and enabled policy; lock their wallet.
2. Return the prior receipt for an idempotent retry; reject a second launch redemption.
3. Recheck verified account, age, qualifying days, available balance and existing lifetime access.
4. Write the debit ledger entry, update wallet, create the redemption receipt and extend the existing membership using the protected server path.
5. Commit all changes together. Any failure rolls everything back. Refresh both membership and reward queries from the returned server state.

Preserve prior device records during migration. Imports carry `legacy_import` provenance and receive zero Reward XP. Scope caches by authenticated user ID and clear in-memory state on account changes; never display one user's private meal/workout history in another account. Import and retry must be idempotent. For offline entries, show pending status until the server accepts them; offline data cannot unlock Plus.

## UI and daily return flow

Keep SVJ's charcoal, white and crimson style. Add one compact card to Challenges with today's check-in, eligible missions completed, Reward XP progress and qualifying days. Use inline confirmation once per day; remove repeated welcome screens and signup-credit celebrations.

The “Earn Plus” detail screen should show the exact cost, eligibility, ledger history, next reset and a single claim button. A disabled button must state the actual missing requirement. Show the confirmed expiry only after a successful receipt. Preserve the user's form on errors and provide retry without duplicate grants.

After this foundation, useful follow-ups are a weekly progress review and the previously requested accepted-rivalry flow. Implement each against real persisted activity. Avoid adding decorative engagement counters or claiming that a friend is progressing when no event exists.

## Delivery order and acceptance gates

1. **Stability first:** release the prepared crash/editor fix, verify in the correct Lovable preview and on the user's Android device. Preserve current Android payment and navigation restrictions.
2. **Persist activity:** prepare migrations, RLS and server APIs; run them against an isolated database with disposable accounts. Verify cross-device reload, ownership and safe legacy import.
3. **Daily check-in:** add the idempotent server-day event and streak logic. Verify midnight, duplicate sessions, missed days and device-clock changes.
4. **Reward ledger and missions:** implement validated sessions, caps, unique receipts and the post-trial free path. Keep claiming disabled until the security and concurrency tests pass.
5. **Earned Plus:** implement the atomic claim, lifetime/timed-member handling and expiry refresh. Prepare the complete reviewable rollout before requesting permission for live schema changes or publishing.

Required tests before enabling rewards:

- Repeated taps, browser refresh, StrictMode and network retries create exactly one record/grant.
- Concurrent check-ins from two devices grant once; client clock changes have no effect.
- Creating and completing 100 personal tasks yields zero Reward XP.
- Editing a completed task or deleting/recreating a log cannot grant again.
- Concurrent mission completions cannot exceed 150 eligible XP in the same policy day.
- Fewer than 21 qualifying days or less than 3,000 Reward XP cannot claim.
- Two simultaneous claims create one debit and one entitlement; injected failure between debit and membership update rolls back both.
- Cross-account reads and writes fail; direct ledger, counter and expiry manipulation fail.
- Existing legitimate Founder/lifetime access remains unchanged, timed Plus extends correctly, and the existing 60-day reward still works.
- A member whose original seven-day trial expired can still earn the required daily mission credit.
- Claim failure preserves balance, avoids success messaging, and can be retried with the same request ID.

Measure repeat use and useful completed activity, legitimate/blocked claims, failed saves and the cost of the promotion after launch. Review the proposed caps and one-time offer using actual usage before considering recurring free months.
