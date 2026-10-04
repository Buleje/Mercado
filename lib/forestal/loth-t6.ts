/**
 * T6 — lo MOVILIZADO de una especie no puede pasar lo AUTORIZADO por el
 * título habilitante (POA), o lo REGISTRADO de una plantación (ADR-459). Es el
 * tope legal de lo despachado: no admite motivo. Única excepción (ADR-468,
 * 04-10): el IMPORTADOR de guías ya despachadas deja pasar una guía que SERFOR
 * ya emitió (verificada por el servidor), con motivo y rol admin/dueño, y deja
 * el evento `loth_despacho_sobre_autorizado`. El despacho a mano no cambia.
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

// ── T6 con motivo: la guía que SERFOR ya emitió (ADR-468) ───────────────────

/**
 * Quién puede importar con motivo una guía VERIFICADA en SERFOR que pasa T6:
 * admin o dueño, como T9. Sale del JWT en las dos rutas (importar decide,
 * la vista previa no le ofrece el motivo a quien no puede); nunca del cuerpo.
 */
export const ROLES_T6_CON_MOTIVO: readonly string[] = ["admin", "owner"];
export const puedePasarT6ConMotivo = (role: string | null | undefined): boolean => ROLES_T6_CON_MOTIVO.includes(role ?? "");

/**
 * Lo que el despacho de UNA guía movió de una especie con techo, troza por
 * troza (`ForestLothDB.enforceT6` con excepción): lo que ya había salido antes
 * de su 1.ª troza y lo que despachó la guía. Lo arma el servidor bajo el lock
 * de la especie; el importador lo usa para el evento de OSINFOR.
 */
export interface DespachoT6DeLaEspecie {
  especie: string;
  clave: string;
  autorizado: number;
  /** Lo movilizado antes de la 1.ª troza de esta especie en la guía, m³. */
  antes: number;
  /** Lo que despacha la guía de la especie, m³. */
  despacha: number;
}

/** Anota una troza en lo que la guía despacha de su especie (`m` = la medida releída bajo el lock, ANTES de esta troza). */
export function anotarDespachoT6(
  acc: Map<string, DespachoT6DeLaEspecie>,
  clave: string,
  especie: string,
  m: { autorizado: number; movilizado: number },
  nuevo: number,
): void {
  const e = acc.get(clave) ?? { especie, clave, autorizado: m.autorizado, antes: r4(m.movilizado), despacha: 0 };
  acc.set(clave, { ...e, autorizado: m.autorizado, despacha: r4(e.despacha + nuevo) });
}

/** Un exceso de T6 del despacho de una guía: el acumulado y lo que aporta ESTA guía. */
export type ExcesoT6DeLaGuia = DespachoT6DeLaEspecie & {
  /** Σ movilizado con la guía − techo (en una tanda, incluye lo de las guías anteriores). */
  excesoM3: number;
  /** Lo que pone ESTA guía de ese exceso: `min(despacha, exceso)`. */
  aporteM3: number;
};

/** Las especies que la guía deja por encima del techo, con su exceso (Σ − techo). Misma regla que `excedeT6`. */
export function excesosDelDespacho(acc: ReadonlyMap<string, DespachoT6DeLaEspecie>): ExcesoT6DeLaGuia[] {
  return [...acc.values()]
    .filter((e) => excedeT6({ autorizado: e.autorizado, movilizado: e.antes }, e.despacha))
    .map((e) => {
      const excesoM3 = r4(e.antes + e.despacha - e.autorizado);
      return { ...e, excesoM3, aporteM3: r4(Math.min(e.despacha, excesoM3)) };
    });
}

/** El detalle del evento `loth_despacho_sobre_autorizado` (la cuenta entera + el motivo). */
export function detalleDespachoSobreAutorizado(
  e: ExcesoT6DeLaGuia,
  guia: { gtfNumber: string; registro: string },
  motivo: string,
  plantacion: boolean,
): string {
  const techo = plantacion ? "registrados de la plantación" : "autorizados";
  return (
    `GTF ${guia.gtfNumber}${guia.registro ? ` (registro SERFOR ${guia.registro})` : ""}, verificada en SERFOR, ` +
    `despachó ${e.especie} sobre lo ${plantacion ? "registrado" : "autorizado"}: ya habían salido ${fmtM3(e.antes)} m³ + ` +
    `esta guía ${fmtM3(e.despacha)} m³ = ${fmtM3(r4(e.antes + e.despacha))} de ${fmtM3(e.autorizado)} m³ ${techo} — ` +
    `exceso ${fmtM3(e.excesoM3)} m³, de los que esta guía aporta ${fmtM3(e.aporteM3)} m³. Motivo: ${motivo}`
  );
}

/** La línea del aviso de una guía VERIFICADA que pasa T6 pero no se exime (`porQueNoAplicaExcepcionT6`). */
export const avisoT6SinExcepcion = (excesos: readonly SobreAutorizadoDeLaGuia[], razon: string): string =>
  `No se puede importar, ni con motivo: ${excesos.map((e) => e.mensaje).join("; ")}. Aunque está verificada en SERFOR, ${razon}.`;

/** La línea del aviso de una guía VERIFICADA que pasa T6 cuando quien mira no es admin ni dueño. */
export const avisoT6SoloDueno = (excesos: readonly SobreAutorizadoDeLaGuia[]): string =>
  `Sólo el dueño o el administrador pueden importarla, con motivo: ${excesos.map((e) => e.mensaje).join("; ")}.`;
