# Legacy Railway shim

The whale indexer product/runtime was removed. This directory exists only because
an older Railway service can still be configured with `workers/whale-indexer` as
its root directory. The Dockerfile intentionally builds the active
`workers/momentum-alerts` worker so legacy Railway deployments do not fail.
