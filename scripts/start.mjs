import { spawn } from "node:child_process";

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_SERVICE_NAME,
);

const forceWeb = String(process.env.HYPERPULSE_START_WEB || "").toLowerCase() === "true";
const forceWorkers = String(process.env.HYPERPULSE_START_WORKERS || "").toLowerCase() === "true";
const runWorkers = forceWorkers || (isRailway && !forceWeb);

const command = "node";
const args = runWorkers ? ["scripts/railway-supervisor.mjs"] : ["node_modules/next/dist/bin/next", "start"];

console.log(`[start] ${runWorkers ? "worker supervisor" : "web server"} mode`);

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

function stop(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
