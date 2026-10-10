import "server-only";

/**
 * Video en vivo de la cámara: RTSP → HLS con ffmpeg (ADR-470; el código citaba ADR-421, que es otro tema).
 *
 * El visor de la pantalla se conforma con snapshots encadenados —un JPEG por
 * segundo, que funciona en cualquier lado—, pero eso no es *ver la cámara*:
 * entre cuadro y cuadro se pierde justo lo que uno quiere mirar, un camión
 * entrando o alguien cruzando el patio. Esto trae el video de verdad.
 *
 * ## Dónde funciona y dónde no
 *
 * Hace falta **un servidor Node que viva entre pedidos** y el binario de
 * `ffmpeg`. Eso se cumple en la máquina de Brandon (el panel corre en su PC,
 * en la misma red que la cámara) y en cualquier self-hosted; **no** se cumple
 * en serverless, donde no hay ni ffmpeg ni proceso que sobreviva a la
 * respuesta. Por eso `hayFfmpeg()` se consulta ANTES de ofrecer el botón: la
 * pantalla cae sola a los snapshots en vez de mostrar un reproductor roto.
 *
 * ## Un proceso por cámara, y que se apague solo
 *
 * Cada cámara mirada levanta un `ffmpeg` que escribe segmentos a una carpeta
 * temporal. Mientras alguien pida segmentos, el stream se mantiene; cuando
 * nadie lo toca por `TTL_MS`, se mata y se borra la carpeta. Sin eso, abrir la
 * pestaña y cerrarla deja un proceso leyendo la cámara para siempre —y la
 * cámara tiene un tope de conexiones simultáneas: dos o tres zombis y el
 * operario deja de poder verla desde el celular.
 *
 * ## ⚠️ La clave viaja en la línea de comandos, y eso se ve
 *
 * RTSP lleva usuario y clave **dentro de la URL**, y ffmpeg recibe esa URL como
 * argumento. En Linux, los argumentos de un proceso se leen desde
 * `/proc/<pid>/cmdline`, que es legible por **cualquier usuario de la máquina**
 * mientras el proceso vive. Medido acá el 2026-09-15: la clave aparece entera.
 *
 * No hay forma de evitarlo con ffmpeg: RTSP no toma credenciales por variable
 * de entorno (que sí sería privada, `/proc/<pid>/environ` es 0400 del dueño) ni
 * por stdin. Se documenta en vez de disimularse.
 *
 * **Qué tan grave es acá:** el panel corre en la PC del dueño del negocio, con
 * un solo usuario. Para que esto sea explotable haría falta otro usuario con
 * shell en esa misma máquina — y quien lo tenga ya puede leer `.env.local`, que
 * trae cosas peores. En un self-hosted **multiusuario** sí es un problema real.
 *
 * **La defensa que sí sirve**, y que la pantalla recomienda: crear en la cámara
 * un usuario aparte de sólo-ver (Hikvision: `Usuario` u `Operador`) para el
 * panel, en vez de usar el `admin`. Lo que quede expuesto es una cuenta que no
 * puede reconfigurar nada.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Sin nadie mirando, el stream se apaga. */
const TTL_MS = 30_000;
/** Cada cuánto se barre el registro buscando streams abandonados. */
const BARRIDO_MS = 10_000;
/** Cuántas cámaras se pueden estar viendo a la vez en esta máquina. */
const MAX_STREAMS = 4;
/** Lo que se espera a que aparezca el primer segmento antes de rendirse. */
const ESPERA_PRIMER_SEGMENTO_MS = 12_000;
/**
 * Un stream caído se vuelve a intentar recién pasado este rato. Sin la pausa,
 * con la cámara apagada cada recarga de la lista (una cada 2 s por pestaña)
 * levantaría un ffmpeg nuevo que muere a los 8 s: una tormenta de procesos.
 */
const REINTENTO_CAIDO_MS = 5_000;

export type EstadoStream = "arrancando" | "vivo" | "caido";

export interface Stream {
  clave: string;
  carpeta: string;
  estado: EstadoStream;
  /** Por qué se cayó, en castellano y sin la URL (que lleva la clave). */
  error: string | null;
  desde: number;
  ultimoUso: number;
  /** Cuándo se cayó: un stream caído se reintenta pasado `REINTENTO_CAIDO_MS`. */
  caidoEn: number | null;
  proceso: ChildProcess;
}

/**
 * El registro vive en `globalThis`.
 *
 * En desarrollo, Next recarga los módulos en caliente: un `Map` de módulo se
 * perdería en cada cambio de archivo y los `ffmpeg` viejos quedarían huérfanos,
 * sin nadie que los mate. Colgarlo del global lo hace sobrevivir a la recarga.
 */
type Arranque = { ok: true; carpeta: string; estado: EstadoStream } | { ok: false; motivo: string };

const global_ = globalThis as unknown as {
  __camarasHls?: Map<string, Stream>;
  __camarasHlsBarrido?: NodeJS.Timeout;
  __camarasHlsArranques?: Map<string, Promise<Arranque>>;
};
const streams = (global_.__camarasHls ??= new Map<string, Stream>());
/** Arranques en curso por cámara: el segundo pedido espera al primero (ver `asegurarStream`). */
const arranques = (global_.__camarasHlsArranques ??= new Map<string, Promise<Arranque>>());

// ─── ffmpeg disponible ──────────────────────────────────────────────────────

let ffmpegDisponible: boolean | null = null;
/** La versión mayor del ffmpeg instalado; `null` = no se pudo leer (compilación nocturna). */
let ffmpegVersion: number | null = null;

/**
 * La versión mayor de la primera línea de `ffmpeg -version`.
 *
 * `ffmpeg version 6.1.1-3ubuntu5` → 6 · `ffmpeg version n7.1` → 7. Las
 * compilaciones nocturnas (`2025-09-28-git-…` de gyan.dev, `N-112345-g…` de
 * BtbN) no traen número: devuelven `null` y se tratan como modernas, que es lo
 * que son.
 */
export function versionMayorDeFfmpeg(texto: string): number | null {
  const m = /ffmpeg version n?(\d+)\.\d+/.exec(texto);
  return m ? Number(m[1]) : null;
}

/** ¿Esta máquina puede transcodificar? Se pregunta una vez y se recuerda. */
export async function hayFfmpeg(): Promise<boolean> {
  if (ffmpegDisponible !== null) return ffmpegDisponible;
  ffmpegDisponible = await new Promise<boolean>((resolver) => {
    try {
      const p = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "ignore"] });
      let salida = "";
      p.stdout?.on("data", (b: Buffer) => {
        if (salida.length < 200) salida += b.toString();
      });
      p.on("error", () => resolver(false));
      p.on("close", (codigo) => {
        ffmpegVersion = versionMayorDeFfmpeg(salida);
        resolver(codigo === 0);
      });
    } catch {
      resolver(false);
    }
  });
  return ffmpegDisponible;
}

// ─── Arranque y parada ──────────────────────────────────────────────────────

/**
 * La línea de ffmpeg.
 *
 * `-c:v copy` **no re-encodea**: la cámara ya entrega H.264 y volver a
 * comprimirlo gastaría toda la CPU de la máquina para empeorar la imagen. El
 * precio es que un flujo H.265 saldría de acá tal cual y Safari/Chrome no lo
 * reproducen en HLS; pasa poco (el segundo flujo de Hikvision es H.264) y se
 * ve enseguida: el reproductor no arranca. Transcodificar en ese caso es el
 * siguiente paso, no el primero.
 *
 * `-rtsp_transport tcp` porque UDP se pierde cruzando WiFi y deja la imagen
 * con bloques; `-an` porque el patio no necesita audio y muchas cámaras no lo
 * traen; `delete_segments` para que la carpeta no crezca sin fin.
 *
 * **El corte por silencio cambió de nombre en ffmpeg 5** (2022): era
 * `-stimeout` y pasó a ser `-timeout`. Con `-stimeout` un ffmpeg 5, 6 o 7 no
 * arranca —«Unrecognized option»— y el video no salía NUNCA (medido 05-10 con
 * el 6.1 de Ubuntu 24.04). Y no vale poner siempre `-timeout`: en el 4.x esa
 * opción significa «esperar a que la cámara se conecte A MÍ» (modo servidor) y
 * ffmpeg se quedaría escuchando en vez de llamar. Por eso va según la versión;
 * sin versión legible (nocturnas) se asume moderna.
 */
export function argumentos(rtsp: string, salida: string, versionMayor: number | null = ffmpegVersion): string[] {
  const corte = versionMayor !== null && versionMayor < 5 ? "-stimeout" : "-timeout";
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-rtsp_transport", "tcp",
    corte, "8000000",
    "-i", rtsp,
    "-an",
    "-c:v", "copy",
    "-f", "hls",
    "-hls_time", "2",
    "-hls_list_size", "4",
    "-hls_flags", "delete_segments+omit_endlist+independent_segments",
    "-hls_segment_filename", join(salida, "s%03d.ts"),
    join(salida, "vivo.m3u8"),
  ];
}

/** Lo que se le puede mostrar al operario de un fallo de ffmpeg. */
export function motivoDeSalida(texto: string): string {
  const t = texto.toLowerCase();
  /* Antes que «not found»: «Option not found» es un problema de ESTA máquina,
     no de la cámara, y caía en «esa ruta no existe» (05-10). */
  if (t.includes("unrecognized option") || t.includes("option not found"))
    return "El ffmpeg de esta máquina no acepta las opciones del video: actualízalo o avisa a soporte.";
  if (t.includes("401") || t.includes("unauthorized"))
    return "La cámara rechazó el usuario o la clave para el video.";
  if (t.includes("connection refused") || t.includes("no route"))
    return "No se pudo abrir el video: la cámara no acepta la conexión.";
  if (t.includes("timed out") || t.includes("timeout"))
    return "La cámara no respondió a tiempo al pedirle el video.";
  if (t.includes("404") || t.includes("not found"))
    return "Esa ruta de video no existe en la cámara. Prueba con el otro canal.";
  return "No se pudo abrir el video de la cámara.";
}

/**
 * Deja un stream corriendo para esa cámara y devuelve su carpeta.
 *
 * Es idempotente: si ya está vivo, sólo marca el uso. `rtsp` lleva la clave de
 * la cámara adentro, así que **no se guarda en el registro ni se loguea**.
 *
 * **Un arranque a la vez por cámara** (05-10). Entre «no hay stream» y
 * «lo anoto» hay dos esperas (`hayFfmpeg`, `mkdtemp`): dos pedidos juntos
 * —el doble efecto de React en desarrollo, dos pestañas que abren a la vez—
 * lanzaban DOS ffmpeg y el registro se quedaba con el segundo. El primero
 * quedaba huérfano: nadie lo mataba y seguía ocupando una conexión de la
 * cámara para siempre (medido: 2 procesos con 1 cámara). El segundo pedido
 * ahora espera la respuesta del primero.
 */
export function asegurarStream(clave: string, rtsp: string): Promise<Arranque> {
  const enCurso = arranques.get(clave);
  if (enCurso) return enCurso;
  const arranque = asegurarStreamUnaVez(clave, rtsp).finally(() => arranques.delete(clave));
  arranques.set(clave, arranque);
  return arranque;
}

async function asegurarStreamUnaVez(clave: string, rtsp: string): Promise<Arranque> {
  const vivo = streams.get(clave);
  if (vivo) {
    vivo.ultimoUso = Date.now();
    /* Caído hace rato (la cámara se reinició, se cortó la luz): se vuelve a
       intentar. Antes quedaba muerto hasta que el barrido lo borraba, y como
       cada pedido le renovaba el uso, mientras alguien mirara no se borraba
       nunca. Caído recién: se contesta el motivo, sin levantar otro ffmpeg. */
    if (vivo.estado === "caido") {
      if (Date.now() - (vivo.caidoEn ?? 0) < REINTENTO_CAIDO_MS)
        return { ok: false, motivo: vivo.error ?? "El video se cortó." };
      detenerStream(clave);
    } else {
      return { ok: true, carpeta: vivo.carpeta, estado: vivo.estado };
    }
  }

  if (!(await hayFfmpeg()))
    return { ok: false, motivo: "Esta instalación no tiene ffmpeg: el video en vivo no está disponible." };

  /* Con la cámara de todos mirando a la vez, la máquina se queda sin CPU y se
     cae también lo que sí importa (el libro, la caja). Mejor negarse claro. */
  if (streams.size >= MAX_STREAMS)
    return {
      ok: false,
      motivo: `Ya hay ${MAX_STREAMS} cámaras en vivo en esta máquina. Cierra una para abrir otra.`,
    };

  let carpeta: string;
  try {
    carpeta = await mkdtemp(join(tmpdir(), "camara-hls-"));
  } catch {
    return { ok: false, motivo: "No se pudo crear la carpeta temporal del video." };
  }

  const proceso = spawn("ffmpeg", argumentos(rtsp, carpeta), { stdio: ["ignore", "ignore", "pipe"] });
  const entrada: Stream = {
    clave,
    carpeta,
    estado: "arrancando",
    error: null,
    desde: Date.now(),
    ultimoUso: Date.now(),
    caidoEn: null,
    proceso,
  };
  streams.set(clave, entrada);

  /* `stderr` de ffmpeg puede traer la URL con la clave: se lee para clasificar
     el fallo y se GUARDA sólo la frase traducida, nunca el texto crudo. */
  let ultimoError = "";
  proceso.stderr?.on("data", (b: Buffer) => {
    ultimoError = b.toString().slice(-500);
  });
  proceso.on("error", () => {
    entrada.estado = "caido";
    entrada.caidoEn = Date.now();
    entrada.error = "No se pudo ejecutar ffmpeg en esta máquina.";
  });
  proceso.on("close", () => {
    /* Que ffmpeg termine NO siempre es un error: también pasa cuando lo
       matamos por falta de uso. Si ya no está en el registro, fue a propósito. */
    if (streams.get(clave) !== entrada) return;
    entrada.estado = "caido";
    entrada.caidoEn = Date.now();
    entrada.error = motivoDeSalida(ultimoError);
  });

  arrancarBarrido();
  return { ok: true, carpeta, estado: "arrancando" };
}

/** Marca que alguien sigue mirando: sin esto el barrido lo apaga. */
export function tocarStream(clave: string): void {
  const s = streams.get(clave);
  if (s) s.ultimoUso = Date.now();
}

export function estadoDeStream(clave: string): { estado: EstadoStream; error: string | null } | null {
  const s = streams.get(clave);
  return s ? { estado: s.estado, error: s.error } : null;
}

/** Corta el stream y borra sus segmentos. Seguro de llamar dos veces. */
export function detenerStream(clave: string): void {
  const s = streams.get(clave);
  if (!s) return;
  streams.delete(clave);
  try {
    s.proceso.kill("SIGKILL");
  } catch {
    /* ya estaba muerto */
  }
  void rm(s.carpeta, { recursive: true, force: true }).catch(() => {
    /* la carpeta es temporal: si no se pudo borrar, el sistema la limpia */
  });
}

function arrancarBarrido(): void {
  if (global_.__camarasHlsBarrido) return;
  const t = setInterval(() => {
    const ahora = Date.now();
    for (const [clave, s] of streams) {
      if (ahora - s.ultimoUso > TTL_MS) detenerStream(clave);
    }
    if (streams.size === 0 && global_.__camarasHlsBarrido) {
      clearInterval(global_.__camarasHlsBarrido);
      global_.__camarasHlsBarrido = undefined;
    }
  }, BARRIDO_MS);
  /* `unref`: un intervalo vivo no debe impedir que el proceso termine. */
  t.unref?.();
  global_.__camarasHlsBarrido = t;
}

// ─── Servir los archivos ────────────────────────────────────────────────────

/** Sólo la lista y los segmentos. Cualquier otro nombre no se sirve. */
export function nombreDeArchivoValido(nombre: string): boolean {
  return /^vivo\.m3u8$/.test(nombre) || /^s\d{3,}\.ts$/.test(nombre);
}

/**
 * Lee un archivo del stream.
 *
 * El nombre se valida contra una lista de formas, no con un `includes("..")`:
 * cualquier cosa que no sea `vivo.m3u8` o `sNNN.ts` no existe para este
 * módulo, así que no hay travesía de directorios posible aunque el pedido
 * venga con `../../etc/passwd`.
 */
export async function leerArchivoDeStream(
  clave: string,
  nombre: string,
): Promise<{ ok: true; datos: Buffer; tipo: string } | { ok: false; motivo: string }> {
  if (!nombreDeArchivoValido(nombre)) return { ok: false, motivo: "Archivo no válido." };
  const s = streams.get(clave);
  if (!s) return { ok: false, motivo: "Ese video no está abierto." };
  s.ultimoUso = Date.now();
  try {
    const datos = await readFile(join(s.carpeta, nombre));
    if (s.estado === "arrancando") s.estado = "vivo";
    return {
      ok: true,
      datos,
      tipo: nombre.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t",
    };
  } catch {
    if (s.estado === "caido") return { ok: false, motivo: s.error ?? "El video se cortó." };
    return { ok: false, motivo: "Todavía no hay video: la cámara está arrancando." };
  }
}

/**
 * Espera a que exista el primer segmento.
 *
 * El reproductor pide la lista apenas abre y ffmpeg tarda un par de segundos
 * en escribirla; devolver 404 en ese hueco hace que el reproductor se rinda y
 * muestre un error sobre un stream que iba a funcionar.
 */
export async function esperarPrimerSegmento(clave: string): Promise<boolean> {
  const hasta = Date.now() + ESPERA_PRIMER_SEGMENTO_MS;
  while (Date.now() < hasta) {
    const s = streams.get(clave);
    if (!s || s.estado === "caido") return false;
    try {
      const archivos = await readdir(s.carpeta);
      if (archivos.some((a) => a.endsWith(".ts")) && archivos.includes("vivo.m3u8")) return true;
    } catch {
      /* la carpeta puede no estar lista todavía */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// ─── Lo que hace la ruta `vivo` (compartido con la prueba de punta a punta) ──

type Leido = { ok: true; datos: Buffer; tipo: string } | { ok: false; motivo: string };

/**
 * Arranca (o reusa) el stream y espera el primer pedazo: el `GET .../vivo`.
 *
 * Se espera al primer pedazo antes de contestar: si el reproductor pide la
 * lista y todavía no existe, se rinde y muestra un error sobre un video que
 * iba a funcionar dos segundos después.
 */
export async function abrirVivo(clave: string, rtsp: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const arranque = await asegurarStream(clave, rtsp);
  if (!arranque.ok) return arranque;
  if (await esperarPrimerSegmento(clave)) return { ok: true };
  return { ok: false, motivo: estadoDeStream(clave)?.error ?? "La cámara no entregó video a tiempo." };
}

/**
 * Lo que pide el reproductor por su cuenta: la lista o un segmento.
 *
 * **Si pide la LISTA y el stream ya no existe, lo vuelve a levantar.** El
 * visor suelta el video cuando la pestaña pasa al fondo; si vuelve después de
 * los 30 s del barrido, el reproductor pide la misma lista de antes y antes
 * recibía 404 → «el video se cortó» → fotos para siempre, aunque la cámara
 * estuviera perfecta (05-10). Sólo la lista revive: un segmento suelto de un
 * stream que no existe es un 404 normal, y el reproductor vuelve a pedir la
 * lista.
 *
 * `rtspPerezoso` arma la URL con la clave sólo si hace falta: en el 99 % de
 * los pedidos el stream está corriendo y la clave no se descifra.
 */
export async function leerOReabrir(clave: string, nombre: string, rtspPerezoso: () => string | null): Promise<Leido> {
  if (!nombreDeArchivoValido(nombre)) return { ok: false, motivo: "Archivo no válido." };
  const estado = estadoDeStream(clave);
  if (nombre === "vivo.m3u8" && (!estado || estado.estado === "caido")) {
    const rtsp = rtspPerezoso();
    if (!rtsp) return { ok: false, motivo: "No se pudo leer la clave guardada de la cámara. Vuelve a conectarla." };
    const abierto = await abrirVivo(clave, rtsp);
    if (!abierto.ok) return abierto;
  }
  return leerArchivoDeStream(clave, nombre);
}

/** Cuántas cámaras se están viendo ahora. Para el panel de estado. */
export function streamsAbiertos(): number {
  return streams.size;
}
