"use client";

/**
 * use-loth-semaforo-libro — lo que el semáforo del plan necesita del libro y la
 * pantalla del plan no tiene (`GET /api/admin/forestal/loth/semaforo`): los
 * plazos de 15 días, quién taló cada árbol, los motosierristas ya escritos y
 * el RUC o DNI del titular, que vive en el permiso.
 *
 * Lo leen la cabecera del plan, la grilla de planes y el formulario de tala y
 * trozado: UN GET para todos (promesa compartida por 20 s). Un `firma` nuevo
 * (el `reloadSignal` del libro) lo pide de nuevo.
 *
 * Degrada sin ruido: 403 (el negocio no tiene el libro TH) → «sin_libro»; un
 * fallo → «fallo» (`useLecturaDelLibro`), y el aviso de plazos del libro dice
 * «No pude leer…» en vez de callar (25-10). `useSemaforoDelLibro` da sólo los
 * datos (`null` mientras carga o si no hay).
 *
 * También arma el semáforo y la ficha de UN plan con lo de la pantalla
 * (`semaforoDeLaPantalla`): la cabecera y la grilla cuentan igual.
 */

import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { fichaDelPlan, type FichaDelPlan } from "@/lib/forestal/loth-plan-ficha";
import { semaforoDelPlan, type PapelesSemaforo, type SemaforoPlan } from "@/lib/forestal/loth-plan-semaforo";
import { docDelTitularDe, type SemaforoDelLibro } from "@/lib/forestal/loth-plan-semaforo-libro";
import type { CascadaEspecie } from "@/lib/forestal/loth-saldo-cascada";
import type { Plan } from "../loth-plan-shared";

const URL_SEMAFORO = "/api/admin/forestal/loth/semaforo";
const VIGENTE_MS = 20_000;

/** Lo que volvió del GET: los datos, «este negocio no tiene libro TH» (403) o un fallo. */
export type RespuestaDelLibro = { estado: "listo"; datos: SemaforoDelLibro } | { estado: "sin_libro" } | { estado: "fallo" };

let compartido: { at: number; firma: number | undefined; promesa: Promise<RespuestaDelLibro> } | null = null;

async function traer(): Promise<RespuestaDelLibro> {
  try {
    const r = await fetch(URL_SEMAFORO, { credentials: "include", cache: "no-store" });
    if (r.status === 403) return { estado: "sin_libro" };
    if (!r.ok) {
      logger.warn("[loth-semaforo] GET failed", { status: r.status });
      return { estado: "fallo" };
    }
    return { estado: "listo", datos: (await r.json()) as SemaforoDelLibro };
  } catch (err) {
    logger.warn("[loth-semaforo] GET failed", { error: String(err) });
    return { estado: "fallo" };
  }
}

/** Sin `firma`, sirve la última respuesta si es reciente; con una firma nueva, pide de nuevo. */
function pedir(firmaPedida: number | undefined): Promise<RespuestaDelLibro> {
  // 0 = la primera carga del libro: vale lo mismo que «sin firma».
  const firma = firmaPedida || undefined;
  const c = compartido;
  if (c && (firma === undefined || c.firma === firma) && Date.now() - c.at < VIGENTE_MS) return c.promesa;
  compartido = { at: Date.now(), firma: firma ?? c?.firma, promesa: traer() };
  return compartido.promesa;
}

/** Tras asentar una tala o un trozado: la próxima lectura pide de nuevo. */
export function olvidarSemaforoDelLibro(): void {
  compartido = null;
}

export type LecturaDelLibro = RespuestaDelLibro | { estado: "cargando" };

/** La lectura con su estado: el aviso de plazos distingue «carga» de «falló». */
export function useLecturaDelLibro(firma?: number, activo = true): LecturaDelLibro {
  const [lectura, setLectura] = useState<LecturaDelLibro>({ estado: "cargando" });
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void pedir(firma).then((d) => {
      if (vivo) setLectura(d);
    });
    return () => {
      vivo = false;
    };
  }, [firma, activo]);
  return lectura;
}

/** Sólo los datos: `null` mientras carga, sin libro TH o si falló. */
export function useSemaforoDelLibro(firma?: number, activo = true): SemaforoDelLibro | null {
  const l = useLecturaDelLibro(firma, activo);
  return l.estado === "listo" ? l.datos : null;
}

/** Especies con volumen autorizado (o registrado) mayor que cero. */
export function especiesConVolumenDe(species: readonly { volumenAutorizadoM3: string | null }[]): number {
  return species.filter((s) => Number(s.volumenAutorizadoM3 ?? 0) > 0).length;
}

/** La ficha de un plan guardado: el RUC o DNI sale del permiso o, si no, del propietario. */
export function fichaDePlanGuardado(plan: Plan, especiesConVolumen: number | null, libro: SemaforoDelLibro | null): FichaDelPlan {
  return fichaDelPlan({
    planType: plan.planType,
    tituloHabilitante: plan.tituloHabilitante,
    resolucionNumber: plan.resolucionNumber,
    resolucionDate: plan.resolucionDate,
    vigenciaHasta: plan.vigenciaHasta,
    titularName: plan.titularName,
    titularDoc: docDelTitularDe(libro?.docsDelTitular, plan) ?? plan.propietarioDoc ?? null,
    areaHa: plan.areaHa,
    region: plan.region,
    provincia: plan.provincia,
    distrito: plan.distrito,
    regenteName: plan.regenteName,
    regenteRegistro: plan.regenteRegistro,
    especiesConVolumen,
  });
}

export interface SemaforoDeLaPantalla {
  semaforo: SemaforoPlan;
  ficha: FichaDelPlan;
}

/**
 * El semáforo y la ficha de un plan con lo que la pantalla tiene. `especies`
 * = la cascada del balance (saldo por especie) y `papeles` = el resumen de los
 * papeles del permiso: `undefined` = no se juzga (carga, o la pantalla no lo
 * tiene); `null` = la lectura falló → ámbar «No pude leer…», nunca un verde.
 * Los plazos de 15 días no van: son del LIBRO entero (`LothPlazosDelLibroAviso`).
 */
export function semaforoDeLaPantalla(
  plan: Plan,
  o: {
    especies?: readonly CascadaEspecie[] | null;
    papeles?: PapelesSemaforo | null;
    especiesConVolumen: number | null;
    libro: SemaforoDelLibro | null;
    hoy?: Date;
  },
): SemaforoDeLaPantalla {
  const ficha = fichaDePlanGuardado(plan, o.especiesConVolumen, o.libro);
  const semaforo = semaforoDelPlan({
    planType: plan.planType,
    estado: plan.estado,
    vigenciaHasta: plan.vigenciaHasta,
    hoy: o.hoy ?? new Date(),
    especies: o.especies,
    ficha,
    papeles: o.papeles,
    talas: o.libro?.talasPorPlan[plan.id] ?? null,
  });
  return { semaforo, ficha };
}

/**
 * El semáforo del plan ABIERTO: lo usan la cabecera (`LothPlanView`) y los
 * avisos (`LothPlanPaneles`) con las mismas entradas y el mismo GET
 * compartido, así que dicen lo mismo. Mientras el plan o su balance cargan,
 * `null` (contaría «sin especies» de más). `especies: null` = el balance
 * falló; `papeles` como en `semaforoDeLaPantalla`.
 */
export function useSemaforoDelPlanAbierto(
  plan: Plan | null,
  o: {
    especies: readonly CascadaEspecie[] | null;
    papeles?: PapelesSemaforo | null;
    species: readonly { volumenAutorizadoM3: string | null }[];
    listo: boolean;
    firma?: number;
  },
): SemaforoDeLaPantalla | null {
  const libro = useSemaforoDelLibro(o.firma, plan != null);
  const { especies, papeles, species, listo } = o;
  return useMemo(
    () => (plan && listo ? semaforoDeLaPantalla(plan, { especies, papeles, especiesConVolumen: especiesConVolumenDe(species), libro }) : null),
    [plan, listo, especies, papeles, species, libro],
  );
}
