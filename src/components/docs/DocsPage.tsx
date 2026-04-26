"use client";

import { useAppConfig } from "@/context/AppConfigContext";

const quickLinks = [
  { href: "#overview", label: "Overview" },
  { href: "#data-sources", label: "Data Sources" },
  { href: "#portfolio", label: "Portfolio Analytics" },
  { href: "#signals", label: "Market Signals" },
  { href: "#factors", label: "Factors" },
  { href: "#whales", label: "Whales" },
  { href: "#sentiment", label: "Next 24h Bias" },
  { href: "#wallets", label: "Wallet Modes" },
  { href: "#limits", label: "Limitations" },
  { href: "#faq", label: "FAQ" },
];

const principles = [
  "Read-only analytics first. HyperPulse can analyze any wallet address without asking for a private key.",
  "Evidence over vibes. Funding and sentiment labels are only meant to be directional when the underlying sample is meaningful.",
  "Public methodology. The docs below describe the current production calculations in plain English.",
];

const portfolioMetrics = [
  {
    name: "Net P&L",
    formula: "Closed trading P&L + net funding - fees",
    detail:
      "This is the top-line realized result from completed trades in the selected history window.",
  },
  {
    name: "Win Rate",
    formula: "Winning round trips / total round trips",
    detail:
      "Trades are grouped into round trips by asset and direction. Open positions are not counted as wins or losses until closed.",
  },
  {
    name: "Fees Paid",
    formula: "Sum of fill fees across the selected trade set",
    detail:
      "Shown separately because fee drag matters for active strategies, especially short-horizon systems.",
  },
  {
    name: "Equity / Account Value",
    formula: "Perps equity + full marked spot wallet",
    detail:
      "Perps equity comes from Hyperliquid margin account value. The spot wallet adds idle USDC plus marked non-USDC balances such as HIP-3 spot holdings. Staked HYPE is not included.",
  },
  {
    name: "Drawdown",
    formula: "Largest peak-to-trough decline on cumulative realized P&L",
    detail:
      "Used for risk-adjusted metrics such as Calmar and recovery factor.",
  },
  {
    name: "Expectancy",
    formula: "(Win rate × average win) - (Loss rate × average loss)",
    detail:
      "Useful for understanding whether the system has a positive edge per completed trade.",
  },
];

const signalStates = [
  {
    label: "Crowded Long / Crowded Short",
    detail:
      "Only shown when current funding is extreme relative to history and forward returns have shown a material relationship with funding.",
  },
  {
    label: "Funding Elevated / Funding Cheap",
    detail:
      "Used when funding is rich or cheap versus recent history, but the correlation with forward returns is too weak to make a stronger claim.",
  },
  {
    label: "Neutral / Low Confidence",
    detail:
      "Default state when history is too sparse or the relationship between funding and forward returns is not reliable enough.",
  },
];

const limitations = [
  "HyperPulse is analytics software, not a custody layer. It does not take possession of user funds.",
  "Signals are descriptive and probabilistic, not guaranteed forecasts. A strong historical relationship can still fail in live markets.",
  "Some analytics are intentionally gated behind minimum sample sizes to avoid false precision.",
  "Displayed account value is optimized for trading clarity, not tax or brokerage-style reporting.",
  "Open positions can change faster than the portfolio polling interval, so intraminute UI differences versus Hyperliquid may occur.",
];

const faqs = [
  {
    q: "Why can HyperPulse show a wallet without connecting a browser wallet?",
    a: "Because wallet analytics are built on public account state and public fill history. Read-only mode only needs the wallet address.",
  },
  {
    q: "Does Privy email login automatically connect my Hyperliquid trading wallet?",
    a: "Not always. Privy can authenticate you by email and may also expose an embedded wallet, but your actual Hyperliquid trading account is often a separate linked external address. HyperPulse now lets you explicitly choose which Privy wallet to view or trade from, and you can always paste the exact address you trade on.",
  },
  {
    q: "Why might HyperPulse differ slightly from Hyperliquid?",
    a: "The app groups fills into round trips and computes portfolio metrics on top of those trades. Hyperliquid is the source of truth for raw balances, positions, fills, and funding.",
  },
  {
    q: "Does HyperPulse include staked HYPE in equity?",
    a: "No. The current production calculation uses perps equity plus the full marked spot wallet. Staked HYPE is excluded so the trading balance stays interpretable.",
  },
  {
    q: "When are AI Insights hidden?",
    a: "If the underlying trade sample is too small. HyperPulse suppresses asset, hour, and performance claims when sample thresholds are not met.",
  },
];

function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 md:p-8">
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">
          {eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-100">{title}</h2>
      </div>
      <div className="space-y-4 text-sm leading-7 text-zinc-300">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  const { factorsEnabled, whalesEnabled } = useAppConfig();
  const visibleQuickLinks = quickLinks.filter((item) => {
    if (!factorsEnabled && item.href === "#factors") return false;
    if (!whalesEnabled && item.href === "#whales") return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              Docs
            </div>
            <div className="mt-3 space-y-1">
              {visibleQuickLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/30 p-6 md:p-8">
            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">
                HyperPulse Docs
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
                Public methodology for wallet analytics, funding signals, and tomorrow&apos;s market bias.
              </h1>
              <p className="mt-4 text-sm leading-7 text-zinc-300">
                HyperPulse is a Hyperliquid analytics layer built for active traders. It combines public wallet data,
                fill history, funding history, and market structure to explain what happened in a portfolio and what
                the tape has historically implied next.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {visibleQuickLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-teal-500/50 hover:text-zinc-100"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </section>

          <Section id="overview" eyebrow="Overview" title="What HyperPulse does">
            <p>
              HyperPulse has two jobs. First, it reconstructs a trader&apos;s recent behavior from Hyperliquid wallet
              activity and turns that into portfolio analytics such as win rate, expectancy, drawdown, asset
              breakdowns, timing patterns, and funding drag. Second, it evaluates market conditions across listed
              assets and converts raw funding, open interest, and price action into a cleaner signal layer.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {principles.map((principle) => (
                <div key={principle} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
                  {principle}
                </div>
              ))}
            </div>
          </Section>

          <Section id="data-sources" eyebrow="Inputs" title="Data sources and source of truth">
            <p>
              HyperPulse uses Hyperliquid account state, public fill history, funding history, and market candles as
              its primary inputs. Hyperliquid remains the source of truth for balances, open positions, fills, and
              funding payments. HyperPulse layers portfolio reconstruction and market inference on top.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs font-medium text-zinc-100">Portfolio inputs</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Wallet account state, marked spot balances, open positions, fills, realized fees, and funding cash
                  flows.
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs font-medium text-zinc-100">Market inputs</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Funding history, current funding APR, open interest changes, 24h price change, and recent candle
                  history for forward-return studies.
                </div>
              </div>
            </div>
          </Section>

          <Section id="portfolio" eyebrow="Portfolio" title="How portfolio analytics are calculated">
            <p>
              Portfolio analytics are built from completed round trips. HyperPulse groups fills by asset and direction,
              derives weighted average entry prices, and closes trades when the tracked position returns to zero.
              Funding paid or earned during that trade window is merged into the resulting trade record.
            </p>
            <div className="overflow-hidden rounded-xl border border-zinc-800">
              <div className="grid grid-cols-1 divide-y divide-zinc-800 bg-zinc-950/60">
                {portfolioMetrics.map((metric) => (
                  <div key={metric.name} className="grid gap-3 p-4 md:grid-cols-[180px_minmax(0,180px)_1fr] md:items-start">
                    <div className="text-sm font-medium text-zinc-100">{metric.name}</div>
                    <div className="text-xs text-teal-300">{metric.formula}</div>
                    <div className="text-sm text-zinc-400">{metric.detail}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
              <div className="font-medium text-amber-200">Accounting note</div>
              <div className="mt-1 text-amber-100/80">
                HyperPulse currently defines displayed trading equity as <span className="font-medium">perps equity + the full marked spot wallet</span>.
                Staked HYPE is intentionally excluded from this number so the dashboard stays aligned with immediately
                usable trading capital.
              </div>
            </div>
          </Section>

          <Section id="signals" eyebrow="Signals" title="How funding signals are produced">
            <p>
              HyperPulse does not rely on a raw funding threshold alone. It first measures how extreme the current
              funding APR is versus roughly 30 days of history, then studies whether historical funding extremes
              actually correlated with forward price returns over a default 24 hour horizon.
            </p>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Signal pipeline</div>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                <div>1. Convert funding history into annualized APR series.</div>
                <div>2. Rank the current funding APR inside the recent distribution.</div>
                <div>3. Pair each historical funding point with forward 24h returns from candles.</div>
                <div>4. Compute funding/forward-return correlation and compare extreme buckets.</div>
                <div>5. Promote to a stronger label only when the relationship is material enough to matter.</div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {signalStates.map((state) => (
                <div key={state.label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="text-sm font-medium text-zinc-100">{state.label}</div>
                  <div className="mt-2 text-sm text-zinc-400">{state.detail}</div>
                </div>
              ))}
            </div>
            <p>
              Confidence is graded from sample size and absolute correlation strength. Sparse history or weak
              correlation forces the signal back toward low confidence rather than overstating precision.
            </p>
          </Section>

          {factorsEnabled ? (
            <Section id="factors" eyebrow="Factors" title="How the Factors tab is calculated">
              <p>
                HyperPulse uses Artemis as the canonical research layer for factor definitions and monthly basket
                commentary. The app then combines those factor snapshots with live Hyperliquid market state so traders can
                see which regimes are actually tradable right now.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="text-xs font-medium text-zinc-100">Historical factor performance</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Computed from Artemis daily <code>price</code> data across the tracked long and short baskets. Long
                    legs and short legs are equal-weighted unless the public report publishes explicit weights.
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="text-xs font-medium text-zinc-100">Hyperliquid trade view</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Built from live Hyperliquid prices, funding, open interest, and existing signal confidence. This is
                    the layer that turns factor research into actual trade candidates such as TAO or NEAR.
                  </div>
                </div>
              </div>
              <p>
                Factor cards are intentionally labeled as HyperPulse-tracked Artemis baskets. HyperPulse does not claim
                to reproduce private rebalance files; it shows the public factor logic, public report holdings, and the
                live Hyperliquid overlay built on top.
              </p>
            </Section>
          ) : null}

          {whalesEnabled ? (
            <Section id="whales" eyebrow="Whales" title="How the positioning monitor works">
              <p>
                The Whales tab now works as a read-only positioning monitor. It combines three signal families:
                crowding setups on major perps, nearby tracked-book liquidation pockets, and rare tracked-wallet repeat
                behavior that can be reviewed on a dedicated wallet page.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="text-xs font-medium text-zinc-100">Live profile lookup</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Today&apos;s production app can already look up any whale wallet on demand from public Hyperliquid
                    state, fills, funding, and ledger updates. That makes the right-side profile pane useful even before a
                    background worker is configured.
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="text-xs font-medium text-zinc-100">Always-on alert feed</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    The alert feed becomes durable when a background worker writes episodes into Neon Postgres. That
                    worker watches large fills, recent deposit flow, leverage, and liquidation distance so repeated
                    partial fills collapse into one cleaner alert instead of spamming the UI.
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Detection logic</div>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  <div>1. Watch large perp trades and explorer flow for candidate wallets.</div>
                  <div>2. Enrich candidate wallets with current state, recent fills, funding, and non-funding ledger events.</div>
                  <div>3. Join recent net inflow with new exposure to classify deposit-led long or short episodes.</div>
                  <div>4. Compute evidence-first tags such as aggressive leverage, underwater, concentrated book, and funding-sensitive.</div>
                  <div>5. Persist the normalized alert plus the current wallet snapshot for replay over the last 30 days.</div>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-amber-300">What this monitor is not</div>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  <div>Crowding is a structural heuristic on major perps, not a guaranteed predictive model.</div>
                  <div>Liquidation pressure is a tracked-book subset from profitable wallets, not a full exchange-wide liquidation map.</div>
                  <div>Rare whale signals are tracked-wallet behavior screens, not copy-trade recommendations.</div>
                </div>
              </div>
              <p>
                HyperPulse intentionally uses deterministic templates for whale alerts in v1. That keeps the feed cheap,
                explainable, and suitable for always-on monitoring without burning model credits.
              </p>
            </Section>
          ) : null}

          <Section id="sentiment" eyebrow="Sentiment" title="How HyperPulse frames next 24h bias">
            <p>
              The HyperPulse sentiment model is a composite regime indicator with a short-horizon directional overlay.
              The headline score runs from fear to greed. The directional overlay frames next-session tape risk using
              BTC as the market anchor.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs font-medium text-zinc-100">Headline regime score</div>
                <div className="mt-2 text-sm text-zinc-400">
                  40% funding regime, 35% market breadth, 25% volatility breadth. Funding regime itself blends median
                  funding direction, signal bias, and a 24h versus 7d funding moving-average regime check.
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs font-medium text-zinc-100">Next 24h bias model</div>
                <div className="mt-2 text-sm text-zinc-400">
                  BTC 24h momentum, BTC 48h momentum, live BTC open-interest tick, and a contrarian funding term are
                  blended into a directional score. Current production weights are 40%, 30%, 10%, and 20%.
                  OI is only a live confirmation input until HyperPulse stores true historical OI windows.
                </div>
              </div>
            </div>
            <p>
              This model is intentionally short-horizon and descriptive. Funding is a crowding/regime input, not a
              direct spot-price predictor. CNN Fear &amp; Greed may be linked as macro backdrop, but it is not ingested
              into the HyperPulse score.
            </p>
          </Section>

          <Section id="wallets" eyebrow="Access" title="Wallet modes, privacy, and execution">
            <p>
              HyperPulse supports read-only analysis and connected trading workflows. Read-only mode is the safest and
              simplest path for analytics because it only needs a wallet address. No private key is required to view a
              public account.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-sm font-medium text-zinc-100">Read-only</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Loads account state and public history for any wallet address. No trading permissions. No private key
                  requested.
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-sm font-medium text-zinc-100">Browser wallet</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Requests a connected wallet, then approves a local Hyperliquid agent key for order execution. Trading
                  permissions stay scoped to the approved agent.
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
              <div className="font-medium text-amber-200">Honest note on Privy</div>
              <div className="mt-1 text-amber-100/80">
                Privy is best treated as an identity and wallet-discovery layer here, not as proof that HyperPulse has
                found your exact Hyperliquid trading account automatically. If your live trading address differs from
                the wallet Privy shows first, choose the linked wallet explicitly or paste the exact address you trade
                on.
              </div>
            </div>
          </Section>

          <Section id="limits" eyebrow="Caveats" title="Known limitations and interpretation rules">
            <div className="grid gap-3">
              {limitations.map((item) => (
                <div key={item} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
                  {item}
                </div>
              ))}
            </div>
          </Section>

          <Section id="faq" eyebrow="FAQ" title="Frequently asked questions">
            <div className="space-y-3">
              {faqs.map((item) => (
                <div key={item.q} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="text-sm font-medium text-zinc-100">{item.q}</div>
                  <div className="mt-2 text-sm text-zinc-400">{item.a}</div>
                </div>
              ))}
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
