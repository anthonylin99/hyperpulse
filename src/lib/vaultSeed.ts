// Seed list of known Hyperliquid vault addresses.
//
// HyperPulse uses this curated list for stable preview/testing coverage, then
// may supplement it with Hyperliquid's recent `vaultSummaries` response when
// that endpoint returns data. Keep this list small and high-conviction.
//
// HOW TO POPULATE
// 1. Open https://app.hyperliquid.xyz/vaults
// 2. For each vault tile, copy the 0x… address from the URL when you click in.
// 3. Paste the lowercase address into VAULT_SEED below.
// 4. Restart the dev server — the /vaults table refreshes server-side every
//    5 minutes (s-maxage=300), so a hard reload may also be needed.
//
// REFRESH CADENCE: ~monthly until richer vault discovery lands.

export const VAULT_SEED: readonly string[] = [
  // HLP: enough for preview smoke tests even before broader vault discovery is curated.
  "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
];
