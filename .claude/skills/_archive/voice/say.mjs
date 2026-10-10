#!/usr/bin/env node
import { spawn } from "node:child_process";

const text = process.argv.slice(2).join(" ");
if (!text) {
  console.error("Uso: say.mjs <mensaje>");
  process.exit(1);
}

const safe = text.replace(/'/g, "''").slice(0, 500);
const rate = process.env.BSM_VOICE_RATE ?? "0";
const volume = process.env.BSM_VOICE_VOLUME ?? "80";

const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = ${rate}; $s.Volume = ${volume}; $s.Speak('${safe}')`;

spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
}).unref();

console.log("OK speaking:", safe.slice(0, 60));
