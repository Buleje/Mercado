import "server-only";
/**
 * «Plantas forestales» del superadmin (17-10, fases 1-2): el resumen, la ficha
 * y las incoherencias de cada planta, armados SÓLO con lo que ya lee su libro.
 *
 * Ningún número nuevo: cada cifra sale de la misma lectura que la pantalla del
 * libro (`ForestCtpDB.saldos`, `conciliacionPeriodo`, `productosDisponibles`,
 * `WoodEntriesDB.trozasComoConsumibles`, …) y de la misma función pura que la
 * dibuja (`armarBalance`, `excepcionesDeSaldo`, `analizarRendimiento`,
 * `cuadreDeIngreso`, `rendimientoPonderado`). Si el superadmin dice 62 m³ y la
 * planta 20, es bug de este archivo.
 *
 * Lecturas que fallan: el dato queda `null` (nunca 0), la fuente se marca en
 * `lecturas` y el semáforo queda gris con el porqué. Un cálculo con alguna
 * lectura caída no se guarda en caché: el próximo pedido lo reintenta.
 *
 * Rendimiento: 4 plantas a la vez; cada planta, cacheada 300 s por período
 * («Recalcular» la limpia con {@link olvidarPlantas}). Las lecturas de una
 * planta van en paralelo y ninguna es por fila.
 */
import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { ForestCtpDB, type TendenciaMes } from "@/lib/db/forest-ctp.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestCorridaCompraDB } from "@/lib/db/forest-corrida-compra.db";
import { ForestInspeccionPlantaDB } from "@/lib/db/forest-inspeccion-planta.db";
import { juntarDatosReporte } from "@/lib/db/forest-reporte-diario-datos.db";
import { CACHE_PLANTAS, PlantasForestalesDB } from "@/lib/db/plantas-forestales.db";
import { leerRendimientoAserradero } from "@/lib/forestal/rendimiento-lectura";
import { antiguedadPorGuia, type GuiaDisponible } from "@/lib/forestal/antiguedad-por-guia";
import type { CorridaDisponible, EntradaCapacidad } from "@/lib/forestal/capacidad-de-planta";
import { alertasRendimiento, analizarRendimiento } from "@/lib/forestal/ctp-radar-rendimiento";
import { rendimientoPonderado } from "@/lib/forestal/ctp-kpis-seccion";
import { TROZAS_VARADAS_DIAS } from "@/lib/forestal/ctp-pendientes";
import { excepcionesDeSaldo } from "@/lib/forestal/ctp-saldos-excepciones";
import { entradaDeExcepciones } from "@/lib/forestal/ctp-saldos-excepciones-entrada";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { resumenDeOrigen } from "@/lib/forestal/origen-incompleto";
import { lotesParaReporte } from "@/lib/forestal/saldos-reporte";
import {
  contarIncoherencias,
  incoherenciasDeCuadre,
  incoherenciasDePendientes,
  incoherenciasDeRendimiento,
  incoherenciasDeSaldo,
  ordenarIncoherencias,
  type IngresoParaCuadre,
} from "./incoherencias";
import { diasDesde, periodoPorDefecto, rangoDelPeriodo } from "./periodo";
import { aserradaPlanta, trozasPlanta } from "./pies-tablares";
import { semaforoDePlanta } from "./semaforo";
import type {
  AserradaPlanta,
  CumplimientoFoto,
  EspecieExistencia,
  EstadoInspeccion,
  EstadoLectura,
  FuenteLectura,
  GravedadIncoherencia,
  IncoherenciaPlanta,
  IncoherenciasResponse,
  MovimientoPeriodo,
  OrigenIncoherencia,
  PendientePlanta,
  PeriodoPlanta,
  PlantaFichaResponse,
  PlantaIdentidad,
  PlantaResumen,
  PlantasListaResponse,
  Semaforo,
  TrozasPlanta,
} from "./tipos";

const TTL_PLANTA_SEG = 300;
const PLANTAS_A_LA_VEZ = 4;
/** El barrido de «Descuadres» del libro: hasta 1.000 guías (el panel, 5 × 200). */
const PAGINA_CUADRE = 500;
const PAGINAS_CUADRE = 2;
const TOLERANCIA_M3 = 0.001;

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);
/** Lo que la pantalla del libro recibe por JSON (Decimal → texto, Date → ISO). */
const comoJson = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;

/* ── Lecturas ───────────────────────────────────────────────────────────── */

type Leido<T> = { ok: true; v: T } | { ok: false };

async function leer<T>(tenantId: string, que: string, fn: () => Promise<T>): Promise<Leido<T>> {
  try {
    return { ok: true, v: await fn() };
  } catch (err) {
    logger.warn("[plantas-forestales] lectura falló", { tenantId, que, error: String(err) });
    return { ok: false };
  }
}

/** El patio como lo pide el libro: piezas, su total real, lo varado y lo pendiente sin piezas. */
async function leerPatio(tenantId: string) {
  const [filas, total, varadas, pendientes] = await Promise.all([
    WoodEntriesDB.trozasComoConsumibles(tenantId, {}),
    WoodEntriesDB.contarTrozasDelPatio(tenantId, {}),
    WoodEntriesDB.contarTrozasVaradas(tenantId, TROZAS_VARADAS_DIAS),
    WoodEntriesDB.list(tenantId, { status: "pendiente", limit: 500 }),
  ]);
  /* Los ingresos sin validar y SIN piezas (`useFuentesDeCapacidad`): los que
     tienen piezas ya entran troza por troza en «por recepcionar». */
  const pendienteSinPiezasM3 = pendientes.entries
    .filter((e) => num(e.trozasCount) === 0)
    .reduce((a, e) => a + num(e.volumeM3), 0);
  return {
    filas,
    truncado: filas.length < total ? { devueltas: filas.length, total } : null,
    varadas,
    pendienteSinPiezasM3,
  };
}

/** Las guías de la planta, todas y en cualquier estado, para el cuadre declarado vs piezas. */
async function leerCuadre(tenantId: string): Promise<{
  filas: IngresoParaCuadre[];
  truncado: { leidos: number; total: number } | null;
}> {
  const filas: IngresoParaCuadre[] = [];
  let total = 0;
  for (let pagina = 0; pagina < PAGINAS_CUADRE; pagina++) {
    const r = await WoodEntriesDB.list(tenantId, { limit: PAGINA_CUADRE, offset: pagina * PAGINA_CUADRE });
    total = r.total;
    for (const e of r.entries) {
      filas.push({
        id: e.id,
        gtfNumber: e.gtfNumber ?? null,
        speciesCommonName: e.speciesCommonName ?? null,
        status: e.status ?? null,
        volumeM3: e.volumeM3 == null ? null : Number(e.volumeM3),
        trozasM3: e.trozasM3 == null ? null : Number(e.trozasM3),
        trozasCount: e.trozasCount ?? 0,
      });
    }
    if (filas.length >= total || r.entries.length < PAGINA_CUADRE) break;
  }
  return { filas, truncado: filas.length < total ? { leidos: filas.length, total } : null };
}

/* ── El cálculo de una planta ───────────────────────────────────────────── */

/** Lo que se guarda en caché: todo lo que no depende de la identidad ni del reloj. */
interface PlantaCalculada {
  trozas: TrozasPlanta | null;
  aserrada: AserradaPlanta | null;
  movimiento: MovimientoPeriodo | null;
  especiesNegativas: EspecieExistencia[];
  porEspecie: EspecieExistencia[];
  incoherencias: IncoherenciaPlanta[];
  pendientes: PendientePlanta[];
  cumplimiento: CumplimientoFoto | null;
  ultimaActividad: string | null;
  lecturas: Record<FuenteLectura, EstadoLectura>;
  semaforo: Semaforo;
  motivoSemaforo: string;
  calculadoEn: string;
}

const estado = (...ok: boolean[]): EstadoLectura => (ok.every(Boolean) ? "ok" : "error");

async function calcularPlanta(p: PlantaIdentidad, periodo: PeriodoPlanta): Promise<PlantaCalculada> {
  const tid = p.tenantId;
  const rango = rangoDelPeriodo(periodo);
  const ahora = new Date();

  const [
    saldosL,
    concilL,
    curvaL,
    sinIngresoL,
    agingL,
    dispL,
    patioL,
    cuadreL,
    lotesL,
    radarL,
    seccionesL,
    pendL,
    cumplL,
    actividadL,
  ] = await Promise.all([
    leer(tid, "saldos", () => ForestCtpDB.saldos(tid, rango)),
    leer(tid, "conciliacion", () => ForestCtpDB.conciliacionPeriodo(tid, rango)),
    leer(tid, "curva", () => ForestCtpDB.curvaSaldo(tid, rango)),
    leer(tid, "especies-sin-ingreso", () => ForestCorridaCompraDB.especiesSinIngreso(tid)),
    leer(tid, "antiguedad", () => ForestCtpDB.availableSource(tid, "produccion", {})),
    /* Lo disponible es una FOTO del depósito (ADR-349): el período no la acota. */
    leer(tid, "disponibles", () =>
      ForestCtpDB.productosDisponibles(tid, { ...rango, soloDelPeriodo: false, incluirUsados: false }),
    ),
    leer(tid, "patio", () => leerPatio(tid)),
    leer(tid, "cuadre", () => leerCuadre(tid)),
    leer(tid, "lotes", () => ForestLoteAserrioDB.list(tid, {})),
    leer(tid, "radar", () =>
      Promise.all([ForestCtpDB.grafoTrazabilidad(tid, rango), leerRendimientoAserradero(tid, { plata: false })]),
    ),
    leer(tid, "secciones", () =>
      Promise.all([
        ForestCtpDB.list(tid, { section: "produccion", ...rango }),
        ForestCtpDB.list(tid, { section: "despacho", ...rango }),
      ]),
    ),
    leer(tid, "pendientes", () =>
      juntarDatosReporte(tid, {
        secciones: ["pendientes"],
        rango: "hoy",
        fecha: limaDateKey(),
        ahora,
        nombreReporte: "Plantas forestales",
        panelUrl: "",
      }),
    ),
    leer(tid, "cumplimiento", () => PlantasForestalesDB.ultimaFotoCumplimiento(tid)),
    leer(tid, "actividad", () => PlantasForestalesDB.ultimaActividad(tid)),
  ]);

  const saldos = saldosL.ok ? saldosL.v : null;
  const concil = concilL.ok ? concilL.v : null;
  /* Como la recibe la pantalla del libro (por JSON): mismo valor, mismo tipo. */
  const corridas = dispL.ok ? comoJson<CorridaDisponible[]>(dispL.v.corridas) : null;
  const lotes = lotesL.ok ? lotesParaReporte(comoJson<LoteAserrio[]>(lotesL.v), ahora) : [];
  const stockLibroM3 = saldos ? saldos.productos.reduce((a, x) => a + num(x.stock), 0) : 0;
  const pendientesFallaron = !pendL.ok || (pendL.v.fallidas ?? []).includes("pendientes");

  const lecturas: Record<FuenteLectura, EstadoLectura> = {
    /* Lo que alimenta «Qué revisar» de Saldos: sin la curva, la antigüedad o
       las especies sin ingreso, la lista de avisos estaría incompleta. */
    saldos: estado(saldosL.ok, curvaL.ok, agingL.ok, sinIngresoL.ok),
    conciliacion: estado(concilL.ok),
    disponibles: estado(dispL.ok),
    patio: estado(patioL.ok, cuadreL.ok),
    lotes: estado(lotesL.ok),
    pendientes: estado(!pendientesFallaron),
    rendimiento: estado(radarL.ok, seccionesL.ok),
    cumplimiento: estado(cumplL.ok),
  };

  /* ── Trozas y aserrada (el balance de capacidad del libro) ── */
  let trozas: TrozasPlanta | null = null;
  if (patioL.ok) {
    const entrada: EntradaCapacidad = {
      patio: patioL.v.filas,
      lotes,
      corridas: corridas ?? undefined,
      stockLibroM3,
      pendienteSinPiezasM3: patioL.v.pendienteSinPiezasM3,
      estado: { patio: "ok", pendientes: "ok", lotes: estadoFuente(lotesL.ok), corridas: estadoFuente(dispL.ok) },
      patioTruncado: patioL.v.truncado,
    };
    trozas = trozasPlanta(entrada, { ...patioL.v.varadas, dias: TROZAS_VARADAS_DIAS });
  }
  /* Sin el saldo no hay contra qué conciliar lo disponible: null, no un 0 inventado. */
  const aserrada = corridas && saldos ? aserradaPlanta(corridas, stockLibroM3) : null;

  /* ── Movimiento del período ── */
  let movimiento: MovimientoPeriodo | null = null;
  if (saldos && seccionesL.ok) {
    const [prod, desp] = seccionesL.v;
    const enM3 = (e: { status: string; unit: string | null; quantity: unknown }) =>
      e.status === "registrado" && (e.unit ?? "m3") === "m3" && e.quantity != null;
    const mp = saldos.materiaPrima;
    const rend = rendimientoPonderado(prod.entries).pct;
    movimiento = {
      periodo,
      ingresoM3: mp.ingresoM3,
      ingresosCount: mp.ingresosCount,
      consumidoM3: mp.consumidoM3,
      despachadoDirectoM3: mp.despachadoDirectoM3,
      saldoM3: mp.saldoM3,
      pendienteM3: mp.pendienteM3,
      /* Derivados: Σ de las corridas y despachos registrados en m³ (los de pt/kg no se suman). */
      producidoM3: r4(prod.entries.filter(enM3).reduce((a, e) => a + num(e.quantity), 0)),
      despachadoM3: r4(desp.entries.filter(enM3).reduce((a, e) => a + num(e.quantity), 0)),
      rendimientoPct: rend == null ? null : Math.round(rend * 100) / 100,
      consumoSinOrigen: { m3: num(mp.consumoSinOrigenM3), corridas: num(mp.consumoSinOrigenCount) },
      consumoSinDeclarar: { m3: num(mp.consumoSinDeclararM3), corridas: num(mp.consumoSinDeclararCount) },
    };
  }

  /* ── Existencia por especie (la conciliación manda: apertura + movimiento) ── */
  const movPorEspecie = new Map<string, number>();
  for (const e of saldos?.porEspecie ?? []) {
    const k = claveEspecie(e.especie);
    movPorEspecie.set(k, (movPorEspecie.get(k) ?? 0) + num(e.saldoM3));
  }
  const porEspecie: EspecieExistencia[] =
    concil && saldos
      ? concil.materiaPrima
          .map((m) => ({
            especie: m.especie,
            existenciaFinalM3: r4(num(m.final)),
            movimientoM3: r4(movPorEspecie.get(claveEspecie(m.especie)) ?? 0),
          }))
          .sort((a, b) => a.existenciaFinalM3 - b.existenciaFinalM3)
      : [];
  const especiesNegativas = porEspecie.filter((e) => e.existenciaFinalM3 < -TOLERANCIA_M3);

  /* ── Incoherencias: lo que el libro ya detecta ── */
  const ref = { tenantId: tid, nombre: p.nombre };
  const items: IncoherenciaPlanta[] = [];
  if (saldos) {
    const excepciones = excepcionesDeSaldo(
      entradaDeExcepciones({
        saldos,
        curva: curvaL.ok ? curvaL.v : null,
        concil,
        origen: resumenDeOrigen(corridas ?? [], lotes),
        lotes,
        antiguedad: agingL.ok ? antiguedadPorGuia(comoJson<GuiaDisponible[]>(agingL.v), ahora) : null,
        especiesSinIngreso: sinIngresoL.ok ? sinIngresoL.v : undefined,
      }),
    );
    items.push(...incoherenciasDeSaldo(ref, excepciones));
  }
  if (cuadreL.ok) items.push(...incoherenciasDeCuadre(ref, cuadreL.v.filas, cuadreL.v.truncado));
  if (radarL.ok) {
    const [grafo, rend] = radarL.v;
    const enProceso = new Map<string, string>();
    for (const c of rend.corridas) if (c.parcial && c.finProceso) enProceso.set(c.id, c.finProceso);
    items.push(
      ...incoherenciasDeRendimiento(ref, alertasRendimiento(analizarRendimiento(grafo, { enProceso, hoy: rend.hoy }))),
    );
  }
  const pendientes: (PendientePlanta & { detalle: string })[] =
    pendL.ok && !pendientesFallaron ? (pendL.v.pendientes ?? []) : [];
  items.push(...incoherenciasDePendientes(ref, pendientes));

  const incoherencias = ordenarIncoherencias(items);
  const conteo = contarIncoherencias(incoherencias);

  const { semaforo, motivo } = semaforoDePlanta({
    lecturas,
    especiesNegativas,
    materiaPrima: saldos
      ? {
          pendienteM3: num(saldos.materiaPrima.pendienteM3),
          consumoSinOrigenM3: num(saldos.materiaPrima.consumoSinOrigenM3),
          consumoSinOrigenCount: num(saldos.materiaPrima.consumoSinOrigenCount),
          consumoSinDeclararM3: num(saldos.materiaPrima.consumoSinDeclararM3),
          consumoSinDeclararCount: num(saldos.materiaPrima.consumoSinDeclararCount),
        }
      : null,
    incoherencias: conteo,
  });

  return {
    trozas,
    aserrada,
    movimiento,
    especiesNegativas,
    porEspecie,
    incoherencias,
    pendientes: pendientes.map((x) => ({ titulo: x.titulo, urgencia: x.urgencia, cantidad: x.cantidad })),
    cumplimiento: cumplL.ok ? cumplL.v : null,
    ultimaActividad: actividadL.ok && actividadL.v ? actividadL.v.toISOString() : null,
    lecturas,
    semaforo,
    motivoSemaforo: motivo,
    calculadoEn: ahora.toISOString(),
  };
}

/** El estado de una lectura como lo pide `EntradaCapacidad.estado` (el balance lo dice, no lo esconde). */
function estadoFuente(ok: boolean): "ok" | "error" {
  return ok ? "ok" : "error";
}

/* ── Caché por planta ───────────────────────────────────────────────────── */

const clavePlanta = (tenantId: string, periodo: PeriodoPlanta): string =>
  `${CACHE_PLANTAS}${tenantId}:${periodo.desde}:${periodo.hasta}`;

async function calculadaCacheada(
  p: PlantaIdentidad,
  periodo: PeriodoPlanta,
): Promise<{ calc: PlantaCalculada; desdeCache: boolean }> {
  const clave = clavePlanta(p.tenantId, periodo);
  let recienCalculada = false;
  const caja = await getOrSet<{ v: PlantaCalculada }>(clave, TTL_PLANTA_SEG, async () => {
    recienCalculada = true;
    return { v: await calcularPlanta(p, periodo) };
  });
  /* Una lectura caída no se queda 5 minutos: el próximo pedido la reintenta. */
  if (recienCalculada && Object.values(caja.v.lecturas).includes("error")) invalidate(clave);
  return { calc: caja.v, desdeCache: !recienCalculada };
}

/** De a `n` a la vez, en el orden de entrada. */
async function enTandas<T, R>(xs: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const fuera = new Array<R>(xs.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < xs.length) {
      const i = siguiente++;
      fuera[i] = await fn(xs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, trabajador));
  return fuera;
}

/** La identidad viva sobre lo cacheado: el nombre de la planta puede haber cambiado. */
function conNombre(items: readonly IncoherenciaPlanta[], nombre: string): IncoherenciaPlanta[] {
  return items.map((i) => (i.plantaNombre === nombre ? i : { ...i, plantaNombre: nombre }));
}

function resumenDe(
  identidad: PlantaIdentidad,
  calc: PlantaCalculada,
  desdeCache: boolean,
  ultimaInspeccion: PlantaResumen["ultimaInspeccion"],
  ahora: Date,
): PlantaResumen {
  return {
    identidad,
    trozas: calc.trozas,
    aserrada: calc.aserrada,
    movimiento: calc.movimiento,
    especiesNegativas: calc.especiesNegativas,
    incoherencias: contarIncoherencias(calc.incoherencias),
    cumplimiento: calc.cumplimiento,
    ultimaActividad: calc.ultimaActividad,
    diasSinActividad: diasDesde(calc.ultimaActividad, ahora),
    ultimaInspeccion,
    semaforo: calc.semaforo,
    motivoSemaforo: calc.motivoSemaforo,
    lecturas: calc.lecturas,
    calculadoEn: calc.calculadoEn,
    desdeCache,
  };
}

async function ultimasInspecciones(
  tenantIds: string[],
): Promise<Record<string, { id: string; fecha: string; estado: EstadoInspeccion }>> {
  try {
    return await ForestInspeccionPlantaDB.ultimaPorPlanta(tenantIds);
  } catch (err) {
    logger.warn("[plantas-forestales] última inspección falló", { error: String(err) });
    return {};
  }
}

/* ── Lo que piden las rutas ─────────────────────────────────────────────── */

const SEMAFORO_PESO: Record<Semaforo, number> = { rojo: 0, gris: 1, amarillo: 2, verde: 3 };

export async function armarLista(o: { periodo: PeriodoPlanta; incluirPrueba: boolean }): Promise<PlantasListaResponse> {
  const plantas = (await PlantasForestalesDB.listar()).filter((p) => o.incluirPrueba || !p.esPrueba);
  const [calcs, ultimas] = await Promise.all([
    enTandas(plantas, PLANTAS_A_LA_VEZ, (p) => calculadaCacheada(p, o.periodo)),
    ultimasInspecciones(plantas.map((p) => p.tenantId)),
  ]);
  const ahora = new Date();
  const resumenes = plantas
    .map((p, i) => resumenDe(p, calcs[i].calc, calcs[i].desdeCache, ultimas[p.tenantId] ?? null, ahora))
    /* Lo que hay que mirar primero: rojo, gris (no se pudo ver), amarillo, verde. */
    .sort(
      (a, b) =>
        Number(a.identidad.esPrueba) - Number(b.identidad.esPrueba) ||
        SEMAFORO_PESO[a.semaforo] - SEMAFORO_PESO[b.semaforo] ||
        a.identidad.nombre.localeCompare(b.identidad.nombre, "es"),
    );
  /* Totales = Σ de lo que dice cada planta (derivado), sin las que no se leyeron. */
  const totales = {
    plantas: resumenes.length,
    trozasM3: r4(resumenes.reduce((a, r) => a + (r.trozas?.enPatio.m3 ?? 0), 0)),
    aserradaM3: r4(resumenes.reduce((a, r) => a + (r.aserrada?.disponibleM3 ?? 0), 0)),
    aserradaPt: Math.round(resumenes.reduce((a, r) => a + (r.aserrada?.disponiblePt ?? 0), 0)),
    rojas: resumenes.filter((r) => r.semaforo === "rojo").length,
  };
  return { plantas: resumenes, periodo: o.periodo, totales };
}

async function tendenciaCacheada(tenantId: string): Promise<TendenciaMes[]> {
  try {
    const caja = await getOrSet<{ v: TendenciaMes[] }>(`${CACHE_PLANTAS}${tenantId}:tendencia`, TTL_PLANTA_SEG, async () => ({
      v: await ForestCtpDB.tendenciasMensuales(tenantId, 6),
    }));
    return caja.v;
  } catch (err) {
    logger.warn("[plantas-forestales] tendencia falló", { tenantId, error: String(err) });
    return [];
  }
}

/** La ficha de UNA planta: la ruta ya validó que `identidad` sea una planta de `listar()`. */
export async function armarFicha(identidad: PlantaIdentidad, periodo: PeriodoPlanta): Promise<PlantaFichaResponse> {
  const tid = identidad.tenantId;
  const [{ calc, desdeCache }, ultimas, tendencia, inspecciones] = await Promise.all([
    calculadaCacheada(identidad, periodo),
    ultimasInspecciones([tid]),
    tendenciaCacheada(tid),
    ForestInspeccionPlantaDB.listar(tid).catch((err) => {
      logger.warn("[plantas-forestales] inspecciones fallaron", { tenantId: tid, error: String(err) });
      return [];
    }),
  ]);
  return {
    resumen: resumenDe(identidad, calc, desdeCache, ultimas[tid] ?? null, new Date()),
    porEspecie: calc.porEspecie,
    incoherencias: conNombre(calc.incoherencias, identidad.nombre),
    tendencia,
    pendientes: calc.pendientes,
    inspecciones,
  };
}

export async function armarIncoherencias(o: {
  gravedad?: GravedadIncoherencia;
  origen?: OrigenIncoherencia;
  tenantId?: string;
  incluirPrueba: boolean;
  periodo?: PeriodoPlanta;
}): Promise<IncoherenciasResponse> {
  const periodo = o.periodo ?? periodoPorDefecto();
  const plantas = (await PlantasForestalesDB.listar()).filter((p) =>
    o.tenantId ? p.tenantId === o.tenantId : o.incluirPrueba || !p.esPrueba,
  );
  const calcs = await enTandas(plantas, PLANTAS_A_LA_VEZ, (p) => calculadaCacheada(p, periodo));
  const todas = plantas.flatMap((p, i) => conNombre(calcs[i].calc.incoherencias, p.nombre));
  /* El conteo por planta es de TODAS sus incoherencias: filtrar la lista no
     cambia cuánto tiene cada una. */
  const porPlanta = plantas.map((p, i) => {
    const c = contarIncoherencias(calcs[i].calc.incoherencias);
    return { tenantId: p.tenantId, error: c.error, warning: c.warning, m3EnJuego: c.m3EnJuego };
  });
  const items = ordenarIncoherencias(
    todas.filter((x) => (!o.gravedad || x.gravedad === o.gravedad) && (!o.origen || x.origen === o.origen)),
  );
  return { items, porPlanta };
}

/** «Recalcular»: olvida lo cacheado de una planta (o de todas) y la lista. */
export function olvidarPlantas(tenantId?: string): void {
  invalidateByPrefix(tenantId ? `${CACHE_PLANTAS}${tenantId}:` : CACHE_PLANTAS);
  PlantasForestalesDB.olvidarLista();
}
