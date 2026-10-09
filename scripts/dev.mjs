import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Windows refuses to spawn a .cmd without a shell, so only pay for one there.
const shell = process.platform === "win32";

const services = [
  { name: "api", color: "\u001b[36m", args: ["--prefix", "backend", "run", "start:dev"] },
  { name: "web", color: "\u001b[35m", args: ["run", "dev:web"] },
];

const children = [];
let shuttingDown = false;

function forward(stream, service) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) process.stdout.write(`${service.color}[${service.name}]${"\u001b[0m"} ${line}\n`);
    }
  });
}

function kill(child) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    // /T reaches the grandchildren nest CLI spawns, which child.kill() misses.
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) kill(child);
  process.exit(code);
}

for (const service of services) {
  const child = spawn(npm, service.args, { stdio: ["ignore", "pipe", "pipe"], shell, env: process.env });
  children.push(child);
  forward(child.stdout, service);
  forward(child.stderr, service);
  // If either half dies, tear the other down instead of leaving a half-running
  // app that looks fine until you click something.
  child.on("exit", (code) => {
    if (!shuttingDown) {
      process.stdout.write(`${service.color}[${service.name}]${"\u001b[0m"} exited with code ${code}\n`);
      shutdown(code ?? 1);
    }
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}