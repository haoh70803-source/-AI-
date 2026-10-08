# Legacy startup used automatic migrations and a worker. The original remains in
# the original worktree and this batch's local baseline snapshot.
Write-Output "LEGACY_STARTUP_DISABLED: use pnpm dev:review; daily database cutover has not been approved."
exit 2
