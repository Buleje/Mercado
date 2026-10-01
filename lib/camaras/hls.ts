import "server-only";

/**
 * Video en vivo de la cámara: RTSP → HLS con ffmpeg (ADR-421).
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

export type EstadoStream = "arrancando" | "vivo" | "caido";

export interface Stream {
  clave: string;
  carpeta: string;
  estado: EstadoStream;
  /** Por qué se cayó, en castellano y sin la URL (que lleva la clave). */
  error: string | null;
  desde: number;
  ultimoUso: number;
  proceso: ChildProcess;
}

/**
 * El registro vive en `globalThis`.
 *
 * En desarrollo, Next recarga los módulos en caliente: un `Map` de módulo se
 * perdería en cada cambio de archivo y los `ffmpeg` viejos quedarían huérfanos,
 * sin nadie que los mate. Colgarlo del global lo hace sobrevivir a la recarga.
 */
const global_ = globalThis as unknown as {
  __camarasHls?: Map<string, Stream>;
  __camarasHlsBarrido?: NodeJS.Timeout;
};
const streams = (global_.__camarasHls ??= new Map<string, Stream>());

// ─── ffmpeg disponible ──────────────────────────────────────────────────────

let ffmpegDisponible: boolean | null = null;

/** ¿Esta máquina puede transcodificar? Se pregunta una vez y se recuerda. */
export async function hayFfmpeg(): Promise<boolean> {
  if (ffmpegDisponible !== null) return ffmpegDisponible;
  ffmpegDisponible = await new Promise<boolean>((resolver) => {
    try {
      const p = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
      p.on("error", () => resolver(false));
      p.on("close", (codigo) => resolver(codigo === 0));
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
 */
function argumentos(rtsp: string, salida: string): string[] {
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-rtsp_transport", "tcp",
    "-stimeout", "8000000",
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
function motivoDeSalida(texto: string): string {
  const t = texto.toLowerCase();
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
 */
export async function asegurarStream(
  clave: string,
  rtsp: string,
): Promise<{ ok: true; carpeta: string; estado: EstadoStream } | { ok: false; motivo: string }> {
  const vivo = streams.get(clave);
  if (vivo) {
    vivo.ultimoUso = Date.now();
    if (vivo.estado === "caido") return { ok: false, motivo: vivo.error ?? "El video se cortó." };
    return { ok: true, carpeta: vivo.carpeta, estado: vivo.estado };
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
    entrada.error = "No se pudo ejecutar ffmpeg en esta máquina.";
  });
  proceso.on("close", () => {
    /* Que ffmpeg termine NO siempre es un error: también pasa cuando lo
       matamos por falta de uso. Si ya no está en el registro, fue a propósito. */
    if (streams.get(clave) !== entrada) return;
    entrada.estado = "caido";
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

/** Cuántas cámaras se están viendo ahora. Para el panel de estado. */
export function streamsAbiertos(): number {
  return streams.size;
}
