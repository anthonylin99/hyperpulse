import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { isAgentDevEnabled } from "@/lib/appConfig";
import { rejectAgentIntent } from "@/lib/agent/intents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = enforceRateLimit(req, {
    key: "api-agent-intent-reject",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (!isAgentDevEnabled()) {
    return jsonError("Agent dev mode is disabled.", { status: 404 });
  }

  try {
    const { id } = await params;
    const intent = await rejectAgentIntent(id);
    if (!intent) {
      return jsonError("Paper intent is not rejectable or storage is unavailable.", { status: 409 });
    }
    return jsonSuccess({
      intent,
      message: "Paper intent rejected.",
    });
  } catch (error) {
    logServerError("api/agent/intents/reject", error);
    return jsonError("Unable to reject paper intent.", { status: 502 });
  }
}
