import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" })
  .split("\n")
  .find((line) => line.startsWith("host: "))
  ?.slice(6);
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || host;
const supported = new Set([
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "aarch64-pc-windows-msvc",
]);

if (!triple || !supported.has(triple)) {
  throw new Error(`Unsupported Tauri target triple: ${triple || "unknown"}`);
}
if (triple !== host) {
  throw new Error(`Node SEA must be built on a native ${triple} runner; current host is ${host}`);
}

const extension = triple.includes("windows") ? ".exe" : "";
const output = resolve("..", "binaries", `mcp-bridge-${triple}${extension}`);
const blob = resolve("sea-prep.blob");
const config = resolve("sea-config.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(config, JSON.stringify({
  main: resolve("bridge.bundle.cjs"),
  output: blob,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
}));

try {
  execFileSync(process.execPath, ["--experimental-sea-config", config], { stdio: "inherit" });
  copyFileSync(process.execPath, output);
  if (!triple.includes("windows")) chmodSync(output, 0o755);
  execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    [
      "exec",
      "postject",
      output,
      "NODE_SEA_BLOB",
      blob,
      "--sentinel-fuse",
      "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
      ...(triple.includes("apple") ? ["--macho-segment-name", "NODE_SEA"] : []),
    ],
    { stdio: "inherit" },
  );
} finally {
  rmSync(blob, { force: true });
  rmSync(config, { force: true });
}
