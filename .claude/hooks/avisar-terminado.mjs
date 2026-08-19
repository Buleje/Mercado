#!/usr/bin/env node
/**
 * Avisa a Brandon que la tarea terminó: melodía de Windows Media + toast nativo
 * (Action Center), no el blip genérico ni el balloon viejo de NotifyIcon.
 *
 * Brandon suele estar en otra cosa mientras el agente trabaja; sin un aviso audible
 * se entera minutos después de que ya terminó.
 *
 * Corre en el hook Stop. Es `async: true` y falla en silencio a propósito: un aviso
 * que no suena no puede además romper el cierre del turno.
 */
import { spawn } from "node:child_process";

// Alarm02.wav: melodía corta (~4s, xilófono) de Windows Media, no el blip genérico de
// notificación. Más corta que Alarm01/09 (~6s) a propósito: este hook suena en CADA Stop,
// y una melodía larga cansa rápido en una sesión con muchos turnos.
const SONIDO = "C:\\Windows\\Media\\Alarm02.wav";
// AppId de la shortcut de PowerShell en el Start Menu: habilita toasts nativos (WinRT) sin
// registrar una app propia ni instalar BurntToast. Verificado 2026-08-19 con screenshot real.
const TOAST_APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

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

  // Sonido + toast en una sola invocación de PowerShell (arrancar powershell.exe cuesta
  // ~300ms; hacerlo dos veces se nota). El toast pide su audio en silencio porque el
  // sonido lo pone la melodía de abajo — sin eso sonarían los dos superpuestos.
  // Si el toast nativo falla (Focus Assist, política, versión rara de Windows) cae a
  // NotifyIcon.ShowBalloonTip, que Windows 10/11 igual renderiza como toast.
  const ps = `
$ErrorActionPreference='SilentlyContinue'
try {
  (New-Object Media.SoundPlayer '${SONIDO}').PlaySync()
} catch {
  (New-Object Media.SoundPlayer 'C:\\Windows\\Media\\Windows Notify System Generic.wav').PlaySync()
}

try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] > $null
  $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
  $t = $xml.GetElementsByTagName('text')
  $t.Item(0).AppendChild($xml.CreateTextNode('Claude Code - listo')) > $null
  $t.Item(1).AppendChild($xml.CreateTextNode('${mensaje}')) > $null
  $audio = $xml.CreateElement('audio')
  $audio.SetAttribute('silent', 'true')
  $xml.DocumentElement.AppendChild($audio) > $null
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${TOAST_APP_ID}').Show($toast)
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  $n = New-Object System.Windows.Forms.NotifyIcon
  $n.Icon = [System.Drawing.SystemIcons]::Information
  $n.BalloonTipTitle = 'Claude Code - listo'
  $n.BalloonTipText = '${mensaje}'
  $n.Visible = $true
  $n.ShowBalloonTip(6000)
  Start-Sleep -Milliseconds 6500
  $n.Dispose()
}
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
