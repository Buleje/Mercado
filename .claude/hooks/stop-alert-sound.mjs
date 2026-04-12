#!/usr/bin/env node
// Stop hook — alerta sonora + YouTube cuando Claude termina una tarea.
// Throttled: máximo 1 alerta cada 5 minutos para no spamear en turns cortos.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, '..', '.state');
const STATE_FILE = join(STATE_DIR, 'last-alert-time');
const THROTTLE_MS = 5 * 60 * 1000;
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=EochZ-iyrqQ&list=RDEochZ-iyrqQ&start_radio=1';

try {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

  const now = Date.now();
  let lastAlert = 0;
  if (existsSync(STATE_FILE)) {
    lastAlert = parseInt(readFileSync(STATE_FILE, 'utf8'), 10) || 0;
  }

  if (now - lastAlert < THROTTLE_MS) {
    process.exit(0);
  }

  writeFileSync(STATE_FILE, String(now));

  spawn('explorer.exe', [YOUTUBE_URL], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();

  const beepCmd =
    'for($i=0;$i -lt 6;$i++){[console]::beep(1200,250);[console]::beep(800,250)}';
  spawn(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', beepCmd],
    { detached: true, stdio: 'ignore', windowsHide: true }
  ).unref();
} catch {
  // Fire-and-forget — nunca bloquear el Stop hook
}

process.exit(0);
