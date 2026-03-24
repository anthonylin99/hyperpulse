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
