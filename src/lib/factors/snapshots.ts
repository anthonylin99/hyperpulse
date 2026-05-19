import type { FactorSnapshot } from '@/types';

// These are HyperPulse-tracked Artemis baskets built from Artemis' public
// methodology and the latest monthly factor reports. We keep the factor
// definitions canonical and only store the names explicitly surfaced in the
// reports so the app stays honest about coverage.
export const FACTOR_SNAPSHOTS: FactorSnapshot[] = [
  {
    id: 'market-risk',
    name: 'Market Risk',
    shortLabel: 'MKT',
    description:
      'High-beta crypto market exposure measured through a long-only basket of the largest liquid tokens highlighted in the latest Artemis report.',
    methodology:
      'Monthly top-10 market-cap basket from the Artemis market factor update. Weighting mirrors the report percentages and acts as the canonical market regime anchor.',
    reportDate: '2026-05-15',
    sourceUrl: 'https://research.artemis.ai/p/artemis-crypto-factor-model-analysis-caf',
    sourceTitle: 'Artemis Crypto Factor Model Analysis: May 2026 Update',
    narrativeTags: ['beta', 'risk-on', 'large-cap'],
    constructionType: 'long-only',
    coverageNote: 'Uses the exact top market-cap names and weights shown in the May 2026 Artemis report.',
    longs: [
      { symbol: 'BTC', weight: 73.2 },
      { symbol: 'ETH', weight: 13.1 },
      { symbol: 'XRP', weight: 4.0 },
      { symbol: 'BNB', weight: 3.9 },
      { symbol: 'SOL', weight: 2.3 },
      { symbol: 'TRX', weight: 1.5 },
      { symbol: 'DOGE', weight: 0.8 },
      { symbol: 'HYPE', weight: 0.5 },
      { symbol: 'ADA', weight: 0.4 },
      { symbol: 'BCH', weight: 0.4 },
    ],
    shorts: [],
  },
  {
    id: 'size',
    name: 'Size / SMB',
    shortLabel: 'SMB',
    description:
      'Small-minus-big factor. Artemis longs smaller-cap names and shorts larger-cap names to isolate the size premium.',
    methodology:
      'Canonical Artemis SMB construction: long the smallest market-cap cohort and short the largest. HyperPulse tracks the names explicitly cited in the March and May 2026 Artemis reports.',
    reportDate: '2026-05-15',
    sourceUrl: 'https://research.artemis.ai/p/artemis-crypto-factor-model-analysis-caf',
    sourceTitle: 'Artemis Crypto Factor Model Analysis: May 2026 Update',
    narrativeTags: ['size', 'small-cap', 'beta'],
    constructionType: 'long-short',
    coverageNote: 'Tracked subset built from names directly referenced in the latest Artemis SMB commentary, not the full private rebalance file.',
    longs: [
      { symbol: 'DEXE' },
      { symbol: 'LUNC' },
      { symbol: 'LDO' },
      { symbol: 'AERO' },
      { symbol: 'ZEC' },
      { symbol: 'HYPE' },
    ],
    shorts: [
      { symbol: 'TAO' },
      { symbol: 'WLD' },
      { symbol: 'ATOM' },
      { symbol: 'BTC' },
      { symbol: 'ETH' },
      { symbol: 'SOL' },
    ],
  },
  {
    id: 'value',
    name: 'Value',
    shortLabel: 'VAL',
    description:
      'Relative value factor favoring fundamentally cheap tokens and shorting expensive tokens on market-cap-to-fees style valuation metrics.',
    methodology:
      'Canonical Artemis value construction: long the cheapest names and short the most expensive. HyperPulse tracks the names cited across the May Artemis writeup.',
    reportDate: '2026-05-15',
    sourceUrl: 'https://research.artemis.ai/p/artemis-crypto-factor-model-analysis-caf',
    sourceTitle: 'Artemis Crypto Factor Model Analysis: May 2026 Update',
    narrativeTags: ['value', 'defensive', 'fundamentals'],
    constructionType: 'long-short',
    coverageNote: 'Tracked subset from report commentary. This is not the full Artemis rebalance file.',
    longs: [
      { symbol: 'ARB' },
      { symbol: 'AERO' },
      { symbol: 'RAY' },
      { symbol: 'MORPHO' },
      { symbol: 'JUP' },
    ],
    shorts: [
      { symbol: 'ALGO' },
      { symbol: 'CHZ' },
      { symbol: 'OP' },
      { symbol: 'WLD' },
    ],
  },
  {
    id: 'momentum',
    name: 'Momentum',
    shortLabel: 'MOM',
    description:
      'Volatility-adjusted momentum factor that owns trend leaders and shorts persistent laggards.',
    methodology:
      'Canonical Artemis momentum factor based on 3-week rolling risk-adjusted momentum. HyperPulse tracks the names explicitly surfaced in the latest reports as the most meaningful winners and losers.',
    reportDate: '2026-05-15',
    sourceUrl: 'https://research.artemis.ai/p/artemis-crypto-factor-model-analysis-caf',
    sourceTitle: 'Artemis Crypto Factor Model Analysis: May 2026 Update',
    narrativeTags: ['momentum', 'trend', 'breakout'],
    constructionType: 'long-short',
    coverageNote: 'Tracked subset built from the winners/losers discussion in the March and May report.',
    longs: [
      { symbol: 'DEXE' },
      { symbol: 'ZEC' },
      { symbol: 'LUNC' },
      { symbol: 'HYPE' },
    ],
    shorts: [
      { symbol: 'AXS' },
      { symbol: 'PENDLE' },
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    shortLabel: 'GRW',
    description:
      'On-chain growth factor combining fee growth and DAU growth to identify assets with accelerating activity.',
    methodology:
      'Canonical Artemis growth factor: equal-weight long-short basket ranked on 2-week fee growth and DAU growth. HyperPulse tracks the names highlighted in recent report commentary.',
    reportDate: '2026-05-15',
    sourceUrl: 'https://research.artemis.ai/p/artemis-crypto-factor-model-analysis-caf',
    sourceTitle: 'Artemis Crypto Factor Model Analysis: May 2026 Update',
    narrativeTags: ['growth', 'AI', 'on-chain activity'],
    constructionType: 'long-short',
    coverageNote: 'Tracked subset from the latest Artemis growth factor winners and losers.',
    longs: [
      { symbol: 'MON' },
      { symbol: 'XPL' },
      { symbol: 'ARB' },
      { symbol: 'ENA' },
    ],
    shorts: [
      { symbol: 'AERO' },
      { symbol: 'RAY' },
      { symbol: 'MORPHO' },
      { symbol: 'ZRO' },
    ],
  },
  {
    id: 'fundamentals-1',
    name: 'Fundamentals 1',
    shortLabel: 'F1',
    description:
      'Artemis long-short factor combining DAU growth, inverted active revenue share, revenue stability, and market-cap-to-fees mean reversion.',
    methodology:
      'Canonical Artemis Fundamentals 1 launch model. HyperPulse tracks the names explicitly referenced in the launch, March, and May report as the most informative longs and shorts.',
    reportDate: '2026-05-15',
    sourceUrl: 'https://research.artemisanalytics.com/p/crypto-factor-model-analysis-launching',
    sourceTitle: 'Crypto Factor Model Analysis: Launching Fundamentals 1',
    narrativeTags: ['fundamentals', 'quality', 'valuation'],
    constructionType: 'long-short',
    coverageNote: 'Tracked subset from the public launch note and latest report updates. It preserves the canonical Artemis factor logic while being explicit about subset coverage.',
    longs: [
      { symbol: 'AXS' },
      { symbol: 'ALGO' },
    ],
    shorts: [
      { symbol: 'PENDLE' },
      { symbol: 'RAY' },
      { symbol: 'JTO' },
      { symbol: 'CHZ' },
    ],
  },
];
