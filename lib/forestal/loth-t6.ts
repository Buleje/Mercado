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

/** A litros (3 decimales): lo que se escribe en la guía y en el libro, y lo que dice `fmtM3`. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * LA regla del techo en m³ (25-10, revisión del freno): `usado` pasa `techo`
 * sólo si lo pasa a 3 decimales. Una sola para el freno de la guía, el 422, la
 * cascada y el semáforo: con 4 decimales, 2,0003 sobre 2,000 frenaba con «Te
 * pasas por 0,000 m³»; con la tolerancia de 0,01 de la cascada, 161,265 sobre
 * 161,258 se veía en verde y la guía se frenaba. Siempre `≤`: en el borde, pasa.
 */
export const excedeTechoM3 = (usado: number, techo: number): boolean => r3(usado) > r3(techo);

/** ¿Despachar `nuevo` m³ más pasa el techo? (`excedeTechoM3`). */
export const excedeT6 = (m: MedidaT6, nuevo: number): boolean =>
  m.autorizado != null && excedeTechoM3(m.movilizado + nuevo, m.autorizado);

/** Cuánto pasa el techo `movilizado + nuevo`, a 3 decimales como `excedeTechoM3`; ≤ 0 = no pasa. */
export const excesoT6 = (m: { autorizado: number; movilizado: number }, nuevo: number): number =>
  r3(r3(m.movilizado + nuevo) - r3(m.autorizado));

/**
 * La frase que abre el rechazo (24-10, Brandon: «te pasas por 3,2 m³»):
 * «Te pasas por 3,200 m³ de Tornillo: el plan 096 tiene 2,000 m³ de saldo.»
 * La misma en la pantalla (antes de enviar, `frenoDeSaldo`) y en el 422 del
 * servidor. Con el saldo ya en cero o debajo, dice que no queda.
 */
export function tePasasT6(species: string, m: { autorizado: number; movilizado: number }, nuevo: number, plan: string | null): string {
  const exceso = excesoT6(m, nuevo);
  const saldo = r3(r3(m.autorizado) - r3(m.movilizado));
  const delPlan = plan?.trim() ? `el plan ${plan.trim()}` : "el plan";
  return saldo > 0
    ? `Te pasas por ${fmtM3(exceso)} m³ de ${species}: ${delPlan} tiene ${fmtM3(saldo)} m³ de saldo.`
    : `Te pasas por ${fmtM3(exceso)} m³ de ${species}: ${delPlan} ya no tiene saldo de ${species}.`;
}

/**
 * El rechazo `T6_EXCESO_AUTORIZADO` del servidor, palabra por palabra (16-10: con cuánto se pasa).
 * Con `plan` (su N° o título; `null` = sin nombre), abre con `tePasasT6`.
 */
export function mensajeT6(
  species: string,
  m: { autorizado: number; movilizado: number },
  nuevo: number,
  plantacion: boolean,
  plan?: string | null,
): string {
  const [techo, exceso] = plantacion
    ? [`El registro de la plantación tiene ${r4(m.autorizado)} m³ de ${species}`, "excede lo registrado"]
    : [`El POA autoriza ${r4(m.autorizado)} m³ de ${species}`, "excede lo autorizado"];
  const pasa = excesoT6(m, nuevo);
  const abre = plan !== undefined && pasa > 0 ? `${tePasasT6(species, m, nuevo, plan)} ` : "";
  return (
    `${abre}${techo} y ya se movilizaron ${r4(m.movilizado)} m³; ` +
    `este despacho de ${r4(nuevo)} m³ ${exceso}${pasa > 0 ? ` en ${pasa} m³` : ""}. Es la infracción que sanciona OSINFOR.`
  );
}

/**
 * Lo que sale SIN plan y ningún plan vigente lo autoriza (25-10, segunda
 * revisión del freno): con planes vigentes que tienen especies cargadas y
 * ninguno con ésta, no hay saldo contra qué medirla. Es un AVISO de la pantalla
 * del despacho (`frenoSinPlan`), no un rechazo: el servidor no lo frena (T7
 * sólo juzga la línea con plan; en Blas todos los planes son sólo Tornillo y
 * frenar rechazaba la madera de un título sin su plan cargado).
 */
export const ningunPlanAutorizaT6 = (species: string): string =>
  `Ningún plan vigente autoriza ${species}. Si es de un título tuyo, crea su plan en Planes.`;

/**
 * La cabecera del rechazo con VARIOS saldos que se pasan: lo sin plan cuenta en
 * el saldo de cada plan vigente (ADR-459) y puede pasar a más de uno a la vez.
 */
export function cabeceraT6(excesos: readonly { planId: string; species: string }[]): string {
  const planes = new Set(excesos.map((e) => e.planId)).size;
  return planes > 1
    ? `Se pasa de lo autorizado en ${planes} planes: lo despachado sin plan cuenta en el saldo de cada uno.`
    : `${excesos.length} especies se pasan de lo autorizado.`;
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
      excesoM3: excesoT6({ autorizado: m.autorizado, movilizado: yaSalio }, suma),
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
      const excesoM3 = excesoT6({ autorizado: e.autorizado, movilizado: e.antes }, e.despacha);
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
