const STORAGE_KEY = "hp_saved_wallets";
const PERSIST_SAVED_WALLETS =
  process.env.NEXT_PUBLIC_ENABLE_SAVED_WALLETS === "true";

export interface SavedWallet {
  address: string;
  nickname: string;
  addedAt: number;
  lastUsed: number;
}

export function savedWalletPersistenceEnabled() {
  return PERSIST_SAVED_WALLETS;
}

export function getSavedWallets(): SavedWallet[] {
  if (typeof window === "undefined") return [];
  if (!PERSIST_SAVED_WALLETS) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWallet(address: string, nickname?: string): SavedWallet[] {
  if (!PERSIST_SAVED_WALLETS) return [];
  const wallets = getSavedWallets();
  const normalized = address.toLowerCase();
  const existing = wallets.find((w) => w.address.toLowerCase() === normalized);

  if (existing) {
    existing.lastUsed = Date.now();
    if (nickname) existing.nickname = nickname;
  } else {
    wallets.push({
      address,
      nickname: nickname || `Wallet ${wallets.length + 1}`,
      addedAt: Date.now(),
      lastUsed: Date.now(),
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  return wallets;
}

export function removeWallet(address: string): SavedWallet[] {
  if (!PERSIST_SAVED_WALLETS) return [];
  const wallets = getSavedWallets().filter(
    (w) => w.address.toLowerCase() !== address.toLowerCase()
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  return wallets;
}

export function renameWallet(address: string, nickname: string): SavedWallet[] {
  if (!PERSIST_SAVED_WALLETS) return [];
  const wallets = getSavedWallets();
  const wallet = wallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );
  if (wallet) wallet.nickname = nickname;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  return wallets;
}

export function touchWallet(address: string): void {
  if (!PERSIST_SAVED_WALLETS) return;
  const wallets = getSavedWallets();
  const wallet = wallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );
  if (wallet) {
    wallet.lastUsed = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  }
}

export function clearSavedWallets(): void {
  if (typeof window === "undefined") return;
  if (!PERSIST_SAVED_WALLETS) return;
  localStorage.removeItem(STORAGE_KEY);
}
