# Phase15-N — Cancel notifications; per-user new-book mark (2026-11-23)

**Owner decision:** No internal notifications, bell, unread notification counter, outbound notification distribution or alert dispatch. The only new-item affordance is a small red **جديد** tag on recently created live books, cleared for **this account only** after opening the book. An explicit formal **اطلعت** remains independent and unchanged.

**Work lanes:** CHAT: this new branch; OPENCODE: prior Phase15 Plan review delivered with four blockers, currently no new assignment. No code changes in OpenCode lane.

**Classification:** HYBRID: GitHub/code/CI tests here; independent OpenCode security review and authorized Windows Host acceptance are external. No Phase16 start and no release authority.

## Scope and acceptance
1. Stop insertion of *all* new notification events: book availability, public incoming books, request workflow and due-reminder job. No notification API for new/old rows; retain old records/table unchanged (do not destructively migrate or delete records). Retain scheduling/reminder records as administrative data only, without notifications.
2. New-book mark is not a notification and carries no book metadata to anyone who cannot already view the book. Server supplies only IDs of **currently viewable active non-imported transactions created in the past 7 days** which were never opened by this account. No old imported archive markers and no row for a book outside transactionScope SQL, including administrative/daily situation restrictions.
3. A separate append-only `transaction_opened` (user_id, transaction_id, opened_at) state table, unique pair. It records *viewed UI* only, never inserts into `view_logs` and never calls formal `acknowledge`. POST /api/transactions/:id/opened requires authenticated `view`, effective scope, locked visibility check and is idempotent.
4. UI removes bell/global notification counters, shows **جديد** beside visible book rows/cards; opening clears only that account's mark after backend confirms. Failed read must not clear it. The official acknowledgement button retains its explicit semantics.
5. Tests: no leak for unauthorized grant/daily, no notifications for requests/broadcast/reminders, no route list old notifications; authorized/new versus imported/old/archived/scope; account isolation, rejected mark, duplicate mark and formal view-log separation; CI TypeScript/build/DB/API passing on synthetic Actions runner.
6. Keep all PRs Draft/NO MERGE. Never touch Windows staging, user data or reports 503. No changes to migration files already applied.
