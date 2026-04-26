# HyperPulse

HyperPulse is a Hyperliquid-native intelligence workspace for live markets, read-only portfolio review, and trader-facing documentation.

The current public demo is optimized for **Hyperliquid traders** and intentionally ships in a **read-only posture**. It is designed to be safe to share publicly while still showing real product surfaces.

## Public Demo Scope

The public production deployment exposes:

- `Home`
- `Markets`
- `Portfolio`
- `Docs`

Hidden in the public demo by default:

- `Trading`
- `Factors`
- `Whales`

Those surfaces can still exist in non-public environments, but they are not part of the shareable public demo posture.

## Product Surfaces

- **Markets**: table-first Hyperliquid directory with price, funding, and top-level tape context
- **Portfolio**: read-only wallet review with performance chart, positions, and trade journal
- **Docs**: methodology and implementation notes for the current demo

## Deployment Architecture

- **Frontend**: Next.js App Router
- **Primary deployment target**: Vercel
- **Market data**: Hyperliquid-native APIs
- **Whale worker**: Railway worker in non-public environments
- **Database**: Neon Postgres for worker-backed analytics where enabled

## Feature Flags

Runtime flags are resolved from environment variables:

- `ENABLE_TRADING`
- `ENABLE_FACTORS`
- `ENABLE_WHALES`
- `NEXT_PUBLIC_ENABLE_TRADING`
- `NEXT_PUBLIC_ENABLE_FACTORS`
- `NEXT_PUBLIC_ENABLE_WHALES`

Public production defaults:

- `ENABLE_TRADING=false`
- `ENABLE_FACTORS=false`
- `ENABLE_WHALES=false`

Optional site/runtime variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BUILD_ID`

## Local Setup

Install dependencies:

```bash
npm install
```

Run the local dev server:

```bash
npm run dev
```

Open:

- [http://localhost:3000](http://localhost:3000)

## Verification

Build the app:

```bash
npm run build
```

Run the public smoke test against a local or deployed environment:

```bash
npm run smoke:public
```

To enforce the public-demo expectations during smoke testing:

```bash
HYPERPULSE_EXPECT_PUBLIC_FLAGS=1 npm run smoke:public
```

## Safety Posture

- Public demo is **read-only**
- No manual private-key entry
- Browser-wallet portfolio view is analytics-only by default
- Hidden features are disabled in public production
- Health, metadata, and crawler routes are included for public sharing

## Notes

- Landing screenshots are intended to come from real HyperPulse UI states rather than synthetic marketing mockups.
- If you are deploying publicly, verify the production flags first before sharing the URL.
