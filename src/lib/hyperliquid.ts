import {
  HttpTransport,
  InfoClient,
  WebSocketTransport,
  SubscriptionClient,
} from "@nktkas/hyperliquid";

// Switch to mainnet — set to true for testnet
const IS_TESTNET = false;

const transport = new HttpTransport({ isTestnet: IS_TESTNET });
const infoClient = new InfoClient({ transport });

let subClient: SubscriptionClient | null = null;

export function getInfoClient(): InfoClient {
  return infoClient;
}

export function getSubscriptionClient(): SubscriptionClient {
  if (!subClient) {
    const wsTransport = new WebSocketTransport({ isTestnet: IS_TESTNET });
    subClient = new SubscriptionClient({ transport: wsTransport });
  }
  return subClient;
}

export function getIsTestnet(): boolean {
  return IS_TESTNET;
}

export { transport, IS_TESTNET };
