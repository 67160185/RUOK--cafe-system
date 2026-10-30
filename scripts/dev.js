const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const backendPort = process.env.PORT || "3000";
const frontendPort = process.env.FRONTEND_PORT || "5173";
const services = [
  {
    name: "Backend",
    args: ["--watch", "src/app.js"],
    env: { ...process.env, PORT: backendPort },
  },
  {
    name: "Frontend",
    args: ["frontend/server.js"],
    env: {
      ...process.env,
      PORT: frontendPort,
      BACKEND: process.env.BACKEND || `http://localhost:${backendPort}`,
    },
  },
];

let stopping = false;
let exitCode = 0;
const children = services.map(({ name, args, env }) => {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`${name} failed to start:`, error.message);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`${name} stopped${signal ? ` (${signal})` : ` with exit code ${code}`}.`);
      stop(code || 1);
    }
  });

  return child;
});

function stop(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
  }
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
process.on("exit", () => {
  process.exitCode = exitCode;
});

console.log("Starting backend and frontend...");
