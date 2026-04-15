interface FilledStatus {
  filled: {
    totalSz: string;
    avgPx: string;
    oid: number;
  };
}

interface RestingStatus {
  resting: {
    oid: number;
  };
}

interface ErrorStatus {
  error: string;
}

type OrderStatus =
  | FilledStatus
  | RestingStatus
  | ErrorStatus
  | "waitingForFill"
  | "waitingForTrigger";

interface OrderLikeResponse {
  response?: {
    data?: {
      statuses?: OrderStatus[];
    };
  };
}

function isOrderLikeResponse(input: unknown): input is OrderLikeResponse {
  return typeof input === "object" && input !== null;
}

export interface ParsedOrderStatus {
  kind: "filled" | "resting" | "waiting" | "error" | "unknown";
  message?: string;
}

export function parseOrderStatuses(input: unknown): ParsedOrderStatus[] {
  if (!isOrderLikeResponse(input)) {
    throw new Error("Invalid order response from exchange");
  }

  const statuses = input.response?.data?.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error("Order response missing execution statuses");
  }

  return statuses.map((status) => {
    if (status === "waitingForFill" || status === "waitingForTrigger") {
      return { kind: "waiting", message: status };
    }
    if (typeof status === "object" && status !== null) {
      if ("error" in status && typeof status.error === "string") {
        return { kind: "error", message: status.error };
      }
      if ("filled" in status) {
        return { kind: "filled", message: status.filled.avgPx };
      }
      if ("resting" in status) {
        return { kind: "resting", message: String(status.resting.oid) };
      }
    }
    return { kind: "unknown" };
  });
}

export function summarizeOrderResponse(input: unknown): {
  filled: number;
  resting: number;
  waiting: number;
  errors: string[];
} {
  if (!isOrderLikeResponse(input)) {
    throw new Error("Invalid order response from exchange");
  }

  const statuses = input.response?.data?.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error("Order response missing execution statuses");
  }

  let filled = 0;
  let resting = 0;
  let waiting = 0;
  const errors: string[] = [];

  for (const status of statuses) {
    if (status === "waitingForFill" || status === "waitingForTrigger") {
      waiting += 1;
      continue;
    }

    if (typeof status === "object" && status !== null) {
      if ("error" in status && typeof status.error === "string") {
        errors.push(status.error);
        continue;
      }
      if ("filled" in status) {
        filled += 1;
        continue;
      }
      if ("resting" in status) {
        resting += 1;
      }
    }
  }

  return { filled, resting, waiting, errors };
}

export interface SequentialOrderInstruction {
  assetIndex: number;
  side: "buy" | "sell";
  price: string;
  size: string;
  reduceOnly: boolean;
}

export interface SequentialLegResult<T extends SequentialOrderInstruction> {
  order: T;
  status: "filled" | "resting" | "waiting" | "error";
  message?: string;
  avgPx?: number;
  filledSz?: number;
}

type ExchangeOrderClient = {
  order: (args: {
    orders: Array<{
      a: number;
      b: boolean;
      p: string;
      s: string;
      r: boolean;
      t: { limit: { tif: "Ioc" | "Gtc" | "Alo" } };
    }>;
    grouping: "na" | "normalTpsl" | "positionTpsl";
  }) => Promise<unknown>;
};

export async function executeOrdersSequentially<T extends SequentialOrderInstruction>(
  client: ExchangeOrderClient,
  orders: T[],
  onLeg?: (index: number, result: SequentialLegResult<T>) => void,
  opts: { stopOnFailure?: boolean } = { stopOnFailure: true },
): Promise<{
  executed: SequentialLegResult<T>[];
  failed: SequentialLegResult<T>[];
  stoppedAt: number | null;
}> {
  const executed: SequentialLegResult<T>[] = [];
  const failed: SequentialLegResult<T>[] = [];
  let stoppedAt: number | null = null;

  for (let i = 0; i < orders.length; i += 1) {
    const order = orders[i];
    try {
      const response = await client.order({
        orders: [
          {
            a: order.assetIndex,
            b: order.side === "buy",
            p: order.price,
            s: order.size,
            r: order.reduceOnly,
            t: { limit: { tif: "Ioc" } },
          },
        ],
        grouping: "na",
      });

      const parsed = parseOrderStatuses(response);
      const status = parsed[0];
      const rawStatuses = (response as OrderLikeResponse)?.response?.data?.statuses;
      const rawFirst = Array.isArray(rawStatuses) ? rawStatuses[0] : undefined;
      let avgPx: number | undefined;
      let filledSz: number | undefined;
      if (
        rawFirst &&
        typeof rawFirst === "object" &&
        "filled" in rawFirst &&
        rawFirst.filled
      ) {
        avgPx = Number(rawFirst.filled.avgPx);
        filledSz = Number(rawFirst.filled.totalSz);
      }

      const result: SequentialLegResult<T> = {
        order,
        status: status?.kind === "unknown" ? "error" : (status?.kind ?? "error"),
        message: status?.message,
        avgPx,
        filledSz,
      };

      if (result.status === "error") {
        failed.push(result);
        onLeg?.(i, result);
        if (opts.stopOnFailure) {
          stoppedAt = i;
          break;
        }
      } else {
        executed.push(result);
        onLeg?.(i, result);
      }
    } catch (err) {
      const result: SequentialLegResult<T> = {
        order,
        status: "error",
        message: err instanceof Error ? err.message : "order failed",
      };
      failed.push(result);
      onLeg?.(i, result);
      if (opts.stopOnFailure) {
        stoppedAt = i;
        break;
      }
    }
  }

  return { executed, failed, stoppedAt };
}

export function assertOrderSucceeded(input: unknown): string {
  const summary = summarizeOrderResponse(input);

  if (summary.errors.length > 0) {
    throw new Error(summary.errors.join("; "));
  }

  if (summary.filled === 0 && summary.resting === 0 && summary.waiting === 0) {
    throw new Error("Order did not return a recognized execution status");
  }

  if (summary.filled > 0) return "filled";
  if (summary.resting > 0) return "resting";
  return "pending";
}
