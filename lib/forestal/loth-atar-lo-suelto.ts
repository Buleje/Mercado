/**
 * «Atar lo suelto» (24-10, Brandon: «cada guía y troza atada a su plan; si el
 * permiso no existe, "Crear el plan desde la guía"»).
 *
 * Una guía sin plan —y sus trozas— cuenta en el saldo de TODOS los planes
 * (ADR-459): el saldo de cada uno se ve más gastado de lo que está. Acá vive lo
 * puro de atarla:
 *
 *   · `sugerirPlanDeLaGuia` — a qué plan va, por el título que imprime la guía
 *     (tramo a tramo, `claveTitulo`, la regla del importador) y, si el título no
 *     está, por el titular SÓLO cuando un único plan lo tiene. Es una sugerencia:
 *     la persona confirma.
 *   · `planDesdeLaGuia` — el plan que se crearía con los datos de la guía
 *     (código, tipo, titular, ATFFS, ubicación, especies con sus trozas y m³).
 *     Lo autorizado NO sale de la guía: lo pide la ventana (nunca se inventa).
 *
 * Se usa en el servidor (importa al importador de guías, que es grande).
 */

import { claveTitulo, tipoPlanDeLaGuia } from "./loth-importar-guia";
import type { TipoPlanImportado } from "./loth-importar-guia-tipos";
import { leerGtfDatos } from "./ctp-gtf-datos";
import { piezasDeItems } from "./loth-guia-despacho";
import { claveEspecie } from "./loth-constants";
import { fmtM3 } from "./cubicacion-formato";
import { saldoDelPlan, type MovimientoDelSaldo } from "./loth-saldo-cascada";
import { excedeTechoM3 } from "./loth-t6";

/** Un plan vivo del negocio, con lo que hace falta para reconocerlo. */
export interface PlanParaSugerir {
  id: string;
  planNumber: string | null;
  tituloHabilitante: string | null;
  titularName: string;
}

export interface PlanSugerido {
  planId: string;
  /** Por qué: el título de la guía es el del plan, o (sin título que cruce) el titular. */
  via: "titulo" | "titular";
}

/** La guía tal como está en el libro (`ForestGtf`), con lo que hace falta para sugerir y proponer. */
export interface GuiaSinPlan {
  gtfNumber: string;
  tituloHabilitante: string | null;
  titularName: string | null;
  origen?: string | null;
  items: unknown;
  gtfDatos: unknown;
}

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const txt = (v: string | null | undefined): string => (/[A-Za-z0-9]/.test(v ?? "") ? (v ?? "").trim() : "");
const oNull = (v: string | null | undefined): string | null => txt(v) || null;

/** El titular sin tildes, puntuación ni dobles espacios: «Comunidad Nativa Séptimo» = «COMUNIDAD NATIVA SEPTIMO». */
export function claveTitular(nombre: string | null | undefined): string {
  return claveEspecie((nombre ?? "").replace(/[.,;:"'´`]/g, " "));
}

/** Los títulos que la guía cita: la columna del libro y los que imprime (casillero de títulos). */
export function titulosDeLaGuia(g: Pick<GuiaSinPlan, "tituloHabilitante" | "gtfDatos">): string[] {
  const datos = leerGtfDatos(g.gtfDatos);
  return [...new Set([g.tituloHabilitante, ...datos.titulos].map(txt).filter(Boolean))];
}

/** El titular que la guía declara: la columna del libro o el propietario de la madera (si no es el CTP). */
export function titularDeLaGuia(g: Pick<GuiaSinPlan, "titularName" | "gtfDatos">): string | null {
  const datos = leerGtfDatos(g.gtfDatos);
  return oNull(g.titularName) ?? (datos.propietario.esElCtp ? null : oNull(datos.propietario.nombre));
}

/**
 * ¿A qué plan va la guía? Por el título (tramo a tramo, sin ceros a la izquierda)
 * contra el N° y el título de cada plan; si ninguno cruza, por el titular —sólo
 * si UN plan lo tiene—. Dos planes con el mismo título o el mismo titular = sin
 * sugerencia: no se adivina.
 */
export function sugerirPlanDeLaGuia(
  g: Pick<GuiaSinPlan, "tituloHabilitante" | "titularName" | "gtfDatos">,
  planes: readonly PlanParaSugerir[],
): PlanSugerido | null {
  const claves = new Set(titulosDeLaGuia(g).map(claveTitulo).filter((c): c is string => c != null));
  if (claves.size > 0) {
    const porTitulo = planes.filter((p) => [p.planNumber, p.tituloHabilitante].some((c) => {
      const k = claveTitulo(c);
      return k != null && claves.has(k);
    }));
    if (porTitulo.length === 1) return { planId: porTitulo[0].id, via: "titulo" };
    if (porTitulo.length > 1) return null;
  }
  const titular = claveTitular(titularDeLaGuia(g));
  if (!titular) return null;
  const porTitular = planes.filter((p) => claveTitular(p.titularName) === titular);
  return porTitular.length === 1 ? { planId: porTitular[0].id, via: "titular" } : null;
}

/** Una especie de la guía: lo que salió con ella (de sus items). */
export interface EspecieDeLaGuia {
  especie: string;
  cientifico: string | null;
  cites: boolean;
  trozas: number;
  m3: number;
}

/** El plan que se crearía con la guía. Lo autorizado no está: lo pide la ventana. */
export interface PlanDesdeLaGuia {
  /** El título que se cruza ante SERFOR; `null` = la guía no cita ninguno (no se puede crear desde ella). */
  codigo: string | null;
  planType: TipoPlanImportado;
  plantacion: boolean;
  planNumber: string | null;
  tituloHabilitante: string | null;
  /** `null` = la guía no lo dice: hay que escribirlo. */
  titularName: string | null;
  propietarioDocTipo: string | null;
  propietarioDoc: string | null;
  representanteLegal: string | null;
  resolucionNumber: string | null;
  arffs: string | null;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  especies: EspecieDeLaGuia[];
}

/** «Puerto Bermúdez, Oxapampa, Pasco» (la columna `origen`) → distrito, provincia, departamento. */
function lugarDelOrigen(origen: string | null | undefined): { distrito: string | null; provincia: string | null; region: string | null } {
  const tramos = (origen ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (tramos.length < 4) return { distrito: null, provincia: null, region: null };
  const [distrito, provincia, region] = tramos.slice(-3);
  return { distrito: oNull(distrito), provincia: oNull(provincia), region: oNull(region) };
}

export function planDesdeLaGuia(g: GuiaSinPlan): PlanDesdeLaGuia {
  const datos = leerGtfDatos(g.gtfDatos);
  const codigo = titulosDeLaGuia(g)[0] ?? null;
  const planType = tipoPlanDeLaGuia(datos.guia.origenRecurso, codigo);
  const plantacion = planType === "PLANTACION";
  const prop = datos.propietario.esElCtp ? null : datos.propietario;
  const partida = datos.traslado.partida;
  const delOrigen = lugarDelOrigen(g.origen);
  const lugar = (a: string, b: string, c: string | null) => oNull(a) ?? oNull(b) ?? c;

  const porEspecie = new Map<string, EspecieDeLaGuia>();
  for (const p of piezasDeItems(g.items)) {
    const especie = p.comun?.trim();
    if (!especie) continue;
    const k = claveEspecie(especie);
    const prev = porEspecie.get(k);
    porEspecie.set(k, {
      especie: prev?.especie ?? especie,
      cientifico: prev?.cientifico ?? p.cientifico ?? null,
      cites: (prev?.cites ?? false) || p.cites,
      trozas: (prev?.trozas ?? 0) + 1,
      m3: r4((prev?.m3 ?? 0) + Math.max(0, p.volumeM3 ?? 0)),
    });
  }

  return {
    codigo,
    planType,
    plantacion,
    planNumber: plantacion ? codigo : null,
    tituloHabilitante: plantacion ? null : codigo,
    titularName: titularDeLaGuia(g),
    propietarioDocTipo: prop && oNull(prop.docNumero) ? prop.docTipo : null,
    propietarioDoc: prop ? oNull(prop.docNumero) : null,
    representanteLegal: oNull(datos.guia.representanteLegal),
    resolucionNumber: oNull(datos.guia.resolucion),
    arffs: oNull(datos.guia.autoridad),
    region: lugar(partida.departamento, datos.guia.departamento, delOrigen.region),
    provincia: lugar(partida.provincia, datos.guia.provincia, delOrigen.provincia),
    distrito: lugar(partida.distrito, datos.guia.distrito, delOrigen.distrito),
    especies: [...porEspecie.values()].sort((a, b) => b.m3 - a.m3 || a.especie.localeCompare(b.especie, "es")),
  };
}

/** La nota del plan creado así (rastro en su ficha, como `notaPlanImportado`). */
export const notaPlanDesdeLaGuia = (gtfNumber: string): string =>
  `Creado desde la GTF ${gtfNumber} con «Atar lo suelto»: lo autorizado lo escribió quien lo creó.`;

/**
 * Lo autorizado que escribió la persona, por especie (revisión 25-10): dos filas
 * de la misma especie («Tornillo» y «TORNILLO») SUMAN —como suma `medidasT6` dos
 * filas del registro—; nunca gana la última en silencio.
 */
export function autorizadoPorEspecie(
  especies: readonly { especie: string; volumenAutorizadoM3: number }[],
): Map<string, { especie: string; volumenAutorizadoM3: number }> {
  const out = new Map<string, { especie: string; volumenAutorizadoM3: number }>();
  for (const e of especies) {
    const k = claveEspecie(e.especie);
    const prev = out.get(k);
    out.set(k, { especie: prev?.especie ?? e.especie.trim(), volumenAutorizadoM3: r4((prev?.volumenAutorizadoM3 ?? 0) + e.volumenAutorizadoM3) });
  }
  return out;
}

/** Lo que el plan nuevo ya lleva usado de una especie de la guía apenas se crea. */
export interface MinimoDelPlanNuevo {
  clave: string;
  especie: string;
  /** Lo que mueve ESTA guía en el libro (sus despachos sin plan). */
  estaGuiaM3: number;
  /** Lo sin plan de OTRAS guías: cuenta en el saldo de todo plan (ADR-459). */
  otrasSinPlanM3: number;
  /** = lo que T6 mide en el plan nuevo al atarle la guía: lo autorizado no puede ser menos. */
  minimoM3: number;
}

/** Un id que ningún plan tiene: con él, `saldoDelPlan` cuenta SÓLO lo sin plan. */
const PLAN_NUEVO = "\u0000plan-nuevo";

/**
 * «Crear el plan desde la guía» (revisión 25-10): al atarle la guía, T6 mide el
 * plan nuevo con esta guía MÁS todo lo sin plan del libro de la especie (ADR-459:
 * lo sin plan cuenta en el saldo de cada plan). Lo autorizado tiene que cubrir
 * las dos cosas; esto dice cuánto es cada una. `sinPlan` = las líneas sin plan
 * y el Trozado de otro plan de sus trozas despachadas (sólo da el volumen; el
 * resto de las líneas de un plan se descartan igual, `saldoDelPlan`).
 */
export function minimoDelPlanDesdeLaGuia(
  especies: readonly EspecieDeLaGuia[],
  sinPlan: readonly MovimientoDelSaldo[],
  gtfNumber: string,
): MinimoDelPlanNuevo[] {
  if (especies.length === 0) return [];
  const claves = new Set(especies.map((e) => claveEspecie(e.especie)));
  const s = saldoDelPlan(
    especies.map((e) => ({ speciesCommon: e.especie, speciesScientific: e.cientifico, cites: e.cites, volumenAutorizadoM3: 0 })),
    sinPlan,
    PLAN_NUEVO,
  );
  const numero = gtfNumber.trim();
  return s.especies
    .filter((e) => claves.has(e.clave))
    .map((e) => {
      const estaGuia = r4(e.guias.filter((g) => g.sinPlan && g.gtfNumber === numero).reduce((a, g) => a + g.m3, 0));
      return { clave: e.clave, especie: e.especie, estaGuiaM3: estaGuia, otrasSinPlanM3: r4(Math.max(0, e.usadoM3 - estaGuia)), minimoM3: e.usadoM3 };
    });
}

/**
 * La especie cuyo autorizado no cubre lo que el plan nuevo ya lleva (mismo
 * redondeo que T6: `excedeTechoM3`). `valores` va en el orden de `especies`;
 * `null` = no se escribió (sin techo no hay T6). `null` = todo cubierto.
 */
export function faltaDelMinimo(
  especies: readonly EspecieDeLaGuia[],
  valores: readonly (number | null)[],
  minimos: readonly MinimoDelPlanNuevo[],
  techo: string,
): string | null {
  for (const [i, e] of especies.entries()) {
    const v = valores[i];
    const m = minimos.find((x) => x.clave === claveEspecie(e.especie));
    if (v == null || !Number.isFinite(v) || !m || !excedeTechoM3(m.minimoM3, v)) continue;
    return m.otrasSinPlanM3 > 0
      ? `${e.especie}: lo ${techo} tiene que cubrir esta guía (${fmtM3(m.estaGuiaM3)} m³) y lo sin plan de otras guías (${fmtM3(m.otrasSinPlanM3)} m³), que también cuenta en el saldo del plan nuevo: al menos ${fmtM3(m.minimoM3)} m³.`
      : `${e.especie}: lo ${techo} tiene que cubrir lo que esta guía ya despachó (${fmtM3(m.minimoM3)} m³).`;
  }
  return null;
}
