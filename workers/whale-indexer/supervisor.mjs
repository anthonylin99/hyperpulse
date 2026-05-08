import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const children = new Map();
const restartTimers = new Map();
let shuttingDown = false;

console.log("[start] worker supervisor mode");

const workerDir = new URL(".", import.meta.url).pathname;
const siblingMomentumWorker = resolve(workerDir, "../momentum-alerts/index.mjs");
const bundledMomentumWorker = resolve(workerDir, "momentum-alerts/index.mjs");
const momentumWorker = existsSync(siblingMomentumWorker) ? siblingMomentumWorker : bundledMomentumWorker;

function cleanEnv(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

function envFlag(name, fallback = false) {
  const value = cleanEnv(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

const momentumOnly = envFlag("MOMENTUM_ONLY");
const whaleEnabled = !momentumOnly && cleanEnv(process.env.WHALE_INDEXER_ENABLED).toLowerCase() !== "false";
const momentumEnabled = cleanEnv(process.env.MOMENTUM_ALERTS_ENABLED).toLowerCase() !== "false";

const workers = [
  ...(whaleEnabled
    ? [
        {
          name: "whale-indexer",
          command: "node",
          args: [resolve(workerDir, "index.mjs")],
        },
      ]
    : []),
  ...(momentumEnabled && existsSync(momentumWorker)
    ? [
        {
          name: "momentum-alerts",
          command: "node",
          args: [momentumWorker],
        },
      ]
    : []),
];

console.log(
  `[supervisor] config workers=${workers.map((worker) => worker.name).join(",") || "none"} ` +
    `database=${cleanEnv(process.env.DATABASE_URL || process.env.POSTGRES_URL) ? "present" : "missing"} ` +
    `telegram=${cleanEnv(process.env.TELEGRAM_BOT_TOKEN) && cleanEnv(process.env.TELEGRAM_CHAT_ID) ? "present" : "missing"}`,
);

if (!workers.length) {
  console.error("[supervisor] no workers enabled; set MOMENTUM_ALERTS_ENABLED=true or WHALE_INDEXER_ENABLED=true");
  process.exit(1);
}

function log(name, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line.trim()) console.log(`[${name}] ${line}`);
  }
}

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const timer of restartTimers.values()) clearTimeout(timer);
  restartTimers.clear();
  for (const [name, child] of children.entries()) {
    if (!child.killed) {
      console.log(`[supervisor] stopping ${name}`);
      child.kill(signal);
    }
  }
}

function startWorker(worker) {
  console.log(`[supervisor] starting ${worker.name}: ${worker.command} ${worker.args.join(" ")}`);
  const child = spawn(worker.command, worker.args, {
    cwd: resolve(workerDir, "../.."),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.set(worker.name, child);

  child.stdout.on("data", (chunk) => log(worker.name, chunk));
  child.stderr.on("data", (chunk) => log(worker.name, chunk));
  child.on("exit", (code, signal) => {
    children.delete(worker.name);
    console.error(`[supervisor] ${worker.name} exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    if (!shuttingDown) {
      const delayMs = 5000;
      console.error(`[supervisor] restarting ${worker.name} in ${delayMs}ms`);
      const timer = setTimeout(() => {
        restartTimers.delete(worker.name);
        startWorker(worker);
      }, delayMs);
      restartTimers.set(worker.name, timer);
    }
  });
  child.on("error", (error) => {
    console.error(`[supervisor] ${worker.name} failed to start`, error);
    if (!shuttingDown) {
      const delayMs = 5000;
      console.error(`[supervisor] retrying ${worker.name} in ${delayMs}ms`);
      const timer = setTimeout(() => {
        restartTimers.delete(worker.name);
        startWorker(worker);
      }, delayMs);
      restartTimers.set(worker.name, timer);
    }
  });
}

if (!existsSync(momentumWorker)) {
  console.warn("[supervisor] momentum-alerts worker not found; running whale-indexer only");
}

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
  setTimeout(() => process.exit(0), 5000).unref();
});
process.on("SIGINT", () => {
  stopAll("SIGINT");
  setTimeout(() => process.exit(0), 5000).unref();
});

for (const worker of workers) startWorker(worker);
