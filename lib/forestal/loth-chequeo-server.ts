/**
 * loth-chequeo-server — junta lo que el chequeo avanzado del Libro TH necesita
 * y lo pasa por las funciones puras (`loth-chequeo-guias`, `-arboles`) y el
 * catálogo (26-10). Lo sirve `GET /api/admin/forestal/loth/chequeo`.
 *
 * Reusa las MISMAS lecturas que ya cuentan en otro lado, para no decir otro
 * número: las líneas y guías del aviso de plazos (`datosAvisoPlazos`), el
 * saldo del freno (`ForestLothSaldoPlanDB.saldo`) y sus bloques
 * (`ForestPlanPreliminaresDB.delPlan`), los papeles (`papelesDelPlan`) y el
 * semáforo del plan (`semaforoDelPlan`). No toca el freno T6 ni las cuentas.
 *
 * Lo que no se pudo leer va a `sinLeer`. Un chequeo sale con los casos que SÍ
 * se leyeron y se omite sólo cuando quedaría «en orden» sin haber mirado todo
 * (reviewer 26-10: un plan sin leer escondía el vencido de OTRO): un «en orden»
 * sin haber mirado enseña a no creerle a la lista.
 */
import "server-only";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestLothChequeoDB } from "@/lib/db/forest-loth-chequeo.db";
import { ForestLothSaldoPlanDB } from "@/lib/db/forest-loth-saldo-plan.db";
import { ForestPlanPreliminaresDB } from "@/lib/db/forest-plan-preliminares.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { despachosSinAsentar, fraseDespacho } from "./loth-aviso-plazos";
import type { PlanFichaApi } from "./loth-ficha-permiso";
import { claveNumeroGtf } from "./gtf-talonario";
import { esTipoPlantacion } from "./loth-tipos-plan";
import { fichaDelPlan } from "./loth-plan-ficha";
import { semaforoDelPlan, type RazonSemaforo } from "./loth-plan-semaforo";
import { docDelTitularDe, docsDelTitular } from "./loth-plan-semaforo-libro";
import { papelesDelPlan } from "./loth-plan-papeles-server";
import { resumenParaSemaforo } from "./loth-plan-papeles";
import type { ExcesoDeBloque } from "./loth-plan-bloques-saldo";
import { armarChequeos, type CasosDelChequeo } from "./loth-chequeo-catalogo";
import { despachosSinGuia, fechaDelCaso, fechasFueraDeOrden, guiasFueraDeVigencia, guiasRepetidas, guiasSinTransporte, preliminaresViejas } from "./loth-chequeo-guias";
import { excesosDeBloques, razonesDelPlan, taladosBajoDmc, taladosSinCenso, taladosSinCoordenadas } from "./loth-chequeo-arboles";
import type { AjustesChequeo, BajoDmcChequeo, ChequeoAvanzado, LineaChequeo, PlanChequeo, PreliminarChequeo } from "./loth-chequeo-tipos";

const MARCA_DMC = "[Tala bajo DMC justificada:";
const fechaClave = (v: Date | string | null | undefined): string | null =>
  v == null ? null : (typeof v === "string" ? v : v.toISOString()).slice(0, 10) || null;
/** «20/09/2026» (el aviso de plazos) → «domingo 20/09». */
const fechaDeAviso = (f: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f.trim());
  return m ? fechaDelCaso(`${m[3]}-${m[2]}-${m[1]}`) : f;
};

/**
 * «PO 12», «PO1», «19-SEC/REG-PLT-2025-117»: el alias o el número tal cual. Con
 * el tipo delante salía «PO PO 12» y «PLANTACION PO1» (medido 26-10).
 */
const nombreCorto = (p: Pick<PlanFichaApi, "alias" | "planNumber" | "tituloHabilitante" | "planType">): string =>
  p.alias ?? p.planNumber ?? p.tituloHabilitante ?? p.planType ?? "Plan sin número";

/** Lo de un plan vivo que se lee de a uno; cada pieza puede fallar sola. */
interface DelPlan {
  excesos: ExcesoDeBloque[] | null;
  preliminares: PreliminarChequeo[] | null;
  /** Vigencia, estado y ficha (y los papeles si se leyeron); `null` = no se pudo leer el plan. */
  razones: RazonSemaforo[] | null;
  /** Los papeles se leyeron (o el plan no pide ninguno). Sin ellos, la vigencia igual se juzga. */
  papelesLeidos: boolean;
}

async function permisosDelTenant(tenantId: string) {
  try {
    if (!(await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"))) return [];
    return await ForestContratoDB.list(tenantId);
  } catch (err) {
    logger.warn("[loth-chequeo] permisos failed", { error: String(err), tenantId });
    return [];
  }
}

async function leerPlan(
  tenantId: string,
  planId: string,
  nombre: string,
  hoy: string,
  ahora: number,
  docs: Record<string, string>,
  verPapeles: boolean,
): Promise<DelPlan> {
  const avisar = (que: string) => (err: unknown) => {
    logger.warn(`[loth-chequeo] ${que} failed`, { error: String(err), tenantId, planId });
    return null;
  };
  /* `null` sin error = el plan no tiene papeles que pedir (no se juzga); el error, en cambio, no se da por bueno. */
  let papelesFallo = false;
  const bloques = (async () => {
    const s = await ForestLothSaldoPlanDB.saldo(tenantId, planId);
    if (!s) return null;
    return ForestPlanPreliminaresDB.delPlan(tenantId, planId, s.saldo);
  })().catch(avisar("saldo"));
  const [prel, papeles, plan, especies] = await Promise.all([
    bloques,
    verPapeles
      ? papelesDelPlan(tenantId, planId, hoy).catch((err: unknown) => {
          papelesFallo = true;
          return avisar("papeles")(err);
        })
      : null,
    ForestPlanDB.getPlan(tenantId, planId).catch(avisar("plan")),
    ForestPlanDB.listSpecies(tenantId, planId).catch(avisar("especies")),
  ]);
  let razones: RazonSemaforo[] | null = null;
  if (plan) {
    const ficha = fichaDelPlan({
      planType: plan.planType,
      tituloHabilitante: plan.tituloHabilitante,
      resolucionNumber: plan.resolucionNumber,
      resolucionDate: fechaClave(plan.resolucionDate),
      vigenciaHasta: fechaClave(plan.vigenciaHasta),
      titularName: plan.titularName,
      titularDoc: docDelTitularDe(docs, plan) ?? plan.propietarioDoc ?? null,
      areaHa: plan.areaHa == null ? null : Number(plan.areaHa),
      region: plan.region,
      provincia: plan.provincia,
      distrito: plan.distrito,
      regenteName: plan.regenteName,
      regenteRegistro: plan.regenteRegistro,
      especiesConVolumen: especies ? especies.filter((e) => Number(e.volumenAutorizadoM3 ?? 0) > 0).length : null,
    });
    /* Sin `especies`: el saldo ya lo juzgan «exceso» y «saldo bajo» (no se cuenta dos veces).
       Papeles `undefined` (fallaron o no se piden) = el semáforo no dice nada de ellos; la vigencia sí. */
    razones = semaforoDelPlan({
      planType: plan.planType,
      estado: plan.estado,
      vigenciaHasta: plan.vigenciaHasta,
      hoy: new Date(ahora),
      ficha,
      papeles: papeles ? resumenParaSemaforo(papeles) : undefined,
    }).razones;
  }
  return {
    excesos: prel ? prel.porBloque.excesos : null,
    preliminares: prel
      ? prel.guias
          .filter((g) => g.estado === "pendiente" && g.enElLibro == null)
          .map((g) => ({ numeroGtf: g.numeroGtf, fecha: g.fecha, anotadaEl: limaDateKey(g.creadaAt), plan: nombre }))
      : null,
    razones: plan ? razones : null,
    papelesLeidos: verPapeles && !papelesFallo,
  };
}

export async function chequeoAvanzado(
  tenantId: string,
  o: {
    ajustes: AjustesChequeo;
    planId?: string | null;
    ahora?: number;
    /** El rol ve los papeles del plan (dueño o administrador, como el Archivo): si no, sus chequeos no salen. */
    verPapeles: boolean;
  },
): Promise<ChequeoAvanzado> {
  if (!tenantId) throw new Error("tenantId is required");
  const ahora = o.ahora ?? Date.now();
  const hoy = limaDateKey(ahora);
  const sinLeer: string[] = [];
  const [datos, guiasTodas, permisos] = await Promise.all([
    ForestLothDB.datosAvisoPlazos(tenantId),
    ForestLothChequeoDB.guias(tenantId).catch((err: unknown) => {
      logger.warn("[loth-chequeo] guías failed", { error: String(err), tenantId });
      return null;
    }),
    permisosDelTenant(tenantId),
  ]);
  const delPlanElegido = <T extends { planId?: string | null }>(xs: readonly T[]) => (o.planId ? xs.filter((x) => x.planId === o.planId) : [...xs]);

  const nombres = new Map(datos.planes.map((p) => [p.id, nombreCorto(p)]));
  const planes: PlanChequeo[] = datos.planes.map((p) => ({
    id: p.id, nombre: nombres.get(p.id) ?? "Plan", planType: p.planType ?? null, vigenciaDesde: fechaClave(p.vigenciaDesde), vigenciaHasta: fechaClave(p.vigenciaHasta),
  }));
  const lineas: LineaChequeo[] = delPlanElegido(datos.lineas).map((l) => ({
    section: l.section,
    lineNo: l.lineNo,
    fecha: l.entryDate.slice(0, 10),
    planId: l.planId ?? null,
    treeCode: l.treeCode,
    trozaCode: l.trozaCode,
    gtfNumber: l.gtfNumber,
    gps: Boolean(l.gpsLat && l.gpsLng),
    justificadaDmc: (l.observations ?? "").startsWith(MARCA_DMC),
  }));
  const guias = guiasTodas ? delPlanElegido(guiasTodas) : null;
  if (!guias) sinLeer.push("las guías emitidas");

  /* Despachos sin asentar: el MISMO cálculo que la campana; con un plan elegido, sólo sus guías.
     Con un plan elegido y las guías sin leer no se sabe cuáles son suyas: no se juzga (se colaban las de todos). */
  const despachosSinSaberDeQuien = Boolean(o.planId) && !guias;
  const numerosDelPlan = o.planId && guias ? new Set(guias.map((g) => claveNumeroGtf(g.gtfNumber))) : null;
  const despachos = despachosSinAsentar(datos, ahora).filter((d) => !numerosDelPlan || numerosDelPlan.has(claveNumeroGtf(d.gtfNumber)));
  const caso = (d: (typeof despachos)[number]) => `GTF ${d.gtfNumber} (${fechaDeAviso(d.fecha)}): ${fraseDespacho(d)}`;

  /* Los planes vivos (no cerrados), uno por uno. */
  const vivos = datos.planes.filter((p) => p.isActive && (p.estado ?? "").toLowerCase() !== "cerrado" && (!o.planId || p.id === o.planId));
  const docs = docsDelTitular(permisos);
  const porPlan = await Promise.all(vivos.map((p) => leerPlan(tenantId, p.id, nombres.get(p.id) ?? "Plan", hoy, ahora, docs, o.verPapeles)));
  const leidos = vivos.map((p, i) => ({ nombre: nombres.get(p.id) ?? "Plan", ...porPlan[i] }));
  for (const p of leidos) {
    if (!p.excesos) sinLeer.push(`el saldo por bloques de ${p.nombre}`);
    if (!p.razones) sinLeer.push(`la vigencia y la ficha${o.verPapeles ? " y los papeles" : ""} de ${p.nombre}`);
    else if (o.verPapeles && !p.papelesLeidos) sinLeer.push(`los papeles de ${p.nombre}`);
  }
  if (!o.verPapeles && leidos.length > 0) sinLeer.push("los papeles de los planes (los ven el dueño y el administrador)");
  /* Los casos que se leyeron; `null` sólo si quedaría «en orden» con algún plan sin leer. */
  const conLoLeido = (casos: string[], faltaAlguno: boolean): string[] | null => (casos.length === 0 && faltaAlguno ? null : casos);
  const falta = <K extends "excesos" | "preliminares" | "razones">(k: K) => leidos.some((p) => p[k] == null);
  const faltanPapeles = !o.verPapeles || leidos.some((p) => p.razones == null || !p.papelesLeidos);
  const bloques = excesosDeBloques(leidos.flatMap((p) => (p.excesos ? [{ plan: p.nombre, excesos: p.excesos }] : [])));
  const prelim = preliminaresViejas(leidos.flatMap((p) => p.preliminares ?? []), hoy, o.ajustes.diasPreliminar);
  const razones = razonesDelPlan(leidos.flatMap((p) => (p.razones ? [{ nombre: p.nombre, razones: p.razones }] : [])));

  /* Árboles: el censo de los planes con talas. */
  const talas = lineas.filter((l) => l.section === "tala" && l.planId && l.treeCode);
  const planesConTala = [...new Set(talas.map((t) => t.planId as string))];
  let arboles: { sinCenso: string[]; sinCoordenadas: string[]; bajoDmc: string[] } | null = null;
  try {
    const codigos = talas.map((t) => t.treeCode as string);
    const [censo, conCenso, bajo] = await Promise.all([
      ForestLothChequeoDB.censoDeArboles(tenantId, planesConTala, codigos),
      ForestLothChequeoDB.planesConCenso(tenantId, planesConTala),
      Promise.all(
        planesConTala.map(async (planId) => {
          const m = await ForestLothDB.arbolesBajoDmc(tenantId, planId, talas.filter((t) => t.planId === planId).map((t) => t.treeCode as string));
          return [...m.values()].flatMap((e): BajoDmcChequeo[] => {
            const d = e.detail ?? {};
            return [{ planId, treeCode: String(d.treeCode ?? ""), especie: String(d.especie ?? ""), dapCm: Number(d.dapCm), dmcCm: Number(d.dmcCm) }];
          });
        }),
      ),
    ]);
    const plantaciones = new Set(datos.planes.filter((p) => esTipoPlantacion(p.planType)).map((p) => p.id));
    const d = { talas, censo, planesConCenso: conCenso, plantaciones, nombres };
    arboles = { sinCenso: taladosSinCenso(d), sinCoordenadas: taladosSinCoordenadas(d), bajoDmc: taladosBajoDmc(talas, bajo.flat(), nombres) };
  } catch (err) {
    logger.warn("[loth-chequeo] censo failed", { error: String(err), tenantId });
    sinLeer.push("el censo de los árboles talados");
  }

  const casos: CasosDelChequeo = {
    guia_repetida: guias && guiasRepetidas(guias),
    guia_fuera_vigencia: guias && guiasFueraDeVigencia(guias, planes),
    despacho_sin_guia: despachosSinGuia(lineas),
    guia_sin_transporte: guias && guiasSinTransporte(guias, o.ajustes.pedirLicencia),
    bloque_excedido: conLoLeido(bloques.hoy, falta("excesos")),
    bloque_excederia: conLoLeido(bloques.conPreliminares, falta("excesos")),
    talado_sin_censo: arboles?.sinCenso ?? null,
    talado_bajo_dmc: arboles?.bajoDmc ?? null,
    talado_sin_coordenadas: arboles?.sinCoordenadas ?? null,
    plan_vencido: conLoLeido(razones.vencido, falta("razones")),
    papeles_vencidos: o.verPapeles ? conLoLeido(razones.papelesVencidos, faltanPapeles) : null,
    plan_por_vencer: conLoLeido(razones.porVencer, falta("razones")),
    papeles_faltan: o.verPapeles ? conLoLeido(razones.papelesFaltan, faltanPapeles) : null,
    ficha_incompleta: conLoLeido(razones.ficha, falta("razones")),
    despacho_sin_asentar: despachosSinSaberDeQuien ? null : despachos.filter((d) => d.estado === "vencido").map(caso),
    preliminar_vencida: conLoLeido(prelim.vencidas, falta("preliminares")),
    despacho_por_asentar: despachosSinSaberDeQuien ? null : despachos.filter((d) => d.estado !== "vencido").map(caso),
    preliminar_vieja: conLoLeido(prelim.porVencer, falta("preliminares")),
    fechas_fuera_de_orden: fechasFueraDeOrden(lineas),
  };
  return { checks: armarChequeos(casos, o.ajustes), sinLeer, planes: vivos.length, hoy };
}
