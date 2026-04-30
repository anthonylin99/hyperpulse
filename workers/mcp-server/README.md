# HyperPulse Private MCP Server

Private, read-only MCP-over-stdio server for AI agents that need HyperPulse market context.

## Tools

- `hyperpulse_get_market_context`
- `hyperpulse_get_levels`
- `hyperpulse_get_trade_ideas`
- `hyperpulse_get_positioning_alerts`

All tools are read-only and return guardrails with `noOrderPlacement: true`.

## Run

```bash
DATABASE_URL=postgres://... npm run mcp:start
```
