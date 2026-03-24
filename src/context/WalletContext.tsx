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
import {
  HttpTransport,
  InfoClient,
  ExchangeClient,
} from "@nktkas/hyperliquid";
import { POLL_INTERVAL_PORTFOLIO } from "@/lib/constants";
import { IS_TESTNET } from "@/lib/hyperliquid";
import type { AccountState, Position } from "@/types";
import toast from "react-hot-toast";

const SESSION_API_KEY = "hp_api_key";
const SESSION_MAIN_ADDR = "hp_main_address";

interface WalletContextValue {
  /** Main wallet address — used for all info queries */
  address: string | null;
  /** API wallet address — derived from private key, used for signing */
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
  const [address, setAddress] = useState<string | null>(null); // main wallet
  const [apiAddress, setApiAddress] = useState<string | null>(null); // API wallet
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
    async (mainAddress: string) => {
      try {
        const info = getInfo();
        const state = await info.clearinghouseState({
          user: mainAddress as `0x${string}`,
        });

        const positions = parsePositions(state.assetPositions);
        const totalUnrealizedPnl = positions.reduce(
          (sum, p) => sum + p.unrealizedPnl,
          0
        );

        setAccountState({
          accountValue: parseFloat(state.marginSummary.accountValue),
          totalMarginUsed: parseFloat(state.marginSummary.totalMarginUsed),
          withdrawable: parseFloat(state.withdrawable),
          unrealizedPnl: totalUnrealizedPnl,
          positions,
        });
      } catch (err) {
        console.error("Failed to fetch portfolio:", err);
      }
    },
    [getInfo]
  );

  const connect = useCallback(
    async (apiPrivateKey: string, mainWalletAddress: string) => {
      setLoading(true);
      try {
        // Normalize the API private key
        const key = apiPrivateKey.startsWith("0x")
          ? (apiPrivateKey as `0x${string}`)
          : (`0x${apiPrivateKey}` as `0x${string}`);

        // Normalize the main wallet address
        const mainAddr = mainWalletAddress.trim() as `0x${string}`;

        // Create the API wallet account (for signing trades)
        const apiWallet = privateKeyToAccount(key);

        // Create ExchangeClient with API wallet
        const transport = new HttpTransport({ isTestnet: IS_TESTNET });
        const exchange = new ExchangeClient({ transport, wallet: apiWallet });

        // Verify by fetching portfolio using the MAIN wallet address
        await fetchPortfolio(mainAddr);

        setAddress(mainAddr);
        setApiAddress(apiWallet.address);
        setExchangeClient(exchange);

        // Store both in sessionStorage
        sessionStorage.setItem(SESSION_API_KEY, key);
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
    [fetchPortfolio]
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

  // Auto-reconnect from sessionStorage
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

  // Poll portfolio when connected
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
