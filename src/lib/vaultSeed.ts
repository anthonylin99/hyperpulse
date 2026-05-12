// Seed list of known Hyperliquid vault addresses.
//
// Hyperliquid has no public "list all vaults" endpoint. We discover via this
// seed then fetch `vaultDetails` per address. The list aggregator silently
// drops addresses that return null or error from the API, so it's safe to
// over-include here.
//
// HOW TO POPULATE
// 1. Open https://app.hyperliquid.xyz/vaults
// 2. For each vault tile, copy the 0x… address from the URL when you click in.
// 3. Paste the lowercase address into VAULT_SEED below.
// 4. Restart the dev server — the /vaults table refreshes server-side every
//    5 minutes (s-maxage=300), so a hard reload may also be needed.
//
// REFRESH CADENCE: ~monthly until leaderboard-based auto-discovery lands
// (see /docs "Vault Analytics" → known limitations).

export const VAULT_SEED: readonly string[] = [
  // Add vault addresses here. Example:
  // "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
];
