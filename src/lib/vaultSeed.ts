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
  // HLP protocol + strategy vaults and high-TVL community vaults used for
  // production discovery until Hyperliquid exposes a fuller public summary feed.
  "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303", // Hyperliquidity Provider (HLP)
  "0x010461c14e146ac35fe42271bdc1134ee31c703a", // HLP Strategy A
  "0x31ca8395cf837de08b24da3f660e77761dfb974b", // HLP Strategy B
  "0xb0a55f13d22f66e6d495ac98113841b2326e9540", // HLP Liquidator 2
  "0x1e37a337ed460039d1b15bd3bc489de789768d5e", // Growi HF
  "0x45e7014f092c5f9c39482caec131346f13ac5e73", // Ultron
  "0xb1505ad1a4c7755e0eb236aa2f4327bfc3474768", // Bitcoin Moving Average Long/Short
  "0x115849ce84370f25cadcf0d348510d73837e1aa5", // Orbit Value Strategies
  "0x9e02aca9865e1859bb7865f6f64801e804a173df", // AceVault Hyper01
  "0xd6e56265890b76413d1d527eb9b75e334c0c5b42", // Systemic Strategies HyperGrowth
  "0xa6a34f0bf2ccea9a1ddf9e9a973f17c498dc5e40", // FC Genesis - Quantum
  "0x07fd993f0fa3a185f7207adccd29f7a87404689d", // Systemic Strategies L/S Grids
  "0xf967239debef10dbc78e9bbbb2d8a16b72a614eb", // Sifu
  "0x914434e8a235cb608a94a5f70ab8c40927152a24", // MC Recovery Fund
  "0xc179e03922afe8fa9533d3f896338b9fb87ce0c8", // drkmttr
  "0xca230e816bdb34a46960c2f978a30a563d1ae9e0", // Hyperrr
  "0xc5098d9a59e4a5cc15ac3b71c02d80d2a3cabbf7", // Tay
  "0x957fec7e7db4cec37cca9fbdb2a98185a9e9ee60", // maxwin
  "0x5a733b25a17dc0f26b862ca9e32b439801b1a8c7", // Hyperliquidity Trader (HLT)
  "0x1840bdb83caff17de910ec407cafb817678786b5", // Scott Phillips Trading Vault
];
