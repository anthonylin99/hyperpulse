import { spawn } from "node:child_process";

const children = new Map();
const restartTimers = new Map();
let shuttingDown = false;

console.log("[start] worker supervisor mode");

const workers = [
  {
    name: "whale-indexer",
    command: "node",
    args: ["workers/whale-indexer/index.mjs"],
  },
  {
    name: "momentum-alerts",
    command: "node",
    args: ["workers/momentum-alerts/index.mjs"],
  },
];

function log(name, message) {
  for (const line of String(message).split(/\r?\n/)) {
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
    cwd: process.cwd(),
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

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
  setTimeout(() => process.exit(0), 5000).unref();
});
process.on("SIGINT", () => {
  stopAll("SIGINT");
  setTimeout(() => process.exit(0), 5000).unref();
});

for (const worker of workers) startWorker(worker);
