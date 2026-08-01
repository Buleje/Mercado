"use client";

/**
 * ctp-dossier-abrir — junta los datos del período y abre la carpeta de
 * fiscalización lista para imprimir o guardar como PDF.
 *
 * Separado de `ctp-dossier.ts` a propósito: allá vive el armado PURO (datos →
 * HTML, con tests) y acá el I/O. Así se puede probar qué entra en cada sección
 * sin levantar el módulo ni abrir ventanas.
 */

import { applyCtpPeriodParams, type CtpPeriod } from "./ctp-period";
import { openCtpReport } from "./ctp-print-shared";
import { armarDossier, DOSSIER_CSS, type DatosDossier, type LineaLibro } from "./ctp-dossier";
import { filasConsumo, type GrafoConsumos } from "./loctp-consumos";
import { filasRetrozado, type RetrozoParaApartado } from "./loctp-apartados";
import { pendientesDelLibro, type DatosPendientes } from "./ctp-pendientes";
import type { CtpFicha } from "./ctp-ficha-types";

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(url, { credentials: "include" });
    return r.ok ? ((await r.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

const withPeriod = (path: string, base: Record<string, string>, period: CtpPeriod) =>
  `${path}?${applyCtpPeriodParams(new URLSearchParams(base), period)}`;

interface EntradaCtp extends LineaLibro {
  status: string;
}
interface RespuestaEntries {
  entries?: EntradaCtp[];
}
interface RespuestaSaldos {
  saldos?: {
    materiaPrima: { especiesEnNegativo: number };
    porEspecie: { especie: string; ingresoM3: number; consumidoM3: number; saldoM3: number }[];
  };
}
/**
 * Los ingresos (WoodEntry) tienen forma propia: `speciesCommonName` en vez de
 * `speciesCommon`, `pieces` en vez de `quantity`, y estados
 * `pendiente|validado|procesado|rechazado|anulado` — NO "registrado", que es el
 * del libro CTP.
 */
interface EntradaWood {
  /** Hace falta para cruzar el consumo con SU ingreso: sin el id, la Sección 2
   *  sólo podría mostrar la especie del grafo y perdería códigos y producto. */
  id?: string;
  entryDate: string;
  gtfNumber?: string | null;
  speciesCommonName?: string | null;
  speciesScientificName?: string | null;
  productType?: string | null;
  originCode?: string | null;
  ctpProductCode?: string | null;
  originSourceNumber?: string | null;
  unit?: string | null;
  pieces?: number | null;
  volumeM3?: string | number | null;
  status: string;
}
interface RespuestaWood {
  stats?: { totalCount: number; lateCount: number; byStatus: Record<string, number> };
  entries?: EntradaWood[];
}
interface RespuestaGtf {
  gtfs?: { gtfNumber: string; gtfDate?: string | null; destino?: string | null; volumenTotalM3?: number | null }[];
}
interface RespuestaAnexos {
  emisiones?: { numero: string; gtf?: string | null; totalPiezas?: number | null; volumenTotal?: number | null }[];
}

/** Líneas vigentes del libro CTP: lo anulado no cuenta ante un fiscalizador. */
const vigentesCtp = <T extends { status?: string }>(xs: T[]): T[] =>
  xs.filter((e) => !e.status || e.status === "registrado");

/** Ingresos vigentes. Su ciclo de estados es otro: acá lo que no cuenta es lo rechazado y lo anulado. */
const vigentesWood = (xs: EntradaWood[]): EntradaWood[] =>
  xs.filter((e) => e.status !== "rechazado" && e.status !== "anulado");

/** Un ingreso, traducido a la forma común del dossier. */
const woodALinea = (e: EntradaWood): LineaLibro => ({
  section: "ingreso",
  entryDate: e.entryDate,
  gtfNumber: e.gtfNumber ?? null,
  speciesCommon: e.speciesCommonName ?? null,
  productType: e.productType ?? null,
  quantity: e.pieces ?? null,
  unit: e.pieces != null ? "pz" : null,
  volumeM3: e.volumeM3 != null ? Number(e.volumeM3) : null,
});

/**
 * Arma y abre la carpeta del período.
 *
 * @param period      Período seleccionado en el Libro.
 * @param periodLabel Etiqueta legible ("Julio 2026") para la portada.
 * @param score       Score de cumplimiento, si el Libro ya lo calculó.
 */
export async function abrirDossierFiscalizacion(
  period: CtpPeriod,
  periodLabel: string,
  score?: number | null,
): Promise<void> {
  const [fic, ing, prod, desp, sal, gtf, anx, wood, gra, ret] = await Promise.all([
    getJson<{ ficha?: CtpFicha }>("/api/admin/forestal/ctp-ficha", {}),
    getJson<RespuestaWood>(withPeriod("/api/admin/forestal/wood-entries", { limit: "500" }, period), {}),
    getJson<RespuestaEntries>(withPeriod("/api/admin/forestal/ctp", { section: "produccion" }, period), {}),
    getJson<RespuestaEntries>(withPeriod("/api/admin/forestal/ctp", { section: "despacho" }, period), {}),
    getJson<RespuestaSaldos>(withPeriod("/api/admin/forestal/ctp", { saldos: "1" }, period), {}),
    getJson<RespuestaGtf>("/api/admin/forestal/gtf", {}),
    getJson<RespuestaAnexos>("/api/admin/forestal/anexos", {}),
    getJson<RespuestaWood>(withPeriod("/api/admin/forestal/wood-entries", { stats: "1", limit: "1" }, period), {}),
    // Sección 2 y Apartado 2: la carpeta tiene que mostrar de qué guía salió cada
    // consumo y qué trozas se cortaron — es lo que se pregunta en una visita.
    getJson<{ grafo?: GrafoConsumos }>(withPeriod("/api/admin/forestal/ctp", { grafo: "1" }, period), {}),
    getJson<{ retrozos?: RetrozoParaApartado[] }>(
      withPeriod("/api/admin/forestal/trozas", { retrozos: "1" }, period), {},
    ),
  ]);

  const despachos = vigentesCtp(desp.entries ?? []);
  const saldos = sal.saldos;

  // Los pendientes se declaran en la portada; se reusa la MISMA priorización del
  // panel del Libro para que la carpeta no diga algo distinto de la pantalla.
  const datosPend: DatosPendientes = {
    ingresosPendientes: wood.stats?.byStatus?.pendiente ?? 0,
    fueraDePlazo: wood.stats?.lateCount ?? 0,
    guiasSinIngresar: 0,
    despachosSinGtf: despachos.filter((e) => !e.gtfNumber || !String(e.gtfNumber).trim()).length,
    despachosSinAnexo: 0,
    corridasSinOrigen: 0,
    saldosNegativos: saldos?.materiaPrima.especiesEnNegativo ?? 0,
  };

  const datos: DatosDossier = {
    ficha: fic.ficha ?? null,
    periodoLabel: periodLabel,
    score: score ?? null,
    ingresos: vigentesWood(ing.entries ?? []).map(woodALinea),
    consumos: filasConsumo(gra.grafo ?? null, vigentesWood(ing.entries ?? [])),
    retrozos: filasRetrozado(ret.retrozos ?? []),
    produccion: vigentesCtp(prod.entries ?? []),
    despachos,
    saldos: (saldos?.porEspecie ?? []).map((s) => ({
      label: s.especie,
      ingresoM3: s.ingresoM3,
      consumidoM3: s.consumidoM3,
      saldoM3: s.saldoM3,
    })),
    guias: (gtf.gtfs ?? []).map((g) => ({
      gtfNumber: g.gtfNumber,
      gtfDate: g.gtfDate ?? null,
      destino: g.destino ?? null,
      volumenTotalM3: g.volumenTotalM3 != null ? Number(g.volumenTotalM3) : null,
    })),
    anexos: (anx.emisiones ?? []).map((a) => ({
      numero: a.numero,
      gtf: a.gtf ?? null,
      totalPiezas: a.totalPiezas ?? null,
      volumenTotal: a.volumenTotal != null ? Number(a.volumenTotal) : null,
    })),
    pendientes: pendientesDelLibro(datosPend).map((p) => ({ titulo: p.titulo, cantidad: p.cantidad })),
    emitidoEn: new Date(),
  };

  openCtpReport({
    title: `Carpeta de fiscalización — ${periodLabel}`,
    css: DOSSIER_CSS,
    body: armarDossier(datos),
  });
}
