# Neon Exposure Zones And Whale Performance Refactor

## Goal

Implement a forward-only Neon/data refactor for current BTC/ETH/SOL exposure zones and durable whale-performance tables while preserving legacy tables until the new path is verified.

## Required Checklist

- [ ] Capture current dirty worktree and preserve existing local changes.
- [ ] Create `0004_*` migration with reaction exposure current/events tables and whale-performance tables.
- [ ] Add a table-retention matrix before any production table drop.
- [ ] Implement deterministic zone IDs and side-separated bull/bear ranking.
- [ ] Move persistent exposure-zone writes to `workers/reaction-map`.
- [ ] Make `/api/market/reaction-levels` read-only for exposure-zone persistence.
- [ ] Add range-aware cleanup with clamp and time-cap fallback.
- [ ] Update chart/UI wording and tooltip metadata to say inferred zones.
- [ ] Update Docker/DigitalOcean deployment docs away from Railway where relevant.
- [ ] Test migration on Neon temp branch before production mutation.
- [ ] Run Docker-only lint/build/API smoke checks.
- [ ] Browser-verify Reaction Map with Browser Use.
- [ ] Clean temporary screenshots/logs after verification.
- [ ] Update `CHANGES.md`, README/docs, and skill usage log.
- [ ] Final audit each requested item against this checklist.

## Decisions

- Use `neondb` as the only app database.
- Do not edit old applied migrations.
- Do not directly drop production tables until temp-branch validation passes.
- Keep legacy tables for one rollout to avoid split-brain regressions.
- Reaction worker owns persistent current-zone writes; Vercel API is read-only for zone persistence.
- Current zones are top 5 bull and top 5 bear per asset/window, clustered within 0.8%.
- Cleanup prunes short-lived aggregates outside `spot +/- clamp(3 * recent average move, 2%, 35%)`, with time-cap fallback.

## Current Phase

Implementation.
