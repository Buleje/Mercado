#!/usr/bin/env node
// /notify — push a Brandon. Telegram primero, fallback a sonido + toast.
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const message = process.argv.slice(2).join(" ") || "Tarea Claude terminada.";
const envFile = join(homedir(), ".bsm-notify.env");

let token = process.env.TELEGRAM_BOT_TOKEN || "";
let chatId = process.env.TELEGRAM_CHAT_ID || "";

if (existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf8").split("\n");
  for (const l of lines) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m?.[1] === "TELEGRAM_BOT_TOKEN") token = m[2];
    if (m?.[1] === "TELEGRAM_CHAT_ID") chatId = m[2];
  }
}

async function tryTelegram() {
  if (!token || !chatId) return false;
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `🤖 Buleje\n${message}` }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function tryWindowsToast() {
  try {
    const safe = message.replace(/'/g, "''").slice(0, 200);
    const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null; $template = '<toast><visual><binding template="ToastText02"><text id="1">Buleje</text><text id="2">${safe}</text></binding></visual></toast>'; $xml = New-Object Windows.Data.Xml.Dom.XmlDocument; $xml.LoadXml($template); $toast = New-Object Windows.UI.Notifications.ToastNotification $xml; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude').Show($toast)`;
    spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    // beep
    spawn("powershell.exe", ["-NoProfile", "-Command", "[console]::beep(1200,250); [console]::beep(800,250)"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return true;
  } catch {
    return false;
  }
}

const ok = await tryTelegram();
if (!ok) tryWindowsToast();
console.log(JSON.stringify({ telegram: ok, fallback: !ok, message }));
