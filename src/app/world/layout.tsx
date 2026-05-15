import type { ReactNode } from "react";
import WorldMiniKitProvider from "@/components/world/WorldMiniKitProvider";

export default function WorldLayout({ children }: { children: ReactNode }) {
  return <WorldMiniKitProvider>{children}</WorldMiniKitProvider>;
}
