#!/usr/bin/env node
// Captura frames periódicos via mcp-desktop-control screenshot endpoint local.
// Si el server no responde, fallback a powershell.exe screenshot.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => {
    if (v.startsWith("--")) acc.push([v.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const intervalSec = parseInt(args.interval ?? "30", 10);
const maxFrames = parseInt(args.max ?? "60", 10);
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(process.cwd(), "reports", "screen-stream", ts);
mkdirSync(outDir, { recursive: true });

console.log(`screen-stream → ${outDir} · interval=${intervalSec}s · max=${maxFrames}`);

const psScript = (path) =>
  `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b = New-Object Drawing.Bitmap ([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width), ([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(0,0,0,0,$b.Size); $b.Save('${path}', [System.Drawing.Imaging.ImageFormat]::Png)`;

let frame = 0;
const interval = setInterval(() => {
  if (frame >= maxFrames) {
    clearInterval(interval);
    console.log(`Done. ${frame} frames in ${outDir}`);
    process.exit(0);
  }
  const fname = `frame-${String(frame).padStart(4, "0")}.png`;
  const winPath = `\\\\wsl.localhost\\Ubuntu${join(outDir, fname).replace(/\//g, "\\")}`;
  spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", psScript(winPath)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
  frame++;
}, intervalSec * 1000);

process.on("SIGTERM", () => {
  clearInterval(interval);
  console.log(`SIGTERM. ${frame} frames captured.`);
  process.exit(0);
});
