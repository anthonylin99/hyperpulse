import { spawn } from "node:child_process";

const command = "node";
const args = ["node_modules/next/dist/bin/next", "start"];

console.log("[start] web server mode");

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
