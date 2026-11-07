/**
 * El «cartero» de papeles (Brandon 06-11): mira el nombre del archivo y el
 * texto leído de un papel y dice de qué cliente o proveedor del negocio es.
 * Función pura (sin base ni servidor): la usan el servidor para decidir y la
 * pantalla para tipar lo que muestra («¿Es de Ronal?»).
 *
 * Reglas, las mismas del cartero de archivos de la PC (30 aciertos de 38 el
 * 06-11):
 * - Se compara sin tildes ni mayúsculas y por palabra completa
 *   («Inforhuay» no aparece dentro de «Inforhuayano»).
 * - Un nombre o alias de UNA palabra con menos de 7 letras («Rosa», «Ronal»)
 *   sólo cuenta en el NOMBRE del archivo: en el texto sale por casualidad.
 * - El nombre del archivo manda: si nombra a una sola entidad → seguro; si
 *   nombra a 2 o más → duda.
 * - Si no, el contenido: una sola entidad con 2+ menciones → seguro; dos o más
 *   pero la primera con 3+ y el triple de la segunda → seguro; cualquier otra
 *   mención → duda; ninguna → nadie.
 */

import type { CarteroCandidato, CarteroDoc } from "@/lib/types/documents";

export type TipoEntidadCartero = "cliente" | "proveedor";
export type EstadoCartero = "seguro" | "duda" | "nadie";

/** Un cliente o proveedor del negocio. Cliente: `id` = su teléfono (lo que guarda `Document.customerId`). */
export interface EntidadCartero {
  tipo: TipoEntidadCartero;
  id: string;
  nombre: string;
  /** Razón social, RUC/DNI, el alias que le puso el negocio… */
  alias?: string[];
}

/** Los tipos viven en `lib/types/documents.ts` (los comparte la pantalla del drive). */
export type CandidatoCartero = CarteroCandidato;
/** Lo que decide `decidirEntidad` (sin `decidido`: eso lo pone quien guarda). */
export type ResultadoCartero = Omit<CarteroDoc, "decidido">;
export type DecididoCartero = NonNullable<CarteroDoc["decidido"]>;
/** Lo que queda en `Document.ocrMetadata.cartero` y lo que el drive devuelve como `cartero`. */
export type CarteroDocumento = CarteroDoc;

/** Etiqueta visible del dueño del papel: «👤 Ronal Pérez». */
export const PREFIJO_ETIQUETA_ENTIDAD = "👤 ";
const TOPE_ETIQUETA = 40;
const MIN_LETRAS_EN_TEXTO = 7;
const MAX_CANDIDATOS = 3;
/** Nombres de relleno que tienen muchos negocios: no dicen de quién es nada. */
const GENERICOS = new Set([
  "cliente", "clientes", "cliente varios", "clientes varios", "varios", "publico general", "publico en general",
  "proveedor", "proveedores", "proveedor varios", "sin nombre", "general", "anonimo", "consumidor final",
]);

export function etiquetaDeEntidad(nombre: string): string {
  return `${PREFIJO_ETIQUETA_ENTIDAD}${nombre.replace(/\s+/g, " ").trim()}`.slice(0, TOPE_ETIQUETA).trim();
}

export function esEtiquetaDeEntidad(tag: string): boolean {
  return tag.startsWith(PREFIJO_ETIQUETA_ENTIDAD);
}

/** Sin tildes, en minúsculas y con cualquier signo convertido en espacio. */
export function normalizarCartero(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Termino {
  tokens: string[];
  corto: boolean;
}

function terminosDe(e: EntidadCartero): Termino[] {
  const vistos = new Set<string>();
  const out: Termino[] = [];
  for (const crudo of [e.nombre, ...(e.alias ?? [])]) {
    const n = normalizarCartero(crudo ?? "");
    if (n.length < 3 || GENERICOS.has(n) || vistos.has(n)) continue;
    vistos.add(n);
    const tokens = n.split(" ");
    out.push({ tokens, corto: tokens.length === 1 && tokens[0].length < MIN_LETRAS_EN_TEXTO });
  }
  return out;
}

/** Palabras del texto y dónde aparece cada una: buscar 2.000 nombres en un PDF largo cuesta poco. */
class Indice {
  readonly palabras: string[];
  private readonly posiciones = new Map<string, number[]>();

  constructor(texto: string) {
    const n = normalizarCartero(texto);
    this.palabras = n ? n.split(" ") : [];
    this.palabras.forEach((p, i) => {
      const lista = this.posiciones.get(p);
      if (lista) lista.push(i);
      else this.posiciones.set(p, [i]);
    });
  }

  apariciones(tokens: string[]): [number, number][] {
    const out: [number, number][] = [];
    for (const i of this.posiciones.get(tokens[0]) ?? []) {
      let igual = true;
      for (let k = 1; k < tokens.length; k++) {
        if (this.palabras[i + k] !== tokens[k]) {
          igual = false;
          break;
        }
      }
      if (igual) out.push([i, i + tokens.length]);
    }
    return out;
  }
}

/** Menciones sin contar dos veces el mismo trozo («Rivers» dentro de «Maderera Rivers»). */
function contar(indice: Indice, terminos: Termino[], conCortos: boolean): number {
  if (!indice.palabras.length) return 0;
  const tramos = terminos.filter((t) => conCortos || !t.corto).flatMap((t) => indice.apariciones(t.tokens));
  tramos.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let veces = 0;
  let hasta = -1;
  for (const [ini, fin] of tramos) {
    if (ini >= hasta) {
      veces++;
      hasta = fin;
    }
  }
  return veces;
}

const vez = (n: number) => (n === 1 ? "1 vez" : `${n} veces`);
const listaNombres = (c: CandidatoCartero[]) =>
  c.slice(0, MAX_CANDIDATOS).map((x) => `${x.nombre} (${vez(x.veces)})`).join(", ") + (c.length > MAX_CANDIDATOS ? "…" : "");

export function decidirEntidad(
  nombreArchivo: string,
  texto: string,
  entidades: readonly EntidadCartero[],
): ResultadoCartero {
  const enNombre = new Indice(nombreArchivo);
  const enTexto = new Indice(texto);
  const vistas = new Set<string>();
  const filas: { e: EntidadCartero; archivo: number; texto: number }[] = [];
  for (const e of entidades) {
    const clave = `${e.tipo}:${e.id}`;
    if (!e.id || vistas.has(clave)) continue;
    vistas.add(clave);
    const terminos = terminosDe(e);
    if (!terminos.length) continue;
    const archivo = contar(enNombre, terminos, true);
    const enT = contar(enTexto, terminos, false);
    if (archivo || enT) filas.push({ e, archivo, texto: enT });
  }

  const candidato = (e: EntidadCartero, veces: number): CandidatoCartero => ({
    tipo: e.tipo,
    id: e.id,
    nombre: e.nombre.replace(/\s+/g, " ").trim(),
    veces,
  });
  const orden = (a: CandidatoCartero, b: CandidatoCartero) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, "es");

  const delArchivo = filas.filter((f) => f.archivo > 0).map((f) => candidato(f.e, f.archivo + f.texto)).sort(orden);
  if (delArchivo.length === 1) {
    return { estado: "seguro", candidatos: delArchivo, motivo: `El nombre del archivo dice «${delArchivo[0].nombre}».` };
  }
  if (delArchivo.length >= 2) {
    return {
      estado: "duda",
      candidatos: delArchivo.slice(0, MAX_CANDIDATOS),
      motivo: `El nombre del archivo nombra a ${delArchivo.length}: ${listaNombres(delArchivo)}.`,
    };
  }

  const delTexto = filas.filter((f) => f.texto > 0).map((f) => candidato(f.e, f.texto)).sort(orden);
  if (!delTexto.length) {
    return { estado: "nadie", candidatos: [], motivo: "No nombra a ningún cliente ni proveedor del negocio." };
  }
  const [a, b] = delTexto;
  const top = delTexto.slice(0, MAX_CANDIDATOS);
  if (!b && a.veces >= 2) {
    return { estado: "seguro", candidatos: top, motivo: `El papel nombra ${vez(a.veces)} a «${a.nombre}».` };
  }
  if (b && a.veces >= 3 && a.veces >= 3 * b.veces) {
    return {
      estado: "seguro",
      candidatos: top,
      motivo: `«${a.nombre}» sale ${vez(a.veces)} y «${b.nombre}» solo ${vez(b.veces)}.`,
    };
  }
  return {
    estado: "duda",
    candidatos: top,
    motivo: b
      ? `El papel nombra a ${delTexto.length}: ${listaNombres(delTexto)}.`
      : `Nombra a «${a.nombre}» una sola vez: confirma si es suyo.`,
  };
}

// ── Leer lo guardado (lo que venga en `ocrMetadata` no se cree a ciegas) ──────

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const esTipo = (v: unknown): v is TipoEntidadCartero => v === "cliente" || v === "proveedor";

export function leerCartero(ocrMetadata: unknown): CarteroDocumento | null {
  if (!esObjeto(ocrMetadata) || !esObjeto(ocrMetadata.cartero)) return null;
  const c = ocrMetadata.cartero;
  if (c.estado !== "seguro" && c.estado !== "duda" && c.estado !== "nadie") return null;
  const candidatos: CandidatoCartero[] = (Array.isArray(c.candidatos) ? c.candidatos : [])
    .filter((x): x is Record<string, unknown> => esObjeto(x) && esTipo(x.tipo) && typeof x.id === "string" && typeof x.nombre === "string")
    .slice(0, MAX_CANDIDATOS)
    .map((x) => ({ tipo: x.tipo as TipoEntidadCartero, id: x.id as string, nombre: x.nombre as string, veces: typeof x.veces === "number" ? x.veces : 0 }));
  const d = c.decidido;
  const decidido: DecididoCartero | undefined =
    esObjeto(d) && (esTipo(d.tipo) || d.tipo === "ninguno") && (d.por === "cartero" || d.por === "usuario")
      ? {
          tipo: d.tipo as DecididoCartero["tipo"],
          ...(typeof d.id === "string" ? { id: d.id } : {}),
          ...(typeof d.nombre === "string" ? { nombre: d.nombre } : {}),
          por: d.por,
          at: typeof d.at === "string" ? d.at : "",
        }
      : undefined;
  return { estado: c.estado, candidatos, motivo: typeof c.motivo === "string" ? c.motivo : "", ...(decidido ? { decidido } : {}) };
}
