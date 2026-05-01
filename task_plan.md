# Task Plan

## Goal
Reduce dev cold-compile cost on market intelligence routes by moving trading-only providers deeper, slimming the shared nav, splitting route-specific server modules, and tuning dev entry retention.

## Phases
- [complete] Verify the current route/provider/import graph and confirm the main compile offenders
- [complete] Move trading-only providers out of the root layout and split market vs trading route groups
- [complete] Split the old market-intel barrel into route-focused server modules and update pages / APIs
- [complete] Defer SSE startup and tune Next dev `onDemandEntries`
- [complete] Validate with Docker build/lint plus live HTTP route checks and update docs/logs

## Constraints
- Use Docker containers for app execution and build/test commands
- Avoid destructive git operations because the worktree already has unrelated local changes

## Errors Encountered
- Playwright MCP could not be used for browser validation on this machine because it attempted to create files under `C:\Windows\System32`.
- The running dev server returned stale 404s immediately after the route move and needed a `web` service restart before live checks reflected the new route tree.
