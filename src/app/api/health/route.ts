import { NextResponse } from "next/server";
import {
  PUBLIC_DEPLOYMENT_MODE,
  isTradingEnabled,
  isWhalesEnabled,
} from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = {
    ok: true,
    status: "ok",
    deploymentMode: PUBLIC_DEPLOYMENT_MODE,
    vercelEnv:
      process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local",
    buildId:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      null,
    featureFlags: {
      tradingEnabled: isTradingEnabled(),
      whalesEnabled: isWhalesEnabled(),
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
