export type MockSetupSide = "long" | "short";
export type MockSetupStatus = "trade-ready" | "watch-only" | "no-trade";
export type MockAlignment = "confirms" | "contradicts" | "mixed" | "crowded" | "none";

export interface MockMarketSetup {
  asset: string;
  side: MockSetupSide;
  status: MockSetupStatus;
  rank: number;
  confidence: number;
  price: number;
  trigger: number;
  stop: number;
  invalidation: number;
  tp1: number;
  tp2: number;
  momentum: string;
  oiChangePct: number;
  volumeChangePct: number;
  fundingApr: number;
  whaleBias: string;
  liquiditySignal: string;
  decisionLabel: string;
  move: string;
  whyNow: string;
  invalidLine: string;
  signalChecks: MockSignalCheck[];
}

export interface MockSignalCheck {
  label: string;
  state: "pass" | "warn" | "fail";
  note: string;
}

export interface MockLevel {
  label: string;
  price: number;
  kind: "support" | "resistance" | "liquidity" | "stop" | "target";
  note: string;
}

export interface MockLevelMap {
  asset: string;
  currentPrice: number;
  bias: string;
  levels: MockLevel[];
}

export interface MockCohortRead {
  label: string;
  alignment: MockAlignment;
  detail: string;
  longPct: number;
}

export interface MockHypeFundamental {
  label: string;
  value: string;
  delta: string;
  read: string;
}

export interface MockTradeCopilotData {
  generatedAt: string;
  dailySetup: MockMarketSetup;
  marketSetups: MockMarketSetup[];
  levelMaps: MockLevelMap[];
  cohortReads: MockCohortRead[];
  hypeFundamentals: MockHypeFundamental[];
  feedbackPrompts: string[];
}

export const mockTradeCopilotData: MockTradeCopilotData = {
  generatedAt: "Static concept snapshot",
  dailySetup: {
    asset: "SOL",
    side: "long",
    status: "watch-only",
    rank: 1,
    confidence: 72,
    price: 74.28,
    trigger: 75.4,
    stop: 72.6,
    invalidation: 71.8,
    tp1: 78.9,
    tp2: 82.4,
    momentum: "Relative strength vs BTC and ETH",
    oiChangePct: 20.7,
    volumeChangePct: 23.2,
    fundingApr: 11.4,
    whaleBias: "Slightly bullish",
    liquiditySignal: "Upside liquidity pocket near 79",
    decisionLabel: "SOL long watch, momentum confirms",
    move: "Wait for the $75.40 reclaim, then long toward $78.90-$82.40.",
    whyNow:
      "SOL is the only major in this sample with price up, volume expanding, and OI rising together. The trade is not active until it reclaims the trigger.",
    invalidLine: "A close back below $71.80 cancels the long. Stand aside below that line.",
    signalChecks: [
      {
        label: "Momentum confirms",
        state: "pass",
        note: "Price, open interest, and volume are rising together.",
      },
      {
        label: "Liquidity level is clean",
        state: "pass",
        note: "Nearest upside objective sits near $79 with limited nearby resistance.",
      },
      {
        label: "Whale / cohort read",
        state: "warn",
        note: "Profitable wallets lean long, but leverage is not aggressive.",
      },
      {
        label: "Funding is not overcrowded",
        state: "pass",
        note: "Funding is mildly positive and below crowded-long thresholds.",
      },
    ],
  },
  marketSetups: [
    {
      asset: "BTC",
      side: "long",
      status: "no-trade",
      rank: 1,
      confidence: 54,
      price: 64104.5,
      trigger: 65200,
      stop: 62800,
      invalidation: 62100,
      tp1: 66900,
      tp2: 69300,
      momentum: "Flat tape",
      oiChangePct: -1.5,
      volumeChangePct: -24.0,
      fundingApr: -3.5,
      whaleBias: "Bullish",
      liquiditySignal: "Two-sided chop",
      decisionLabel: "BTC no trade, wait for range break",
      move: "No trade. Stand aside until BTC breaks and holds $65,200.",
      whyNow:
        "BTC is chopping in a tight range on falling volume. Whale positioning is constructive, but there is no fresh momentum to lean on yet.",
      invalidLine: "There is no long to lose. BTC only gets interesting on a break and hold above $65,200.",
      signalChecks: [
        {
          label: "Momentum confirms",
          state: "fail",
          note: "Range-bound price action with declining 24h volume.",
        },
        {
          label: "Liquidity level is clean",
          state: "warn",
          note: "Liquidity is split above and below the current range.",
        },
        {
          label: "Whale / cohort read",
          state: "pass",
          note: "Large-wallet positioning remains net long.",
        },
        {
          label: "Funding is not overcrowded",
          state: "pass",
          note: "Funding is slightly negative, so long positioning is not crowded.",
        },
      ],
    },
    {
      asset: "SOL",
      side: "long",
      status: "watch-only",
      rank: 2,
      confidence: 72,
      price: 74.28,
      trigger: 75.4,
      stop: 72.6,
      invalidation: 71.8,
      tp1: 78.9,
      tp2: 82.4,
      momentum: "Strongest major",
      oiChangePct: 20.7,
      volumeChangePct: 23.2,
      fundingApr: 11.4,
      whaleBias: "Slightly bullish",
      liquiditySignal: "Upside magnet",
      decisionLabel: "SOL long watch, momentum confirms",
      move: "Wait for the $75.40 reclaim, then long toward $78.90-$82.40.",
      whyNow:
        "SOL is the only major here with price, volume, and open interest rising together. It is not active until it reclaims the trigger and holds.",
      invalidLine: "A close back below $71.80 cancels the long. Stand aside below that line.",
      signalChecks: [
        {
          label: "Momentum confirms",
          state: "pass",
          note: "Price, open interest, and volume are rising together.",
        },
        {
          label: "Liquidity level is clean",
          state: "pass",
          note: "Nearest upside objective sits near $79 with limited nearby resistance.",
        },
        {
          label: "Whale / cohort read",
          state: "warn",
          note: "Profitable wallets lean long, but leverage is not aggressive.",
        },
        {
          label: "Funding is not overcrowded",
          state: "pass",
          note: "Funding is mildly positive and below crowded-long thresholds.",
        },
      ],
    },
    {
      asset: "HYPE",
      side: "long",
      status: "watch-only",
      rank: 3,
      confidence: 66,
      price: 68.0,
      trigger: 69.3,
      stop: 65.9,
      invalidation: 64.8,
      tp1: 72.8,
      tp2: 76.7,
      momentum: "Consolidating below ATH",
      oiChangePct: -4.0,
      volumeChangePct: -21.3,
      fundingApr: -13.1,
      whaleBias: "Slightly bullish",
      liquiditySignal: "ATH liquidity above 76",
      decisionLabel: "HYPE breakout watch",
      move: "Wait for acceptance above $69.30, then long the breakout.",
      whyNow:
        "Strong fundamentals, but live perp flow is cooling. Open interest and volume are fading, so wait for acceptance above the trigger.",
      invalidLine: "Below $64.80 it is spot-patience only. The breakout idea is off the table.",
      signalChecks: [
        {
          label: "Momentum confirms",
          state: "warn",
          note: "Consolidating below ATH while OI and volume cool.",
        },
        {
          label: "Liquidity level is clean",
          state: "pass",
          note: "ATH liquidity above $76 gives the breakout a defined objective.",
        },
        {
          label: "Whale / cohort read",
          state: "pass",
          note: "Large wallets are net long while fundamentals remain supportive.",
        },
        {
          label: "Funding is not overcrowded",
          state: "pass",
          note: "Funding does not show a crowded long imbalance.",
        },
      ],
    },
  ],
  levelMaps: [
    {
      asset: "BTC",
      currentPrice: 64104.5,
      bias: "Range until 65.2k breaks",
      levels: [
        { label: "Support shelf", price: 62800, kind: "support", note: "Range buyers need this to hold." },
        { label: "Invalidation", price: 62100, kind: "stop", note: "Below here the long idea is wrong." },
        { label: "Trigger", price: 65200, kind: "resistance", note: "Break and hold turns BTC constructive." },
        { label: "TP1", price: 66900, kind: "target", note: "First profit zone after reclaim." },
        { label: "Liquidity magnet", price: 69300, kind: "liquidity", note: "Upside cluster if trend expands." },
      ],
    },
    {
      asset: "ETH",
      currentPrice: 1727.15,
      bias: "Weak until 1,786 reclaim",
      levels: [
        { label: "Breakdown trigger", price: 1695, kind: "resistance", note: "Short only after acceptance below." },
        { label: "Stop", price: 1768, kind: "stop", note: "Tight invalidation for breakdown shorts." },
        { label: "Invalidation", price: 1786, kind: "stop", note: "Reclaim cancels bearish read." },
        { label: "TP1", price: 1635, kind: "target", note: "First downside liquidity pocket." },
        { label: "TP2", price: 1588, kind: "liquidity", note: "Deeper flush zone." },
      ],
    },
    {
      asset: "SOL",
      currentPrice: 74.28,
      bias: "Best major if 75.40 reclaims",
      levels: [
        { label: "Trigger", price: 75.4, kind: "resistance", note: "Momentum long activates here." },
        { label: "Stop", price: 72.6, kind: "stop", note: "Keep leverage honest." },
        { label: "Invalidation", price: 71.8, kind: "stop", note: "No adding below this line." },
        { label: "TP1", price: 78.9, kind: "target", note: "First liquidity magnet." },
        { label: "TP2", price: 82.4, kind: "liquidity", note: "Trend extension zone." },
      ],
    },
    {
      asset: "HYPE",
      currentPrice: 68.0,
      bias: "Consolidation below ATH",
      levels: [
        { label: "Trigger", price: 69.3, kind: "resistance", note: "Breakout watch starts here." },
        { label: "Stop", price: 65.9, kind: "stop", note: "Short-term perp risk line." },
        { label: "Invalidation", price: 64.8, kind: "stop", note: "Below this, spot patience only." },
        { label: "TP1", price: 72.8, kind: "target", note: "Reduce leverage into strength." },
        { label: "ATH zone", price: 76.7, kind: "liquidity", note: "Spot unload candidate if flow cools." },
      ],
    },
  ],
  cohortReads: [
    {
      label: "Whales vs retail",
      alignment: "mixed",
      detail: "Large wallets lean HYPE and BTC long, while smaller accounts chase SOL strength.",
      longPct: 58,
    },
    {
      label: "Profitable wallets",
      alignment: "confirms",
      detail: "Profitable wallets favor SOL and HYPE, but they are not aggressively levered.",
      longPct: 63,
    },
    {
      label: "Underwater wallets",
      alignment: "crowded",
      detail: "Underwater accounts are clustered in weak alt longs, so bounces may be exit liquidity.",
      longPct: 71,
    },
    {
      label: "Leverage pressure",
      alignment: "contradicts",
      detail: "Funding is not stretched enough to justify a pure funding short on majors.",
      longPct: 48,
    },
  ],
  hypeFundamentals: [
    {
      label: "Builder revenue",
      value: "$18.4M",
      delta: "+12% 30d",
      read: "Supports the medium-term HYPE story, but not an intraday entry by itself.",
    },
    {
      label: "Protocol volume",
      value: "$63.2B",
      delta: "+9% 30d",
      read: "Healthy base demand if price reclaims the breakout trigger.",
    },
    {
      label: "HYPE perp OI",
      value: "$1.38B",
      delta: "-4% 24h",
      read: "Cooling leverage means the breakout needs fresh participation.",
    },
    {
      label: "Funding regime",
      value: "-0.0015%",
      delta: "shorts pay lightly",
      read: "Not crowded enough for a contrarian long alone.",
    },
  ],
  feedbackPrompts: [
    "Would you trust this setup enough to watch it?",
    "Are the trigger, stop, and TP levels obvious in under 30 seconds?",
    "What data feels missing before this becomes useful?",
    "Should HyperPulse show one best setup or a ranked board?",
  ],
};
