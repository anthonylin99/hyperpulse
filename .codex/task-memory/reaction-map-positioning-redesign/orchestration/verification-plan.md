# Verification Plan

## Commands

- `docker compose ps --services`
- `docker compose exec web npm run lint`
- `docker compose exec web npm run build`
- `docker compose exec web npm run reaction:health`
- `docker compose logs --tail 120 web`
- If worker changes are included: `docker compose -f docker-compose.reaction-map.yml config --services`
- If worker runtime is available: `docker compose -f docker-compose.reaction-map.yml logs --tail 120 reaction-map`

## API Smoke

- `/api/market/reaction-levels?coin=BTC&window=15m`
- `/api/market/reaction-levels?coin=BTC&window=1h`
- Same checks for ETH and SOL.
- Confirm book shelf counts and positioning zone counts are separate.
- Confirm exact-position caveat remains present.

## Browser Smoke

- `/markets?asset=BTC`
- `/markets?asset=ETH`
- `/markets?asset=SOL`
- Check Order Book mode for bid/ask shelves.
- Check Positioning mode for buyer/seller roles, confidence, age, and missing-slot reasons.
- Check selected zone panel for acceptance/rejection context.
- Check mobile/narrow viewport for no overlap or clipped tooltip.
