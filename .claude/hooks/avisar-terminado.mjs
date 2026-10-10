#!/usr/bin/env node
/**
 * Avisa a Brandon que la tarea terminó: Telegram (push al celu, funciona lejos de
 * la PC) + melodía de Windows Media/toast nativo local en paralelo — no el blip
 * genérico ni el balloon viejo de NotifyIcon.
 *
 * Brandon suele estar en otra cosa mientras el agente trabaja; sin un aviso audible
 * se entera minutos después de que ya terminó.
 *
 * Corre en el hook Stop. Es `async: true` y falla en silencio a propósito: un aviso
 * que no suena no puede además romper el cierre del turno.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ~/.bsm-notify.env (fuera del repo, chmod 600) — configurado 2026-08-19 vía @BotFather.
const NOTIFY_ENV = join(homedir(), ".bsm-notify.env");

/** Lee TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID de ~/.bsm-notify.env si existe. */
function leerConfigTelegram() {
  if (!existsSync(NOTIFY_ENV)) return null;
  const cfg = {};
  for (const linea of readFileSync(NOTIFY_ENV, "utf8").split("\n")) {
    const m = linea.match(/^([A-Z_]+)=(.*)$/);
    if (m) cfg[m[1]] = m[2].trim();
  }
  if (!cfg.TELEGRAM_BOT_TOKEN || !cfg.TELEGRAM_CHAT_ID) return null;
  return { token: cfg.TELEGRAM_BOT_TOKEN, chatId: cfg.TELEGRAM_CHAT_ID };
}

/** Push a Telegram — no bloquea, no rompe el aviso local si falla. */
async function avisarTelegram(mensaje) {
  const cfg = leerConfigTelegram();
  if (!cfg) return;
  try {
    await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text: `🤖 Buleje\n${mensaje}` }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* PC sin internet, token revocado, etc. — el toast local igual avisa */
  }
}

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

// ── Voz (Brandon 09-10: «dictar y escuchar en español») ─────────────────────
// En vez de la melodía, una voz cálida (Ava) lee el comienzo de la respuesta. WSLg está
// apagado a propósito (.wslconfig), así que el audio no puede salir de Ubuntu: el mp3
// se genera acá (edge-tts, ~1,8 s en caliente) y lo reproduce PowerShell en Windows.
// Apagar: crear ~/.claude/voz-apagada (vuelve la melodía). Sin internet → melodía.
const VOZ_APAGADA = join(homedir(), ".claude", "voz-apagada");
const UVX = join(homedir(), ".local", "bin", "uvx");
// Ava (multilingüe, la de Copilot): Brandon la eligió el 09-10 entre 4 muestras por ser la más
// natural y cálida; lee el español con acento neutro. Antes: es-PE-CamilaNeural.
const VOZ = "en-US-AvaMultilingualNeural";
const CARPETA_VOZ_WSL = "/mnt/c/Users/Public/claude-voz";
const CARPETA_VOZ_WIN = "C:\\Users\\Public\\claude-voz";
// Dos sesiones que terminan juntas no deben hablar encima: la reproducción hace fila.
const CANDADO_VOZ = "/tmp/claude-voz.lock";

/** Lo que se lee en voz alta: el primer párrafo de prosa (sin tablas, código ni rutas), ≤ 280 letras. */
function textoParaLeer(input) {
  if (input?.hook_event_name === "StopFailure") return "Brandon, me detuve por un error. Revisa la terminal, por favor.";
  const texto = (input?.last_assistant_message ?? "").trim();
  if (!texto) return "Terminé.";
  const parrafos = [];
  let actual = [];
  let enCodigo = false;
  const cerrar = () => {
    if (actual.length) parrafos.push(actual.join(" "));
    actual = [];
  };
  for (const cruda of texto.split("\n")) {
    const l = cruda.trim();
    if (l.startsWith("```")) {
      enCodigo = !enCodigo;
      cerrar();
      continue;
    }
    if (enCodigo) continue;
    // Tablas, títulos y separadores no se leen: suenan a «barra, barra, guion».
    if (!l || l.startsWith("|") || l.startsWith("#") || /^[-*_]{3,}$/.test(l)) {
      cerrar();
      continue;
    }
    actual.push(l.replace(/^[-*>]\s+/, "").replace(/^\d+\.\s+/, ""));
  }
  cerrar();
  const limpiar = (s) =>
    s
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`[^`]*`/g, "")
      .replace(/https?:\/\/\S+/g, "")
      // Como se dice en voz alta: «S/ 95,00» → «95,00 soles», «8 ms» → «8 milisegundos».
      .replace(/S\/\.?\s?([\d.,]+)(?:\s*PEN)?/g, "$1 soles")
      .replace(/S\/\.?\s?/g, "soles ")
      .replace(/(\d)\s?ms\b/g, "$1 milisegundos")
      .replace(/[→·]/g, ", ")
      .replace(/[*_~]+/g, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
  let salida = "";
  for (const p of parrafos.map(limpiar).filter(Boolean)) {
    salida = salida ? `${salida} ${p}` : p;
    if (salida.length >= 60) break;
  }
  if (!salida) return "Terminé.";
  if (salida.length <= 280) return salida;
  const corte = salida.slice(0, 280);
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf(": "));
  return fin > 80 ? corte.slice(0, fin + 1) : `${corte.replace(/\s+\S*$/, "")}.`;
}

/** Genera el mp3 con la voz; null si está apagada o falla (sin internet, uvx ausente). */
function generarVoz(texto) {
  if (existsSync(VOZ_APAGADA) || !existsSync(UVX)) return Promise.resolve(null);
  try {
    mkdirSync(CARPETA_VOZ_WSL, { recursive: true });
  } catch {
    return Promise.resolve(null);
  }
  const nombre = `voz-${process.pid}-${Date.now()}.mp3`;
  return new Promise((ok) => {
    execFile(
      UVX,
      ["edge-tts", "--voice", VOZ, "--text", texto, "--write-media", `${CARPETA_VOZ_WSL}/${nombre}`],
      { timeout: 20_000 },
      (err) => ok(err ? null : `${CARPETA_VOZ_WIN}\\${nombre}`),
    );
  });
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

  // StopFailure (corre EN LUGAR de Stop, nunca los dos): el turno murió por error de API.
  // Payload oficial: `error` (rate_limit|overloaded|server_error…), `error_details`
  // opcional, y `last_assistant_message` = el texto del error, no una respuesta.
  // Sin este aviso, una corrida autónoma se queda muda hasta que Brandon vuelve
  // a mirar la terminal.
  const resumen =
    input?.hook_event_name === "StopFailure"
      ? `⚠️ Claude se detuvo por error de API: ${input.error ?? "unknown"}${input.error_details ? ` (${String(input.error_details).slice(0, 60)})` : ""}. Revisá la terminal.`
      : resumenDelTurno(input);
  const mensaje = psEscape(resumen);

  // Corre en paralelo con el toast local — no esperar a Telegram para sonar.
  avisarTelegram(resumen).catch(() => {});

  // La voz se genera antes de lanzar PowerShell (el hook es async: el turno no espera).
  const mp3 = await generarVoz(textoParaLeer(input));

  // Con voz: la lee MediaPlayer (espera a conocer la duración y borra el mp3 al final).
  // Sin voz (apagada, sin internet): la melodía de siempre.
  const sonido = mp3
    ? `
try {
  Add-Type -AssemblyName PresentationCore
  $p = New-Object System.Windows.Media.MediaPlayer
  $p.Open([uri]'${psEscape(mp3)}')
  $i = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $i -lt 50) { Start-Sleep -Milliseconds 100; $i++ }
  $p.Play()
  $ms = if ($p.NaturalDuration.HasTimeSpan) { $p.NaturalDuration.TimeSpan.TotalMilliseconds } else { 8000 }
  Start-Sleep -Milliseconds ([int]$ms + 300)
  $p.Close()
} catch {
  (New-Object Media.SoundPlayer '${SONIDO}').PlaySync()
}
Remove-Item -LiteralPath '${psEscape(mp3)}' -Force`
    : `
try {
  (New-Object Media.SoundPlayer '${SONIDO}').PlaySync()
} catch {
  (New-Object Media.SoundPlayer 'C:\\Windows\\Media\\Windows Notify System Generic.wav').PlaySync()
}`;

  // Toast + sonido en una sola invocación de PowerShell (arrancar powershell.exe cuesta
  // ~300ms; hacerlo dos veces se nota). El toast va primero y pide su audio en silencio:
  // aparece mientras habla la voz (o suena la melodía) y no se superponen dos sonidos.
  // Si el toast nativo falla (Focus Assist, política, versión rara de Windows) cae a
  // NotifyIcon.ShowBalloonTip, que Windows 10/11 igual renderiza como toast.
  const ps = `
$ErrorActionPreference='SilentlyContinue'
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] > $null
  $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
  $t = $xml.GetElementsByTagName('text')
  $t.Item(0).AppendChild($xml.CreateTextNode('Claude Code')) > $null
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
  $n.BalloonTipTitle = 'Claude Code'
  $n.BalloonTipText = '${mensaje}'
  $n.Visible = $true
  $n.ShowBalloonTip(6000)
}
${sonido}
# El globo vive mientras viva el proceso: se suelta después del sonido, no antes.
if ($n) { Start-Sleep -Milliseconds 1500; $n.Dispose() }
`.trim();

  // `flock`: si dos sesiones terminan juntas, la segunda espera a que calle la primera.
  const hijo = spawn(
    "flock",
    ["-w", "90", CANDADO_VOZ, "powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
    { detached: true, stdio: "ignore" }
  );
  // Se desprende: el turno no espera a que termine de sonar.
  hijo.unref();
}

main().catch(() => {});
