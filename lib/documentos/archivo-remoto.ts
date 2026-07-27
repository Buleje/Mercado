/**
 * archivo-remoto — traer el contenido de un documento del drive sin que un
 * error termine DIBUJADO COMO SI FUERA EL ARCHIVO.
 *
 * EL BUG QUE ORIGINA ESTE MÓDULO: cada visor hacía su propio `fetch` y, cuando
 * el servidor contestaba 429 ("demasiadas solicitudes"), el visor de PDF
 * recibía un JSON y el navegador lo mostraba como texto plano dentro del modal:
 * el usuario veía `{"error":"Too many requests",...}` donde esperaba su
 * planilla y no tenía forma de saber que era un límite temporal ni cuándo
 * volver a intentar.
 *
 * Acá el error se convierte en algo que la UI puede explicar: un motivo, el
 * estado HTTP y —cuando el servidor lo dice— cuántos segundos faltan para
 * reintentar. Ningún visor vuelve a mostrar el cuerpo de un error como
 * contenido.
 */

export type MotivoArchivo = "limite" | "permiso" | "no-esta" | "servidor" | "red";

/** Tope del contador en pantalla: más que esto ya no es "esperá un momento". */
const ESPERA_MAXIMA = 300;

export class ErrorArchivo extends Error {
  readonly motivo: MotivoArchivo;
  readonly estado: number;
  /** Segundos hasta poder reintentar. 0 = reintentar no ayuda por sí solo. */
  readonly espera: number;

  constructor(motivo: MotivoArchivo, estado: number, espera: number, mensaje: string) {
    super(mensaje);
    this.name = "ErrorArchivo";
    this.motivo = motivo;
    this.estado = estado;
    this.espera = espera;
  }
}

const MENSAJES: Record<MotivoArchivo, string> = {
  limite: "El servidor recibió muchas solicitudes seguidas y pidió esperar un momento.",
  permiso: "No tenés permiso para ver este archivo (o la sesión venció).",
  "no-esta": "El archivo ya no está en el drive.",
  servidor: "El servidor no pudo entregar el archivo.",
  red: "No se pudo conectar con el servidor.",
};

function motivoDe(estado: number): MotivoArchivo {
  if (estado === 429) return "limite";
  if (estado === 401 || estado === 403) return "permiso";
  if (estado === 404 || estado === 410) return "no-esta";
  return "servidor";
}

/**
 * Cuántos segundos pidió esperar el servidor.
 *
 * Se mira primero la cabecera estándar `Retry-After` y después el `retryAfter`
 * del cuerpo (lo que devuelve `applyRateLimit`). Leer el cuerpo acá es seguro:
 * es la rama de error, nadie lo va a usar como contenido.
 */
async function esperaDe(res: Response): Promise<number> {
  const cabecera = Number(res.headers.get("retry-after"));
  if (Number.isFinite(cabecera) && cabecera > 0) return Math.min(ESPERA_MAXIMA, Math.ceil(cabecera));
  try {
    const cuerpo = (await res.clone().json()) as { retryAfter?: unknown };
    const n = Number(cuerpo?.retryAfter);
    if (Number.isFinite(n) && n > 0) return Math.min(ESPERA_MAXIMA, Math.ceil(n));
  } catch {
    // Cuerpo vacío o no-JSON: no hay dato de espera, se reintenta a mano.
  }
  return 0;
}

/**
 * GET al drive con las cookies de la sesión. Devuelve la `Response` sólo si
 * trae el archivo; cualquier otra cosa sale como `ErrorArchivo`.
 */
export async function pedirArchivo(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include", ...init });
  } catch (e) {
    // AbortController: el visor se cerró o cambió de documento; no es un error
    // que haya que mostrarle a nadie.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ErrorArchivo("red", 0, 0, MENSAJES.red);
  }
  if (res.ok) return res;
  const motivo = motivoDe(res.status);
  throw new ErrorArchivo(motivo, res.status, motivo === "limite" ? await esperaDe(res) : 0, MENSAJES[motivo]);
}

/** El archivo como bytes, listo para los lectores de xlsx/docx/pptx. */
export async function descargarArchivo(url: string, init?: RequestInit): Promise<ArrayBuffer> {
  return (await pedirArchivo(url, init)).arrayBuffer();
}

/** El archivo como texto (csv, txt, md). */
export async function descargarTexto(url: string, init?: RequestInit): Promise<string> {
  return (await pedirArchivo(url, init)).text();
}

/** Cualquier excepción → `ErrorArchivo`, para que la UI hable un solo idioma. */
export function comoErrorArchivo(e: unknown): ErrorArchivo {
  if (e instanceof ErrorArchivo) return e;
  const mensaje = e instanceof Error ? e.message : String(e);
  return new ErrorArchivo("servidor", 0, 0, mensaje || MENSAJES.servidor);
}
