"use client";

import type { ReactNode } from "react";
import { MiniKitProvider } from "@worldcoin/minikit-js/provider";

export default function WorldMiniKitProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID;

  if (!appId) {
    return <>{children}</>;
  }

  return <MiniKitProvider props={{ appId }}>{children}</MiniKitProvider>;
}
