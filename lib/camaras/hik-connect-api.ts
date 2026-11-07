/**
 * Hik-Connect for Teams (HikCentral Connect) OpenAPI — lo puro (ADR-471).
 *
 * Arma los pedidos, lee las respuestas y traduce los errores. Sin red, sin
 * secretos guardados, sin React: lo prueba `__tests__/camaras-hik-connect-api.test.ts`
 * con respuestas de la forma real. La red vive en `hik-connect-api.server.ts`.
 *
 * ## Fuentes (verificadas el 05-10-2026)
 *
 *  · Referencia de Syscom (distribuidor), «HikCentral Connect OpenAPI V2.11.800»:
 *    https://hikconnectapi.syscom.mx/ — token (`Token:` en el header, NO Bearer),
 *    `streamtoken/get` (appToken + streamAreaDomain para EZUIKit),
 *    `video/v1/live/address/get` (type 1 vivo · 2 nube · 3 microSD; protocol 1 =
 *    EZOPEN, el único para video cifrado: HLS/FLV dan EVZ60019; quality 1 HD ·
 *    2 SD; startTime/stopTime «YYYY-MM-DD HH:MM:SS», no ISO).
 *  · Integración de referencia que funciona contra la API real:
 *    https://github.com/Frens98/hikconnect-nvr (`api.py`): la respuesta del
 *    token trae `areaDomain` —el dominio al que van los pedidos siguientes— y
 *    `expireTime` en segundos epoch; la lista de cámaras es
 *    `resource/v1/areas/cameras/get` con `pageIndex` + `filter.areaID "-1"` y
 *    contesta `data.camera[]` (`id`, `name`, `device.devInfo.serialNo`).
 *    Syscom documenta otra forma (`pageNo`, `data.list`, `cameraName`): se leen
 *    las dos.
 *  · https://github.com/pergolafabio/Hikvision-Addons/issues/282: «Every user
 *    can generate those keys inside TeamManagement → Api Integration» (05-2026).
 *  · Medido con claves falsas contra los 4 dominios (05-10): HTTP 200 y
 *    `{"message":"AK_NOT_FOUND{OPEN000001}","errorCode":"OPEN000001"}`; sin
 *    secretKey → OPEN000010; token inventado → OPEN000006 TOKEN_NOT_FOUND;
 *    sin token → OPEN000007 TOKEN_ERROR. La tabla «0x2001…» de Syscom NO es lo
 *    que contesta el servidor: no se usa.
 *  · Dominios de video por región: README de `ezuikit-js` 9.0.23 (tabla
 *    «海外版本»): América del Sur = https://isaopen.ezvizlife.com.
 */

/* ───────────────────────── Regiones ───────────────────────── */

export const REGIONES_HIK = {
  sa: {
    nombre: "América del Sur",
    api: "https://isa.hikcentralconnect.com",
    video: "https://isaopen.ezvizlife.com",
  },
  us: {
    nombre: "Norteamérica",
    api: "https://ius.hikcentralconnect.com",
    video: "https://iusopen.ezvizlife.com",
  },
  eu: {
    nombre: "Europa",
    api: "https://ieu.hikcentralconnect.com",
    video: "https://ieuopen.ezvizlife.com",
  },
  sgp: {
    nombre: "Asia",
    api: "https://isgp.hikcentralconnect.com",
    video: "https://isgpopen.ezvizlife.com",
  },
} as const;

export type RegionHik = keyof typeof REGIONES_HIK;
export const CODIGOS_REGION = Object.keys(REGIONES_HIK) as RegionHik[];

/** Perú primero: si la clave no es de ahí, se prueban las demás en este orden. */
export const ORDEN_REGIONES: readonly RegionHik[] = ["sa", "us", "eu", "sgp"];

export const esRegion = (v: unknown): v is RegionHik =>
  typeof v === "string" && (CODIGOS_REGION as string[]).includes(v);

export const RUTAS_HIK = {
  token: "/api/hccgw/platform/v1/token/get",
  streamToken: "/api/hccgw/platform/v1/streamtoken/get",
  camaras: "/api/hccgw/resource/v1/areas/cameras/get",
  direccion: "/api/hccgw/video/v1/live/address/get",
} as const;

/* ───────────────────────── Errores ───────────────────────── */

export type TipoErrorHik =
  /** AppKey/SecretKey: no las reconoce o no coinciden. */
  | "clave"
  /** El token venció o no existe: se pide otro y se reintenta UNA vez. */
  | "token"
  | "camara"
  | "parametro"
  | "limite"
  /** Hikvision no contestó, o contestó algo que no es su JSON. */
  | "red"
  | "otro";

export interface ErrorHik {
  codigo: string;
  tipo: TipoErrorHik;
  /** Para Brandon: qué pasó y qué hacer, sin jerga. */
  mensaje: string;
}

/**
 * Lo conocido, con su fuente:
 *  · OPEN000001/06/07/10: medidos el 05-10 contra los servidores reales.
 *  · EVZ…: EZVIZ Open Platform (la nube de video que usa Hik-Connect) —
 *    EVZ60019 lo cita Syscom; 10002/20002/20007/20008/20018 son los códigos
 *    de su API abierta y vuelven con el prefijo EVZ.
 * Lo que no está acá se muestra con el nombre que da Hikvision y su código.
 */
const CONOCIDOS: Record<string, { tipo: TipoErrorHik; mensaje: string }> = {
  OPEN000001: {
    tipo: "clave",
    mensaje:
      "Hikvision no reconoce esa AppKey. Cópiala de nuevo desde «API Integration» del portal (sin espacios) y revisa que sea de la región correcta.",
  },
  OPEN000006: { tipo: "token", mensaje: "El permiso de Hikvision venció. Vuelve a intentar." },
  OPEN000007: {
    tipo: "token",
    mensaje: "El permiso de Hikvision no es válido. Vuelve a intentar.",
  },
  OPEN000010: {
    tipo: "parametro",
    mensaje:
      "Hikvision rechazó el pedido porque le faltó un dato. Revisa que la AppKey y la SecretKey estén completas.",
  },
  EVZ10002: {
    tipo: "token",
    mensaje: "El permiso de video venció. Cierra y vuelve a abrir el video.",
  },
  EVZ20002: {
    tipo: "camara",
    mensaje:
      "Hikvision no encuentra esa cámara en la cuenta del equipo. Revisa que esté importada en Hik-Connect for Teams.",
  },
  EVZ20007: {
    tipo: "camara",
    mensaje:
      "La cámara está desconectada: sin datos en el chip, sin batería o dormida. Mírala en Hik-Connect y vuelve a intentar.",
  },
  EVZ20008: {
    tipo: "camara",
    mensaje:
      "La cámara tardó demasiado en contestar (señal 4G débil). Vuelve a intentar en un rato.",
  },
  EVZ20018: {
    tipo: "camara",
    mensaje:
      "La cuenta del equipo no tiene permiso sobre esa cámara. Compártela o impórtala al equipo en Hik-Connect for Teams.",
  },
  EVZ60019: {
    tipo: "camara",
    mensaje:
      "El video de la cámara está cifrado. Carga el código de verificación (6 letras de la etiqueta) en «Enlazar».",
  },
  EVZ10001: {
    tipo: "camara",
    mensaje:
      "Hikvision no aceptó el código de verificación. Son las 6 letras MAYÚSCULAS de la etiqueta de la cámara (o de su caja): revísalo en «Código».",
  },
};

/** «AK_NOT_FOUND{OPEN000001}» → «AK_NOT_FOUND». */
function nombreDelError(message: string): string {
  return message.replace(/\{[^}]*\}\s*$/, "").trim();
}

export function traducirError(codigo: string, message = ""): ErrorHik {
  const c = String(codigo || "")
    .trim()
    .toUpperCase();
  const conocido = CONOCIDOS[c];
  if (conocido) return { codigo: c, ...conocido };
  const nombre = nombreDelError(String(message ?? ""));
  const texto = `${c} ${nombre}`.toUpperCase();
  if (/TOKEN/.test(texto))
    return { codigo: c, tipo: "token", mensaje: CONOCIDOS.OPEN000006.mensaje };
  if (/\bAK\b|\bSK\b|SECRET|APPKEY|APP_KEY/.test(texto))
    return {
      codigo: c,
      tipo: "clave",
      mensaje:
        "Hikvision no aceptó la AppKey o la SecretKey. Cópialas de nuevo desde «API Integration» del portal.",
    };
  if (/OFFLINE|NOT_ONLINE/.test(texto)) return { codigo: c, ...CONOCIDOS.EVZ20007 };
  if (/LIMIT|FREQUEN|TOO_MANY/.test(texto))
    return {
      codigo: c,
      tipo: "limite",
      mensaje: "Hikvision pide esperar unos segundos entre pedidos. Vuelve a intentar.",
    };
  return {
    codigo: c || "?",
    tipo: "otro",
    mensaje: `Hikvision respondió «${nombre || "error sin detalle"}»${c ? ` (${c})` : ""}.`,
  };
}

export const ERROR_RED: ErrorHik = {
  codigo: "RED",
  tipo: "red",
  mensaje:
    "No se pudo hablar con Hikvision (sin internet o su servidor no contestó). Vuelve a intentar en un momento.",
};

export const ERROR_FORMA: ErrorHik = {
  codigo: "FORMA",
  tipo: "red",
  mensaje:
    "Hikvision contestó algo que no se entiende. Vuelve a intentar; si sigue, avisa a soporte.",
};

/* ───────────────────────── Respuestas ───────────────────────── */

export type Leido<T> = { ok: true; valor: T } | { ok: false; error: ErrorHik };

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texto = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

/** `{ errorCode: "0", data }` → data; cualquier otro código → el error traducido. */
export function leerSobre(raw: unknown): Leido<Record<string, unknown>> {
  const r = obj(raw);
  if (!r || !("errorCode" in r)) return { ok: false, error: ERROR_FORMA };
  const codigo = texto(r.errorCode);
  if (codigo !== "0") return { ok: false, error: traducirError(codigo, texto(r.message)) };
  return { ok: true, valor: obj(r.data) ?? {} };
}

/** Un dominio que vino en la respuesta sólo se usa si es https y del dueño esperado. */
function dominioDe(valor: unknown, sufijo: string, porDefecto: string): string {
  const s = texto(valor).trim();
  if (!s) return porDefecto;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" || u.username || u.password) return porDefecto;
    if (u.hostname !== sufijo.slice(1) && !u.hostname.endsWith(sufijo)) return porDefecto;
    return `https://${u.host}`;
  } catch {
    return porDefecto;
  }
}

/** `expireTime`: segundos epoch (lo que contesta el servidor), ms, o ISO (lo que dice Syscom). */
export function venceDe(valor: unknown, ahora: number): number {
  const UNA_HORA = 3_600_000;
  if (typeof valor === "number" || (typeof valor === "string" && /^\d+$/.test(valor.trim()))) {
    const n = Number(valor);
    const ms = n < 1e12 ? n * 1000 : n;
    return ms > ahora ? ms : ahora + UNA_HORA;
  }
  if (typeof valor === "string") {
    const ms = Date.parse(valor);
    if (Number.isFinite(ms) && ms > ahora) return ms;
  }
  return ahora + UNA_HORA;
}

export interface TokenHik {
  token: string;
  /** ms epoch. */
  vence: number;
  /** A dónde van los pedidos siguientes (el `areaDomain` del token, si es de Hikvision). */
  dominioApi: string;
}

export function leerToken(raw: unknown, region: RegionHik, ahora: number): Leido<TokenHik> {
  const s = leerSobre(raw);
  if (!s.ok) return s;
  const token = texto(s.valor.accessToken);
  if (!token) return { ok: false, error: ERROR_FORMA };
  return {
    ok: true,
    valor: {
      token,
      vence: venceDe(s.valor.expireTime, ahora),
      dominioApi: dominioDe(s.valor.areaDomain, ".hikcentralconnect.com", REGIONES_HIK[region].api),
    },
  };
}

export interface StreamTokenHik {
  /** El `accessToken` de EZUIKit (distinto del token de la API). */
  appToken: string;
  /** El `env.domain` de EZUIKit: sin él va a China y falla callado. */
  dominioVideo: string;
}

export function leerStreamToken(raw: unknown, region: RegionHik): Leido<StreamTokenHik> {
  const s = leerSobre(raw);
  if (!s.ok) return s;
  const appToken = texto(s.valor.appToken);
  if (!appToken) return { ok: false, error: ERROR_FORMA };
  return {
    ok: true,
    valor: {
      appToken,
      dominioVideo: dominioDe(
        s.valor.streamAreaDomain,
        ".ezvizlife.com",
        REGIONES_HIK[region].video,
      ),
    },
  };
}

export interface CamaraHik {
  /** El `resourceId` del vivo. */
  resourceId: string;
  nombre: string;
  deviceSerial: string;
  /** `null` = Hikvision no lo dijo. */
  enLinea: boolean | null;
}

function estadoEnLinea(...valores: unknown[]): boolean | null {
  for (const v of valores) {
    const t = texto(v).toLowerCase();
    if (t === "1" || t === "online" || t === "true") return true;
    if (t === "0" || t === "2" || t === "offline" || t === "false") return false;
  }
  return null;
}

export interface PaginaCamaras {
  camaras: CamaraHik[];
  /** ¿Hay que pedir la siguiente? */
  hayMas: boolean;
}

export const TAM_PAGINA = 500;

export function leerCamaras(raw: unknown): Leido<PaginaCamaras> {
  const s = leerSobre(raw);
  if (!s.ok) return s;
  const lista = Array.isArray(s.valor.camera)
    ? s.valor.camera
    : Array.isArray(s.valor.list)
      ? s.valor.list
      : null;
  if (!lista) return { ok: false, error: ERROR_FORMA };
  const camaras: CamaraHik[] = [];
  for (const item of lista) {
    const c = obj(item);
    if (!c) continue;
    const dispositivo = obj(c.device);
    const info = obj(dispositivo?.devInfo);
    const resourceId = texto(c.id) || texto(c.resourceId) || texto(c.cameraId);
    const deviceSerial = (
      texto(info?.serialNo) ||
      texto(c.deviceSerial) ||
      texto(c.deviceSerialNo)
    ).toUpperCase();
    if (!resourceId) continue;
    camaras.push({
      resourceId,
      nombre: texto(c.name) || texto(c.cameraName) || resourceId,
      deviceSerial,
      enLinea: estadoEnLinea(
        /* `online: "1"` es lo que manda la API real (medido 05-10). */
        c.online,
        c.onlineStatus,
        c.status,
        dispositivo?.onlineStatus,
        info?.onlineStatus,
      ),
    });
  }
  return { ok: true, valor: { camaras, hayMas: lista.length >= TAM_PAGINA } };
}

export function leerDireccion(raw: unknown): Leido<string> {
  const s = leerSobre(raw);
  if (!s.ok) return s;
  const url = texto(s.valor.url).trim();
  if (!/^ezopen:\/\//i.test(url)) return { ok: false, error: ERROR_FORMA };
  return { ok: true, valor: url };
}

/* ───────────────────────── Pedidos ───────────────────────── */

export const pedidoToken = (appKey: string, secretKey: string) => ({ appKey, secretKey });

/** Toda la cuenta del equipo (`areaID "-1"` + subáreas), de a 500. */
export const pedidoCamaras = (pagina: number) => ({
  pageIndex: String(pagina),
  pageSize: TAM_PAGINA,
  filter: { areaID: "-1", includeSubArea: "1", deviceID: "", deviceSerialNo: "" },
});

export type TipoVideo = "vivo" | "grabacion";
export type CalidadVideo = "hd" | "sd";

/** «YYYY-MM-DD HH:MM:SS», hora de la cámara (la API no recibe zona). */
export const FECHA_HIK = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export interface PedidoVideo {
  resourceId: string;
  deviceSerial: string;
  tipo: TipoVideo;
  calidad: CalidadVideo;
  desde?: string;
  hasta?: string;
  /** Código de verificación de la cámara (la clave del video cifrado). */
  codigo?: string | null;
}

export function pedidoDireccion(p: PedidoVideo): Leido<Record<string, string>> {
  const base: Record<string, string> = {
    resourceId: p.resourceId,
    deviceSerial: p.deviceSerial,
    /* 3 = la microSD de la cámara (la DS-2CFSP4/4G graba ahí; la nube «2» es un plan pago). */
    type: p.tipo === "vivo" ? "1" : "3",
    protocol: "1",
    quality: p.calidad === "hd" ? "1" : "2",
  };
  /* `code` NO es el canal (como dice Syscom): es el código de verificación.
     Medido 05-10 con la DS-2CFSP4/4G real: sin `code` → EVZ60019 «Encryption is
     enabled and parameter code is empty»; con "0" o "1" → EVZ10001 «illegal
     parameter code». Sin código cargado, se omite y Hikvision dice qué falta. */
  if (p.codigo) base.code = p.codigo;
  if (p.tipo === "vivo") return { ok: true, valor: base };
  const desde = p.desde ?? "";
  const hasta = p.hasta ?? "";
  if (
    !FECHA_HIK.test(desde) ||
    !FECHA_HIK.test(hasta) ||
    desde.slice(0, 10) !== hasta.slice(0, 10) ||
    desde >= hasta
  )
    return {
      ok: false,
      error: {
        codigo: "RANGO",
        tipo: "parametro",
        mensaje: "La grabación se pide por un rango del mismo día, con inicio antes del fin.",
      },
    };
  return { ok: true, valor: { ...base, startTime: desde, stopTime: hasta } };
}

/**
 * Rango de grabación desde una fecha y hora del formulario: `minutos` hacia
 * adelante, sin pasar de la medianoche (EZUIKit y la API piden el mismo día).
 */
export function rangoDeGrabacion(
  fecha: string,
  hora: string,
  minutos = 60,
): { desde: string; hasta: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const [h, m] = hora.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  const inicio = h * 60 + m;
  const fin = Math.min(inicio + Math.max(1, minutos), 24 * 60 - 1);
  if (fin <= inicio) return null;
  const hhmm = (t: number) =>
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  return {
    desde: `${fecha} ${hhmm(inicio)}:00`,
    hasta: `${fecha} ${hhmm(fin)}:${fin === 24 * 60 - 1 ? "59" : "00"}`,
  };
}

/* ───────────────────────── Video y claves ───────────────────────── */

/** 6 letras en la etiqueta de la cámara; se acepta hasta 12 por si el modelo trae otro largo. */
export const CODIGO_VERIFICACION = /^[A-Z0-9]{6,12}$/;

export function normalizarCodigo(v: string): string | null {
  const c = v.replace(/\s+/g, "").toUpperCase();
  return CODIGO_VERIFICACION.test(c) ? c : null;
}

/**
 * El código de verificación va DENTRO de la URL EZOPEN: `ezopen://CODIGO@host/…`
 * (así la arma `ezuikit-js` 9.0.23 al leerla: `${protocolo}//${validateCode}@${host}`).
 * Si la URL ya trae uno, se respeta.
 */
export function conCodigo(url: string, codigo: string | null): string {
  if (!codigo) return url;
  const m = /^(ezopen:\/\/)([^/]*)(.*)$/i.exec(url);
  if (!m || m[2].includes("@")) return url;
  return `${m[1]}${codigo}@${m[2]}${m[3]}`;
}

export const ultimos4 = (s: string) => s.trim().slice(-4);

/** Lo que se puede mostrar de una AppKey: «•••• 9f2a». */
export const claveOculta = (u4: string) => (u4 ? `•••• ${u4}` : "");
