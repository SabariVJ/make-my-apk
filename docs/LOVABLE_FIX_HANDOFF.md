# SVJ activity fix and Lovable handoff

Target repository: `SabariVJ/make-my-apk`  
Target branch: `release/play-v1-compliance`  
Starting commit: `3ad1f4799b4a80b73b3c52f27de88eefaa3ce09f`

## What this patch changes

- Repairs older cached profiles whose missing `xpHistory` caused meal/workout/task XP updates to throw. In an isolated reproduction, meal logging threw `TypeError: prevUser.xpHistory is not iterable`.
- Moves task XP, feed and tier-notification effects out of React state updater callbacks. A StrictMode reproduction previously awarded 240 XP for one 120-XP task; the repaired path awards 120 once.
- Contains browser storage and decoration failures. Meal/workout forms reset only when their primary record saves, and failed writes show an inline error with the draft retained.
- Adds personal task editing with persisted IDs and protected completed XP, and replaces the native category/difficulty controls with dark Radix selectors in an accessible dialog.
- Removes automatic cinematic welcome/personalization, the Samurai profile banner and the +100 welcome grant. Signing in no longer tops up Founder XP counters. Existing cached progress is preserved.
- Removes the displayed +200 “all tasks” bonus because that bonus had no corresponding award implementation.

The new earn-a-month economy is a **plan**, in `docs/XP_RETENTION_PLAN.md`. This patch does not grant free subscriptions, add a fake wallet, run a database migration or publish production.

## Use the correct Lovable branch

At inspection, GitHub `main` was `ee61a91185ae4f5da795f8d8e9d20e9ac630aaa1`, with three commits ahead and 25 commits behind the compliance branch. It contains separate Lovable preview-auth changes. Preserve those changes; do not replace `main` with the compliance tree or rewrite either history.

In the existing Lovable project's GitHub connection settings, select **`release/play-v1-compliance`** to load this work. Lovable syncs one selected branch; commits on a different branch do not automatically appear in its current preview. [Official Lovable GitHub instructions](https://docs.lovable.dev/integrations/github).

A Lovable-internal repository UUID or `edit/...` branch name is not itself proof of a wrong project. Confirm the connected GitHub repository, selected branch and the actual source files. The prepared source contains `src/app/lib/activity.ts`, `src/app/components/TaskEditorDialog.tsx` and this handoff document. Do not delete the connection, create a replacement repository or discard existing work to resolve a naming difference.

## Prompt to paste into Lovable

```text
Continue the existing SVJ app in SabariVJ/make-my-apk on release/play-v1-compliance.

Read AGENTS.md, docs/LOVABLE_FIX_HANDOFF.md and docs/XP_RETENTION_PLAN.md first.
Verify that the selected connected branch includes the prepared activity fix,
TaskEditorDialog.tsx and activity.ts. Preserve the branch history and current
Android compliance behavior.

First verify the prepared fixes in your preview using a disposable test account:
1. Log a workout with named exercises and valid sets; verify its history and XP
   survive refresh without a page error or duplicate entry.
2. Log a meal; verify its calorie total, history and XP survive refresh.
3. Complete and undo a task; verify the exact XP delta and no page error.
4. Create a custom task, change its title/category/difficulty, cancel an edit,
   and rename it after completion. Completed XP must remain unchanged by rename.
5. Check the dark category/difficulty menus on tablet portrait/landscape and a
   narrow phone screen. Verify keyboard focus, scrolling and closing the dialog.
6. Confirm the Samurai banner, cinematic welcome and welcome XP grant are gone.
   Preserve existing progress and legitimate Founder/lifetime membership.
7. Run npm test, TypeScript, lint, formatting and the production build. Inspect
   console errors from the exact preview; do not label a code-only check as a
   live-device pass. Do not clear an existing member's data to hide a crash.

Then prepare the server implementation described in XP_RETENTION_PLAN.md:
daily login XP, a capped and idempotent mission ledger, 3,000 Reward XP plus 21
qualifying days for one 30-day Plus grant, and a usable free earning path after
the original seven-day trial expires. Personal tasks and manual logs cannot
mint redeemable credit. Existing XP is not redeemable automatically.

Build this in the documented phases, validate RLS and transactions in an
isolated database, and keep the reward feature disabled until the tests pass.
Do not merge, publish, change live accounts or apply live schema changes under
this task. Prepare the concrete migration and rollout for review first.
Report implemented code, passing checks, preview/device results and remaining
deployment work separately. Do not claim a mock UI is a working reward system.
```

## Validation scope

The new tests exercise the real React provider, workout/meal forms and task editor against synthetic device storage. They replace Supabase and confetti dependencies and do not create, modify or delete a live account. React's updater purity requirement is documented in [useState](https://react.dev/reference/react/useState); storage quota exceptions are documented in [Storage.setItem](https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem).

Ordinary activity persistence remains device-local until the planned server migration. Protected entitlement behavior, database deployment, Lovable publishing and physical Android operation require their separate verification. The cloud browser available for this work could not open the local preview, so component checks must not be reported as tablet screenshot validation.

## Checks completed for the prepared patch

| Check                                         | Result                                             |
| --------------------------------------------- | -------------------------------------------------- |
| JavaScript/TypeScript tests                   | 65 passed, including 10 real React component tests |
| Android theme regression checks               | 8 passed                                           |
| TypeScript                                    | Passed                                             |
| ESLint                                        | 0 errors; 9 existing warnings                      |
| Source formatting and whitespace              | Passed                                             |
| Production client and server build            | Passed                                             |
| Lovable preview / physical Android smoke test | Pending in the selected connected project/device   |
| Production deployment / live DB mutation      | Not performed                                      |

The npm lockfile was repaired to include missing platform-specific optional packages and the new test tools, and the Bun lockfile was synchronized. Existing runtime dependency versions were preserved. Both npm's clean-install dry run and Bun's frozen lockfile check passed. The test runner uses Node's `--import tsx` entry point so it does not require the tsx command-line IPC socket.
