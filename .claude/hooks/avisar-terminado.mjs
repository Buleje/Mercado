#!/usr/bin/env node
/**
 * Avisa a Brandon que la tarea terminó: sonido + notificación de Windows.
 *
 * Brandon suele estar en otra cosa mientras el agente trabaja; sin un aviso audible
 * se entera minutos después de que ya terminó.
 *
 * Corre en el hook Stop. Es `async: true` y falla en silencio a propósito: un aviso
 * que no suena no puede además romper el cierre del turno.
 */
import { spawn } from "node:child_process";

const SONIDO = "C:\\Windows\\Media\\Windows Notify System Generic.wav";

/** Última línea significativa del asistente, para que el aviso diga algo útil. */
function resumenDelTurno(input) {
  const texto = (input?.last_assistant_message ?? "").trim();
  if (!texto) return "Tarea terminada";
  // Primera línea con contenido real, sin markdown ni encabezados.
  const linea = texto
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s`]+/, "").trim())
    .find((l) => l.length > 12);
  if (!linea) return "Tarea terminada";
  return linea.length > 110 ? linea.slice(0, 107) + "…" : linea;
}

/** Escapa comillas simples para incrustar texto en un string de PowerShell. */
function psEscape(s) {
  return s.replace(/'/g, "''").replace(/[\r\n]+/g, " ");
}

async function main() {
  let input = {};
  try {
    const crudo = await new Promise((res) => {
      let d = "";
      process.stdin.on("data", (c) => (d += c));
      process.stdin.on("end", () => res(d));
      setTimeout(() => res(d), 1500);
    });
    input = crudo ? JSON.parse(crudo) : {};
  } catch {
    /* sin input igual avisamos */
  }

  // El hook Stop se re-dispara a sí mismo; sin esto suena dos veces por turno.
  if (input?.stop_hook_active) return;

  const mensaje = psEscape(resumenDelTurno(input));

  // Sonido + globo de notificación en una sola invocación de PowerShell
  // (arrancar powershell.exe cuesta ~300ms; hacerlo dos veces se nota).
  const ps = `
$ErrorActionPreference='SilentlyContinue'
(New-Object Media.SoundPlayer '${SONIDO}').PlaySync()
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.BalloonTipTitle = 'Claude Code - listo'
$n.BalloonTipText = '${mensaje}'
$n.Visible = $true
$n.ShowBalloonTip(6000)
Start-Sleep -Milliseconds 6500
$n.Dispose()
`.trim();

  const hijo = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
    { detached: true, stdio: "ignore" }
  );
  // Se desprende: el turno no espera a que termine de sonar.
  hijo.unref();
}

main().catch(() => {});
