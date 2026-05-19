"use client";

import Link from "next/link";
import { useAppConfig } from "@/context/AppConfigContext";

const quickLinks = [
  { href: "#overview", label: "Overview" },
  { href: "#portfolio", label: "Portfolio" },
  { href: "#markets", label: "Markets & Alerts" },
  { href: "#vaults", label: "Vaults" },
  { href: "#privacy", label: "Privacy" },
  { href: "#limits", label: "Limits" },
];

const productCards = [
  {
    title: "Portfolio",
    href: "/portfolio",
    body: "Paste a wallet and separate trading P&L, fees, funding, open risk, and behavior patterns.",
  },
  {
    title: "Markets",
    href: "/markets",
    body: "Scan liquid Hyperliquid perps by momentum, funding, OI, pressure levels, and relative strength.",
  },
  {
    title: "Alerts",
    href: "/alerts",
    body: "Review stored momentum alerts with exact alert price, timestamp, TP/SL outcome, and delivery status.",
  },
  {
    title: "Market Brief",
    href: "/docs/factors",
    body: "Read the biweekly HyperPulse tape note: top performers, themes, catalysts, and direct asset links.",
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
    <section id={id} className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-[#10151b] p-5 md:p-6">
      <div className="text-[10px] uppercase tracking-[0.2em] text-teal-300/80">{eyebrow}</div>
      <h2 className="mt-2 text-xl font-semibold text-zinc-100 md:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-300">{children}</div>
    </section>
  );
}

function MiniCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="text-sm font-medium text-zinc-100">{title}</div>
      <div className="mt-2 text-sm leading-6 text-zinc-400">{children}</div>
    </div>
  );
}

function Formula({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 font-mono text-xs leading-6 text-teal-200">{value}</div>
    </div>
  );
}

export default function DocsPage() {
  const { vaultsEnabled } = useAppConfig();
  const visibleQuickLinks = vaultsEnabled ? quickLinks : quickLinks.filter((item) => item.href !== "#vaults");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-20">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-zinc-800 bg-[#10151b] p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Docs</div>
            <div className="mt-3 space-y-1">
              {visibleQuickLinks.map((item) => (
                <a key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <section className="rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_32%),#10151b] p-6 md:p-8">
            <div className="max-w-3xl">
              <div className="text-[10px] uppercase tracking-[0.22em] text-teal-300/80">HyperPulse Docs</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">The short version.</h1>
              <p className="mt-4 text-sm leading-7 text-zinc-300">
                HyperPulse is a read-only Hyperliquid trader OS. It explains portfolio performance, market momentum,
                alert quality, and vault risk using public Hyperliquid data plus compact stored alert snapshots.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 lg:hidden">
              {visibleQuickLinks.map((item) => (
                <a key={item.href} href={item.href} className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-teal-500/50 hover:text-zinc-100">
                  {item.label}
                </a>
              ))}
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            {productCards.map((card) => (
              <Link key={card.href} href={card.href} className="rounded-2xl border border-zinc-800 bg-[#10151b] p-4 transition hover:border-teal-500/40 hover:bg-zinc-900/70">
                <div className="text-base font-semibold text-zinc-100">{card.title}</div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{card.body}</p>
              </Link>
            ))}
          </div>

          <Section id="overview" eyebrow="Overview" title="What HyperPulse is">
            <p>
              HyperPulse turns Hyperliquid market and wallet data into trader-facing context: what moved, what hurt
              performance, what alerts fired, and whether those alerts later hit target or invalidation first.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <MiniCard title="Read-only by default">Paste a public wallet. HyperPulse never needs seed phrases or private keys for analytics.</MiniCard>
              <MiniCard title="Evidence-first">Signals include data coverage, timestamps, confidence, and stored outcomes where available.</MiniCard>
              <MiniCard title="Built for review">The product is designed to improve trading decisions, not to guarantee a forecast.</MiniCard>
            </div>
          </Section>

          <Section id="portfolio" eyebrow="Portfolio" title="How wallet analytics work">
            <p>
              Portfolio analytics are reconstructed from public account state, fills, funding, ledger events, and open
              positions. Completed fills are grouped into round trips so the app can show behavior and risk, not just raw transactions.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Formula label="Realized trading P&L" value="closed P&L + net funding - fees" />
              <Formula label="Displayed equity" value="perps account value + marked spot wallet; staked HYPE excluded" />
              <Formula label="Win rate" value="winning closed round trips / all closed round trips" />
              <Formula label="Expectancy" value="(win rate × avg win) - (loss rate × avg loss)" />
            </div>
            <p className="text-zinc-400">
              Deposits and withdrawals are separated from trading profits where ledger data is available. If coverage is
              incomplete, HyperPulse labels the gap instead of pretending the accounting is perfect.
            </p>
          </Section>

          <Section id="markets" eyebrow="Markets" title="How signals and alerts work">
            <p>
              Market Radar ranks liquid perps by relative momentum, not raw 24h green candles. Telegram alerts are stricter:
              they require relative strength versus BTC and the liquid basket, volume participation, a clean structure break or hold near highs, and usable TP1/SL zones.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Formula label="Momentum Edge" value="0.35×BTC residual z + 0.25×basket residual z + 0.15×raw return z + structure + acceleration + participation" />
              <Formula label="Participation" value="recent 1h volume ÷ prior hourly baseline; Telegram requires confirmation before sending" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <MiniCard title="Alerts page">Stores the exact alert price, alert time, current return, delivery state, and TP1/SL first-touch outcome.</MiniCard>
              <MiniCard title="Biweekly brief">Summarizes which assets led, why they likely moved, and which themes carried the Hyperliquid tape.</MiniCard>
            </div>
          </Section>

          {vaultsEnabled ? (
            <Section id="vaults" eyebrow="Vaults" title="How vault screening works">
              <p>
                Vaults are screened by TVL, recent P&L, drawdown, age, depositor base, and operator behavior. HyperPulse
                prefers risk-adjusted consistency over headline APR.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Formula label="30d return" value="P&L change / starting equity when vault P&L history is available" />
                <Formula label="Risk quality" value="drawdown + sample size + flow contamination + operator history" />
              </div>
              <p className="text-zinc-400">
                Vault charts can be affected by deposits and withdrawals, so HyperPulse labels flow-sensitive equity curves.
              </p>
            </Section>
          ) : null}

          <Section id="privacy" eyebrow="Privacy" title="Wallet modes and safety">
            <p>
              Read-only analytics require only a public Hyperliquid address. Connecting a wallet is optional and should
              only be used for authenticated workflows. HyperPulse does not custody funds.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <MiniCard title="Public wallet mode">Best for analytics, sharing, and reviewing a wallet without permissions.</MiniCard>
              <MiniCard title="Connected mode">Used only when the app explicitly needs your active browser wallet context.</MiniCard>
            </div>
          </Section>

          <Section id="limits" eyebrow="Limits" title="What to be careful with">
            <div className="grid gap-3 md:grid-cols-2">
              <MiniCard title="Signals are probabilistic">A strong setup can fail. Treat alerts as review prompts, not instructions.</MiniCard>
              <MiniCard title="Coverage can vary">Some wallets have partial funding, ledger, sizing, or historical fill coverage.</MiniCard>
              <MiniCard title="Markets move faster than polling">Intraminute values can differ from Hyperliquid during fast tape.</MiniCard>
              <MiniCard title="Not tax accounting">Displayed equity and P&L are optimized for trading review, not tax reporting.</MiniCard>
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
