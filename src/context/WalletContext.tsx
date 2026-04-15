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
import { custom, createWalletClient, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { HttpTransport, InfoClient, ExchangeClient } from "@nktkas/hyperliquid";
import { POLL_INTERVAL_PORTFOLIO } from "@/lib/constants";
import { isNetworkTestnet, onNetworkChange } from "@/lib/hyperliquid";
import { useAppConfig } from "@/context/AppConfigContext";
import type { AccountState, Position } from "@/types";
import toast from "react-hot-toast";

const SESSION_MAIN_ADDR = "hp_main_address";
const MAIN_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export type BrowserWalletPreference =
  | "auto"
  | "metamask"
  | "rabby"
  | "coinbase";

interface WalletContextValue {
  address: string | null;
  apiAddress: string | null;
  isConnected: boolean;
  isReadOnly: boolean;
  accountState: AccountState | null;
  exchangeClient: ExchangeClient | null;
  loading: boolean;
  connectWithBrowserWallet: (
    preference?: BrowserWalletPreference
  ) => Promise<void>;
  connectWithPrivyWallet: (wallet: PrivyEthereumWallet) => Promise<void>;
  connectReadOnly: (walletAddress: string) => Promise<void>;
  disconnect: () => void;
  refreshPortfolio: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

interface InjectedEthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  providers?: InjectedEthereumProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
}

export interface PrivyEthereumWallet {
  address: string;
  walletClientType?: string;
  getEthereumProvider: () => Promise<InjectedEthereumProvider>;
}

function matchesPreference(
  provider: InjectedEthereumProvider,
  preference: BrowserWalletPreference
): boolean {
  if (preference === "metamask") {
    return !!provider.isMetaMask && !provider.isCoinbaseWallet;
  }
  if (preference === "rabby") {
    return !!provider.isRabby;
  }
  if (preference === "coinbase") {
    return !!provider.isCoinbaseWallet;
  }
  return true;
}

function selectProvider(
  rootProvider: InjectedEthereumProvider,
  preference: BrowserWalletPreference
): InjectedEthereumProvider {
  const providers =
    Array.isArray(rootProvider.providers) && rootProvider.providers.length > 0
      ? rootProvider.providers
      : [rootProvider];

  if (preference !== "auto") {
    const explicit = providers.find((p) => matchesPreference(p, preference));
    if (!explicit) {
      throw new Error(`Selected wallet provider (${preference}) not found.`);
    }
    return explicit;
  }

  // Auto selection order to avoid unintentional Coinbase default hijacking.
  return (
    providers.find((p) => !!p.isRabby) ??
    providers.find((p) => !!p.isMetaMask && !p.isCoinbaseWallet) ??
    providers.find((p) => !p.isCoinbaseWallet) ??
    providers[0]
  );
}

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
      const szi = parseFloat(p.szi);
      const entryPx = parseFloat(p.entryPx);
      const unrealizedPnl = parseFloat(p.unrealizedPnl);
      const absSzi = Math.abs(szi);
      const pnlPerUnit = absSzi > 0 ? unrealizedPnl / absSzi : 0;
      const markPx = szi > 0
        ? entryPx + pnlPerUnit
        : szi < 0
          ? entryPx - pnlPerUnit
          : entryPx;
      return {
        coin: p.coin,
        szi,
        entryPx,
        markPx,
        unrealizedPnl,
        marginUsed: parseFloat(p.marginUsed),
        leverage: p.leverage.value,
        liquidationPx: p.liquidationPx ? parseFloat(p.liquidationPx) : null,
        returnOnEquity: parseFloat(p.returnOnEquity),
      };
    });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { tradingEnabled } = useAppConfig();
  const [address, setAddress] = useState<string | null>(null);
  const [apiAddress, setApiAddress] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [exchangeClient, setExchangeClient] = useState<ExchangeClient | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const infoRef = useRef<InfoClient | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getInfo = useCallback(() => {
    if (!infoRef.current) {
      const transport = new HttpTransport({ isTestnet: isNetworkTestnet() });
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
        const crossMarginUsed = parseFloat(state.crossMarginSummary.totalMarginUsed);
        const totalMarginUsed = parseFloat(state.marginSummary.totalMarginUsed);

        // marginSummary.accountValue is the total perps equity (cross + isolated).
        // spotUsdcTotal is USDC sitting in the spot wallet (NOT deposited to perps).
        const totalAccountValue = isolatedAccountValue + spotUsdcTotal;

        // Available for new orders = cross account value - cross margin used
        // This matches Hyperliquid UI "Available Balance"
        const availableForTrading = Math.max(crossAccountValue - crossMarginUsed, 0);

        setAccountState({
          accountValue: totalAccountValue,
          crossAccountValue,
          isolatedAccountValue,
          totalMarginUsed,
          withdrawable: availableForTrading,
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

  const connectWithExecutionProvider = useCallback(
    async (
      provider: InjectedEthereumProvider,
      explicitAddress?: string,
      walletLabel = "wallet"
    ) => {
      if (!tradingEnabled) {
        throw new Error(
          "Trading connections are disabled in the public deployment. Use read-only wallet analytics instead."
        );
      }

      const transport = new HttpTransport({ isTestnet: isNetworkTestnet() });
      const walletClient = createWalletClient({
        transport: custom(provider),
      });
      const [providerAddr] = await walletClient.requestAddresses();
      const mainAddr = (explicitAddress ?? providerAddr) as Address | undefined;

      if (!mainAddr) {
        throw new Error(`Failed to connect ${walletLabel}: no address returned.`);
      }

      const browserWallet = {
        getAddresses: async () => [mainAddr as Address],
        getChainId: async () => walletClient.getChainId(),
        signTypedData: async (params: {
          domain: Record<string, unknown>;
          types: Record<string, Array<{ name: string; type: string }>>;
          primaryType: string;
          message: Record<string, unknown>;
        }) =>
          walletClient.signTypedData({
            ...params,
            account: mainAddr as Address,
          } as Parameters<typeof walletClient.signTypedData>[0]),
      };

      const agentPrivateKey = generatePrivateKey();
      const agentWallet = privateKeyToAccount(agentPrivateKey);
      const approver = new ExchangeClient({
        transport,
        wallet: browserWallet as never,
      });
      const agentName = `hp${Date.now().toString(36).slice(-10)}`;
      await approver.approveAgent({
        agentAddress: agentWallet.address,
        agentName,
      });

      const exchange = new ExchangeClient({ transport, wallet: agentWallet });

      const info = getInfo();
      await info.openOrders({ user: mainAddr });
      await fetchPortfolio(mainAddr, true);

      setAddress(mainAddr);
      setApiAddress(agentWallet.address);
      setExchangeClient(exchange);
      setIsReadOnly(false);

      toast.success(`Trading enabled: ${mainAddr.slice(0, 6)}...${mainAddr.slice(-4)}`);
    },
    [fetchPortfolio, getInfo, tradingEnabled]
  );

  const connectWithBrowserWallet = useCallback(
    async (preference: BrowserWalletPreference = "auto") => {
      setLoading(true);
      try {
        if (typeof window === "undefined") {
          throw new Error("Browser wallet is unavailable in this environment.");
        }
        const ethereum = (
          window as Window & { ethereum?: InjectedEthereumProvider }
        ).ethereum;
        if (!ethereum) {
          throw new Error("No browser wallet found. Install MetaMask or Rabby.");
        }
        const injectedProvider = selectProvider(ethereum, preference);
        await connectWithExecutionProvider(injectedProvider, undefined, "browser wallet");
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to connect with browser wallet";
        toast.error(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [connectWithExecutionProvider]
  );

  const connectWithPrivyWallet = useCallback(
    async (wallet: PrivyEthereumWallet) => {
      setLoading(true);
      try {
        const provider = await wallet.getEthereumProvider();
        await connectWithExecutionProvider(
          provider,
          wallet.address as Address,
          wallet.walletClientType === "privy" ? "Privy wallet" : "linked wallet"
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to connect with Privy wallet";
        toast.error(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [connectWithExecutionProvider]
  );

  const connectReadOnly = useCallback(
    async (walletAddress: string) => {
      setLoading(true);
      try {
        const normalized = walletAddress.trim();
        if (!MAIN_ADDRESS_REGEX.test(normalized)) {
          throw new Error("Invalid wallet address. Expected 42-char 0x address.");
        }

        await fetchPortfolio(normalized, true);

        setAddress(normalized);
        setApiAddress(null);
        setExchangeClient(null);
        setIsReadOnly(true);

        sessionStorage.setItem(SESSION_MAIN_ADDR, normalized);

        toast.success(
          `Viewing: ${normalized.slice(0, 6)}...${normalized.slice(-4)} (read-only)`
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load address";
        toast.error(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPortfolio]
  );

  const disconnect = useCallback(() => {
    if (address) {
      try {
        localStorage.removeItem(`hp_cache_${address.toLowerCase()}`);
      } catch {
        // ignore
      }
    }
    setAddress(null);
    setApiAddress(null);
    setIsReadOnly(false);
    setAccountState(null);
    setExchangeClient(null);
    sessionStorage.removeItem(SESSION_MAIN_ADDR);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    toast.success("Wallet disconnected");
  }, [address]);

  const refreshPortfolio = useCallback(async () => {
    if (address) {
      await fetchPortfolio(address);
    }
  }, [address, fetchPortfolio]);

  useEffect(() => {
    const unsubscribe = onNetworkChange(() => {
      infoRef.current = null;
      setExchangeClient(null);
      setAccountState(null);
      setAddress(null);
      setApiAddress(null);
      setIsReadOnly(false);
      sessionStorage.removeItem(SESSION_MAIN_ADDR);
      toast("Network changed — reconnect required", { icon: "⚡" });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const storedAddr = sessionStorage.getItem(SESSION_MAIN_ADDR);
    if (storedAddr) {
      // Restore read-only session
      connectReadOnly(storedAddr).catch(() => {
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
        isReadOnly,
        accountState,
        exchangeClient,
        loading,
        connectWithBrowserWallet,
        connectWithPrivyWallet,
        connectReadOnly,
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
