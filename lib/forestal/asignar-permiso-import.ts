/**
 * Permiso por archivo al importar el libro CTP (Brandon 19-10, ADR-503).
 *
 * Contrato compartido entre el modal (`CtpSerforImportModal` y sus cajas) y el
 * endpoint `wood-entries/import`: cada archivo elige UN permiso del catálogo
 * (`ForestContrato`; el nuevo se crea antes con `POST /contratos`) y viaja sólo
 * su `contratoId`. El servidor llena lo VACÍO —nunca pisa el permiso que una
 * fila ya trae: eso fabricaría origen (skill serfor §4/§8)— y devuelve cuántas
 * filas quedaron en cada estado.
 *
 * Aplica a Sección 1 (ingresos), Rolliza en patio (ingresos con trozas),
 * Aserrada en depósito y Sección 3 (sólo corridas SIN consumo: las demás
 * heredan el origen de lo que consumieron, ADR-402).
 */
import { z } from "zod";
import { normalizarCodigoContrato } from "./contratos";
import type { IngresoParaTitulo, PlanTitulo } from "./titulo-de-guia";

/** Lo que el operador eligió para todo un archivo. */
export type AsignacionDeArchivo = { contratoId: string };

/** Zod del campo opcional `asignacion` del cuerpo del import. */
export const asignacionSchema = z
  .object({ contratoId: z.string().trim().min(1).max(40) })
  .nullish();

/**
 * Qué pasó con el permiso de una fila:
 * - `asignado`: estaba vacío y se llenó con el del archivo;
 * - `ya-tenia`: traía el MISMO permiso;
 * - `conflicto`: traía OTRO permiso; se respetó el suyo y se importó igual;
 * - `hereda`: corrida con consumo; su origen sale de lo que consumió.
 */
export type EstadoPermisoFila = "asignado" | "ya-tenia" | "conflicto" | "hereda";

/**
 * Por fila, en `detalle[]` de la respuesta. `delArchivo` = el código que traía
 * la fila (o que ya tenía la guía en la base), si era otro; o la RESOLUCIÓN de
 * la fila cuando el conflicto es ése (`motivo` lo dice).
 *
 * `motivo` (opcional) explica un `conflicto` que NO es otro código: la fila
 * trae otra resolución, o la guía ya estaba en la base y su mes está cerrado o
 * el ingreso está anulado — el permiso del archivo no se aplicó y alguien
 * tiene que mirarlo.
 */
export interface PermisoDeFila {
  estado: EstadoPermisoFila;
  delArchivo?: string | null;
  motivo?: string | null;
}

/** En `resumen.permiso` de la respuesta, cuando el archivo llevó asignación. */
export interface ResumenPermisoImport {
  /** Código del permiso asignado (`ForestContrato.codigo`). */
  codigo: string;
  asignadas: number;
  yaTenian: number;
  conflictos: number;
  heredan: number;
}

/* ── Decidir qué se escribe (PURO: lo usa el endpoint y lo prueba el test) ── */

/** El permiso elegido, ya leído del catálogo del negocio. */
export interface PermisoParaImport {
  contratoId: string;
  /** `ForestContrato.codigo`, tal como está en el catálogo. */
  codigo: string;
  /** N° de resolución del permiso, si lo tiene. */
  resolucion: string | null;
  /** Titular del permiso; `null` si el catálogo no lo tiene (guarda «—»). */
  titular: string | null;
  /** RUC del titular (11 dígitos). NUNCA el de la instancia (ATFFS) que trae
   *  el `providerDocument` de una ficha SERFOR. */
  ruc: string | null;
}

/** Lo mínimo del catálogo para armar el permiso (subset de `Contrato`). */
export interface ContratoDelCatalogo {
  id: string;
  codigo: string;
  resolucionNumero: string | null;
  titularNombre: string | null;
  titularDoc: string | null;
  titularDocTipo: string | null;
}

const limpio = (s: string | null | undefined): string => (s ?? "").trim();

export function permisoParaImport(c: ContratoDelCatalogo): PermisoParaImport {
  const titular = limpio(c.titularNombre);
  const doc = limpio(c.titularDoc).replace(/\s+/g, "");
  const tipo = limpio(c.titularDocTipo).toUpperCase();
  return {
    contratoId: c.id,
    codigo: limpio(c.codigo),
    resolucion: limpio(c.resolucionNumero) || null,
    /* «—» es lo que guarda el alta cuando no hay titular: no es un nombre. */
    titular: titular && titular !== "—" ? titular : null,
    ruc: /^\d{11}$/.test(doc) && (tipo === "" || tipo === "RUC") ? doc : null,
  };
}

/** Una fila del archivo, vista desde el permiso. */
export interface FilaParaPermiso {
  /** El código de permiso que trae la fila (vacío = no trae). */
  codigo?: string | null;
  /** La resolución que trae la fila. */
  resolucion?: string | null;
  /** Corrida que consumió guías o trozas: su origen sale de lo consumido (ADR-402). */
  consume?: boolean;
}

/** Qué se escribe en el alta de la fila. `null` = nada del permiso. */
export interface EscrituraPermiso {
  originCode: string;
  /** Sólo los ingresos la guardan; la corrida no tiene casillero de resolución. */
  originSourceNumber: string | null;
  contratoId: string;
}

export interface DecisionPermisoFila extends PermisoDeFila {
  escribir: EscrituraPermiso | null;
}

/* ── La resolución de la fila contra la del permiso (19-10, reviewer) ──
 * El libro escribe la misma resolución de muchas formas («R.A N° D000485-2024»,
 * «D000485-2024», «RA Nº D000485-2024»): compararlas como texto haría un
 * conflicto de cada fila. Son la MISMA si coinciden sus letras y números, o si
 * coinciden sus números (sin ceros a la izquierda) y alguno tiene ≥ 3 cifras.
 * Dos resoluciones con los mismos números y otro emisor quedan como la misma:
 * el error tolerado es el que no frena el import, y el código sigue mandando. */
const alfanumerico = (s: string | null | undefined): string =>
  limpio(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cifras = (s: string | null | undefined): string[] =>
  (limpio(s).match(/\d+/g) ?? []).map((d) => d.replace(/^0+(?=\d)/, ""));

export function mismaResolucion(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = alfanumerico(a);
  const y = alfanumerico(b);
  if (!x || !y) return true; // falta una: no hay nada que contradiga
  if (x === y) return true;
  const cx = cifras(a);
  const cy = cifras(b);
  return cx.some((d) => d.length >= 3) && cx.join("-") === cy.join("-");
}

/**
 * La regla de la fila NUEVA (ingreso o corrida que se va a crear):
 *   · corrida con consumo → `hereda` (no se le escribe nada);
 *   · sin código y con OTRA resolución que la del permiso → `conflicto`
 *     («la fila trae otra resolución»): escribirle el código del permiso con
 *     una resolución ajena fabricaría un origen que el libro no declara;
 *   · sin código → `asignado`: código, resolución (si la fila no trae) y vínculo;
 *   · mismo código (normalizado) → `ya-tenia`: queda su texto, se vincula y se
 *     completa la resolución vacía;
 *   · otro código → `conflicto`: queda el suyo, sin vínculo forzado (el alta lo
 *     deduce de SU código si está en el catálogo).
 */
export function decidirPermisoFila(fila: FilaParaPermiso, permiso: PermisoParaImport): DecisionPermisoFila {
  if (fila.consume) return { estado: "hereda", escribir: null };
  const propio = limpio(fila.codigo);
  const suya = limpio(fila.resolucion);
  const resolucion = suya || permiso.resolucion;
  if (!propio) {
    /* La fila que pone el CÓDIGO del permiso en la columna de resolución no lo
       contradice: lo repite. */
    const otra =
      suya &&
      permiso.resolucion &&
      !mismaResolucion(suya, permiso.resolucion) &&
      normalizarCodigoContrato(suya) !== normalizarCodigoContrato(permiso.codigo);
    if (otra) return { estado: "conflicto", delArchivo: suya, motivo: "la fila trae otra resolución", escribir: null };
    return {
      estado: "asignado",
      escribir: { originCode: permiso.codigo, originSourceNumber: resolucion, contratoId: permiso.contratoId },
    };
  }
  if (normalizarCodigoContrato(propio) === normalizarCodigoContrato(permiso.codigo)) {
    return {
      estado: "ya-tenia",
      escribir: { originCode: propio, originSourceNumber: resolucion, contratoId: permiso.contratoId },
    };
  }
  return { estado: "conflicto", delArchivo: propio, escribir: null };
}

/** Lo que va en `detalle[].permiso` de una decisión (sin lo que se escribe). */
export function permisoDeLaDecision(d: DecisionPermisoFila): PermisoDeFila {
  return {
    estado: d.estado,
    ...(d.delArchivo ? { delArchivo: d.delArchivo } : {}),
    ...(d.motivo ? { motivo: d.motivo } : {}),
  };
}

/**
 * La guía que YA está en la base: el estado sale del plan de `planearTitulo`
 * (sólo llena lo vacío, respeta mes cerrado y anulados). Se miran los ingresos
 * de la especie de la fila; si ninguno es de esa especie, todos los de la guía.
 *
 * `escritos` (en commit) = los ids que `TituloGuiaDB.declarar` de verdad tocó:
 * un plan que no llegó a escribirse lo completó otra pantalla en el medio.
 */
export function permisoDeGuiaExistente(
  ingresos: readonly IngresoParaTitulo[],
  planes: readonly PlanTitulo[],
  opts: { especie?: string | null; escritos?: ReadonlySet<string> } = {},
): PermisoDeFila {
  const esp = limpio(opts.especie).toLowerCase();
  const deLaEspecie = esp ? planes.filter((p) => limpio(p.especie).toLowerCase() === esp) : [];
  const base = deLaEspecie.length > 0 ? deLaEspecie : planes;
  const vigentes = base.map((p) =>
    p.escribir && opts.escritos && !opts.escritos.has(p.id)
      ? { ...p, escribir: null, razon: null, motivo: "otra pantalla lo completó antes" }
      : p,
  );
  if (vigentes.some((p) => p.escribir?.originCode)) return { estado: "asignado" };
  const otro = vigentes.find((p) => p.razon === "otro_titulo");
  if (otro) {
    const codigo = limpio(ingresos.find((i) => i.id === otro.id)?.originCode);
    return { estado: "conflicto", delArchivo: codigo || null };
  }
  if (vigentes.some((p) => p.escribir || p.razon === "igual")) return { estado: "ya-tenia" };
  return { estado: "conflicto", delArchivo: null, motivo: vigentes[0]?.motivo ?? "la guía no tiene ingresos vivos" };
}

/**
 * ¿El proveedor del ingreso es el RELLENO que arma el importador cuando el
 * formato no trae titular (`proveedorDesdeFormato`: «Origen X · GTF», la GTF
 * sola o «Sin identificar…»)? Sólo ése se reemplaza por el titular del permiso;
 * un nombre real o la marca del inventario de patio quedan como están.
 */
export function esProveedorDeRelleno(providerName: string | null | undefined, gtfNumber: string): boolean {
  const p = limpio(providerName);
  if (!p) return true;
  if (p === "Sin identificar (importado del SNIFFS)") return true;
  if (p === limpio(gtfNumber)) return true;
  return /^Origen .+ · .+$/.test(p);
}

/**
 * La «X» de un relleno «Origen X · GTF»: el código o la N° de fuente de origen
 * de la Sección 1 (`codigoOrigen || fuenteOrigen`). Antes de este arreglo sólo
 * viajaba ahí, y al poner el titular en su lugar se perdía. `null` = no hay.
 */
export function fuenteDelRelleno(providerName: string | null | undefined): string | null {
  const m = /^Origen (.+) · .+$/.exec(limpio(providerName));
  return m ? limpio(m[1]) || null : null;
}

/** Lo que entra en el casillero de resolución (`originSourceNumber`, Zod 120). */
const TOPE_RESOLUCION = 120;
const contiene = (texto: string | null | undefined, parte: string) =>
  limpio(texto).toUpperCase().includes(parte.toUpperCase());

/**
 * Antes de reemplazar un relleno, su fuente queda guardada (reviewer 19-10:
 * «Origen R.A N° D000485-2024 · 019-…» → «TITULAR SAC» la borraba):
 *   · si ya está en el código, la resolución o las notas, no se repite;
 *   · si la resolución está vacía y cabe, va ahí;
 *   · si no, a las notas: «Fuente de origen: …».
 * Devuelve los dos campos como deben quedar (iguales si no había nada).
 */
export function rescatarFuenteDelRelleno(fila: {
  providerName: string | null | undefined;
  originCode?: string | null;
  originSourceNumber?: string | null;
  notes?: string | null;
}): { originSourceNumber: string | null; notes: string | null; fuente: string | null; guardadaEn: "resolucion" | "notas" | null } {
  const originSourceNumber = limpio(fila.originSourceNumber) || null;
  const notes = limpio(fila.notes) || null;
  const fuente = fuenteDelRelleno(fila.providerName);
  const igual = { originSourceNumber, notes, fuente, guardadaEn: null };
  if (!fuente) return igual;
  const yaEsta =
    normalizarCodigoContrato(fuente) === normalizarCodigoContrato(limpio(fila.originCode)) ||
    (originSourceNumber != null && alfanumerico(originSourceNumber) === alfanumerico(fuente)) ||
    contiene(notes, fuente);
  if (yaEsta) return igual;
  if (!originSourceNumber && fuente.length <= TOPE_RESOLUCION) {
    return { originSourceNumber: fuente, notes, fuente, guardadaEn: "resolucion" };
  }
  return { originSourceNumber, notes: [notes, `Fuente de origen: ${fuente}`].filter(Boolean).join(" · "), fuente, guardadaEn: "notas" };
}

/** El proveedor que va en el alta: el titular del permiso (+ su RUC) en lugar
 *  del relleno; `null` = dejar el que trae la fila. */
export function proveedorDelPermiso(
  providerName: string | null | undefined,
  gtfNumber: string,
  permiso: PermisoParaImport,
  estado: EstadoPermisoFila,
): { providerName: string; providerDocument: string | null; providerDocumentType: "RUC" | null } | null {
  if (estado !== "asignado" && estado !== "ya-tenia") return null;
  if (!permiso.titular || !esProveedorDeRelleno(providerName, gtfNumber)) return null;
  return {
    providerName: permiso.titular,
    providerDocument: permiso.ruc,
    providerDocumentType: permiso.ruc ? "RUC" : null,
  };
}

/** Los conteos de `resumen.permiso`. */
export function resumirPermiso(codigo: string, filas: readonly PermisoDeFila[]): ResumenPermisoImport {
  const r: ResumenPermisoImport = { codigo, asignadas: 0, yaTenian: 0, conflictos: 0, heredan: 0 };
  for (const f of filas) {
    if (f.estado === "asignado") r.asignadas++;
    else if (f.estado === "ya-tenia") r.yaTenian++;
    else if (f.estado === "conflicto") r.conflictos++;
    else r.heredan++;
  }
  return r;
}
