# Delivery Map

## Goal

Separate Reaction Map into real order-book shelves, inferred positioning zones, and confluence-based reaction zones so the feature helps trade decisions without overclaiming OI data.

## Roles

| Role | Owner | Responsibility | Output |
|---|---|---|---|
| Architect / Tech Lead | Current agent | Scope, architecture, lane boundaries | Approved implementation plan |
| Data/Worker Owner | Pending | Worker windows, shelf/zone persistence, health metrics | Worker/API data ready |
| API/Model Owner | Pending | Payload contract, roles, confidence, hidden reasons | Typed model and adapters |
| UI Owner | Pending | Chart/panel layout, copy, responsive states | Usable market UI |
| Integration Engineer | Pending | Shared files, validation, browser checks | Integrated branch |
| Review Engineer | Pending | Bug/regression review | Findings or approval |
| Human Approver | User | Product vocabulary and release decision | Approval after proof |

## Parallel-Safe Lanes

- Data/Worker can work in `workers/reaction-map/**` after the payload contract is decided.
- UI can work in components after API/model fixtures are stable.
- Health/test seam can work in scripts after model field names are stable.

## Serial / Integration-Only Lanes

- `src/lib/reactionLevels.ts`, `src/lib/reactionLevelStore.ts`, and `src/types/index.ts` should be serialized first because they define the contract.
- `src/lib/tradePlan.ts` should follow role classification so it does not encode old support/resistance semantics.
- Package scripts, Docker config, migrations, and shared docs are integration-only unless assigned to one owner.

## Verification Gates

1. Contract smoke: BTC/ETH/SOL API returns separate book and positioning counts.
2. Model smoke: role classification cases pass for buyer/seller above/below price.
3. UI smoke: Order Book and Positioning views show different semantics.
4. Build gate: lint and production build pass inside Docker.
5. Runtime log gate: recent `web` logs show no new relevant errors.
6. Browser gate: BTC/ETH/SOL verified in local browser across desktop and narrow viewport.
