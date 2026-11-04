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
import { execFile, execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, writeFileSync } from "node:fs";
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

/**
 * Push a Telegram — no bloquea, no rompe el aviso local si falla.
 * `silencioso` (01-11, Brandon: «aviso al Telegram si no estás»): con Brandon en la PC el mensaje llega sin sonar;
 * si lleva 5 min sin tocar mouse ni teclado, suena en el celular.
 */
async function avisarTelegram(mensaje, silencioso = false) {
  const cfg = leerConfigTelegram();
  if (!cfg) return;
  try {
    await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text: mensaje, disable_web_page_preview: true, disable_notification: silencioso }),
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
// 22-10: Brandon pidió una voz más natural → primero Karla (peruana, ElevenLabs, la misma de su
// asistente de voz); si ElevenLabs falla (sin permiso text_to_speech, sin saldo, sin internet)
// habla Ava. El motivo del último fallo queda en ~/.claude/voz-karla-error.txt.
const ELEVEN_CLAVE = join(homedir(), ".config", "elevenlabs", "api_key");
// 01-11: Brandon dejó a Karla solo para su canal «Selva Prohibida» (el saldo de 40 mil créditos
// al mes se va en la narración): con este archivo los avisos hablan con Ava. Borrarlo = vuelve Karla.
const KARLA_SOLO_CANAL = join(homedir(), ".claude", "voz-karla-solo-canal");
const ELEVEN_ULTIMO_ERROR = join(homedir(), ".claude", "voz-karla-error.txt");
const VOZ_KARLA = "saqk76H0L3GCnuHtLDw6";
const MODELO_KARLA = "eleven_v4";
const CARPETA_VOZ_WSL = "/mnt/c/Users/Public/claude-voz";
const CARPETA_VOZ_WIN = "C:\\Users\\Public\\claude-voz";
// Dos sesiones que terminan juntas no deben hablar encima: la reproducción hace fila.
const CANDADO_VOZ = "/tmp/claude-voz.lock";

/** Markdown → frase que suena bien: sin enlaces, código, emojis ni «S/» leído como «ese barra». */
function limpiarParaVoz(s) {
  return s
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
}

/** Una fila de tabla «| Qué | Resultado |» → «Qué: Resultado.» (Brandon 30-10: «más datos» en la voz). */
function filaParaVoz(l) {
  const celdas = l.split("|").map((c) => limpiarParaVoz(c.trim())).filter(Boolean);
  if (celdas.length < 2) return "";
  const frase = `${celdas[0]}: ${celdas.slice(1).join(", ")}`;
  return /[.!?]$/.test(frase) ? frase : `${frase}.`;
}

/** Corta en el último punto o dos puntos antes de `max` letras, para no dejar la frase colgada. */
function recortar(salida, max = 650) {
  if (salida.length <= max) return salida;
  const corte = salida.slice(0, max);
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf(": "), corte.lastIndexOf("? "));
  return fin > 80 ? corte.slice(0, fin + 1) : `${corte.replace(/\s+\S*$/, "")}.`;
}

/**
 * Lo que se lee en voz alta. Al terminar: el primer párrafo de prosa, las filas de la primera
 * tabla como frases («Qué: Resultado.») y el último párrafo (lo que sigue), sin código ni rutas;
 * Brandon 30-10: «que la descripción sea más detallada y tenga más datos». Además (09-10):
 * una pregunta con opciones y un pedido de permiso también se dicen, con las opciones.
 */
function textoParaLeer(input, ctx = {}) {
  const evento = input?.hook_event_name;
  // 01-11: con varias sesiones vivas, la voz dice de cuál habla (el título del chat).
  // 04-11: si el Claude tiene color de pestaña (claude-sigue), la voz dice el color, que es lo que Brandon ve.
  const enChat = ctx.varias && ctx.color ? `en el Claude ${ctx.color.nombre}, ` : ctx.varias && ctx.titulo ? `en «${ctx.titulo}» ` : "";
  if (evento === "StopFailure") return `Brandon, ${enChat}me detuve por un error. Revisa la terminal, por favor.`;
  if (evento === "Notification") {
    // 01-11 (Brandon: «en vez de solo decirme "necesito permiso en la terminal", algo más completo»): qué quiere
    // hacer, en qué andaba y qué tiene que hacer él.
    if (input?.notification_type === "permission_prompt") {
      const accion = queVaAHacer(ctx.herramienta) || "seguir";
      const antes = primerParrafo(ctx.texto, 300);
      return recortar(`Brandon, ${enChat}necesito tu permiso para ${accion}.${antes ? ` Estaba en esto: ${antes}` : ""} Mira la terminal para decir sí o no.`, 900);
    }
    const pide = limpiarParaVoz(String(input?.message ?? ""));
    return recortar(`Brandon, ${enChat}una conexión te pide un dato en la terminal.${pide ? ` Dice: ${pide}` : ""}`, 600);
  }
  if (evento === "PreToolUse" && input?.tool_name === "AskUserQuestion") {
    // Brandon 30-10: «tienes que leer más las respuestas»: todas las preguntas, cada opción con su número y su explicación.
    const preguntas = (input?.tool_input?.questions ?? []).map((q) => {
      const pregunta = limpiarParaVoz(String(q?.question ?? ""));
      const opciones = (q?.options ?? [])
        .map((o, i) => {
          const nombre = limpiarParaVoz(String(o?.label ?? ""))
            .replace(/^\d+\s*[.·)-]\s*/, "")
            .replace(/\s*\(Recomendado\)/i, ", la que te recomiendo");
          const detalle = limpiarParaVoz(String(o?.description ?? ""));
          if (!nombre) return "";
          const frase = detalle ? `Opción ${i + 1}, ${nombre}: ${detalle}` : `Opción ${i + 1}, ${nombre}`;
          return /[.!?]$/.test(frase) ? frase : `${frase}.`;
        })
        .filter(Boolean);
      return [pregunta, ...opciones].filter(Boolean).join(" ");
    });
    const intro =
      preguntas.length > 1
        ? `Brandon, ${enChat}tengo ${preguntas.length === 2 ? "dos" : "varias"} preguntas para ti.`
        : `Brandon, ${enChat}tengo una pregunta para ti.`;
    // 01-11: antes de las opciones, lo que acababa de pasar (el párrafo que escribí antes de preguntar).
    const antes = primerParrafo(ctx.texto, 250);
    return recortar(`${intro}${antes ? ` ${antes}` : ""} ${preguntas.join(" ")}`, 1800);
  }
  const texto = (input?.last_assistant_message ?? "").trim();
  if (!texto) return "Terminé.";
  const { prosa, filas } = partesDeRespuesta(texto);
  let salida = "";
  let usados = 0;
  for (const p of prosa) {
    salida = salida ? `${salida} ${p}` : p;
    usados += 1;
    if (salida.length >= 60) break;
  }
  if (filas.length) salida = `${salida} ${filas.join(" ")}`.trim();
  // Brandon 30-10 (2.ª vez): «leer más las respuestas y texto»: el resto de párrafos también, no solo el último.
  for (const p of prosa.slice(usados)) salida = `${salida} ${p}`;
  const pre = ctx.varias && ctx.color ? `El Claude ${ctx.color.nombre}. ` : ctx.varias && ctx.titulo ? `En «${ctx.titulo}». ` : "";
  return salida ? recortar(`${pre}${salida}`, 1100 + pre.length) : "Terminé.";
}

/** La respuesta en partes: párrafos de prosa (limpios para voz) y las filas de la PRIMERA tabla como frases. */
function partesDeRespuesta(texto) {
  const parrafos = [];
  const filas = [];
  let tablas = 0;
  let enTabla = false;
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
    // De la primera tabla se leen las filas de datos como frases (sin encabezado ni «|---|»).
    if (l.startsWith("|")) {
      cerrar();
      if (!enTabla) tablas += 1;
      const esEncabezado = !enTabla;
      enTabla = true;
      if (tablas === 1 && !esEncabezado && !/^\|[\s:|-]+$/.test(l) && filas.length < 5) {
        const frase = filaParaVoz(l);
        if (frase) filas.push(frase);
      }
      continue;
    }
    enTabla = false;
    // Títulos y separadores no se leen: suenan a «barra, barra, guion».
    if (!l || l.startsWith("#") || /^[-*_]{3,}$/.test(l)) {
      cerrar();
      continue;
    }
    actual.push(l.replace(/^[-*>]\s+/, "").replace(/^\d+\.\s+/, ""));
  }
  cerrar();
  return { prosa: parrafos.map(limpiarParaVoz).filter(Boolean), filas };
}

/** Karla con ElevenLabs; null si no hay clave o falla (sin permiso, sin saldo): sigue Ava. */
async function generarVozKarla(texto, nombre) {
  if (!existsSync(ELEVEN_CLAVE) || existsSync(KARLA_SOLO_CANAL)) return null;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOZ_KARLA}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": readFileSync(ELEVEN_CLAVE, "utf8").trim(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: texto, model_id: MODELO_KARLA }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      writeFileSync(ELEVEN_ULTIMO_ERROR, `${new Date().toISOString()} ${res.status} ${(await res.text()).slice(0, 300)}\n`);
      return null;
    }
    writeFileSync(`${CARPETA_VOZ_WSL}/${nombre}`, Buffer.from(await res.arrayBuffer()));
    rmSync(ELEVEN_ULTIMO_ERROR, { force: true });
    return `${CARPETA_VOZ_WIN}\\${nombre}`;
  } catch (err) {
    writeFileSync(ELEVEN_ULTIMO_ERROR, `${new Date().toISOString()} ${String(err)}\n`);
    return null;
  }
}

/** Genera el mp3 con la voz; null si está apagada o falla (sin internet, uvx ausente). */
async function generarVoz(texto) {
  if (existsSync(VOZ_APAGADA)) return null;
  try {
    mkdirSync(CARPETA_VOZ_WSL, { recursive: true });
  } catch {
    return null;
  }
  const nombre = `voz-${process.pid}-${Date.now()}.mp3`;
  const karla = await generarVozKarla(texto, nombre);
  if (karla || !existsSync(UVX)) return karla;
  return new Promise((ok) => {
    execFile(
      UVX,
      ["edge-tts", "--voice", VOZ, "--text", texto, "--write-media", `${CARPETA_VOZ_WSL}/${nombre}`],
      { timeout: 20_000 },
      (err) => ok(err ? null : `${CARPETA_VOZ_WIN}\\${nombre}`),
    );
  });
}

// ── Telegram con el chat y su enlace (Brandon 29-10: «mejora las notificaciones para que me avisen mejor») ──
// Con 5 chats abiertos, «te necesito en la terminal» no decía cuál; ahora va el nombre del chat, qué pide
// (la pregunta con sus opciones o el permiso) y el enlace que lo abre en la app Claude del celular.

/** Nombre del chat: el de `claude agents` (--name) o, si no tiene, su 1.er pedido (aviso del globo). */
function nombreDelChat(id) {
  if (!id) return "";
  try {
    const lista = JSON.parse(execFileSync(join(homedir(), ".local", "bin", "claude"), ["agents", "--json"], { timeout: 8000, encoding: "utf8" }));
    const n = lista.find((s) => s.sessionId === id)?.name;
    if (n) return n;
  } catch {
    /* sin la lista: se usa el aviso del globo */
  }
  try {
    const pedido = (readFileSync(`/mnt/c/Users/Usuario/.claude-tune/globo/sesiones/${id}.txt`, "utf8").split("|")[3] ?? "").trim();
    return pedido.length > 40 ? `${pedido.slice(0, 38)}…` : pedido;
  } catch {
    return "";
  }
}

/** Enlace claude.ai/code/session_… del chat (está en su transcripción si tiene Remote Control); lee hasta 8 MB. */
function enlaceDelChat(transcripcion) {
  if (!transcripcion || !existsSync(transcripcion)) return "";
  let fd;
  try {
    fd = openSync(transcripcion, "r");
    const buf = Buffer.alloc(8 * 1024 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.toString("utf8", 0, n).match(/https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/)?.[0] ?? "";
  } catch {
    return "";
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// ── Contexto del chat (Brandon 01-11: «en vez de solo decirme "necesito permiso en la terminal", quiero algo más
// completo: un resumen y texto que leas para entender mejor») ──
// De la transcripción salen el título del chat, lo último que Claude escribió en este turno y la herramienta que
// pide permiso. Con eso la voz, el globito de Windows y el Telegram dicen QUÉ chat, QUÉ quiere hacer y en QUÉ andaba.
const SESIONES_GLOBO = "/mnt/c/Users/Usuario/.claude-tune/globo/sesiones";
const PRESENCIA = "/mnt/c/Users/Usuario/.claude-tune/globo/presencia.txt";

/** Título del chat: el que le puso Brandon (--name) y, si no tiene, el que le generó Claude. */
function tituloDelChat(ruta) {
  if (!ruta || !existsSync(ruta)) return "";
  try {
    const out = execFileSync("grep", ["-oE", '"(customTitle|aiTitle)":"[^"]{1,80}"', ruta], { encoding: "utf8", timeout: 3000, maxBuffer: 8 * 1024 * 1024 });
    const lineas = out.trim().split("\n").filter(Boolean);
    const propio = lineas.filter((l) => l.startsWith('"customTitle"')).pop();
    const elegida = propio ?? lineas.pop();
    return elegida ? String(JSON.parse(`{${elegida}}`)[propio ? "customTitle" : "aiTitle"] ?? "") : "";
  } catch {
    return ""; // sin título (grep sin coincidencias sale con 1)
  }
}

/** Del final de la transcripción (3 MB): el último texto de Claude en ESTE turno y la herramienta más reciente. */
function ultimoDelTurno(ruta) {
  const r = { texto: "", herramienta: null };
  if (!ruta || !existsSync(ruta)) return r;
  let fd;
  try {
    fd = openSync(ruta, "r");
    const tam = fstatSync(fd).size;
    const largo = Math.min(tam, 3 * 1024 * 1024);
    const buf = Buffer.alloc(largo);
    readSync(fd, buf, 0, largo, tam - largo);
    const lineas = buf.toString("utf8").split("\n");
    for (let i = lineas.length - 1; i >= 0 && !(r.texto && r.herramienta); i--) {
      let o;
      try {
        o = JSON.parse(lineas[i]);
      } catch {
        continue; // la primera línea del corte queda partida
      }
      if (o?.type === "user") {
        const c = o?.message?.content;
        // Un pedido de Brandon marca el comienzo del turno: más atrás ya es otro tema.
        if (!(Array.isArray(c) && c.some((x) => x?.type === "tool_result"))) break;
        continue;
      }
      if (o?.type !== "assistant") continue;
      for (const b of [...(o?.message?.content ?? [])].reverse()) {
        if (!r.herramienta && b?.type === "tool_use") r.herramienta = { nombre: String(b.name ?? ""), entrada: b.input ?? {} };
        if (!r.texto && b?.type === "text" && String(b.text ?? "").trim().length > 15) r.texto = String(b.text).trim();
      }
    }
  } catch {
    /* sin transcripción legible: el aviso sale igual, más corto */
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return r;
}

const NOMBRES_CONEXION = {
  "desktop-control": "manejar tu PC",
  buleje: "usar el panel de Buleje",
  autocad: "dibujar en AutoCAD",
  freecad: "usar FreeCAD",
  "google-hojas": "cambiar tus Hojas de Google",
  playwright: "usar el navegador de pruebas",
};

/** Qué quiere hacer la herramienta, dicho para Brandon (sin rutas ni comandos). */
function queVaAHacer(h) {
  if (!h?.nombre) return "";
  const e = h.entrada ?? {};
  const n = h.nombre;
  if (n === "Bash") return e.description ? `correr esto: «${String(e.description).trim().replace(/\.$/, "")}»` : "correr un programa";
  if (n === "Edit" || n === "Write" || n === "NotebookEdit") return "cambiar un archivo";
  if (n === "Read") return "leer un archivo";
  if (n === "WebFetch" || n === "WebSearch") return "buscar en internet";
  if (n === "Agent" || n === "Task") return "mandar el trabajo a un ayudante";
  if (n.startsWith("mcp__")) {
    const srv = n.split("__")[1] ?? "";
    return NOMBRES_CONEXION[srv] ?? `usar la conexión ${srv.replace(/^claude_ai_/, "").replace(/[_-]/g, " ")}`;
  }
  return `usar ${n}`;
}

/** Primer párrafo de prosa (sin tablas, código ni títulos), limpio para voz. */
function primerParrafo(texto, max = 260) {
  const p = String(texto ?? "")
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .find((x) => x && !x.startsWith("|") && !x.startsWith("```") && !x.startsWith("#"));
  return p ? recortar(limpiarParaVoz(p.replace(/\s*\n\s*/g, " ")), max) : "";
}

/** Sesiones vivas según el globo (avisaron en los últimos 30 min): con más de una, se dice de cuál se habla. */
function sesionesVivas() {
  try {
    const ahora = Date.now() / 1000;
    return readdirSync(SESIONES_GLOBO).filter((f) => {
      try {
        return ahora - Number(readFileSync(join(SESIONES_GLOBO, f), "utf8").split("|")[2]) < 1800;
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 1;
  }
}

/** ¿Brandon está en la PC? El globo anota cuándo tocó el mouse o el teclado con SU mano; sin dato = no está. */
function brandonEnLaPC() {
  try {
    return Date.now() / 1000 - Number(readFileSync(PRESENCIA, "utf8").trim()) < 300;
  } catch {
    return false;
  }
}

function contextoDelChat(input) {
  const ruta = input?.transcript_path;
  return { titulo: tituloDelChat(ruta), ...ultimoDelTurno(ruta), varias: sesionesVivas() > 1 };
}

/** Respuesta final para Telegram: 1.er párrafo, filas de la 1.ª tabla como «• Qué: Resultado» y el resto de la prosa. */
function resumenParaTelegram(texto) {
  const { prosa, filas } = partesDeRespuesta(String(texto ?? "").trim());
  if (!prosa.length && !filas.length) return "Terminó.";
  const [primero = "", ...resto] = prosa;
  const partes = [primero, filas.map((f) => `• ${f}`).join("\n"), resto.join("\n")].filter(Boolean);
  return recortar(partes.join("\n\n"), 1500);
}

/** «Claude needs your permission to use Bash» → «Necesita tu permiso para usar Bash». */
function queNecesita(input) {
  if (input?.hook_event_name === "PreToolUse" && input?.tool_name === "AskUserQuestion") {
    const q = input?.tool_input?.questions?.[0] ?? {};
    const opciones = (q.options ?? []).map((o) => `• ${o.label}`).join("\n");
    return `❓ Te pregunta: ${q.question ?? ""}${opciones ? `\n${opciones}` : ""}`;
  }
  if (input?.hook_event_name === "Notification") {
    const m = String(input?.message ?? "").match(/permission to use (.+)$/i);
    return input?.notification_type === "permission_prompt"
      ? `🔐 Necesita tu permiso${m ? ` para usar ${m[1]}` : ""}`
      : "❓ Te necesita para seguir";
  }
  return null;
}

function textoTelegram(input, resumen, ctx = {}) {
  const nombre = ctx.titulo || nombreDelChat(String(input?.session_id ?? ""));
  const enlace = enlaceDelChat(input?.transcript_path);
  const ev = input?.hook_event_name;
  let cuerpo;
  if (ev === "Notification" && input?.notification_type === "permission_prompt") {
    // 01-11: qué quiere hacer y en qué andaba, no solo «necesita tu permiso».
    const antes = primerParrafo(ctx.texto, 450);
    cuerpo = `🔐 Necesita tu permiso para ${queVaAHacer(ctx.herramienta) || "seguir"}.${antes ? `\n\nEstaba en esto: ${antes}` : ""}\n\nResponde en la terminal: sí o no.`;
  } else if (ev === "PreToolUse" && input?.tool_name === "AskUserQuestion") {
    const antes = primerParrafo(ctx.texto, 400);
    const preguntas = (input?.tool_input?.questions ?? [])
      .map((q) => `❓ ${q?.question ?? ""}\n${(q?.options ?? []).map((o, i) => `${i + 1}. ${o?.label ?? ""}${o?.description ? ` — ${o.description}` : ""}`).join("\n")}`)
      .join("\n\n");
    cuerpo = `${antes ? `${antes}\n\n` : ""}${preguntas}`;
  } else if (ev === "StopFailure") {
    cuerpo = resumen;
  } else {
    cuerpo = queNecesita(input) ?? `✅ Terminó\n\n${resumenParaTelegram(input?.last_assistant_message)}`;
  }
  const quien = ctx.color ? `${ctx.color.emoji} Claude ${ctx.color.nombre} · ` : "🤖 ";
  return `${quien}${nombre || "Claude"}\n${cuerpo}${enlace ? `\n\n👉 Abrir el chat: ${enlace}` : ""}`.slice(0, 3900);
}

/** Escapa comillas simples para incrustar texto en un string de PowerShell. */
function psEscape(s) {
  return s.replace(/'/g, "''").replace(/[\r\n]+/g, " ");
}

/** 04-11 (Brandon: «cada Claude con su color»): {nombre, emoji…} del color de la pestaña de este Claude, o null. */
async function colorDelClaude() {
  try {
    const m = await import(join(homedir(), ".claude", "bin", "claude-color.mjs"));
    return m.colorDeEsteClaude();
  } catch {
    return null; // sin el programa de colores, el aviso sale como siempre
  }
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
  const ctx = contextoDelChat(input);
  ctx.color = await colorDelClaude();
  const resumen =
    input?.hook_event_name === "StopFailure"
      ? `⚠️ Claude se detuvo por error de API: ${input.error ?? "unknown"}${input.error_details ? ` (${String(input.error_details).slice(0, 60)})` : ""}. Revisá la terminal.`
      : input?.hook_event_name === "Stop" || !input?.hook_event_name
        ? primerParrafo(input?.last_assistant_message, 240) || resumenDelTurno(input)
        : recortar(textoParaLeer(input, ctx), 240);
  const mensaje = psEscape(resumen);
  // 01-11: el globito de Windows lleva el nombre del chat (con 2 terminales se sabe cuál fue).
  // 04-11: y el color de su pestaña («Claude rojo · …»), sin emoji: PowerShell lo puede pasar como «??».
  const quien = ctx.color ? `Claude ${ctx.color.nombre}` : "Claude";
  const tituloToast = psEscape(ctx.titulo ? `${quien} · ${ctx.titulo}` : ctx.color ? quien : "Claude Code");

  // Prueba en seco (AVISO_PRUEBA=1): imprime lo que diría cada canal y no manda nada.
  if (process.env.AVISO_PRUEBA === "1") {
    process.stdout.write(
      JSON.stringify({ voz: textoParaLeer(input, ctx), toast: { titulo: tituloToast, texto: resumen }, telegram: textoTelegram(input, resumen, ctx), silencioso: brandonEnLaPC() }, null, 2)
    );
    return;
  }

  // Corre en paralelo con el toast local — no esperar a Telegram para sonar. Suena en el celular solo si Brandon no está.
  avisarTelegram(textoTelegram(input, resumen, ctx), brandonEnLaPC()).catch((err) => process.stderr.write(`[avisar-terminado] telegram: ${String(err)}\n`));

  // La voz se genera antes de lanzar PowerShell (el hook es async: el turno no espera).
  const mp3 = await generarVoz(textoParaLeer(input, ctx));

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
  $t.Item(0).AppendChild($xml.CreateTextNode('${tituloToast}')) > $null
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
  $n.BalloonTipTitle = '${tituloToast}'
  $n.BalloonTipText = '${mensaje}'
  $n.Visible = $true
  $n.ShowBalloonTip(6000)
}
# 01-11: si el globo está diciendo su frase («Tarea completada», «Claude te hace una pregunta»…), esperar a que termine.
try {
  $hasta = [int64](Get-Content -Raw -LiteralPath 'C:\\Users\\Usuario\\.claude-tune\\globo\\sonando-hasta.txt')
  $falta = $hasta - [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($falta -gt 0 -and $falta -lt 9000) { Start-Sleep -Milliseconds ($falta + 250) }
} catch { }
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
