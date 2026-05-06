import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const children = new Map();
let shuttingDown = false;

const workerDir = new URL(".", import.meta.url).pathname;
const siblingMomentumWorker = resolve(workerDir, "../momentum-alerts/index.mjs");
const bundledMomentumWorker = resolve(workerDir, "momentum-alerts/index.mjs");
const momentumWorker = existsSync(siblingMomentumWorker) ? siblingMomentumWorker : bundledMomentumWorker;

const workers = [
  {
    name: "whale-indexer",
    command: "node",
    args: [resolve(workerDir, "index.mjs")],
  },
  ...(existsSync(momentumWorker)
    ? [
        {
          name: "momentum-alerts",
          command: "node",
          args: [momentumWorker],
        },
      ]
    : []),
];

function log(name, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line.trim()) console.log(`[${name}] ${line}`);
  }
}

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
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
      stopAll();
      process.exitCode = code && code !== 0 ? code : 1;
    }
  });
  child.on("error", (error) => {
    console.error(`[supervisor] ${worker.name} failed to start`, error);
    if (!shuttingDown) {
      stopAll();
      process.exitCode = 1;
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
