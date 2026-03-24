"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { privateKeyToAccount } from "viem/accounts";
import { HttpTransport, InfoClient, ExchangeClient } from "@nktkas/hyperliquid";
import { POLL_INTERVAL_PORTFOLIO } from "@/lib/constants";
import { IS_TESTNET } from "@/lib/hyperliquid";
import type { AccountState, Position } from "@/types";
import toast from "react-hot-toast";

const SESSION_API_KEY = "hp_api_key";
const SESSION_MAIN_ADDR = "hp_main_address";
const MAIN_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_REGEX = /^0x[a-fA-F0-9]{64}$/;

interface WalletContextValue {
  address: string | null;
  apiAddress: string | null;
  isConnected: boolean;
  accountState: AccountState | null;
  exchangeClient: ExchangeClient | null;
  loading: boolean;
  connect: (apiPrivateKey: string, mainWalletAddress: string) => Promise<void>;
  disconnect: () => void;
  refreshPortfolio: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function parsePositions(
  assetPositions: Array<{
    type: string;
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      unrealizedPnl: string;
      marginUsed: string;
      leverage: { value: number };
      liquidationPx: string | null;
      returnOnEquity: string;
    };
  }>
): Position[] {
  return assetPositions
    .filter((ap) => parseFloat(ap.position.szi) !== 0)
    .map((ap) => {
      const p = ap.position;
      return {
        coin: p.coin,
        szi: parseFloat(p.szi),
        entryPx: parseFloat(p.entryPx),
        markPx: 0,
        unrealizedPnl: parseFloat(p.unrealizedPnl),
        marginUsed: parseFloat(p.marginUsed),
        leverage: p.leverage.value,
        liquidationPx: p.liquidationPx ? parseFloat(p.liquidationPx) : null,
        returnOnEquity: parseFloat(p.returnOnEquity),
      };
    });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [apiAddress, setApiAddress] = useState<string | null>(null);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [exchangeClient, setExchangeClient] = useState<ExchangeClient | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const infoRef = useRef<InfoClient | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getInfo = useCallback(() => {
    if (!infoRef.current) {
      const transport = new HttpTransport({ isTestnet: IS_TESTNET });
      infoRef.current = new InfoClient({ transport });
    }
    return infoRef.current;
  }, []);

  const fetchPortfolio = useCallback(
    async (mainAddress: string, throwOnError = false) => {
      try {
        const info = getInfo();
        const [state, spotState] = await Promise.all([
          info.clearinghouseState({
            user: mainAddress as `0x${string}`,
          }),
          info.spotClearinghouseState({
            user: mainAddress as `0x${string}`,
          }),
        ]);

        const positions = parsePositions(state.assetPositions);
        const totalUnrealizedPnl = positions.reduce(
          (sum, p) => sum + p.unrealizedPnl,
          0
        );
        const usdcBalance = spotState.balances.find((b) => b.coin === "USDC");
        const spotUsdcTotal = usdcBalance ? parseFloat(usdcBalance.total) : 0;
        const spotUsdcHold = usdcBalance ? parseFloat(usdcBalance.hold) : 0;
        const crossAccountValue = parseFloat(state.crossMarginSummary.accountValue);
        const isolatedAccountValue = parseFloat(state.marginSummary.accountValue);

        setAccountState({
          // Use cross summary for main dashboard "account value" to align with
          // Hyperliquid's cross-margin trading view.
          accountValue: crossAccountValue,
          crossAccountValue,
          isolatedAccountValue,
          totalMarginUsed: parseFloat(state.crossMarginSummary.totalMarginUsed),
          withdrawable: parseFloat(state.withdrawable),
          spotUsdcTotal,
          spotUsdcHold,
          unrealizedPnl: totalUnrealizedPnl,
          positions,
        });
      } catch (err) {
        console.error("Failed to fetch portfolio:", err);
        if (throwOnError) {
          throw err;
        }
      }
    },
    [getInfo]
  );

  const connect = useCallback(
    async (apiPrivateKey: string, mainWalletAddress: string) => {
      setLoading(true);
      try {
        const rawKey = apiPrivateKey.trim();
        const normalizedKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
        const normalizedAddress = mainWalletAddress.trim();

        if (!PRIVATE_KEY_REGEX.test(normalizedKey)) {
          throw new Error(
            "Invalid API wallet private key. Expected 64-byte hex (0x...)."
          );
        }
        if (!MAIN_ADDRESS_REGEX.test(normalizedAddress)) {
          throw new Error(
            "Invalid main wallet address. Expected 42-char 0x address."
          );
        }

        const key = normalizedKey as `0x${string}`;
        const mainAddr = normalizedAddress as `0x${string}`;

        const apiWallet = privateKeyToAccount(key);
        const transport = new HttpTransport({ isTestnet: IS_TESTNET });
        const exchange = new ExchangeClient({ transport, wallet: apiWallet });

        // Connectivity verification: open orders + account state for main wallet
        const info = getInfo();
        await info.openOrders({ user: mainAddr });
        await fetchPortfolio(mainAddr, true);

        setAddress(mainAddr);
        setApiAddress(apiWallet.address);
        setExchangeClient(exchange);

        sessionStorage.setItem(SESSION_API_KEY, normalizedKey);
        sessionStorage.setItem(SESSION_MAIN_ADDR, mainAddr);

        toast.success(
          `Connected: ${mainAddr.slice(0, 6)}...${mainAddr.slice(-4)}`
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to connect wallet";
        toast.error(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPortfolio, getInfo]
  );

  const disconnect = useCallback(() => {
    setAddress(null);
    setApiAddress(null);
    setAccountState(null);
    setExchangeClient(null);
    sessionStorage.removeItem(SESSION_API_KEY);
    sessionStorage.removeItem(SESSION_MAIN_ADDR);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    toast.success("Wallet disconnected");
  }, []);

  const refreshPortfolio = useCallback(async () => {
    if (address) {
      await fetchPortfolio(address);
    }
  }, [address, fetchPortfolio]);

  useEffect(() => {
    const storedKey = sessionStorage.getItem(SESSION_API_KEY);
    const storedAddr = sessionStorage.getItem(SESSION_MAIN_ADDR);
    if (storedKey && storedAddr) {
      connect(storedKey, storedAddr).catch(() => {
        sessionStorage.removeItem(SESSION_API_KEY);
        sessionStorage.removeItem(SESSION_MAIN_ADDR);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (address) {
      intervalRef.current = setInterval(
        () => fetchPortfolio(address),
        POLL_INTERVAL_PORTFOLIO
      );
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [address, fetchPortfolio]);

  return (
    <WalletContext.Provider
      value={{
        address,
        apiAddress,
        isConnected: !!address,
        accountState,
        exchangeClient,
        loading,
        connect,
        disconnect,
        refreshPortfolio,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
