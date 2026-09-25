/**
 * tramites-relacion-guias — el anexo del trámite "Relación de guías emitidas"
 * (ADR-364): una fila por GTF que se declara a SERFOR, con su lista de trozas.
 *
 * Vive aparte de `tramites-catalogo` porque tiene forma propia (una tabla, no
 * campos sueltos) y de `guias-emitidas` porque ésa deriva del despacho — acá se
 * declara lo que el titular decide presentar, que puede incluir guías que el
 * libro no vio (monte→SERFOR, talonario anulado antes de registrar). Cuando la
 * fila SÍ viene del libro (`origen: "libro"`) se marca para que el operador sepa
 * qué está verificado y qué tipeó a mano.
 *
 * PURO: sin React, sin fetch, sin DOM. Se serializa como el valor de UN campo
 * del trámite (`datos.guiasJson`), mismo mecanismo que el resto del formulario.
 */

import { esc } from "./ctp-print-shared";
import type { GuiaEmitida } from "./guias-emitidas";
import type { TramiteRegistro } from "./tramites-registro";

export interface FilaGuiaInforme {
  /** Clave estable de la fila en la UI — no viaja a ningún otro sistema. */
  uid: string;
  numero: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  destinatario: string;
  especie: string;
  producto: string;
  /** Texto, no número: conserva la unidad tal cual la declaró el libro o el operador. */
  cantidad: string;
  unidad: string;
  /** Detalle de trozas — código y medida, una por línea. Vacío se declara vacío, nunca se inventa. */
  trozas: string;
  anulada: boolean;
  /** Sólo tiene sentido si `anulada`. */
  motivo: string;
  /**
   * De dónde salió la fila — para que el operador sepa qué está verificado
   * contra un libro y qué tipeó a mano:
   * `"ctp"` = despacho del Libro CTP (`guias-emitidas.ts`, ADR-321).
   * `"loth"` = GTF de trozas del Libro de Títulos Habilitantes (`ForestGtf`).
   * `"manual"` = la tipeó el operador.
   */
  origen: "ctp" | "loth" | "manual";
}

export const nuevaFilaGuia = (
  uid: string,
  over: Partial<Omit<FilaGuiaInforme, "uid">> = {},
): FilaGuiaInforme => ({
  uid,
  numero: "",
  fecha: "",
  destinatario: "",
  especie: "",
  producto: "",
  cantidad: "",
  unidad: "",
  trozas: "",
  anulada: false,
  motivo: "",
  origen: "manual",
  ...over,
});

/** Una guía ya derivada del despacho (`guias-emitidas.ts`), lista para la relación. */
export function filaDesdeGuiaEmitida(uid: string, g: GuiaEmitida): FilaGuiaInforme {
  return nuevaFilaGuia(uid, {
    numero: g.gtfNumber,
    fecha: g.fecha.slice(0, 10),
    destinatario: g.destinatario ?? g.destino ?? "",
    especie: g.especie ?? "",
    producto: g.producto ?? "",
    cantidad: g.cantidad != null ? String(g.cantidad) : "",
    unidad: g.unidad ?? "",
    // Sin lista de trozas: `guias-emitidas` no la trae (es un agregado del
    // despacho). Queda en blanco a propósito — un valor inventado acá es peor
    // que uno ausente.
    trozas: "",
    anulada: g.estado === "anulada",
    origen: "ctp",
  });
}

/** Un ítem (troza) de una `ForestGtf` del Libro de Títulos Habilitantes. */
export interface ItemGtfLoth {
  code?: string | null;
  species?: string | null;
  diamMayorM?: number | null;
  diamMenorM?: number | null;
  lengthM?: number | null;
  volumeM3?: number | null;
  productType?: string | null;
}

/** Subconjunto de `ForestGtf` (Prisma) que necesita el adaptador — sin importar el modelo. */
export interface GtfLothLike {
  gtfNumber: string;
  gtfDate: string | Date | null;
  destino?: string | null;
  tipo?: string | null;
  volumenTotalM3?: number | null;
  status: string;
  annulledReason?: string | null;
  items: ItemGtfLoth[];
}

/**
 * Una línea legible por troza: código y medidas, tal como se escribiría a
 * mano. Una medida ausente se OMITE, nunca se marca con un "?" — un casillero
 * que no se sabe se declara vacío, no con un signo que parece un dato real.
 */
function lineaDeItem(it: ItemGtfLoth): string {
  const diam =
    it.diamMayorM != null || it.diamMenorM != null
      ? `Ø${it.diamMayorM ?? "—"}/${it.diamMenorM ?? "—"}m`
      : null;
  const largo = it.lengthM != null ? `L${it.lengthM}m` : null;
  return [it.code, it.species, diam, largo, it.volumeM3 != null ? `${it.volumeM3} m³` : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Una GTF de trozas del Libro TH, lista para la relación. A diferencia de la
 * del CTP, ACÁ SÍ hay lista de trozas real (`ForestGtf.items` guarda código y
 * medida por pieza) — se arma sola, no queda para completar a mano.
 */
export function filaDesdeGtfLoth(uid: string, g: GtfLothLike): FilaGuiaInforme {
  const items = g.items ?? [];
  const especies = [...new Set(items.map((i) => i.species).filter((s): s is string => Boolean(s)))];
  const fecha = g.gtfDate ? new Date(g.gtfDate).toISOString().slice(0, 10) : "";
  return nuevaFilaGuia(uid, {
    numero: g.gtfNumber,
    fecha,
    destinatario: g.destino ?? "",
    especie: especies.length > 1 ? `${especies.length} especies` : (especies[0] ?? ""),
    producto: g.tipo === "trozas" ? "Trozas" : (items[0]?.productType ?? ""),
    cantidad: g.volumenTotalM3 != null ? String(g.volumenTotalM3) : "",
    unidad: "m3",
    trozas: items.map(lineaDeItem).join("\n"),
    anulada: g.status === "anulada",
    motivo: g.annulledReason ?? "",
    origen: "loth",
  });
}

export interface ResumenGuiasInforme {
  emitidas: number;
  anuladas: number;
  /** Vigentes sin lista de trozas cargada — lo que falta antes de presentar. */
  sinTrozas: number;
}

export function resumenGuiasInforme(filas: FilaGuiaInforme[]): ResumenGuiasInforme {
  let emitidas = 0;
  let anuladas = 0;
  let sinTrozas = 0;
  for (const f of filas) {
    if (f.anulada) anuladas += 1;
    else {
      emitidas += 1;
      if (!f.trozas.trim()) sinTrozas += 1;
    }
  }
  return { emitidas, anuladas, sinTrozas };
}

/** N° repetidos entre las vigentes — mismo criterio que `guias-emitidas.numerosRepetidos`. */
export function numerosGuiaRepetidos(filas: FilaGuiaInforme[]): string[] {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const n = f.numero.trim();
    if (!n || f.anulada) continue;
    cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  }
  return [...cuenta.entries()].filter(([, n]) => n > 1).map(([n]) => n);
}

export function serializeGuiasInforme(filas: FilaGuiaInforme[]): string {
  return filas.length === 0 ? "" : JSON.stringify(filas);
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");

/** Tolerante a basura: un JSON roto o viejo vuelve `[]`, nunca tira. */
export function parseGuiasInforme(json: string | undefined | null): FilaGuiaInforme[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      uid: s(o.uid) || `fila-${i}`,
      numero: s(o.numero),
      fecha: s(o.fecha),
      destinatario: s(o.destinatario),
      especie: s(o.especie),
      producto: s(o.producto),
      cantidad: s(o.cantidad),
      unidad: s(o.unidad),
      trozas: s(o.trozas),
      anulada: Boolean(o.anulada),
      motivo: s(o.motivo),
      origen: o.origen === "ctp" || o.origen === "loth" ? o.origen : "manual",
    } satisfies FilaGuiaInforme;
  });
}

const fmtFechaCorta = (iso: string): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
};

const HEAD_GUIAS = ["N° de GTF", "Fecha", "Destinatario", "Especie / producto", "Cantidad"];
const HEAD_TROZAS = ["N° de GTF", "Detalle de trozas"];

function filaHtml(f: FilaGuiaInforme, conMotivo: boolean): string {
  const cantidad = f.cantidad.trim() ? esc(`${f.cantidad} ${f.unidad}`.trim()) : "—";
  return `<tr>
    <td>${esc(f.numero || "—")}</td>
    <td>${esc(fmtFechaCorta(f.fecha))}</td>
    <td>${esc(f.destinatario || "—")}</td>
    <td>${esc([f.especie, f.producto].filter(Boolean).join(" · ") || "—")}</td>
    <td>${cantidad}</td>
    ${conMotivo ? `<td>${esc(f.motivo || "—")}</td>` : ""}
  </tr>`;
}

function filaTrozasHtml(f: FilaGuiaInforme): string {
  const trozas = f.trozas.trim()
    ? esc(f.trozas).replace(/\n/g, "<br/>")
    : `<span class="sin-dato">sin lista cargada</span>`;
  return `<tr><td>${esc(f.numero || "—")}</td><td>${trozas}</td></tr>`;
}

/** Tabla de identidad de la guía (sin trozas) — N°/fecha/destinatario/especie/cantidad. */
function tablaGuias(filas: FilaGuiaInforme[], conMotivo: boolean, vacio: string): string {
  const head = conMotivo ? [...HEAD_GUIAS, "Motivo de anulación"] : HEAD_GUIAS;
  return filas.length
    ? `<table class="tabla-guias"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
       <tbody>${filas.map((f) => filaHtml(f, conMotivo)).join("")}</tbody></table>`
    : `<p class="vacio">${esc(vacio)}</p>`;
}

/** Tabla del detalle de trozas — separada de la de identidad: leer un GTF con
 *  seis columnas y una lista de piezas dentro de la última es leer una hoja
 *  torcida; acá cada tabla contesta UNA pregunta. */
function tablaTrozas(filas: FilaGuiaInforme[], vacio: string): string {
  return filas.length
    ? `<table class="tabla-guias tabla-trozas"><thead><tr>${HEAD_TROZAS.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
       <tbody>${filas.map(filaTrozasHtml).join("")}</tbody></table>`
    : `<p class="vacio">${esc(vacio)}</p>`;
}

/** El código de una línea de troza: lo que va antes del primer " · " (la
 *  medida no importa acá, sólo el código — `lineaDeItem` arma "código · Ø... · L... · m³"). */
function codigoDeLineaTroza(linea: string): string {
  const i = linea.indexOf(" · ");
  return (i === -1 ? linea : linea.slice(0, i)).trim();
}

const numerosGuia = (filas: FilaGuiaInforme[]): string[] => filas.map((f) => f.numero.trim()).filter(Boolean);

const codigosDeTrozas = (filas: FilaGuiaInforme[]): string[] =>
  filas.flatMap((f) => f.trozas.split("\n").map((l) => l.trim()).filter(Boolean).map(codigoDeLineaTroza));

const listaOGuion = (items: string[]): string => (items.length ? `${items.join(" ; ")}.` : "—");

/** "Emitidas"/"Anuladas": los N° de GTF y los códigos de troza EN LÍNEA, sin
 *  tabla — lo que pide Brandon leer de un vistazo dentro del cuerpo de la
 *  carta, sin abrir el anexo. Sin filas, muestra "—" (no desaparece): mismo
 *  criterio que el Anexo 1, que siempre se ve aunque esté vacío. */
function bloqueNumerado(titulo: string, filas: FilaGuiaInforme[]): string {
  return `<p><strong>${esc(titulo)}:</strong></p>
    <p><strong>Guía de Transporte Forestal:</strong> ${esc(listaOGuion(numerosGuia(filas)))}</p>
    <p><strong>Lista de trozas:</strong> ${esc(listaOGuion(codigosDeTrozas(filas)))}</p>`;
}

/**
 * El resumen que va DENTRO del cuerpo de la carta (no en el anexo): Brandon
 * pidió (2026-08-20) reemplazar la prosa "se emitieron N guías" por los
 * números reales, agrupados Emitidas/Anuladas — es lo primero que lee un
 * fiscalizador, antes de tener que abrir el anexo con el detalle completo.
 *
 * "Emitidas" SIEMPRE se ve (con "—" si todavía no hay guías cargadas, igual
 * que el Anexo 1) — así el operador ve el formato nuevo desde el primer
 * momento, sin confundirlo con "no cambió nada" por tener el trámite vacío.
 * "Anuladas" sólo aparece si de verdad hay alguna (igual que el Anexo 2).
 */
export function resumenNumeradoHtml(filas: FilaGuiaInforme[]): string {
  const emitidas = filas.filter((f) => !f.anulada);
  const anuladas = filas.filter((f) => f.anulada);
  return `${bloqueNumerado("Emitidas", emitidas)}${anuladas.length > 0 ? bloqueNumerado("Anuladas", anuladas) : ""}`;
}

/**
 * El anexo completo: emitidas y anuladas por separado (mezclarlas obligaría a
 * leer una columna extra fila por fila para saber si esa guía todavía vale),
 * y dentro de cada una, la identidad de la guía separada de su lista de
 * trozas — dos preguntas distintas, dos tablas.
 */
export function tablaGuiasHtml(filas: FilaGuiaInforme[]): string {
  if (filas.length === 0) return "";
  const emitidas = filas.filter((f) => !f.anulada);
  const anuladas = filas.filter((f) => f.anulada);

  const seccionEmitidas = `
    <h2>Anexo 1 · Guías emitidas</h2>
    ${tablaGuias(emitidas, false, "Sin guías emitidas declaradas en este período.")}
    <h3>Lista de trozas</h3>
    ${tablaTrozas(emitidas, "Sin guías emitidas para listar trozas.")}
  `;

  // `anexo-anuladas` (ronda 8, Brandon: "mejora la tabla de guías"): las
  // anuladas ya viven en su propia sección — pero con el mismo verde de
  // "Emitidas" un fiscalizador que hojea rápido puede leerlas como válidas.
  // El tinte rojo (mismo semántico que el resto del módulo usa para
  // "anulada"/"error") las marca de un vistazo, sin mezclar filas ni
  // inventar una columna de estado que la tabla ya no necesita.
  const seccionAnuladas = anuladas.length > 0
    ? `
    <div class="anexo-anuladas">
    <h2>Anexo 2 · Anuladas</h2>
    <h3>Guías de transporte forestal</h3>
    ${tablaGuias(anuladas, true, "")}
    <h3>Lista de trozas</h3>
    ${tablaTrozas(anuladas, "")}
    </div>
  `
    : "";

  return `<div class="anexo-guias">${seccionEmitidas}${seccionAnuladas}</div>`;
}

// ─── Ronda 4 (2026-08-20) — continuidad de período, historial, duplicados ────

/**
 * Relaciones YA guardadas de este formato (cualquier estado), la más
 * reciente primero por período "hasta" (o `updatedAt` si no lo tiene). Base
 * de la continuidad de período, el historial y el chequeo de duplicados —
 * las tres necesitan "qué se declaró antes", no cada una su propio filtro.
 */
export function relacionesDelFormato(tramites: TramiteRegistro[], formatoId: string): TramiteRegistro[] {
  return tramites
    .filter((t) => t.formatoId === formatoId)
    .slice()
    .sort((a, b) => (b.datos.periodoHasta || b.updatedAt || "").localeCompare(a.datos.periodoHasta || a.updatedAt || ""));
}

/** La última relación YA presentada (no borrador) con un "período — hasta"
 *  legible — `null` si no hay antecedente. Base común de las dos funciones
 *  de abajo: las dos preguntan "¿hasta cuándo llegó lo último declarado?". */
function ultimaPresentadaConPeriodo(relaciones: TramiteRegistro[]): TramiteRegistro | null {
  return relaciones.find((t) => t.estado !== "borrador" && /^\d{4}-\d{2}-\d{2}/.test(t.datos.periodoHasta ?? "")) ?? null;
}

/**
 * Sugerencia de "Período — desde": el día siguiente al "hasta" de la última
 * relación YA presentada — evita huecos o superposiciones entre
 * declaraciones consecutivas (lo que un fiscalizador cruza es que los
 * períodos se encadenen sin salto). `null` sin antecedente o con fecha rara.
 */
export function periodoDesdeSugerido(relaciones: TramiteRegistro[]): string | null {
  const ultima = ultimaPresentadaConPeriodo(relaciones);
  if (!ultima) return null;
  const d = new Date(`${ultima.datos.periodoHasta}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface AvisoPlazoRelacion {
  dias: number;
  numeroDocumento: string | null;
  periodoHasta: string;
}

/**
 * Cuántos días pasaron desde que terminó el período de la última relación
 * PRESENTADA, sin que haya una siguiente — `null` si no aplica (sin
 * antecedente, el "hasta" es de hoy o el futuro, o todavía no se cumplió
 * `diasLimite`). No es un plazo legal (la norma no fija uno para ESTA
 * relación en particular, ver §7 del skill serfor-osinfor-compliance): es el
 * recordatorio de que el siguiente tramo quedó sin declarar. Default 15 días
 * — el mismo criterio que `tramitesSinRespuesta` usa para "ir a preguntar".
 */
export function avisoPlazoRelacion(relaciones: TramiteRegistro[], hoy: Date, diasLimite = 15): AvisoPlazoRelacion | null {
  const ultima = ultimaPresentadaConPeriodo(relaciones);
  if (!ultima) return null;
  const d = new Date(`${ultima.datos.periodoHasta}T00:00:00Z`);
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const dias = Math.floor((hoyUtc - d.getTime()) / 86_400_000);
  if (dias < diasLimite) return null;
  return { dias, numeroDocumento: ultima.numeroDocumento, periodoHasta: ultima.datos.periodoHasta! };
}

export interface GtfDuplicada {
  numero: string;
  /** A qué otra relación pertenece — "N° 002-2026" o, sin numerar, una frase legible. */
  otraRelacion: string;
}

/**
 * N° de GTF de `filasActuales` que YA aparecen en OTRA relación guardada
 * (mismo formato, distinto id) — típicamente un tipeo repetido o la misma
 * guía declarada dos veces por error. Mira TODAS las filas de la otra
 * relación, emitida o anulada: aparecer en cualquiera de las dos ya amerita
 * revisar antes de presentar (a diferencia de `numerosGuiaRepetidos`, que
 * sólo mira DENTRO de la relación que se está llenando).
 */
export function gtfDuplicadaEntreRelaciones(filasActuales: FilaGuiaInforme[], otras: TramiteRegistro[]): GtfDuplicada[] {
  const otrasConNumeros = otras.map((t) => ({
    t,
    numeros: new Set(parseGuiasInforme(t.datos.guiasJson).map((g) => g.numero.trim()).filter(Boolean)),
  }));
  const encontradas: GtfDuplicada[] = [];
  const vistos = new Set<string>();
  for (const f of filasActuales) {
    const numero = f.numero.trim();
    if (!numero || vistos.has(numero)) continue;
    const otra = otrasConNumeros.find((o) => o.numeros.has(numero));
    if (otra) {
      vistos.add(numero);
      encontradas.push({ numero, otraRelacion: otra.t.numeroDocumento ? `N° ${otra.t.numeroDocumento}` : "otra relación sin N° asignado" });
    }
  }
  return encontradas;
}
