const STORAGE_KEY = "hp_saved_wallets";

export interface SavedWallet {
  address: string;
  nickname: string;
  addedAt: number;
  lastUsed: number;
}

export function getSavedWallets(): SavedWallet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWallet(address: string, nickname?: string): SavedWallet[] {
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
  const wallets = getSavedWallets().filter(
    (w) => w.address.toLowerCase() !== address.toLowerCase()
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  return wallets;
}

export function renameWallet(address: string, nickname: string): SavedWallet[] {
  const wallets = getSavedWallets();
  const wallet = wallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );
  if (wallet) wallet.nickname = nickname;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  return wallets;
}

export function touchWallet(address: string): void {
  const wallets = getSavedWallets();
  const wallet = wallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );
  if (wallet) {
    wallet.lastUsed = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  }
}
