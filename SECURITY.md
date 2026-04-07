# HyperPulse Security Notes

## Threat model
- Public, interview-facing web deployment on Vercel
- Read-only analytics as the primary product surface
- Assume arbitrary internet traffic, scraping attempts, malformed query input, and curiosity-driven wallet probing

## Current protections
- Read-only wallet analytics require only a public address
- Manual API private-key entry is removed from the public UI
- Wallet-specific API routes use strict validation, rate limiting, and `no-store` cache headers
- Market routes use bounded inputs and short-lived shared caching
- App-wide security headers include CSP, frame protection, referrer policy, content-type sniffing protection, permissions policy, and production HSTS
- Execution-capable browser-wallet sessions are not persisted across reloads

## Accepted limitations
- Rate limiting is lightweight and in-memory; it is intended for interview-safe abuse reduction rather than full WAF-grade enforcement
- Wallet addresses are public on-chain, so privacy protections focus on minimizing persistence, logging, and cross-user caching rather than hiding public data
- This project is an analytics showcase, not a custody system or institutional trading platform

## Reporting
If you find a security issue in HyperPulse, contact Anthony directly before sharing it publicly.
