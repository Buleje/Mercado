/**
 * Controles del aparato por EZVIZ Open — lo puro (ADR-472).
 *
 * Hik-Connect for Teams entrega un permiso de video de EZVIZ (`appToken`,
 * `at.…`) para el reproductor. Medido el 05-10 con las dos DS-2CFSP4/4G de
 * Blas: ese MISMO permiso abre las APIs de dispositivo de EZVIZ Open en
 * `isaopen.ezvizlife.com` (mover, armado, foto, capacidades, alarma) y el
 * ISAPI por la nube. La API de Teams (Syscom V2.11.800) no trae ninguno.
 * Detalle, respuestas y fechas: `docs/camaras/funciones-hikvision.md`.
 *
 * Arma los pedidos y lee las respuestas. Sin red ni secretos: lo prueba
 * `__tests__/camaras-ezviz-control.test.ts`. La red vive en
 * `ezviz-control.server.ts`.
 *
 * ## Fuentes
 *
 *  · Documentación de EZVIZ Open (copia en github passenge3r/Fall-detection-model
 *    `vendor_docs/ys7-docs/OPEN_API`, actualizada 2026-07): ptz/start (doc 679),
 *    ptz/stop (680), defence/set (701), capture, device/info, capacity,
 *    «设备主动防御» `/api/v3/device/defence` (status 1 apaga, 2 dispara).
 *  · `ezuikit-js` 9.0.23 (`index.mjs`): el reproductor mueve la cámara con
 *    `{env.domain}/api/lapp/device/ptz/start|stop` y el MISMO `accessToken`,
 *    FormData `deviceSerial, channelNo, speed, direction`, en una cola (un
 *    pedido detrás de otro).
 */

export const RUTAS_EZVIZ = {
  capacidad: "/api/lapp/device/capacity",
  info: "/api/lapp/device/info",
  /** Batería y estado de la microSD. */
  estado: "/api/lapp/device/status/get",
  microfonoLeer: "/api/lapp/camera/video/sound/status",
  microfono: "/api/lapp/camera/video/sound/set",
  moverEmpezar: "/api/lapp/device/ptz/start",
  moverParar: "/api/lapp/device/ptz/stop",
  armado: "/api/lapp/device/defence/set",
  foto: "/api/lapp/device/capture",
  /** «Defensa activa» (sirena + luz de la cámara). Va con headers, no con form. */
  alarma: "/api/v3/device/defence",
} as const;

/* ───────────────────────── Pedidos ───────────────────────── */

export const DIRECCIONES = ["up", "down", "left", "right"] as const;
export type Direccion = (typeof DIRECCIONES)[number];

/** EZVIZ: 0 arriba · 1 abajo · 2 izquierda · 3 derecha (doc 679). */
const CODIGO_DIRECCION: Record<Direccion, string> = { up: "0", down: "1", left: "2", right: "3" };

/**
 * EZVIZ: 0 lenta · 1 media · 2 rápida, y «en equipos Hikvision no puede ser 0»
 * (doc 679). Por eso el panel sólo ofrece 1 y 2.
 */
export type Velocidad = 1 | 2;

/** Un pedido de formulario a EZVIZ (sin el `accessToken`: lo agrega la red). */
export interface PedidoForm {
  ruta: string;
  campos: Record<string, string>;
}

/** Un pedido con el permiso y la serie en los headers (las APIs `v3`). */
export interface PedidoCabeceras {
  ruta: string;
  cabeceras: Record<string, string>;
  campos: Record<string, string>;
}

/** El canal de la cámara IP: siempre 1 (EZVIZ: «IPC 设备填写 1»). */
const CANAL = "1";

export function pedidoMover(
  serie: string,
  direccion: Direccion,
  velocidad: Velocidad = 1,
): PedidoForm {
  return {
    ruta: RUTAS_EZVIZ.moverEmpezar,
    campos: {
      deviceSerial: serie,
      channelNo: CANAL,
      direction: CODIGO_DIRECCION[direccion],
      speed: String(velocidad),
    },
  };
}

/**
 * Frenar. EZVIZ recomienda mandar la dirección que se estaba moviendo; sin
 * ella también frena (medido: el `stop` sin dirección es opcional en la doc 680).
 */
export function pedidoParar(serie: string, direccion?: Direccion): PedidoForm {
  return {
    ruta: RUTAS_EZVIZ.moverParar,
    campos: {
      deviceSerial: serie,
      channelNo: CANAL,
      ...(direccion && { direction: CODIGO_DIRECCION[direccion] }),
    },
  };
}

/** Cámara IP común: 1 armada (avisa movimiento), 0 desarmada (doc 701). */
export const pedidoArmado = (serie: string, activa: boolean): PedidoForm => ({
  ruta: RUTAS_EZVIZ.armado,
  campos: { deviceSerial: serie, isDefence: activa ? "1" : "0" },
});

export const pedidoInfo = (serie: string): PedidoForm => ({
  ruta: RUTAS_EZVIZ.info,
  campos: { deviceSerial: serie },
});

export const pedidoEstado = (serie: string): PedidoForm => ({
  ruta: RUTAS_EZVIZ.estado,
  campos: { deviceSerial: serie, channel: CANAL },
});

export const pedidoLeerMicrofono = (serie: string): PedidoForm => ({
  ruta: RUTAS_EZVIZ.microfonoLeer,
  campos: { deviceSerial: serie },
});

/** El micrófono de la cámara (graba sonido en el vivo y en la microSD): 1 prendido, 0 apagado. */
export const pedidoMicrofono = (serie: string, activo: boolean): PedidoForm => ({
  ruta: RUTAS_EZVIZ.microfono,
  campos: { deviceSerial: serie, enable: activo ? "1" : "0" },
});

export const pedidoCapacidad = (serie: string): PedidoForm => ({
  ruta: RUTAS_EZVIZ.capacidad,
  campos: { deviceSerial: serie, channelNo: CANAL },
});

export const pedidoFoto = (serie: string): PedidoForm => ({
  ruta: RUTAS_EZVIZ.foto,
  campos: { deviceSerial: serie, channelNo: CANAL },
});

/** Sirena + luz: `status` 2 la dispara, 1 la apaga. */
export const pedidoAlarma = (serie: string, activa: boolean): PedidoCabeceras => ({
  ruta: RUTAS_EZVIZ.alarma,
  cabeceras: { deviceSerial: serie },
  campos: { status: activa ? "2" : "1" },
});

/* ───────────────────────── Errores ───────────────────────── */

export type TipoErrorEzviz =
  /** El permiso de video venció: se pide otro y se repite UNA vez. */
  "token" | "desconectada" | "tope" | "no_soporta" | "permiso" | "ocupada" | "red" | "otro";

export interface ErrorEzviz {
  codigo: string;
  tipo: TipoErrorEzviz;
  /** Para Brandon: qué pasó y qué hacer, sin jerga. */
  mensaje: string;
}

/** Los de la doc de EZVIZ que pueden salir de estas rutas. */
const CONOCIDOS: Record<string, { tipo: TipoErrorEzviz; mensaje: string }> = {
  "10002": { tipo: "token", mensaje: "El permiso de Hikvision venció. Vuelve a intentar." },
  "20002": {
    tipo: "permiso",
    mensaje: "Hikvision no encuentra esa cámara en la cuenta del equipo.",
  },
  "20006": {
    tipo: "desconectada",
    mensaje: "La cámara tiene mala señal 4G y no contestó. Vuelve a intentar en un rato.",
  },
  "20007": {
    tipo: "desconectada",
    mensaje: "La cámara está desconectada (sin señal, sin batería o dormida).",
  },
  "20008": {
    tipo: "ocupada",
    mensaje:
      "La cámara tardó en contestar o recibió muchos pedidos seguidos. Espera unos segundos.",
  },
  "20018": {
    tipo: "permiso",
    mensaje: "La cuenta del equipo no tiene permiso para esto en esa cámara.",
  },
  "10031": {
    tipo: "permiso",
    mensaje: "La cuenta del equipo no tiene permiso para esto en esa cámara.",
  },
  "10051": {
    tipo: "permiso",
    mensaje: "La cuenta del equipo no tiene permiso para sacar fotos de esa cámara.",
  },
  "10028": {
    tipo: "ocupada",
    mensaje: "Se pidieron demasiadas fotos hoy a Hikvision. Intenta más tarde.",
  },
  "60000": { tipo: "no_soporta", mensaje: "Esta cámara no se puede mover." },
  "60001": { tipo: "permiso", mensaje: "La cuenta no tiene permiso para mover esta cámara." },
  "60002": { tipo: "tope", mensaje: "La cámara llegó a su tope de arriba." },
  "60003": { tipo: "tope", mensaje: "La cámara llegó a su tope de abajo." },
  "60004": { tipo: "tope", mensaje: "La cámara llegó a su tope de la izquierda." },
  "60005": { tipo: "tope", mensaje: "La cámara llegó a su tope de la derecha." },
  "60006": {
    tipo: "ocupada",
    mensaje: "La cámara está ocupada con otro movimiento. Suelta y vuelve a intentar.",
  },
  "60020": { tipo: "no_soporta", mensaje: "Esta cámara no hace eso." },
  /* Medido 05-10 en «Entrada» (…3717), 3 veces seguidas; «Patio» sí sacó la foto. */
  "60017": {
    tipo: "otro",
    mensaje: "La cámara no pudo sacar la foto.",
  },
};

export function traducirErrorEzviz(codigo: string, mensaje = ""): ErrorEzviz {
  const c = String(codigo ?? "").trim();
  const conocido = CONOCIDOS[c];
  if (conocido) return { codigo: c, ...conocido };
  return {
    codigo: c || "?",
    tipo: "otro",
    mensaje: `Hikvision respondió «${String(mensaje || "error sin detalle").slice(0, 80)}»${c ? ` (${c})` : ""}.`,
  };
}

export const ERROR_RED_EZVIZ: ErrorEzviz = {
  codigo: "RED",
  tipo: "red",
  mensaje: "No se pudo hablar con Hikvision (sin internet o no contestó). Vuelve a intentar.",
};

export const ERROR_FORMA_EZVIZ: ErrorEzviz = {
  codigo: "FORMA",
  tipo: "red",
  mensaje: "Hikvision contestó algo que no se entiende. Vuelve a intentar.",
};

/* ───────────────────────── Respuestas ───────────────────────── */

export type LeidoEzviz<T> = { ok: true; valor: T } | { ok: false; error: ErrorEzviz };

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texto = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

/**
 * EZVIZ contesta de dos formas (medidas el 05-10):
 *  · `lapp`: `{ code: "200", msg, data }`
 *  · `v3`:   `{ meta: { code: 200, message }, data }` (HTTP 422 con 60020)
 * Devuelve `data` (o `{}`) si el código es 200.
 */
export function leerRespuestaEzviz(raw: unknown): LeidoEzviz<unknown> {
  const r = obj(raw);
  if (!r) return { ok: false, error: ERROR_FORMA_EZVIZ };
  const meta = obj(r.meta);
  const codigo = meta ? texto(meta.code) : texto(r.code);
  const mensaje = meta ? texto(meta.message) : texto(r.msg);
  if (!codigo) return { ok: false, error: ERROR_FORMA_EZVIZ };
  if (codigo !== "200") return { ok: false, error: traducirErrorEzviz(codigo, mensaje) };
  return { ok: true, valor: r.data ?? {} };
}

/** Qué botones tiene sentido mostrar para esta cámara. */
export interface Capacidades {
  mover: boolean;
  /** Arriba/abajo además de izquierda/derecha. */
  moverVertical: boolean;
  deteccion: boolean;
  alarma: boolean;
  foto: boolean;
  /** Prender/apagar el micrófono de la cámara (`support_audio_onoff`). */
  microfono: boolean;
}

const SIN_CAPACIDADES: Capacidades = {
  mover: false,
  moverVertical: false,
  deteccion: false,
  alarma: false,
  foto: false,
  microfono: false,
};

const si = (v: unknown) => texto(v) === "1";

/**
 * `capacity` → los botones. Medido en la DS-2CFSP4/4G: `support_ptz`,
 * `ptz_left_right`, `ptz_top_bottom`, `support_defence`, `support_capture` y
 * `support_active_defense` en "1". `support_talk` también dice "1", pero el
 * permiso de Teams contesta 20018 al pedir la sesión de voz
 * (`/api/lapp/live/talk/url`): hablar NO va.
 */
export function leerCapacidades(data: unknown): Capacidades {
  const d = obj(data);
  if (!d) return SIN_CAPACIDADES;
  const horizontal = si(d.ptz_left_right);
  const vertical = si(d.ptz_top_bottom);
  return {
    mover: si(d.support_ptz) && (horizontal || vertical),
    moverVertical: si(d.support_ptz) && vertical,
    deteccion: si(d.support_defence),
    /* 1 = botón de defensa activa · 2 = botón + luz de aviso (doc capacity, nº 96). */
    alarma: ["1", "2"].includes(texto(d.support_active_defense)),
    foto: si(d.support_capture),
    microfono: si(d.support_audio_onoff),
  };
}

export interface EstadoAparato {
  enLinea: boolean | null;
  /** `defence` de `device/info`: 1 armada. `null` = no lo dijo. */
  deteccion: boolean | null;
  modelo: string | null;
}

export function leerEstado(data: unknown): EstadoAparato {
  const d = obj(data) ?? {};
  const armado = texto(d.defence);
  const estado = texto(d.status);
  return {
    enLinea: estado === "1" ? true : estado === "0" ? false : null,
    /* En cámaras IP: 0 desarmada, 1 armada. Los 8/16 son de las centrales A1. */
    deteccion: armado === "" ? null : armado !== "0",
    modelo: texto(d.model) || null,
  };
}

export type EstadoTarjeta = "ok" | "sin_formato" | "error" | "formateando";

export interface Salud {
  /** 1-100; `null` = la cámara no lo dijo (con cable, o dormida). */
  bateria: number | null;
  /** La microSD (primer carácter de `diskState`); `null` = sin tarjeta o no lo dijo. */
  tarjeta: EstadoTarjeta | null;
}

const TARJETA: Record<string, EstadoTarjeta> = {
  "0": "ok",
  "1": "error",
  "2": "sin_formato",
  "3": "formateando",
};

/**
 * `status/get` → batería y microSD. Medido el 05-10: «Patio de trozas»
 * `battryStatus 94`, `diskState "2---…"` (= sin formatear); «Entrada» 92 y "0".
 */
export function leerSalud(data: unknown): Salud {
  const d = obj(data) ?? {};
  const b = Number(texto(d.battryStatus));
  return {
    bateria: Number.isInteger(b) && b >= 1 && b <= 100 ? b : null,
    tarjeta: TARJETA[texto(d.diskState).charAt(0)] ?? null,
  };
}

/** `sound/status` → `{ enable: 1 }` (medido; la doc dice lista, se leen las dos). */
export function leerMicrofono(data: unknown): boolean | null {
  const d = Array.isArray(data) ? obj(data[0]) : obj(data);
  const v = texto(d?.enable);
  return v === "1" ? true : v === "0" ? false : null;
}

/**
 * La URL de la foto sólo se baja si es https de la nube de EZVIZ (anti-SSRF):
 * medido `https://pmssa1.ezvizlife.com:8444/image/…`, firmada y válida 2 h.
 */
export function leerUrlFoto(data: unknown): LeidoEzviz<string> {
  const url = texto(obj(data)?.picUrl).trim();
  if (!url) return { ok: false, error: ERROR_FORMA_EZVIZ };
  return esUrlDeFotoEzviz(url) ? { ok: true, valor: url } : { ok: false, error: ERROR_FORMA_EZVIZ };
}

export function esUrlDeFotoEzviz(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (u.hostname === "ezvizlife.com" || u.hostname.endsWith(".ezvizlife.com"))
    );
  } catch {
    return false;
  }
}

/* ───────────────────────── Alarma ───────────────────────── */

/**
 * La alarma (sirena + luz) está DESHABILITADA en el panel (security, 05-10):
 * el servidor contesta 409 a todo «sonar» y la pantalla muestra el botón
 * apagado con su ⓘ. «Apagar» sigue andando siempre.
 *
 * Por qué: nunca se oyó sonar una de estas cámaras y no se sabe si el
 * disparo manual respeta `AudioAlarm.alarmTimes` (5) o suena hasta que
 * alguien la apague; el apagado del servidor dentro de `after()` no llega a
 * correr en Vercel (`app/api/**` corta a los 30 s). Pasarla a `true` SÓLO
 * después de los pasos de ADR-472 § «Alarma: antes de habilitarla» (prueba
 * con `--sirena` en el sitio, con Brandon presente, y el apagado que
 * sobreviva a la función).
 */
export const ALARMA_HABILITADA = false;

/** Cuánto suena la alarma si no se dice otra cosa, y los topes (segundos). */
export const ALARMA_SEGUNDOS = { porDefecto: 30, min: 5, max: 60 } as const;

/**
 * Un «sonar» que falló así puede haber llegado igual a la cámara: la red se
 * cortó después de mandar, la cámara contestó tarde (20006/20008) o EZVIZ
 * dijo algo que no se entiende. Ante la duda se trata como SONANDO: la
 * pantalla muestra «Apagar» y el servidor programa el apagado igual.
 * Seguro que NO sonó: permiso, desconectada (20007), no la soporta, token.
 */
export function alarmaQuizaSonando(e: ErrorEzviz): boolean {
  return e.tipo === "red" || e.tipo === "ocupada" || e.tipo === "otro" || e.codigo === "20006";
}
