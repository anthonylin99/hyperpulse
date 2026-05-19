import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { isAgentDevEnabled } from "@/lib/appConfig";
import { approvePaperIntent } from "@/lib/agent/intents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = enforceRateLimit(req, {
    key: "api-agent-intent-approve",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (!isAgentDevEnabled()) {
    return jsonError("Agent dev mode is disabled.", { status: 404 });
  }

  try {
    const { id } = await params;
    const intent = await approvePaperIntent(id);
    if (!intent) {
      return jsonError("Paper intent is not approvable or storage is unavailable.", { status: 409 });
    }
    return jsonSuccess({
      intent,
      message: "Paper intent approved. No exchange order was placed.",
    });
  } catch (error) {
    logServerError("api/agent/intents/approve", error);
    return jsonError("Unable to approve paper intent.", { status: 502 });
  }
}
