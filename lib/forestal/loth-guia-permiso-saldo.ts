/**
 * Lo que trae una guía sin permiso contra lo autorizado del permiso que se le
 * quiere asignar, especie por especie (15-10, Brandon: «Revisar lo autorizado
 * al asignar»).
 *
 * Es la MISMA regla del despacho, con la MISMA severidad (los dos bloquean):
 *  - T7 (`ForestLothDB.enforceT7`, momento «despacho»): la especie tiene que
 *    estar entre las del permiso. Sin especie, o permiso sin especies cargadas
 *    → no se juzga.
 *  - T6 (`ForestLothDB.enforceT6` + `loth-t6.ts`): lo ya movilizado + lo de la
 *    guía no pasa lo autorizado. Sin especie, sin volumen o sin techo → no se
 *    juzga. No admite motivo (la excepción de ADR-468 es sólo del importador).
 *
 * Antes que las dos, el cruce (15-10, revisión): una troza cuyo Trozado o cuya
 * línea de despacho ya es de OTRO permiso no se asigna — la guía quedaría con
 * un permiso y esa troza con otro. Bloquea con `TROZA_DE_OTRO_PERMISO`, por
 * troza (`mensajeTrozasDeOtroPermiso`).
 *
 * Ojo con «ya movilizado»: una guía SIN permiso ya cuenta en el saldo de TODOS
 * los permisos (ADR-459), así que lo que mide `ForestLothDB.medidaT6` HOY ya la
 * trae adentro. Acá se descuenta para decir «ya salió (sin esta guía)» y se le
 * suma la guía, como haría el despacho. Asignar no cambia el movilizado de ESE
 * permiso: sólo devuelve el saldo a los demás.
 *
 * PURO y client-safe: lo usan la vista previa (la ventana) y la transacción de
 * `ForestLothGuiaPermisoDB.asignar`, que vuelve a medir bajo el lock.
 */
import { claveEspecie, type EspecieReconocible } from "./loth-constants";
import { rechazoT7 } from "./loth-plan-especie";
import { claveT6, despachoT6DeLaGuia, mensajeT6, type MedidaT6 } from "./loth-t6";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Una troza de la guía con lo de SU línea de Trozado (la especie y el volumen los decide la base). */
export interface TrozaParaElPermiso {
  codigo: string;
  speciesCommon: string | null;
  speciesScientific: string | null;
  volumeM3: number | null;
  /** Su Trozado o su línea de despacho es de OTRO permiso: no cuenta en éste y bloquea asignar. */
  deOtroPermiso?: boolean;
  /** Ese otro permiso, como se lee (título o N° de plan). */
  otroPermiso?: string | null;
}

/** Una troza de la guía que ya es de otro permiso, y cuál. */
export interface TrozaDeOtroPermiso {
  codigo: string;
  permiso: string;
}

export type EstadoEspecieEnElPermiso = "cabe" | "pasa" | "sin_techo" | "fuera_del_permiso";

export interface EspecieDeLaGuiaEnElPermiso {
  /** Como la escribe el permiso (o la troza, si no es del permiso). */
  especie: string;
  trozas: number;
  /** Lo que despacha la guía de la especie, m³ (Σ de sus trozas). */
  guiaM3: number;
  /** `null` = el permiso no le pone techo (o no es del permiso). */
  autorizadoM3: number | null;
  /** Lo movilizado SIN esta guía, m³. */
  yaSalioM3: number | null;
  /** autorizado − ya salió − la guía: lo que queda después de asignar (negativo = se pasa). */
  quedaM3: number | null;
  estado: EstadoEspecieEnElPermiso;
}

export interface CodigoDeError {
  codigo: "TROZA_DE_OTRO_PERMISO" | "T7_ESPECIE_NO_AUTORIZADA" | "T6_EXCESO_AUTORIZADO";
  /** T7/T6: el rechazo del despacho, palabra por palabra. */
  mensaje: string;
  /** `null` en `TROZA_DE_OTRO_PERMISO` (es por troza, no por especie). */
  especie: string | null;
}

export interface SaldoDeLaGuiaEnElPermiso {
  plantacion: boolean;
  especies: EspecieDeLaGuiaEnElPermiso[];
  sinEspecie: { trozas: number; codigos: string[] };
  deOtroPermiso: { trozas: number; codigos: string[]; porTroza: TrozaDeOtroPermiso[] };
  /** El permiso no tiene especies cargadas: T7 no juzga y T6 no tiene techo. */
  permisoSinEspecies: boolean;
  /** El 1.er rechazo (el cruce de permisos; después T7 antes que T6, como en el despacho) o `null` = se puede asignar. */
  bloqueo: CodigoDeError | null;
}

/** Lo que la ventana de «Asignar permiso» muestra antes de confirmar (`GET …/guia-permiso?gtfId&planId`). */
export type SaldoDelPermisoParaLaGuia = SaldoDeLaGuiaEnElPermiso & { gtfNumber: string; planId: string };

/** Las trozas que anular la guía anula con ella: las que nacieron con ella, anotadas a mano (`GET …?trozasAManoDe`). */
export interface TrozasAManoDeLaGuia {
  trozas: number;
  codigos: string[];
}

/** «1 troza sin especie: no se puede comparar…» / «3 trozas sin especie: no se pueden comparar…». */
export function avisoSinEspecie(n: number): string {
  return n === 1
    ? "1 troza sin especie: no se puede comparar con lo autorizado"
    : `${n} trozas sin especie: no se pueden comparar con lo autorizado`;
}

/**
 * El 422 del cruce, por troza: «La troza 1-0001 de esta guía ya es de otro
 * permiso: 1-0001 (PO-2026-001)…». Con un solo permiso ajeno dice cuál asignar.
 */
export function mensajeTrozasDeOtroPermiso(porTroza: readonly TrozaDeOtroPermiso[]): string {
  const uno = porTroza.length === 1;
  const lista = porTroza.slice(0, 8).map((t) => `${t.codigo} (${t.permiso})`).join(", ");
  const mas = porTroza.length > 8 ? ` y ${porTroza.length - 8} más` : "";
  const permisos = [...new Set(porTroza.map((t) => t.permiso))];
  const salida = permisos.length === 1 ? `asígnale a la guía el permiso ${permisos[0]} o corrige antes` : "corrige antes";
  return (
    `${uno ? "1 troza de esta guía ya es" : `${porTroza.length} trozas de esta guía ya son`} de otro permiso: ${lista}${mas}. ` +
    `Una guía ampara un solo título habilitante: asignarle éste dejaría ${uno ? "esa troza" : "esas trozas"} con otro permiso que su guía. ` +
    `${salida.charAt(0).toUpperCase()}${salida.slice(1)} el permiso de ${uno ? "esa troza" : "esas trozas"}.`
  );
}

const ORDEN: Record<EstadoEspecieEnElPermiso, number> = { fuera_del_permiso: 0, pasa: 1, cabe: 2, sin_techo: 3 };

/**
 * La comparación por especie.
 *
 * @param trozas  las trozas de la guía que SALEN (con despacho vivo) y su Trozado.
 * @param delPlan las especies del permiso (`ForestLothDB.especiesT6DelPlan`).
 * @param medidas `ForestLothDB.medidaT6` por clave, de HOY: ya cuentan esta guía.
 */
export function compararGuiaConPermiso(
  trozas: readonly TrozaParaElPermiso[],
  delPlan: readonly EspecieReconocible[],
  medidas: ReadonlyMap<string, MedidaT6>,
  plantacion: boolean,
): SaldoDeLaGuiaEnElPermiso {
  const sinEspecie: string[] = [];
  const deOtroPermiso: TrozaDeOtroPermiso[] = [];
  const cuentan: TrozaParaElPermiso[] = [];
  for (const t of trozas) {
    if (t.deOtroPermiso) deOtroPermiso.push({ codigo: t.codigo, permiso: t.otroPermiso?.trim() || "otro permiso" });
    else if (!t.speciesCommon?.trim()) sinEspecie.push(t.codigo);
    else cuentan.push(t);
  }
  const permisoSinEspecies = delPlan.length === 0;

  /* Agrupar: por la especie del permiso (la clave de T6) o, si no es del permiso, por su propio nombre. */
  const grupos = new Map<string, { especie: string; delPermiso: boolean; trozas: TrozaParaElPermiso[]; m3: number }>();
  for (const t of cuentan) {
    const species = t.speciesCommon!.trim();
    const clave = claveT6(delPlan, species, t.speciesScientific);
    const delPermiso = clave != null;
    const k = delPermiso ? `p:${clave}` : `x:${claveEspecie(species)}`;
    const nombre = delPermiso ? (delPlan.find((e) => claveEspecie(e.speciesCommon) === clave)?.speciesCommon ?? species) : species;
    const g = grupos.get(k) ?? { especie: nombre, delPermiso, trozas: [], m3: 0 };
    grupos.set(k, { ...g, trozas: [...g.trozas, t], m3: r4(g.m3 + Math.max(0, t.volumeM3 ?? 0)) });
  }

  /* Lo movilizado SIN la guía: la medida de hoy menos lo que la guía ya aporta. */
  const sinLaGuia = new Map<string, MedidaT6>();
  for (const [k, g] of grupos) {
    if (!g.delPermiso) continue;
    const clave = k.slice(2);
    const m = medidas.get(clave) ?? { autorizado: null, movilizado: 0 };
    sinLaGuia.set(clave, { autorizado: m.autorizado, movilizado: Math.max(0, r4(m.movilizado - g.m3)) });
  }
  const especies: EspecieDeLaGuiaEnElPermiso[] = [];
  let bloqueoT7: CodigoDeError | null = null;
  let bloqueoT6: CodigoDeError | null = null;
  for (const [k, g] of grupos) {
    if (!g.delPermiso) {
      /* T7 con la decisión del despacho (`rechazoT7`): sin especies cargadas no se juzga. */
      const rechazo = rechazoT7(delPlan, g.trozas[0].speciesCommon, g.trozas[0].speciesScientific, plantacion);
      if (rechazo && !bloqueoT7) bloqueoT7 = { codigo: "T7_ESPECIE_NO_AUTORIZADA", mensaje: rechazo, especie: g.especie };
      especies.push({ especie: g.especie, trozas: g.trozas.length, guiaM3: g.m3, autorizadoM3: null, yaSalioM3: null, quedaM3: null, estado: rechazo ? "fuera_del_permiso" : "sin_techo" });
      continue;
    }
    const clave = k.slice(2);
    const m = sinLaGuia.get(clave)!;
    if (m.autorizado == null) {
      especies.push({ especie: g.especie, trozas: g.trozas.length, guiaM3: g.m3, autorizadoM3: null, yaSalioM3: r4(m.movilizado), quedaM3: null, estado: "sin_techo" });
      continue;
    }
    /* T6 de la guía (ADR-461): la medida SIN la guía y nada antes en la tanda. La suma pasa
       sii alguna troza pasaría; sin volumen no se juzga. El rechazo, el del servidor. */
    const pasa = despachoT6DeLaGuia(g.trozas, { delPlan, medidas: sinLaGuia }, new Map(), plantacion).excesos.length > 0;
    if (pasa && !bloqueoT6) {
      bloqueoT6 = {
        codigo: "T6_EXCESO_AUTORIZADO",
        mensaje: mensajeT6(g.especie, { autorizado: m.autorizado, movilizado: m.movilizado }, g.m3, plantacion),
        especie: g.especie,
      };
    }
    especies.push({
      especie: g.especie,
      trozas: g.trozas.length,
      guiaM3: g.m3,
      autorizadoM3: r4(m.autorizado),
      yaSalioM3: r4(m.movilizado),
      quedaM3: r4(m.autorizado - m.movilizado - g.m3),
      estado: pasa ? "pasa" : "cabe",
    });
  }
  especies.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.especie.localeCompare(b.especie, "es"));
  return {
    plantacion,
    especies,
    sinEspecie: { trozas: sinEspecie.length, codigos: sinEspecie },
    deOtroPermiso: { trozas: deOtroPermiso.length, codigos: deOtroPermiso.map((t) => t.codigo), porTroza: deOtroPermiso },
    permisoSinEspecies,
    bloqueo:
      (deOtroPermiso.length > 0
        ? { codigo: "TROZA_DE_OTRO_PERMISO" as const, mensaje: mensajeTrozasDeOtroPermiso(deOtroPermiso), especie: null }
        : null) ??
      bloqueoT7 ??
      bloqueoT6,
  };
}
