import "server-only";
import { logger } from "@/lib/logger";
import {
  ENLACE_REGISTRO_INFRACTORES,
  buscarInfractor,
  parsearInfractores,
  type BusquedaInfractor,
  type ResumenInfractores,
  type SancionSerfor,
} from "@/lib/forestal/serfor-infractores";

/**
 * Lista pública del Registro Nacional de Infractores de SERFOR (datos abiertos,
 * sin clave). SERFOR la vuelve a subir con otro número (`INFRACTORES_<n>.csv`):
 * se lee la página del conjunto, se toma el número más alto y su «Fecha
 * modificada», y se baja ese CSV (~0,8 MB, 6.303 filas el 04-11-2026).
 *
 * datosabiertos.gob.pe responde 418 sin cabecera de navegador (medido 04-11).
 * Se guarda en la memoria del servidor 24 h: la búsqueda es local, no se envía
 * el documento ni el nombre del proveedor a ningún lado.
 */

const BASE_ARCHIVOS = "https://www.datosabiertos.gob.pe/sites/default/files/";
/** Si la página del conjunto no responde, el último archivo conocido (04-11-2026). */
const ARCHIVO_CONOCIDO = "INFRACTORES_202.csv";
/** «Fecha modificada» del conjunto cuando se midió ARCHIVO_CONOCIDO. */
const CORTE_CONOCIDO = "2026-10-13";
const TIMEOUT_MS = 12_000;
const VIGENCIA_MS = 24 * 60 * 60 * 1000;
/** Tras una bajada fallida no se reintenta en cada clic: se espera esto (y se usa la lista de ayer si hay). */
const ESPERA_TRAS_FALLO_MS = 10 * 60 * 1000;
/** El archivo pesa ~0,8 MB; más de esto no es la lista. */
const MAX_BYTES = 15 * 1024 * 1024;

const CABECERAS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36",
  Accept: "text/html,text/csv,*/*;q=0.8",
  "Accept-Language": "es-PE,es;q=0.9",
};

interface ListaEnMemoria {
  sanciones: SancionSerfor[];
  corte: string | null;
  leidaEn: number;
}

let lista: ListaEnMemoria | null = null;
let bajando: Promise<ListaEnMemoria | null> | null = null;
let ultimoFallo = 0;

/** Archivo más nuevo y su fecha, leídos de la página del conjunto. */
export function ubicarArchivo(html: string): { archivo: string | null; corte: string | null } {
  let mejor: { archivo: string; n: number } | null = null;
  for (const m of html.matchAll(/INFRACTORES(?:_(\d+))?\.csv/g)) {
    const n = m[1] ? Number(m[1]) : 0;
    if (!mejor || n > mejor.n) mejor = { archivo: m[0], n };
  }
  const fecha = /Fecha modificada[\s\S]{0,200}?(\d{4}-\d{2}-\d{2})/.exec(html);
  return { archivo: mejor?.archivo ?? null, corte: fecha?.[1] ?? null };
}

async function traer(url: string): Promise<string | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: CABECERAS, cache: "no-store" });
  if (!res.ok) {
    logger.warn("[serfor-infractores] respuesta no OK", { status: res.status, url });
    return null;
  }
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES) {
    logger.warn("[serfor-infractores] archivo demasiado grande", { largo, url });
    return null;
  }
  const texto = await res.text();
  return texto.length > MAX_BYTES ? null : texto;
}

async function bajarLista(): Promise<ListaEnMemoria | null> {
  let archivo = ARCHIVO_CONOCIDO;
  let corte: string | null = null;
  try {
    const html = await traer(ENLACE_REGISTRO_INFRACTORES);
    const ubicado = html ? ubicarArchivo(html) : null;
    if (ubicado?.archivo) archivo = ubicado.archivo;
    corte = ubicado?.corte ?? null;
  } catch (err) {
    logger.warn("[serfor-infractores] página del conjunto sin respuesta; uso el último archivo conocido", {
      error: String(err),
    });
  }

  // El más nuevo primero; si ese falla (404, enlace roto), el último conocido.
  const candidatos = archivo === ARCHIVO_CONOCIDO ? [archivo] : [archivo, ARCHIVO_CONOCIDO];
  for (const nombre of candidatos) {
    try {
      const csv = await traer(BASE_ARCHIVOS + nombre);
      if (!csv) continue;
      const sanciones = parsearInfractores(csv);
      if (sanciones.length === 0) {
        logger.warn("[serfor-infractores] el archivo no trae sanciones legibles", { archivo: nombre });
        continue;
      }
      // Con el archivo de respaldo, la fecha de la página no es la suya.
      const suCorte = nombre === archivo && corte ? corte : nombre === ARCHIVO_CONOCIDO ? CORTE_CONOCIDO : null;
      return { sanciones, corte: suCorte, leidaEn: Date.now() };
    } catch (err) {
      logger.warn("[serfor-infractores] no se pudo bajar la lista", { archivo: nombre, error: String(err) });
    }
  }
  return null;
}

/** La lista vigente (24 h); una sola bajada aunque lleguen varias consultas juntas. */
async function listaVigente(): Promise<ListaEnMemoria | null> {
  if (lista && Date.now() - lista.leidaEn < VIGENCIA_MS) return lista;
  if (Date.now() - ultimoFallo < ESPERA_TRAS_FALLO_MS) return lista; // la de ayer, o null al instante
  if (!bajando) {
    bajando = bajarLista()
      .then((nueva) => {
        if (nueva) lista = nueva;
        else ultimoFallo = Date.now();
        return nueva ?? lista; // si falla, la de ayer sirve más que nada
      })
      .finally(() => {
        bajando = null;
      });
  }
  return bajando;
}

/** Resumen para la pantalla, o null si SERFOR no respondió y no hay lista guardada. */
export async function consultarInfractores(busqueda: BusquedaInfractor): Promise<ResumenInfractores | null> {
  const vigente = await listaVigente();
  if (!vigente) return null;
  return buscarInfractor(vigente.sanciones, busqueda, vigente.corte);
}
