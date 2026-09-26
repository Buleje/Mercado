import "server-only";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestCtpFichaDB } from "@/lib/db/forest-ctp-ficha.db";
import { ForestAnexosDB } from "@/lib/db/forest-anexos.db";
import { GuiaPlataDB } from "@/lib/db/guia-plata.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { MembreteDB } from "@/lib/db/membrete.db";
import { logger } from "@/lib/logger";
import { rendimientoPonderado } from "@/lib/forestal/ctp-kpis-seccion";
import { pendientesDelLibro, TROZAS_VARADAS_DIAS } from "@/lib/forestal/ctp-pendientes";
import { construirAviso, fraseLote, frasePlazo } from "@/lib/forestal/ctp-aviso-plazos";
import { documentosVencimientoDeFicha } from "@/lib/forestal/ctp-ficha-types";
import {
  diasDelRango,
  rangoDelReporte,
  sinCaracteresDeControl,
  type RangoReporte,
  type SeccionReporte,
} from "@/lib/forestal/reporte-diario";
import type { DatosReporteForestal, FilaNombreM3 } from "@/lib/forestal/reporte-diario-bloques";

/**
 * Junta lo que lee un reporte diario (ADR-439), SÓLO por las DB classes que ya
 * alimentan las pantallas del libro: el reporte tiene que decir lo mismo que el
 * panel, y dos caminos a la misma cifra terminan diciendo cosas distintas.
 *
 * Cada sección se lee por separado y, si falla, se anota en `fallidas`: un
 * endpoint caído no puede dejar al dueño sin el resto del reporte, ni el
 * reporte puede callar que le falta una parte.
 */

/** Cuántos renglones de detalle por sección: el reporte es un vistazo, el resto está en el panel. */
const TOP = 5;
const r2 = (n: number) => Math.round(n * 100) / 100;
const desdeDia = (d: string) => new Date(`${d}T00:00:00.000Z`);
const hastaDia = (d: string) => new Date(`${d}T23:59:59.999Z`);
const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Una lectura compartida entre secciones se hace una sola vez. */
function unaVez<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

export interface OpcionesDatos {
  secciones: readonly SeccionReporte[];
  rango: RangoReporte;
  /** Día de Lima en que sale («AAAA-MM-DD»). */
  fecha: string;
  /** El instante real, para los plazos (días hábiles). */
  ahora: Date;
  nombreReporte: string;
  panelUrl: string;
}

export async function juntarDatosReporte(tenantId: string, o: OpcionesDatos): Promise<DatosReporteForestal> {
  if (!tenantId) throw new Error("tenantId is required");
  const { desde, hasta } = rangoDelReporte(o.rango, o.fecha);
  const periodo = { fromDate: desdeDia(desde), toDate: hastaDia(hasta) };
  /* Lo que el libro mide «del mes» (la tira de pendientes del panel usa el período del libro). */
  const mes = { fromDate: desdeDia(`${o.fecha.slice(0, 8)}01`), toDate: hastaDia(o.fecha) };

  /**
   * UNA lectura de saldos para Patio y Pendientes (revisión 26-09: el patio
   * leía el acumulado y los pendientes el MES, y «saldo negativo» salía con
   * dos cuentas distintas en el mismo correo). Se usa el acumulado hasta el
   * día del reporte: un saldo es existencia, y mirar sólo los movimientos del
   * mes pone en rojo una especie que consumió madera recibida el mes anterior.
   */
  const saldosAlDia = unaVez(() => ForestCtpDB.saldos(tenantId, { toDate: hastaDia(o.fecha) }));
  const guiasSinIngresar = unaVez(() => ForestGtfDB.sinIngresarAlCtp(tenantId));
  const sinPagar = unaVez(() => GuiaPlataDB.sinPagarPorParte(tenantId));
  const varadas = unaVez(() => WoodEntriesDB.contarTrozasVaradas(tenantId, TROZAS_VARADAS_DIAS));

  const lectores: Record<SeccionReporte, () => Promise<Partial<DatosReporteForestal>>> = {
    async produccion() {
      /* El rendimiento sale de las MISMAS corridas y con la MISMA fórmula que
         la cabecera de Producción del libro (`rendimientoPonderado`): sólo las
         que declaran entrada. Sumar lo producido por corridas sin entrada
         inflaba la cifra (41,6 % contra 38,5 % del libro en `main`). */
      const [res, corridas] = await Promise.all([
        ForestCtpDB.resumenDeJornadas(tenantId, diasDelRango(desde, hasta)),
        ForestCtpDB.list(tenantId, { section: "produccion", ...periodo }),
      ]);
      const { pct: rend, entradaM3 } = rendimientoPonderado(corridas.entries);
      const consumidoM3 = r2(entradaM3);
      return {
        produccion: {
          corridas: res.totales.corridas,
          piezas: res.totales.piezas,
          m3: res.totales.m3,
          pt: res.totales.pt,
          porEspecie: res.porEspecie.map((e) => ({
            especie: e.especie,
            corridas: e.corridas,
            piezas: e.piezas,
            m3: e.m3,
            pt: e.pt,
            productos: e.productos.map((p) => ({ producto: p.producto, piezas: p.piezas, m3: p.m3, pt: p.pt })),
          })),
          consumidoM3,
          /* Más de 100 % no es un rendimiento: un dato mal cargado. Se calla. */
          rendimientoPct: rend != null && rend <= 100 ? Math.round(rend * 10) / 10 : null,
        },
      };
    },

    async tala() {
      const t = await ForestLothDB.resumenPeriodo(tenantId, periodo.fromDate, periodo.toDate);
      return { tala: { lineas: t.lineasCount, taladoM3: r2(t.taladoM3), trozadoM3: r2(t.trozadoM3) } };
    },

    async ingresos() {
      /* Por GUÍA (serie + número), como la bandeja: contar asientos decía
         «11 guías · 7 por recibir» donde la bandeja muestra 8 · 5. */
      const g = await WoodEntriesDB.resumenPorGuia(tenantId, periodo);
      const top = (f: FilaNombreM3[]): FilaNombreM3[] => f.slice(0, TOP).map((x) => ({ ...x, m3: r2(x.m3) }));
      return {
        ingresos: {
          guias: g.guias,
          m3: r2(g.m3),
          porRecibir: g.porRecibir,
          deServicio: g.deServicio,
          porEspecie: top(g.porEspecie),
          porProveedor: top(g.porProveedor),
        },
      };
    },

    async despachos() {
      const { entries } = await ForestCtpDB.list(tenantId, { section: "despacho", ...periodo });
      let m3 = 0, piezas = 0, otraUnidad = 0, valor = 0, conValor = 0, sinGuia = 0;
      const porEsp = new Map<string, FilaNombreM3>();
      for (const e of entries) {
        const enM3 = !e.unit || e.unit === "m3";
        const q = enM3 ? n(e.quantity) : 0;
        if (enM3) m3 += q;
        else otraUnidad += 1;
        piezas += e.pieces ?? 0;
        if (e.valorVenta != null) {
          valor += n(e.valorVenta);
          conValor += 1;
        }
        if (!e.gtfNumber?.trim()) sinGuia += 1;
        const nombre = e.speciesCommon?.trim() || "Sin especie";
        const f = porEsp.get(nombre.toLowerCase()) ?? { nombre, cantidad: 0, m3: 0 };
        f.cantidad += 1;
        f.m3 = r2(f.m3 + q);
        porEsp.set(nombre.toLowerCase(), f);
      }
      return {
        despachos: {
          registros: entries.length,
          m3: r2(m3),
          piezas,
          otraUnidad,
          valorVenta: conValor > 0 ? r2(valor) : null,
          sinGuia,
          porEspecie: [...porEsp.values()].sort((a, b) => b.m3 - a.m3).slice(0, TOP),
        },
      };
    },

    async patio() {
      const [s, v] = await Promise.all([saldosAlDia(), varadas()]);
      return {
        patio: {
          saldoM3: r2(s.materiaPrima.saldoM3),
          sinValidarM3: r2(s.materiaPrima.pendienteM3),
          especiesEnNegativo: s.materiaPrima.especiesEnNegativo,
          varadas: { piezas: v.piezas, m3: r2(v.m3), dias: TROZAS_VARADAS_DIAS },
          productos: s.productos
            .filter((p) => p.stock > 0.0005)
            .sort((a, b) => b.stock - a.stock)
            .slice(0, TOP)
            .map((p) => ({ producto: p.producto, stock: r2(p.stock) })),
        },
      };
    },

    async plata() {
      const [partes, movs, adel] = await Promise.all([sinPagar(), ForestCuentaDB.listar(tenantId), AdelantosDB.resumen(tenantId)]);
      /* Sólo soles: sumar dólares a soles sin tipo de cambio inventaría la cifra. */
      const delPeriodo = movs.filter((m) => {
        const d = m.fecha.slice(0, 10);
        return d >= desde && d <= hasta && (m.moneda ?? "PEN") === "PEN";
      });
      const suma = (c: string) => {
        const f = delPeriodo.filter((m) => m.concepto === c);
        return { cantidad: f.length, monto: r2(f.reduce((s, m) => s + m.monto, 0)) };
      };
      return {
        plata: {
          deudaProveedores: r2(partes.reduce((s, p) => s + p.pendiente, 0)),
          guiasSinPagar: partes.reduce((s, p) => s + p.guias, 0),
          proveedores: partes.slice(0, TOP).map((p) => ({
            nombre: p.parteNombre,
            guias: p.guias,
            pendiente: r2(p.pendiente),
            atrasado: p.nivel === "atrasado",
          })),
          pagos: { pagados: suma("pago_hecho"), cobrados: suma("pago") },
          adelantos: adel.porMoneda.map((a) => ({ moneda: a.moneda, saldo: a.saldoPendiente, abiertos: a.adelantosAbiertos })),
        },
      };
    },

    async pendientes() {
      const [stats, gtfs, desp, anexos, saldos, v, sinOrigen, sinFoto, partes] = await Promise.all([
        WoodEntriesDB.stats(tenantId, mes),
        guiasSinIngresar(),
        ForestCtpDB.list(tenantId, { section: "despacho", ...mes }),
        ForestAnexosDB.list(tenantId),
        saldosAlDia(),
        varadas(),
        ForestCtpDB.contarCorridasSinOrigen(tenantId, mes),
        WoodEntriesDB.guiasRecibidasSinFoto(tenantId, mes),
        sinPagar(),
      ]);
      const conAnexo = new Set(anexos.map((a) => a.ctpEntryId).filter(Boolean));
      const lista = pendientesDelLibro({
        ingresosPendientes: stats.byStatus.pendiente ?? 0,
        fueraDePlazo: stats.lateCount,
        guiasSinIngresar: gtfs.length,
        despachosSinGtf: desp.entries.filter((e) => !e.gtfNumber?.trim()).length,
        despachosSinAnexo: desp.entries.filter((e) => !conAnexo.has(e.id)).length,
        corridasSinOrigen: sinOrigen.corridas,
        corridasSinOrigenDetalle: sinOrigen.detalle,
        saldosNegativos: saldos.materiaPrima.especiesEnNegativo,
        trozasVaradas: v.piezas,
        ingresosSinCosto: stats.sinCostoCount,
        m3SinCosto: stats.sinCostoM3,
        guiasSinFoto: sinFoto.guias,
        guiasSinFotoDetalle: sinFoto.detalle,
        guiasSinPagar: partes,
      });
      return {
        pendientes: lista.map((p) => ({ titulo: p.titulo, detalle: p.detalle, cantidad: p.cantidad, urgencia: p.urgencia })),
      };
    },

    async plazos() {
      const [gtfs, lotes, ficha] = await Promise.all([
        guiasSinIngresar(),
        ForestLoteAserrioDB.list(tenantId, { status: "abierto", limite: 500 }),
        ForestCtpFichaDB.get(tenantId),
      ]);
      const aviso = construirAviso(
        {
          guiasSinIngresar: gtfs
            .filter((g) => g.gtfDate != null)
            .map((g) => ({
              gtfNumber: g.gtfNumber,
              gtfDate: g.gtfDate as Date,
              titularName: g.titularName,
              volumenTotalM3: g.volumenTotalM3 ? Number(g.volumenTotalM3) : null,
            })),
          despachosSinGtf: 0,
          saldosNegativos: 0,
          fueraDePlazo: 0,
          documentosVencidosLabels: documentosVencimientoDeFicha(ficha, o.ahora.getTime()).vencidosLabels,
          lotes: lotes
            .filter((l) => l.finProceso != null)
            .map((l) => ({
              code: l.code,
              finProceso: new Date(l.finProceso as unknown as string),
              especie: l.speciesCommon ?? null,
              volumenM3: l.volumenM3 == null ? null : Number(l.volumenM3),
              piezas: Array.isArray(l.trozas) ? l.trozas.length : 0,
            })),
        },
        o.ahora,
      );
      return {
        plazos: {
          guias: aviso.guias
            .filter((g) => g.estado !== "en_plazo")
            .slice(0, TOP * 2)
            .map((g) => ({ gtf: g.gtfNumber, titular: g.titularName ?? null, frase: frasePlazo(g), urgente: g.estado === "vencido" || g.estado === "vence_hoy" })),
          lotes: aviso.lotes.slice(0, TOP).map((l) => ({ codigo: l.code, frase: fraseLote(l) })),
          documentosVencidos: documentosVencimientoDeFicha(ficha, o.ahora.getTime()).vencidosLabels,
        },
      };
    },
  };

  const membrete = await MembreteDB.del(tenantId).catch((err) => {
    logger.warn("[reporte-diario] membrete no leído", { tenantId, err: String(err).slice(0, 200) });
    return null;
  });

  const datos: DatosReporteForestal = {
    negocio: sinCaracteresDeControl(membrete?.nombre ?? "") || "Tu negocio",
    nombreReporte: sinCaracteresDeControl(o.nombreReporte) || "Reporte del día",
    fecha: o.fecha,
    rango: o.rango,
    desde,
    hasta,
    panelUrl: o.panelUrl,
    fallidas: [],
  };
  const partes = await Promise.all(
    o.secciones.map(async (s) => {
      try {
        return await lectores[s]();
      } catch (err) {
        logger.error("[reporte-diario] sección no leída", { tenantId, seccion: s, err: String(err).slice(0, 300) });
        datos.fallidas?.push(s);
        return {};
      }
    }),
  );
  return Object.assign(datos, ...partes);
}
