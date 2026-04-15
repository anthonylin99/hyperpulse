import {
  HttpTransport,
  InfoClient,
  WebSocketTransport,
  SubscriptionClient,
} from "@nktkas/hyperliquid";

export type HyperliquidNetwork = "mainnet" | "testnet";

const NETWORK_STORAGE_KEY = "hp_network";
const NETWORK_CHANGE_EVENT = "hp-network-change";

// Default network used for SSR + any pre-hydration render.
const DEFAULT_NETWORK: HyperliquidNetwork = "mainnet";

export function getStoredNetwork(): HyperliquidNetwork {
  if (typeof window === "undefined") return DEFAULT_NETWORK;
  const raw = window.localStorage.getItem(NETWORK_STORAGE_KEY);
  return raw === "testnet" ? "testnet" : "mainnet";
}

export function setStoredNetwork(network: HyperliquidNetwork): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
  window.dispatchEvent(new CustomEvent(NETWORK_CHANGE_EVENT, { detail: network }));
}

export function onNetworkChange(
  handler: (network: HyperliquidNetwork) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<HyperliquidNetwork>).detail;
    handler(detail ?? getStoredNetwork());
  };
  window.addEventListener(NETWORK_CHANGE_EVENT, listener);
  return () => window.removeEventListener(NETWORK_CHANGE_EVENT, listener);
}

export function isNetworkTestnet(network?: HyperliquidNetwork): boolean {
  const active = network ?? getStoredNetwork();
  return active === "testnet";
}

export function resolveNetworkFromRequest(url: URL): HyperliquidNetwork {
  const raw = url.searchParams.get("network");
  return raw === "testnet" ? "testnet" : "mainnet";
}

// Cached singletons per network (server-side reused across requests).
const transportCache = new Map<HyperliquidNetwork, HttpTransport>();
const infoCache = new Map<HyperliquidNetwork, InfoClient>();

export function getHttpTransport(network: HyperliquidNetwork = DEFAULT_NETWORK): HttpTransport {
  let t = transportCache.get(network);
  if (!t) {
    t = new HttpTransport({ isTestnet: network === "testnet" });
    transportCache.set(network, t);
  }
  return t;
}

export function getInfoClient(network: HyperliquidNetwork = DEFAULT_NETWORK): InfoClient {
  let c = infoCache.get(network);
  if (!c) {
    c = new InfoClient({ transport: getHttpTransport(network) });
    infoCache.set(network, c);
  }
  return c;
}

let subClient: SubscriptionClient | null = null;
let subClientNetwork: HyperliquidNetwork | null = null;

export function getSubscriptionClient(
  network: HyperliquidNetwork = DEFAULT_NETWORK,
): SubscriptionClient {
  if (!subClient || subClientNetwork !== network) {
    const wsTransport = new WebSocketTransport({ isTestnet: network === "testnet" });
    subClient = new SubscriptionClient({ transport: wsTransport });
    subClientNetwork = network;
  }
  return subClient;
}

// Appends ?network=testnet when the client has selected testnet. Mainnet stays
// plain so default URLs / cache keys don't change for existing users.
export function withNetworkParam(path: string): string {
  if (typeof window === "undefined") return path;
  if (getStoredNetwork() !== "testnet") return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}network=testnet`;
}

// Deprecated: compile-time fallback retained for backwards compatibility with
// code paths that cannot yet read the runtime value. Prefer isNetworkTestnet().
export const IS_TESTNET = false;

// Default mainnet transport/info for modules that import them directly.
export const transport = getHttpTransport("mainnet");
