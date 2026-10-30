# Chain lifecycle deployment

The lifecycle migration and the updated waxing endpoint are not compatible with an uncoordinated rollout. Production changes require the separate owner approvals in the deployment runbook.

1. Confirm the production Worker, Supabase project, approved migration, application build, backup, and rollback owner. Schedule a maintenance window and notify users that waxing changes will be unavailable.
2. Block waxing writes for the whole window, including direct authenticated database API writes. On the confirmed database, revoke insert, update, and delete on `public.chain_waxing_marks` from `PUBLIC`, `anon`, and `authenticated`; verify those roles cannot write. Keep reads available.
3. Apply the approved lifecycle migration and deploy the matching Worker version. Do not reopen writes after either step alone.
4. With an authorized test account, verify the existing waxing endpoint can set, reassign, clear, and retry a mark against the migrated database. Verify direct mark and stop-event writes remain forbidden, owner isolation holds, and the dashboard still reads activities.
5. Reopen waxing writes only after the Worker and database are compatible and the verification succeeds. Record the deployment versions and outcome.

If migration, deployment, or verification fails, keep writes blocked. Restore service only after an owner-approved compatible application and database combination has been established and verified. Do not blindly regrant direct writes or roll back a database containing lifecycle events.