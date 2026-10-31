/**
 * corrida-compra — «Corrida con su compra» y «Especies aserradas sin ingreso»
 * (ADR-485). PURO: sin Prisma, sin fetch; lo usan la DB class y los tests.
 *
 * Medido en Blas (08-10, sólo lectura): 5 corridas de producción (78,671 m³ de
 * troza, fechadas el 01/08) y 0 consumos. El botón existía («Editar
 * atribución» en la ficha de la corrida); lo que no existía era madera que
 * ligar: las 5 especies de las corridas (Cachimbo, Panguana, Copal,
 * Mashonaste, Azúcar huayo) no tienen NINGÚN ingreso, los 7 ingresos son de
 * otras 5 especies, llegaron el 03/10 (después de las corridas) y ninguno
 * tiene costo. Por eso la propuesta dice POR QUÉ no propone, en vez de un
 * buscador vacío.
 *
 * La regla de la propuesta: misma especie (`claveEspecie`), ingreso que llegó
 * el mismo día o antes que la corrida, con saldo, del mismo permiso y del mismo
 * dueño de la madera; el más viejo primero (FIFO). No inventa: lo que no se
 * cubre queda «sin atribuir», y una guía sin costo se nombra.
 */

import { fmtM3 } from "./cubicacion-formato";
import { claveEspecie } from "./loth-constants";
import { diaDelLibro } from "./recepcion-antes-de-la-sierra";
import { clavePermiso, mismoPermiso, type PermisoRef } from "./vincular-trozas";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** La tolerancia en la unidad del negocio: menos de un milésimo de m³ no es madera. */
const TOLERANCIA_M3 = 0.0005;

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
const legible = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const nombre = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// ── Corrida con su compra ────────────────────────────────────────────────────

export interface CorridaParaCompra {
  id: string;
  lineNo: number;
  /** Día de la corrida (date-only). */
  fecha: Date | string;
  especie: string | null;
  /** `volumeInputM3`: los m³ de troza que la corrida dice que entraron. */
  declaradoM3: number | null;
  status: string;
  /** ADR-394: madera anterior al libro, declarada sin guía. */
  aperturaDeclarada: boolean;
  /** Algún consumo con costo congelado: la atribución es inmutable (D6). */
  congelado: boolean;
  /** Etiqueta del mes cerrado en que cae la corrida, o `null`. */
  mesCerrado: string | null;
  permiso: PermisoRef;
  /**
   * De quién es la madera (ADR-412): `"propia"` | `"tercero"`; `null` = no se
   * declaró (corrida vieja) y se trata como propia. NO es un nombre: el nombre
   * del tercero va en `titularNombre` (revisión 08-10: comparar este campo con
   * el dueño de la guía descartaba TODAS las guías de 36 de 39 corridas en QA).
   */
  duenoMadera: string | null;
  /** A quién se le asierra, cuando `duenoMadera === "tercero"`. */
  titularNombre?: string | null;
  /** m³ que entraron desde OTRA corrida (reproceso, ADR-316): ya tienen origen. */
  desdeReprocesoM3?: number;
}

export interface IngresoParaCompra {
  id: string;
  gtf: string;
  /** Día en que llegó: la recepción de la guía, si no el asiento. */
  llegada: Date | string | null;
  especie: string | null;
  status: string;
  volumenM3: number;
  /** m³ que ya consumen OTRAS corridas vivas. */
  usadoPorOtrasM3: number;
  costoUnitario: number | null;
  moneda: string | null;
  deTercero: boolean;
  duenoNombre: string | null;
  permiso: PermisoRef;
  /**
   * Cuántas trozas de cada especie (tal como se anotó en la troza) cuelgan de
   * esta fila. Sólo hace falta cuando ninguna fila es de la especie de la
   * corrida: una troza de Pashaco en la fila de Cumala sí entró con guía, y
   * decir «no hay ningún ingreso» contradecía al aviso de Saldos.
   */
  trozasPorEspecie?: Readonly<Record<string, number>>;
}

export interface ConsumoActual {
  woodEntryId: string;
  volumeM3: number;
}

export interface FilaPropuesta {
  woodEntryId: string;
  gtf: string;
  /** `AAAA-MM-DD`. */
  llegada: string | null;
  m3: number;
  /** Lo que la guía tenía libre antes de esta propuesta. */
  libreM3: number;
  costoUnitario: number | null;
  moneda: string | null;
}

export type EstadoPropuesta = "completa" | "parcial" | "nada" | "ya_atribuida" | "bloqueada";

export interface PropuestaCompra {
  corridaId: string;
  lineNo: number;
  especie: string | null;
  fecha: string | null;
  declaradoM3: number | null;
  /** m³ ya atados a guías (consumos de la corrida). */
  atribuidoM3: number;
  /** m³ que llegaron desde otra corrida (reproceso): tienen origen sin ser de una guía. */
  desdeReprocesoM3: number;
  /** declarado − atribuido − reproceso (lo que la propuesta intenta cubrir). */
  faltaM3: number;
  filas: FilaPropuesta[];
  cubreM3: number;
  /** Lo que sigue sin guía después de confirmar. */
  quedaM3: number;
  estado: EstadoPropuesta;
  /** Por qué no cubre todo (o por qué no se puede): en palabras del operador. */
  motivo: string | null;
  /** Guías (propuestas o ya atribuidas) sin costo cargado: el costo por PT las nombra. */
  guiasSinCosto: string[];
  /** Guías propias en soles y en dólares a la vez: el costo de la corrida no se puede sumar. */
  monedasMezcladas: boolean;
  /** Lo que el operador vio: el servidor la recalcula al confirmar y exige la misma. */
  firma: string;
}

const ESTADOS_LIBRES = new Set(["validado", "procesado"]);
const ESTADOS_MUERTOS = new Set(["anulado", "rechazado"]);

export function firmaDePropuesta(corridaId: string, atribuidoM3: number, filas: readonly Pick<FilaPropuesta, "woodEntryId" | "m3">[]): string {
  return `${corridaId}|${atribuidoM3.toFixed(4)}|${filas.map((f) => `${f.woodEntryId}:${f.m3.toFixed(4)}`).join(",")}`;
}

/**
 * Los consumos que se escriben al confirmar: los que la corrida ya tenía más
 * los propuestos (un mismo ingreso se SUMA: el UNIQUE no admite dos filas).
 */
export function consumosAlConfirmar(actuales: readonly ConsumoActual[], filas: readonly FilaPropuesta[]): ConsumoActual[] {
  const suma = new Map<string, number>();
  for (const c of actuales) suma.set(c.woodEntryId, r4((suma.get(c.woodEntryId) ?? 0) + c.volumeM3));
  for (const f of filas) suma.set(f.woodEntryId, r4((suma.get(f.woodEntryId) ?? 0) + f.m3));
  return [...suma.entries()].filter(([, v]) => v > 0).map(([woodEntryId, volumeM3]) => ({ woodEntryId, volumeM3 }));
}

function motivoSinFilas(especie: string, descartes: Descartes): string {
  const partes: string[] = [];
  if (descartes.posteriores.length > 0) {
    const primera = [...descartes.posteriores].sort()[0];
    partes.push(
      `${descartes.posteriores.length === 1 ? "la guía de" : `las ${descartes.posteriores.length} guías de`} ${especie} ` +
        `${descartes.posteriores.length === 1 ? "llegó" : "llegaron"} después de la corrida (desde el ${legible(primera)}): no se asierra madera que todavía no llegó`,
    );
  }
  if (descartes.sinSaldo > 0) partes.push(`${descartes.sinSaldo === 1 ? "una guía ya se consumió" : `${descartes.sinSaldo} guías ya se consumieron`} en otras corridas`);
  if (descartes.sinValidar > 0) partes.push(`${descartes.sinValidar === 1 ? "una guía está" : `${descartes.sinValidar} guías están`} sin validar (valídalas en Ingresos)`);
  if (descartes.otroPermiso > 0) {
    partes.push(
      `${descartes.otroPermiso === 1 ? "una guía es" : `${descartes.otroPermiso} guías son`} de otro permiso` +
        (descartes.tituloElegido ? ` que ${descartes.tituloElegido} (la corrida no declara permiso y sale de uno solo)` : ""),
    );
  }
  if (descartes.otroDueno > 0) partes.push(`${descartes.otroDueno === 1 ? "una guía es" : `${descartes.otroDueno} guías son`} de otro dueño de madera`);
  const texto = partes.join("; ");
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) + "." : "";
}

/** «010-001-0000007 (3 en la fila de Cumala)», la más cargada primero. */
function motivoTrozasEnOtraFila(especie: string, filas: readonly { gtf: string; fila: string; n: number }[]): string {
  const total = filas.reduce((a, f) => a + f.n, 0);
  const lista = [...filas]
    .sort((a, b) => b.n - a.n || a.gtf.localeCompare(b.gtf, "es"))
    .map((f) => `${f.gtf} (${f.n} en la fila de ${f.fila})`)
    .join(", ");
  return (
    `Ninguna guía tiene una fila de ${especie}, pero ${total === 1 ? "una troza" : `${total} trozas`} de ${especie} ` +
    `${total === 1 ? "entró anotada" : "entraron anotadas"} en otra especie: ${lista}. ` +
    `Revísalas en Ingresos: si son de ${especie}, a su guía le falta esa fila; si no, corrige la especie de la troza. ` +
    `Mientras tanto puedes elegir la guía a mano con «Editar atribución».`
  );
}

interface Descartes {
  posteriores: string[];
  sinSaldo: number;
  sinValidar: number;
  otroPermiso: number;
  otroDueno: number;
  /** Corrida sin permiso: el título que se tomó (el que ya consume, o el de la guía más vieja). */
  tituloElegido?: string;
}

/** FIFO: la que llegó primero sale primero; a igual día, por N° de guía. */
const fifo = (a: { llegada: string | null; ingreso: IngresoParaCompra }, b: { llegada: string | null; ingreso: IngresoParaCompra }) =>
  (a.llegada ?? "").localeCompare(b.llegada ?? "") || a.ingreso.gtf.localeCompare(b.ingreso.gtf, "es") || a.ingreso.id.localeCompare(b.ingreso.id);

/**
 * Propone de qué ingreso(s) sale la madera que a la corrida le falta atribuir.
 *
 * No escribe nada. La escritura la hace `setConsumos` (lock, I1, I2, cierre y
 * congelado), así que esta función decide QUÉ proponer y deja que el escritor
 * de siempre decida si se puede.
 */
export function proponerCompraDeCorrida(
  corrida: CorridaParaCompra,
  ingresos: readonly IngresoParaCompra[],
  actuales: readonly ConsumoActual[],
): PropuestaCompra {
  const fecha = diaDelLibro(corrida.fecha);
  const especie = corrida.especie?.trim() || null;
  const atribuidoM3 = r4(actuales.reduce((a, c) => a + c.volumeM3, 0));
  const declarado = corrida.declaradoM3 != null && corrida.declaradoM3 > 0 ? r4(corrida.declaradoM3) : null;
  const desdeReprocesoM3 = r4(Math.max(0, corrida.desdeReprocesoM3 ?? 0));
  const faltaM3 = declarado != null ? r4(Math.max(0, declarado - atribuidoM3 - desdeReprocesoM3)) : 0;
  const porId = new Map(ingresos.map((i) => [i.id, i]));
  const propiasDe = (ids: Iterable<string>) => [...ids].map((id) => porId.get(id)).filter((i): i is IngresoParaCompra => !!i && !i.deTercero);
  const sinCostoDe = (ids: Iterable<string>) => [...new Set(propiasDe(ids).filter((i) => i.costoUnitario == null).map((i) => i.gtf))].sort();
  /* La misma regla que `costoDeLinea`: la moneda de cada guía propia, tenga o no costo. */
  const mezclaMonedas = (ids: Iterable<string>) => new Set(propiasDe(ids).map((i) => i.moneda ?? "PEN")).size > 1;

  const base = {
    corridaId: corrida.id,
    lineNo: corrida.lineNo,
    especie,
    fecha,
    declaradoM3: declarado,
    atribuidoM3,
    desdeReprocesoM3,
    faltaM3,
  };
  const sinFilas = (estado: EstadoPropuesta, motivo: string | null): PropuestaCompra => ({
    ...base,
    filas: [],
    cubreM3: 0,
    quedaM3: faltaM3,
    estado,
    motivo,
    guiasSinCosto: sinCostoDe(actuales.map((c) => c.woodEntryId)),
    monedasMezcladas: mezclaMonedas(actuales.map((c) => c.woodEntryId)),
    firma: firmaDePropuesta(corrida.id, atribuidoM3, []),
  });

  if (corrida.status !== "registrado") return sinFilas("bloqueada", "La corrida está anulada: no se le liga madera.");
  if (corrida.aperturaDeclarada) {
    return sinFilas("bloqueada", "Declaraste esta corrida como existencia de apertura: su madera es anterior al libro y no sale de una compra.");
  }
  if (corrida.congelado) return sinFilas("bloqueada", "El costo de esta corrida está congelado: su materia prima ya no cambia.");
  if (corrida.mesCerrado) return sinFilas("bloqueada", `El mes ${corrida.mesCerrado} está cerrado: reábrelo para cambiar la materia prima de esta corrida.`);
  if (declarado == null) {
    return sinFilas("bloqueada", "La corrida no dice cuántos m³ de troza entraron: elige sus guías a mano con «Editar atribución».");
  }
  if (faltaM3 <= TOLERANCIA_M3) return sinFilas("ya_atribuida", null);
  if (!especie) return sinFilas("nada", "La corrida no tiene especie: no se sabe de qué guía saldría su madera.");

  const clave = claveEspecie(especie);
  const deLaEspecie = ingresos.filter((i) => claveEspecie(i.especie) === clave && !ESTADOS_MUERTOS.has(i.status));
  if (deLaEspecie.length === 0) {
    const enOtraFila = ingresos
      .filter((i) => !ESTADOS_MUERTOS.has(i.status))
      .map((i) => ({
        gtf: i.gtf,
        fila: i.especie?.trim() || "otra especie",
        n: Object.entries(i.trozasPorEspecie ?? {}).reduce((a, [e, n]) => a + (claveEspecie(e) === clave ? n : 0), 0),
      }))
      .filter((f) => f.n > 0);
    if (enOtraFila.length > 0) return sinFilas("nada", motivoTrozasEnOtraFila(especie, enOtraFila));
    return sinFilas(
      "nada",
      `No hay ningún ingreso de ${especie} en el libro: esta madera no tiene guía que la respalde ante SERFOR. Registra su guía en Ingresos.`,
    );
  }

  const usadoPorEsta = new Map<string, number>();
  for (const c of actuales) usadoPorEsta.set(c.woodEntryId, r4((usadoPorEsta.get(c.woodEntryId) ?? 0) + c.volumeM3));
  const tercero = corrida.duenoMadera === "tercero";
  const titular = tercero ? corrida.titularNombre?.trim() || null : null;
  const descartes: Descartes = { posteriores: [], sinSaldo: 0, sinValidar: 0, otroPermiso: 0, otroDueno: 0 };
  const candidatos: { ingreso: IngresoParaCompra; llegada: string | null; libre: number }[] = [];
  for (const i of deLaEspecie) {
    const llegada = diaDelLibro(i.llegada);
    if (!ESTADOS_LIBRES.has(i.status)) {
      descartes.sinValidar++;
      continue;
    }
    if (fecha && llegada && llegada > fecha) {
      descartes.posteriores.push(llegada);
      continue;
    }
    /* Propia con propia; la de un tercero, sólo con la de ESE tercero (si los dos lo dicen). */
    if (i.deTercero !== tercero || (titular && i.duenoNombre?.trim() && nombre(i.duenoNombre) !== nombre(titular))) {
      descartes.otroDueno++;
      continue;
    }
    if (!mismoPermiso(i.permiso, corrida.permiso)) {
      descartes.otroPermiso++;
      continue;
    }
    const libre = r4(i.volumenM3 - i.usadoPorOtrasM3 - (usadoPorEsta.get(i.id) ?? 0));
    if (libre <= TOLERANCIA_M3) {
      descartes.sinSaldo++;
      continue;
    }
    candidatos.push({ ingreso: i, llegada, libre });
  }

  candidatos.sort(fifo);

  /* Corrida SIN permiso: `mismoPermiso` deja pasar a todas, pero una corrida
     sale de UN título (el lote sería de dos: `deUnSoloPermiso` en
     `vincular-trozas.ts` y `origen-en-tanda.ts`). Manda el título que la
     corrida ya consume; si no consume nada, el de la guía más vieja (FIFO: es
     la primera que se toma). Las guías sin permiso declarado acompañan a
     cualquiera. Revisión 08-10: proponía «GTF-A 4 + GTF-B 6» de dos títulos, y
     en Blas y main ninguna corrida tiene permiso. */
  let delTitulo = candidatos;
  if (!clavePermiso(corrida.permiso)) {
    const yaConsume = actuales
      .map((c) => porId.get(c.woodEntryId))
      .filter((i): i is IngresoParaCompra => !!i)
      .map((ingreso) => ({ ingreso, llegada: diaDelLibro(ingreso.llegada) }))
      .sort(fifo);
    const manda = [...yaConsume, ...candidatos].find((c) => clavePermiso(c.ingreso.permiso));
    const titulo = manda ? clavePermiso(manda.ingreso.permiso) : null;
    if (manda && titulo) {
      delTitulo = candidatos.filter((c) => {
        const k = clavePermiso(c.ingreso.permiso);
        return !k || k === titulo;
      });
      descartes.otroPermiso += candidatos.length - delTitulo.length;
      if (delTitulo.length < candidatos.length) descartes.tituloElegido = manda.ingreso.permiso.codigo?.trim() || `el de la guía ${manda.ingreso.gtf}`;
    }
  }

  const filas: FilaPropuesta[] = [];
  let resta = faltaM3;
  for (const c of delTitulo) {
    if (resta <= TOLERANCIA_M3) break;
    const m3 = r4(Math.min(resta, c.libre));
    filas.push({
      woodEntryId: c.ingreso.id,
      gtf: c.ingreso.gtf,
      llegada: c.llegada,
      m3,
      libreM3: c.libre,
      costoUnitario: c.ingreso.costoUnitario,
      moneda: c.ingreso.moneda,
    });
    resta = r4(resta - m3);
  }

  if (filas.length === 0) return sinFilas("nada", motivoSinFilas(especie, descartes) || `Ninguna guía de ${especie} tiene saldo para esta corrida.`);

  const cubreM3 = r4(filas.reduce((a, f) => a + f.m3, 0));
  const quedaM3 = r4(Math.max(0, faltaM3 - cubreM3));
  const completa = quedaM3 <= TOLERANCIA_M3;
  const porQue = motivoSinFilas(especie, descartes);
  return {
    ...base,
    filas,
    cubreM3,
    quedaM3: completa ? 0 : quedaM3,
    estado: completa ? "completa" : "parcial",
    motivo: completa
      ? null
      : `Las guías de ${especie} con saldo cubren ${fmtM3(cubreM3)} de ${fmtM3(faltaM3)} m³: ${fmtM3(quedaM3)} m³ quedan sin atribuir.` +
        (porQue ? ` ${porQue}` : ""),
    guiasSinCosto: sinCostoDe([...actuales.map((c) => c.woodEntryId), ...filas.map((f) => f.woodEntryId)]),
    monedasMezcladas: mezclaMonedas([...actuales.map((c) => c.woodEntryId), ...filas.map((f) => f.woodEntryId)]),
    firma: firmaDePropuesta(corrida.id, atribuidoM3, filas),
  };
}

// ── Especies aserradas sin ingreso ───────────────────────────────────────────

export interface CorridaParaRiesgo {
  lineNo: number;
  especie: string | null;
  /** m³ de troza declarados (`volumeInputM3`). */
  m3Troza: number | null;
  paquetes: number;
  aperturaDeclarada: boolean;
}

export interface EspecieSinIngreso {
  especie: string;
  corridas: number;
  lineNos: number[];
  m3Troza: number;
  paquetes: number;
  /** Corridas de la especie declaradas como existencia de apertura (ADR-394). */
  conApertura: number;
}

/**
 * Las especies que se asierran (corridas vivas, y con ellas sus paquetes) sin
 * NINGÚN ingreso de esa especie en el libro. `especiesConIngreso` trae las de
 * las guías vivas y las de sus trozas (una troza de Pashaco colgada de la fila
 * de Cumala sigue siendo madera de Pashaco que entró con guía).
 */
export function especiesSinIngreso(
  corridas: readonly CorridaParaRiesgo[],
  especiesConIngreso: Iterable<string | null | undefined>,
): EspecieSinIngreso[] {
  const conIngreso = new Set<string>();
  for (const e of especiesConIngreso) {
    const k = claveEspecie(e);
    if (k) conIngreso.add(k);
  }
  const porClave = new Map<string, EspecieSinIngreso>();
  for (const c of corridas) {
    const k = claveEspecie(c.especie);
    if (!k || conIngreso.has(k)) continue;
    const fila = porClave.get(k) ?? { especie: (c.especie ?? "").trim(), corridas: 0, lineNos: [], m3Troza: 0, paquetes: 0, conApertura: 0 };
    fila.corridas++;
    fila.lineNos.push(c.lineNo);
    fila.m3Troza = r4(fila.m3Troza + (c.m3Troza ?? 0));
    fila.paquetes += c.paquetes;
    if (c.aperturaDeclarada) fila.conApertura++;
    porClave.set(k, fila);
  }
  return [...porClave.values()]
    .map((f) => ({ ...f, lineNos: [...f.lineNos].sort((a, b) => a - b) }))
    .sort((a, b) => b.m3Troza - a.m3Troza || a.especie.localeCompare(b.especie, "es"));
}
