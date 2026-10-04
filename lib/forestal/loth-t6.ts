/**
 * T6 — lo MOVILIZADO de una especie no puede pasar lo AUTORIZADO por el
 * título habilitante (POA), o lo REGISTRADO de una plantación (ADR-459). Es el
 * tope legal de lo despachado: no admite motivo.
 *
 * La parte PURA, compartida por las dos puntas (04-10):
 *  - el despacho (`ForestLothDB.enforceT6`, con lock sobre las filas de la
 *    especie) decide con `claveT6` + `excedeT6` y rechaza con `mensajeT6`;
 *  - la vista previa del importador de guías (ADR-461) mide lo mismo sin lock
 *    ni escritura (`despachoT6DeLaGuia`), para no ofrecer un motivo T9 a una
 *    guía que T6 rechazaría igual.
 * La lectura (lo autorizado y lo ya movilizado de la clave) es una sola:
 * `ForestLothDB.medidaT6`.
 *
 * PURO y client-safe.
 */
import { fmtM3 } from "./cubicacion-formato";
import { claveEspecie, resolverEspecie, type EspecieReconocible } from "./loth-constants";
import type { SobreAutorizadoDeLaGuia } from "./loth-importar-guia-tipos";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** La clave de la especie DEL PLAN que pone el techo (`resolverEspecie`, como T7). `null` = no es del plan: sin techo. */
export function claveT6(
  delPlan: readonly EspecieReconocible[],
  comun: string | null | undefined,
  cientifico?: string | null,
): string | null {
  const suya = resolverEspecie(delPlan, comun, cientifico);
  return suya ? claveEspecie(suya.speciesCommon) : null;
}

/** Lo que mide T6 de una especie en un plan. `autorizado: null` = el plan no le pone techo. */
export interface MedidaT6 {
  autorizado: number | null;
  movilizado: number;
}

/** ¿Despachar `nuevo` m³ más pasa el techo? (a 4 decimales, como siempre). */
export const excedeT6 = (m: MedidaT6, nuevo: number): boolean =>
  m.autorizado != null && r4(m.movilizado + nuevo) > r4(m.autorizado);

/** El rechazo `T6_EXCESO_AUTORIZADO` del servidor, palabra por palabra. */
export function mensajeT6(species: string, m: { autorizado: number; movilizado: number }, nuevo: number, plantacion: boolean): string {
  const [techo, exceso] = plantacion
    ? [`El registro de la plantación tiene ${r4(m.autorizado)} m³ de ${species}`, "excede lo registrado"]
    : [`El POA autoriza ${r4(m.autorizado)} m³ de ${species}`, "excede lo autorizado"];
  return (
    `${techo} y ya se movilizaron ${r4(m.movilizado)} m³; ` +
    `este despacho de ${r4(nuevo)} m³ ${exceso}. Es la infracción que sanciona OSINFOR.`
  );
}

/** T6 de un plan para la vista previa: sus especies y la medida de cada clave que traen las guías. */
export interface EstadoT6DelPlan {
  delPlan: readonly EspecieReconocible[];
  medidas: ReadonlyMap<string, MedidaT6>;
}

/** Una troza que la guía despacharía: con la especie y el volumen de SU línea de Trozado. */
export interface DespachoT6 {
  speciesCommon: string | null;
  speciesScientific: string | null;
  volumeM3: number | null;
}

/**
 * Lo que la guía despacha por encima del techo, especie por especie, contando
 * lo que ya salió (`medidas`) y lo que despachan antes las guías de la misma
 * tanda (`previo`, clave → m³). El servidor mide troza por troza y frena en la
 * primera que pasa; como los volúmenes sólo suman, eso pasa sí y sólo sí la
 * suma de la guía lo pasa.
 */
export function despachoT6DeLaGuia(
  trozas: readonly DespachoT6[],
  estado: EstadoT6DelPlan,
  previo: ReadonlyMap<string, number>,
  plantacion: boolean,
): { excesos: SobreAutorizadoDeLaGuia[]; despacha: Map<string, number> } {
  const despacha = new Map<string, number>();
  const nombre = new Map<string, string>();
  for (const t of trozas) {
    const species = t.speciesCommon?.trim() || null;
    const vol = t.volumeM3 ?? 0;
    if (!species || !(vol > 0)) continue;
    const clave = claveT6(estado.delPlan, species, t.speciesScientific);
    if (!clave) continue;
    despacha.set(clave, (despacha.get(clave) ?? 0) + vol);
    if (!nombre.has(clave)) nombre.set(clave, species);
  }
  const excesos: SobreAutorizadoDeLaGuia[] = [];
  for (const [clave, suma] of despacha) {
    const m = estado.medidas.get(clave);
    if (!m || m.autorizado == null) continue;
    const yaSalio = r4(m.movilizado + (previo.get(clave) ?? 0));
    if (!excedeT6({ autorizado: m.autorizado, movilizado: yaSalio }, suma)) continue;
    const especie = nombre.get(clave) ?? clave;
    const permiso = plantacion ? "el registro de la plantación tiene" : "el permiso autoriza";
    const mensaje =
      yaSalio > 0
        ? `ya salieron ${fmtM3(yaSalio)} m³ de ${especie}, esta guía despacha ${fmtM3(suma)} m³ más y ${permiso} ${fmtM3(m.autorizado)} m³`
        : `despacha ${fmtM3(suma)} m³ de ${especie} y ${permiso} ${fmtM3(m.autorizado)} m³`;
    excesos.push({
      especie,
      autorizadoM3: r4(m.autorizado),
      yaSalioM3: yaSalio,
      despachaM3: r4(suma),
      excesoM3: r4(yaSalio + suma - m.autorizado),
      plantacion,
      mensaje,
    });
  }
  return { excesos, despacha };
}

/** La línea del aviso: «No se puede importar, ni con motivo: despacha 50 m³ de …». */
export const avisoT6DeLaGuia = (excesos: readonly SobreAutorizadoDeLaGuia[]): string =>
  `No se puede importar, ni con motivo: ${excesos.map((e) => e.mensaje).join("; ")}.`;
