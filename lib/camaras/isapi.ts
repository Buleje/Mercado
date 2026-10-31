import "server-only";

/**
 * Cliente ISAPI de Hikvision — hablarle a la cámara desde el panel (2026-09-15).
 *
 * ## Por qué ISAPI y no Hik-Connect
 *
 * Brandon ve sus cámaras con **Hik-Connect**. Esa app es nube P2P propietaria
 * de Hikvision y su OpenAPI está reservada a partners (verificado en
 * `tpp.hikvision.com`): no hay forma legítima de que el panel se cuelgue de esa
 * nube. Lo que SÍ se puede reproducir es lo que la app hace por debajo cuando
 * el aparato es alcanzable: **ISAPI sobre HTTP con autenticación Digest**, que
 * es el protocolo abierto del propio fabricante. Ese es el caso de Brandon: usa
 * el panel en `localhost`, dentro de la misma red que la cámara.
 *
 * Esto convive con el camino que ya existe (`lib/camaras/camaras.ts`): la cámara
 * 4G del patio EMPUJA fotos porque detrás de CGNAT no hay dirección a la que
 * llamar. Acá es al revés — la cámara de la red local sí tiene IP fija y se la
 * puede llamar. Los dos caminos terminan dejando la foto en el mismo lugar.
 *
 * ## Digest, que `fetch` no hace solo
 *
 * `fetch` no implementa RFC 2617: manda el pedido, la cámara contesta 401 con
 * `WWW-Authenticate: Digest …` y ahí se termina. Hay que leer el desafío y
 * rearmar el pedido firmado a mano — es la pieza donde se rompe todo si está
 * mal, y por eso `leerDesafio` y `armarAutorizacion` son funciones puras,
 * exportadas y testeadas contra el ejemplo canónico de la RFC.
 *
 * El MD5 de acá NO es una decisión de seguridad nuestra: es el algoritmo que el
 * protocolo manda y el único que entienden los firmwares viejos. Los firmwares
 * nuevos ofrecen `SHA-256` y se usa si lo ofrecen.
 *
 * ## Reglas de la casa
 *
 * - Timeout propio siempre: una cámara apagada no puede colgar un endpoint.
 * - Ninguna función tira: todo vuelve como `Resultado`, con un motivo que el
 *   operario pueda accionar («revisa el usuario», «la cámara no responde»).
 * - La clave NUNCA entra en un `detalle` ni en un log: todo texto de salida
 *   pasa por `sinSecretos()`.
 */

import { createHash, randomBytes } from "node:crypto";

// ─────────────────────────────── Contratos ───────────────────────────────

export interface CredencialesCamara {
  host: string;
  puerto: number;
  usuario: string;
  clave: string;
  https?: boolean;
  /** Canal del aparato (un NVR tiene varios). Canal 1 → stream `101`. */
  canal?: number;
}

export interface InfoDelAparato {
  modelo: string | null;
  firmware: string | null;
  serie: string | null;
  nombre: string | null;
  canales: number | null;
  soportaPtz: boolean;
}

export type MotivoFalla =
  | "credenciales"
  | "inalcanzable"
  | "no-es-hikvision"
  | "tiempo"
  | "rechazado"
  | "sin-configurar";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: MotivoFalla; detalle: string };

// ─────────────────────────────── Constantes ──────────────────────────────

/** Seis segundos: en la red local una cámara viva contesta en decenas de ms. */
const TIMEOUT_POR_DEFECTO = 6_000;
/** El RTSP de Hikvision vive en 554 aunque el HTTP esté movido de puerto. */
const PUERTO_RTSP = 554;
/**
 * Tope de lo que se lee de una foto. Una snapshot de cámara pesa 50-500 KB; 12 MB
 * es holgado hasta para 4K. El tope existe porque la dirección la escribe el
 * operario: si apunta sin querer a algo que devuelve un archivo enorme, el
 * servidor no puede quedarse cargándolo en memoria (el panel corre con 8 GB).
 */
const MAXIMO_FOTO = 12 * 1024 * 1024;

/** Cuánto dura un empujón de PTZ antes del freno. */
const MS_PTZ_POR_DEFECTO = 500;
const MS_PTZ_MAXIMO = 5_000;

/** Las rutas cambian por firmware: se prueban en orden y se devuelve la que anduvo. */
const RUTAS_INFO = ["/ISAPI/System/deviceInfo", "/System/deviceInfo"] as const;

function rutasSnapshot(canal: number): string[] {
  return [
    `/ISAPI/Streaming/channels/${canal}01/picture`,
    `/Streaming/channels/${canal}01/picture`,
    "/onvif-http/snapshot?Profile_1",
  ];
}

// ──────────────────────── Digest / Basic (RFC 2617) ──────────────────────

export interface DesafioAuth {
  esquema: "digest" | "basic";
  parametros: Record<string, string>;
}

export interface DatosDeFirma {
  usuario: string;
  clave: string;
  /** `GET`, `PUT`… en mayúsculas: entra tal cual en el hash. */
  metodo: string;
  /** Ruta con query, exactamente como viaja en la línea de pedido. */
  uri: string;
  /** Sólo para los tests: en producción se sortea. */
  cnonce?: string;
  nc?: number;
  /** Cuerpo del pedido — sólo hace falta si la cámara pide `qop=auth-int`. */
  cuerpo?: string;
}

const HASHES: Record<string, string> = { MD5: "md5", "SHA-256": "sha256", "SHA-512-256": "sha512-256" };

/**
 * Lee el `WWW-Authenticate` del 401. Puede traer VARIOS desafíos en la misma
 * línea (`Digest …, Basic realm="x"`): se leen los dos y gana Digest, porque
 * Basic manda la clave en claro por la red.
 */
export function leerDesafio(cabecera: string | null | undefined): DesafioAuth | null {
  if (!cabecera) return null;
  const marcas: { esquema: "digest" | "basic"; desde: number; hasta: number }[] = [];
  const re = /(?:^|,)[ \t]*(Digest|Basic)[ \t]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cabecera)) !== null) {
    const previa = marcas[marcas.length - 1];
    if (previa) previa.hasta = m.index;
    marcas.push({
      esquema: m[1].toLowerCase() as "digest" | "basic",
      desde: m.index + m[0].length,
      hasta: cabecera.length,
    });
  }
  const elegida = marcas.find((x) => x.esquema === "digest") ?? marcas[0];
  if (!elegida) return null;
  return { esquema: elegida.esquema, parametros: leerParametros(cabecera.slice(elegida.desde, elegida.hasta)) };
}

/** `realm="IP Camera(C1234)", qop="auth", nonce=abc` → objeto. Tolera comillas o no. */
function leerParametros(crudo: string): Record<string, string> {
  const salida: Record<string, string> = {};
  const re = /([A-Za-z][A-Za-z0-9_-]*)[ \t]*=[ \t]*(?:"((?:[^"\\]|\\.)*)"|([^,\s]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(crudo)) !== null) {
    const valor = m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : (m[3] ?? "");
    salida[m[1].toLowerCase()] = valor;
  }
  return salida;
}

/**
 * Arma el header `Authorization` para ese desafío. `null` si no se puede
 * (falta el `nonce`, o el algoritmo que pide la cámara no existe en Node).
 */
export function armarAutorizacion(desafio: DesafioAuth, d: DatosDeFirma): string | null {
  if (desafio.esquema === "basic") {
    return `Basic ${Buffer.from(`${d.usuario}:${d.clave}`, "utf8").toString("base64")}`;
  }

  const p = desafio.parametros;
  const nonce = p.nonce;
  if (!nonce) return null;
  const realm = p.realm ?? "";

  const algoritmo = (p.algorithm || "MD5").toUpperCase();
  const esSesion = algoritmo.endsWith("-SESS");
  const nombre = HASHES[esSesion ? algoritmo.slice(0, -5) : algoritmo];
  if (!nombre) return null;
  let H: (t: string) => string;
  try {
    createHash(nombre); // algunos builds de OpenSSL no traen sha512-256
    H = (t: string) => createHash(nombre).update(t, "utf8").digest("hex");
  } catch {
    /* El algoritmo no existe en este Node: mejor decir «no puedo» que firmar mal. */
    return null;
  }

  const ofrecidos = (p.qop ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const qop = ofrecidos.includes("auth") ? "auth" : ofrecidos.includes("auth-int") ? "auth-int" : null;

  const cnonce = d.cnonce ?? randomBytes(8).toString("hex");
  const nc = (d.nc ?? 1).toString(16).padStart(8, "0");

  let ha1 = H(`${d.usuario}:${realm}:${d.clave}`);
  if (esSesion) ha1 = H(`${ha1}:${nonce}:${cnonce}`);
  const ha2 = qop === "auth-int" ? H(`${d.metodo}:${d.uri}:${H(d.cuerpo ?? "")}`) : H(`${d.metodo}:${d.uri}`);
  const respuesta = qop
    ? H(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : H(`${ha1}:${nonce}:${ha2}`); // RFC 2069, firmwares viejos

  const partes = [
    `username="${escapar(d.usuario)}"`,
    `realm="${escapar(realm)}"`,
    `nonce="${escapar(nonce)}"`,
    `uri="${d.uri}"`,
    `algorithm=${algoritmo}`,
  ];
  if (qop) partes.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  partes.push(`response="${respuesta}"`);
  if (p.opaque) partes.push(`opaque="${escapar(p.opaque)}"`);
  return `Digest ${partes.join(", ")}`;
}

/** Comillas y barras adentro de un valor entre comillas van escapadas. */
function escapar(v: string): string {
  return v.replace(/(["\\])/g, "\\$1");
}

// ─────────────────────── Sesión Digest y memorias ────────────────────────

/**
 * El desafío se guarda por origen+usuario para no pagar dos vueltas en cada
 * pedido (probar la cámara son tres pedidos seguidos). Nunca se guarda la
 * clave: sólo el `nonce` público y el contador `nc`, que la RFC exige que suba.
 */
const sesiones = new Map<string, { desafio: DesafioAuth; nc: number }>();

/** Qué ruta de foto anduvo la última vez, para no re-descubrirla en cada foto. */
const rutaSnapshotConocida = new Map<string, string>();

// ────────────────────────────── Utilidades ───────────────────────────────

/** El usuario escribe «http://192.168.1.64/» o «192.168.1.64:80»: se limpia. */
function hostLimpio(host: string): string {
  let h = host.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  h = h.split("/")[0].split("?")[0];
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1) || h; // IPv6
  const corte = h.lastIndexOf(":");
  return corte > 0 ? h.slice(0, corte) : h;
}

function canalDe(c: CredencialesCamara): number {
  const n = Math.trunc(c.canal ?? 1);
  return Number.isFinite(n) && n >= 1 && n <= 64 ? n : 1;
}

function origenDe(c: CredencialesCamara): string {
  return `${c.https ? "https" : "http"}://${hostLimpio(c.host)}:${c.puerto}`;
}

/**
 * Última barrera antes de devolver un texto: si la clave aparece, se tapa.
 * Un mensaje de error de Node puede traer la URL entera, y una URL RTSP lleva
 * la clave adentro — preferimos un `***` feo a un secreto en el historial.
 */
function sinSecretos(texto: string, clave: string): string {
  let salida = texto;
  for (const v of [clave, encodeURIComponent(clave)]) {
    if (v && v.length >= 3) salida = salida.split(v).join("***");
  }
  return salida;
}

function falla(c: CredencialesCamara, motivo: MotivoFalla, detalle: string): { ok: false; motivo: MotivoFalla; detalle: string } {
  return { ok: false, motivo, detalle: sinSecretos(detalle, c.clave) };
}

/** Falta algo para siquiera intentar. Se mira antes de tocar la red. */
function validar(c: CredencialesCamara): { ok: false; motivo: MotivoFalla; detalle: string } | null {
  const faltan: string[] = [];
  if (!hostLimpio(c.host ?? "")) faltan.push("la dirección IP o el nombre de la cámara");
  if (!c.usuario?.trim()) faltan.push("el usuario");
  if (!c.clave) faltan.push("la clave");
  if (faltan.length) {
    return falla(c, "sin-configurar", `Falta cargar ${faltan.join(", ")}. Completa los datos de la cámara y prueba de nuevo.`);
  }
  if (!Number.isInteger(c.puerto) || c.puerto < 1 || c.puerto > 65535) {
    return falla(c, "sin-configurar", `El puerto ${String(c.puerto)} no es válido. Casi siempre es 80 (o 443 con HTTPS).`);
  }
  return null;
}

// ──────────────────── Clasificación honesta de las fallas ────────────────

const CODIGOS_TIEMPO = new Set(["TimeoutError", "AbortError", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_ABORTED"]);
const CODIGOS_INALCANZABLE = new Set([
  "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "EHOSTDOWN", "ENETDOWN",
  "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "EPIPE", "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
]);
const CODIGOS_TLS = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED",
]);
const CODIGOS_PROTOCOLO = new Set(["ERR_SSL_WRONG_VERSION_NUMBER", "EPROTO", "ERR_SSL_PACKET_LENGTH_TOO_LONG"]);

/** «6 s», «1,5 s»: el redondeo a entero convertía 1500 ms en «2 s». */
function segundos(ms: number): string {
  const v = ms / 1000;
  return (v < 10 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.round(v))).replace(".", ",");
}

/**
 * Un error de `fetch` esconde la causa real en `cause` (y a veces en `errors`):
 * el de arriba siempre dice «fetch failed». Se recorre la cadena entera
 * juntando códigos, nombres y mensajes.
 */
function pistasDelError(e: unknown): { codigos: string[]; mensajes: string[] } {
  const codigos: string[] = [];
  const mensajes: string[] = [];
  const vistos = new Set<object>();
  const pila: unknown[] = [e];
  while (pila.length) {
    const actual = pila.pop();
    if (!actual || typeof actual !== "object" || vistos.has(actual as object)) continue;
    vistos.add(actual as object);
    const o = actual as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown; errors?: unknown };
    if (typeof o.code === "string") codigos.push(o.code);
    if (typeof o.name === "string") codigos.push(o.name);
    if (typeof o.message === "string" && o.message) mensajes.push(o.message);
    if (o.cause) pila.push(o.cause);
    if (Array.isArray(o.errors)) pila.push(...o.errors);
  }
  return { codigos, mensajes };
}

function motivoDeError(c: CredencialesCamara, e: unknown, timeoutMs: number): { ok: false; motivo: MotivoFalla; detalle: string } {
  const { codigos, mensajes } = pistasDelError(e);
  const donde = `${hostLimpio(c.host)}:${c.puerto}`;
  if (codigos.some((s) => CODIGOS_TIEMPO.has(s))) {
    return falla(c, "tiempo", `La cámara no contestó en ${segundos(timeoutMs)} s. Puede estar apagada, dormida o en otra red.`);
  }
  if (codigos.some((s) => CODIGOS_PROTOCOLO.has(s))) {
    return falla(c, "inalcanzable", `En ${donde} hay algo que no habla HTTPS. Desmarca HTTPS o usa el puerto que corresponde (suele ser 443).`);
  }
  if (codigos.some((s) => CODIGOS_TLS.has(s))) {
    return falla(c, "inalcanzable", `La cámara usa un certificado propio que el servidor no acepta. Dentro de la red local conviene conectarla por HTTP.`);
  }
  if (codigos.some((s) => CODIGOS_INALCANZABLE.has(s))) {
    const codigo = codigos.find((s) => CODIGOS_INALCANZABLE.has(s));
    const pista = codigo === "ENOTFOUND" || codigo === "EAI_AGAIN"
      ? "Ese nombre no existe en la red: prueba con la dirección IP."
      : codigo === "ECONNREFUSED"
        ? "La dirección responde pero ese puerto está cerrado: revisa el puerto del panel de la cámara."
        : "Revisa que la cámara esté encendida y en la misma red que este equipo.";
    return falla(c, "inalcanzable", `No hay respuesta de ${donde} (${codigo}). ${pista}`);
  }
  const texto = mensajes.join(" · ") || String(e);
  /* Node bloquea por norma unos puertos «peligrosos» (21, 22, 25, 110…) y ni
     siquiera intenta conectar: sin esto el operario leía «fetch failed». */
  if (/bad port/i.test(texto)) {
    return falla(c, "inalcanzable", `El puerto ${c.puerto} está bloqueado por seguridad y no se puede usar. La cámara suele estar en el 80, el 8000 o el 443.`);
  }
  return falla(c, "inalcanzable", `No se pudo hablar con ${donde}: ${texto}`);
}

/** Estados que no son 2xx: cada uno con lo que el operario puede hacer. */
function motivoDelEstado(c: CredencialesCamara, estado: number, contexto: string): { ok: false; motivo: MotivoFalla; detalle: string } {
  if (estado === 401) {
    return falla(c, "credenciales", "La cámara rechazó el usuario y la clave (401). Revisa el usuario y la clave que usas para entrar a la cámara.");
  }
  if (estado === 403) {
    return falla(
      c,
      "rechazado",
      "La cámara contestó 403: el usuario entra pero no tiene permiso para esto, o la cámara bloqueó esta dirección por intentos fallidos (se destraba esperando o desde su panel).",
    );
  }
  if (estado >= 300 && estado < 400) {
    return falla(c, "inalcanzable", `La cámara redirige a otra dirección (${estado}). Si tiene HTTPS activado, marca la casilla HTTPS.`);
  }
  if (estado >= 500) {
    return falla(c, "rechazado", `La cámara contestó con un error interno (${estado}) al pedir ${contexto}. Reiníciala y prueba de nuevo.`);
  }
  return falla(c, "rechazado", `La cámara contestó ${estado} al pedir ${contexto}. Puede que su firmware no tenga esa función.`);
}

// ────────────────────────── El pedido con Digest ─────────────────────────

interface Pedido {
  metodo: "GET" | "PUT";
  /** Ruta con query. */
  ruta: string;
  cuerpo?: string;
  acepta?: string;
  /** Instante (epoch ms) en que se abandona: el presupuesto es de la operación entera. */
  hasta: number;
}

/** Lee el cuerpo como texto; si la conexión se cortó a mitad, texto vacío. */
async function leerTexto(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    /* Cuerpo truncado: para el llamador es lo mismo que «no vino nada». */
    return "";
  }
}

/** Corta el cuerpo sin leerlo (cuando ya sabemos que no lo queremos). */
async function cancelarCuerpo(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* Ya estaba cerrado: nada que cortar. */
  }
}

/**
 * Lee el cuerpo con tope. `null` = se pasó del máximo o se cortó a mitad; el
 * llamador lo trata como «esto no es una foto», que es lo que el operario ve.
 */
async function leerBytes(res: Response, maximo: number): Promise<Uint8Array | null> {
  const declarado = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado)) {
    if (declarado > maximo) {
      /* Se CORTA, no se lee: leerlo para descartarlo sería tragarse igual los
         mismos megabytes que estamos evitando. */
      await cancelarCuerpo(res);
      return null;
    }
  }
  const lector = res.body?.getReader();
  if (!lector) return new Uint8Array(await res.arrayBuffer());
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      /* Sin content-length (respuesta en pedazos) el tope se controla acá. */
      if (total > maximo) {
        await lector.cancel();
        return null;
      }
      trozos.push(value);
    }
  } catch {
    /* Se cortó la conexión a mitad de la foto: para el llamador es «no vino». */
    return null;
  }
  const salida = new Uint8Array(total);
  let desde = 0;
  for (const t of trozos) {
    salida.set(t, desde);
    desde += t.length;
  }
  return salida;
}

/** Deja el socket libre aunque no nos interese el cuerpo (un 401, por ejemplo). */
async function descartarCuerpo(res: Response): Promise<void> {
  try {
    await res.arrayBuffer();
  } catch {
    /* Si el cuerpo ya se cerró no hay nada que hacer: sólo se liberaba el socket. */
  }
}

/**
 * Hace el pedido resolviendo el desafío: primero sin credenciales (o con el
 * desafío guardado), y al 401 se rearma firmado. Devuelve la `Response` para
 * cualquier estado que no sea 401/403 — el 404 lo usa el llamador para probar
 * la ruta siguiente.
 */
async function pedir(c: CredencialesCamara, p: Pedido): Promise<Resultado<Response>> {
  const origen = origenDe(c);
  const llave = `${origen}|${c.usuario}`;
  const guardada = sesiones.get(llave);
  let desafio: DesafioAuth | null = guardada?.desafio ?? null;
  let nc = guardada?.nc ?? 0;
  let firmadoConDesafioFresco = false;
  let desafioFresco = false;

  for (let intento = 0; intento < 3; intento++) {
    const restante = p.hasta - Date.now();
    if (restante <= 0) {
      return falla(c, "tiempo", `Se acabó el tiempo de espera hablando con ${hostLimpio(c.host)}:${c.puerto}.`);
    }

    const cabeceras: Record<string, string> = { Accept: p.acepta ?? "*/*" };
    if (p.cuerpo !== undefined) cabeceras["Content-Type"] = "application/xml; charset=UTF-8";
    if (desafio) {
      nc += 1;
      const auth = armarAutorizacion(desafio, {
        usuario: c.usuario,
        clave: c.clave,
        metodo: p.metodo,
        uri: p.ruta,
        nc,
        cuerpo: p.cuerpo,
      });
      if (!auth) {
        return falla(c, "credenciales", "La cámara pide una forma de autenticación que este servidor no sabe armar. Actualiza el firmware o usa autenticación Digest/Basic.");
      }
      cabeceras.Authorization = auth;
      sesiones.set(llave, { desafio, nc });
      if (desafioFresco) firmadoConDesafioFresco = true;
    }

    let res: Response;
    try {
      res = await fetch(`${origen}${p.ruta}`, {
        method: p.metodo,
        headers: cabeceras,
        body: p.cuerpo,
        signal: AbortSignal.timeout(restante),
        redirect: "manual",
        cache: "no-store",
      });
    } catch (e) {
      sesiones.delete(llave);
      return motivoDeError(c, e, restante);
    }

    if (res.status === 401) {
      const nuevo = leerDesafio(res.headers.get("www-authenticate"));
      await descartarCuerpo(res);
      if (!nuevo) return motivoDelEstado(c, 401, p.ruta);
      /* Si ya firmamos con un desafío recién emitido y sigue en 401, la clave
         está mal. `stale=TRUE` es la excepción: el nonce venció, se reintenta. */
      const vencido = (nuevo.parametros.stale ?? "").toLowerCase() === "true";
      if (firmadoConDesafioFresco && !vencido) {
        sesiones.delete(llave);
        return motivoDelEstado(c, 401, p.ruta);
      }
      desafio = nuevo;
      desafioFresco = true;
      nc = 0;
      continue;
    }

    if (res.status === 403) {
      await descartarCuerpo(res);
      return motivoDelEstado(c, 403, p.ruta);
    }

    return { ok: true, valor: res };
  }

  sesiones.delete(llave);
  return motivoDelEstado(c, 401, p.ruta);
}

// ───────────────────────── XML sin librería ──────────────────────────────

/** Cuatro campos no justifican un parser: regex acotada y tolerante al namespace. */
function campoXml(xml: string, etiqueta: string): string | null {
  const re = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${etiqueta}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${etiqueta}\\s*>`, "i");
  const m = re.exec(xml);
  if (!m) return null;
  const valor = desescapar(m[1]).trim();
  /* Campo presente pero vacío es lo mismo que ausente para quien lo muestra. */
  return valor === "" ? null : valor;
}

function desescapar(v: string): string {
  return v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function numeroXml(xml: string, etiquetas: string[]): number | null {
  for (const etiqueta of etiquetas) {
    const bruto = campoXml(xml, etiqueta);
    if (bruto === null) continue;
    const n = Number.parseInt(bruto, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** `null` = lo que contestó no es el `deviceInfo` de una Hikvision. */
export function leerInfoDelAparato(xml: string): InfoDelAparato | null {
  const info: InfoDelAparato = {
    modelo: campoXml(xml, "model"),
    firmware: campoXml(xml, "firmwareVersion"),
    serie: campoXml(xml, "serialNumber"),
    nombre: campoXml(xml, "deviceName"),
    canales: numeroXml(xml, ["videoInputPortNums", "channelNums", "videoInputChannelNums"]),
    soportaPtz: false,
  };
  const esDeviceInfo = /<(?:[A-Za-z0-9_.-]+:)?DeviceInfo\b/i.test(xml);
  if (!esDeviceInfo && !info.modelo && !info.serie && !info.firmware) return null;
  return info;
}

const NO_ES_HIKVISION = "Ese aparato contesta, pero lo que devuelve no es una cámara Hikvision con ISAPI. Revisa la dirección y el puerto.";

// ──────────────────────────── API pública ────────────────────────────────

/**
 * Prueba la conexión: identifica el aparato, descubre por qué ruta da la foto y
 * si tiene PTZ. Es lo que corre el botón «Probar conexión» del panel.
 */
export async function probarCamara(
  c: CredencialesCamara,
  opts?: { timeoutMs?: number },
): Promise<Resultado<{ info: InfoDelAparato; rutaSnapshot: string; ms: number }>> {
  const invalida = validar(c);
  if (invalida) return invalida;

  const timeoutMs = opts?.timeoutMs ?? TIMEOUT_POR_DEFECTO;
  const arranque = Date.now();
  const hasta = arranque + timeoutMs;
  const canal = canalDe(c);

  let info: InfoDelAparato | null = null;
  for (const ruta of RUTAS_INFO) {
    const r = await pedir(c, { metodo: "GET", ruta, hasta, acepta: "application/xml, text/xml, */*" });
    if (!r.ok) return r; // 401/403/red: probar otra ruta no cambia nada
    const res = r.valor;
    if (res.status !== 200) {
      await descartarCuerpo(res);
      continue;
    }
    info = leerInfoDelAparato(await leerTexto(res));
    if (info) break;
  }
  if (!info) return falla(c, "no-es-hikvision", NO_ES_HIKVISION);

  let rutaSnapshot: string | null = null;
  let fallaDeLaFoto: { ok: false; motivo: MotivoFalla; detalle: string } | null = null;
  for (const ruta of rutasSnapshot(canal)) {
    const r = await pedir(c, { metodo: "GET", ruta, hasta, acepta: "image/jpeg, image/*" });
    if (!r.ok) {
      if (r.motivo === "tiempo" || r.motivo === "inalcanzable") return r;
      fallaDeLaFoto = r; // un 403 en la foto puede ser sólo permiso: se prueba otra ruta
      continue;
    }
    const res = r.valor;
    if (res.status !== 200) {
      await descartarCuerpo(res);
      continue;
    }
    const bytes = await leerBytes(res, MAXIMO_FOTO);
    if (bytes !== null && esJpeg(bytes)) {
      rutaSnapshot = ruta;
      rutaSnapshotConocida.set(`${origenDe(c)}|${canal}`, ruta);
      break;
    }
  }
  if (!rutaSnapshot) {
    /* Si alguna ruta devolvió 403, ESE es el dato accionable (permiso del
       usuario), no un genérico «no dio la foto». */
    if (fallaDeLaFoto) return fallaDeLaFoto;
    return falla(
      c,
      "no-es-hikvision",
      `El aparato responde ISAPI (${info.modelo ?? "modelo desconocido"}) pero no dio la foto por ninguna ruta conocida del canal ${canal}. Revisa el número de canal o si el usuario tiene permiso de ver en vivo.`,
    );
  }

  info.soportaPtz = await tienePtz(c, canal, hasta);
  return { ok: true, valor: { info, rutaSnapshot, ms: Date.now() - arranque } };
}

/** JPEG siempre arranca con `FF D8 FF`: así se distingue de una página de login. */
function esJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function tienePtz(c: CredencialesCamara, canal: number, hasta: number): Promise<boolean> {
  const r = await pedir(c, {
    metodo: "GET",
    ruta: `/ISAPI/PTZCtrl/channels/${canal}/capabilities`,
    hasta,
    acepta: "application/xml, text/xml, */*",
  });
  /* Sin PTZ la cámara contesta 404/403; cualquier falla se lee como «no tiene»:
     es un dato de adorno, nunca debe hacer fracasar la prueba de conexión. */
  if (!r.ok) return false;
  const ok = r.valor.status === 200;
  await descartarCuerpo(r.valor);
  return ok;
}

/** Trae la foto de este instante. Recuerda la ruta que funcionó para la próxima. */
export async function traerSnapshot(
  c: CredencialesCamara,
  opts?: { timeoutMs?: number },
): Promise<Resultado<{ jpeg: Uint8Array; tipo: string }>> {
  const invalida = validar(c);
  if (invalida) return invalida;

  const hasta = Date.now() + (opts?.timeoutMs ?? TIMEOUT_POR_DEFECTO);
  const canal = canalDe(c);
  const llave = `${origenDe(c)}|${canal}`;
  const conocida = rutaSnapshotConocida.get(llave);
  const candidatas = conocida
    ? [conocida, ...rutasSnapshot(canal).filter((r) => r !== conocida)]
    : rutasSnapshot(canal);

  let ultimaFalla: { ok: false; motivo: MotivoFalla; detalle: string } | null = null;
  for (const ruta of candidatas) {
    const r = await pedir(c, { metodo: "GET", ruta, hasta, acepta: "image/jpeg, image/*" });
    if (!r.ok) {
      if (r.motivo === "tiempo" || r.motivo === "inalcanzable" || r.motivo === "credenciales") {
        rutaSnapshotConocida.delete(llave);
        return r;
      }
      ultimaFalla = r;
      continue;
    }
    const res = r.valor;
    if (res.status !== 200) {
      await descartarCuerpo(res);
      ultimaFalla = motivoDelEstado(c, res.status, "la foto");
      continue;
    }
    const jpeg = await leerBytes(res, MAXIMO_FOTO);
    if (jpeg === null) {
      ultimaFalla = falla(
        c,
        "no-es-hikvision",
        `Lo que devuelve esa dirección pesa más de ${Math.round(MAXIMO_FOTO / 1024 / 1024)} MB o se cortó a mitad: no es la foto de una cámara.`,
      );
      continue;
    }
    if (!esJpeg(jpeg)) {
      ultimaFalla = falla(c, "no-es-hikvision", "Lo que llegó en vez de la foto no es una imagen JPEG. Revisa la dirección, el puerto y el canal.");
      continue;
    }
    rutaSnapshotConocida.set(llave, ruta);
    const tipo = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim() || "image/jpeg";
    return { ok: true, valor: { jpeg, tipo } };
  }
  rutaSnapshotConocida.delete(llave);
  return ultimaFalla ?? falla(c, "no-es-hikvision", NO_ES_HIKVISION);
}

/**
 * Mueve la cámara un ratito y la frena. `x` = giro (izquierda/derecha),
 * `y` = inclinación, `zoom` = acercar/alejar; los tres de -100 a 100.
 *
 * El freno NO es opcional: `continuous` sigue moviendo hasta que llega el cero.
 * Si el freno falla se avisa, porque una cámara que quedó girando sola es peor
 * que un movimiento que no salió.
 */
export async function moverPtz(
  c: CredencialesCamara,
  mov: { x: number; y: number; zoom: number },
  opts?: { ms?: number },
): Promise<Resultado<null>> {
  const invalida = validar(c);
  if (invalida) return invalida;

  const canal = canalDe(c);
  const ruta = `/ISAPI/PTZCtrl/channels/${canal}/continuous`;
  const ms = Math.min(MS_PTZ_MAXIMO, Math.max(0, Math.trunc(opts?.ms ?? MS_PTZ_POR_DEFECTO)));
  /* El presupuesto cubre los dos PUT (el que mueve y el que frena) más la pausa. */
  const hasta = Date.now() + TIMEOUT_POR_DEFECTO + ms;

  const arrancar = await pedir(c, { metodo: "PUT", ruta, cuerpo: cuerpoPtz(mov.x, mov.y, mov.zoom), hasta });
  if (!arrancar.ok) return arrancar;
  if (arrancar.valor.status !== 200 && arrancar.valor.status !== 204) {
    const estado = arrancar.valor.status;
    await descartarCuerpo(arrancar.valor);
    if (estado === 404 || estado === 400) {
      return falla(c, "rechazado", `Esta cámara no acepta movimiento en el canal ${canal} (${estado}). Puede ser una cámara fija, sin motor.`);
    }
    return motivoDelEstado(c, estado, "mover la cámara");
  }
  await descartarCuerpo(arrancar.valor);

  if (ms > 0) await new Promise((listo) => setTimeout(listo, ms));

  const frenar = await pedir(c, { metodo: "PUT", ruta, cuerpo: cuerpoPtz(0, 0, 0), hasta: Date.now() + TIMEOUT_POR_DEFECTO });
  if (!frenar.ok) {
    return falla(c, frenar.motivo, `La cámara se movió pero no se pudo frenar: ${frenar.detalle} Detén el movimiento desde el panel de la cámara.`);
  }
  await descartarCuerpo(frenar.valor);
  return { ok: true, valor: null };
}

function cuerpoPtz(x: number, y: number, zoom: number): string {
  const limitar = (v: number) => Math.max(-100, Math.min(100, Math.trunc(Number.isFinite(v) ? v : 0)));
  return `<?xml version="1.0" encoding="UTF-8"?><PTZData><pan>${limitar(x)}</pan><tilt>${limitar(y)}</tilt><zoom>${limitar(zoom)}</zoom></PTZData>`;
}

/**
 * URL RTSP para el video (la consume ffmpeg, no el navegador).
 *
 * Usuario y clave van escapados: una clave con `@` o con `/` —lo más común en
 * las cámaras que ya vienen instaladas— parte la URL en dos y el stream falla
 * con un «unauthorized» que manda a buscar el problema donde no está.
 */
export function urlRtsp(c: CredencialesCamara, calidad: "alta" | "baja" = "alta"): string {
  const canal = canalDe(c);
  const flujo = calidad === "baja" ? "02" : "01";
  const usuario = encodeURIComponent(c.usuario ?? "");
  const clave = encodeURIComponent(c.clave ?? "");
  return `rtsp://${usuario}:${clave}@${hostLimpio(c.host ?? "")}:${PUERTO_RTSP}/Streaming/Channels/${canal}${flujo}`;
}

/** La misma URL pero con la clave tapada: para mostrar en pantalla o loguear. */
export function urlRtspEnmascarada(c: CredencialesCamara, calidad: "alta" | "baja" = "alta"): string {
  const canal = canalDe(c);
  const flujo = calidad === "baja" ? "02" : "01";
  return `rtsp://${encodeURIComponent(c.usuario ?? "")}:***@${hostLimpio(c.host ?? "")}:${PUERTO_RTSP}/Streaming/Channels/${canal}${flujo}`;
}

/** Sólo para los tests: borra la memoria de desafíos y rutas entre casos. */
export function olvidarSesiones(): void {
  sesiones.clear();
  rutaSnapshotConocida.clear();
}
