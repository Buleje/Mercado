import "server-only";
import { prisma } from "@/lib/prisma";
import { armarHistoriaTroza } from "@/lib/forestal/troza-historia";
import type { EventoTroza } from "@/lib/forestal/planta-zona-types";

/**
 * ForestTrozaHistoriaDB — la vida de una troza para la ficha del Mapa de
 * Planta (ADR-465): recepción, mixto, lote, retrozado, corrida y despacho, con
 * las fechas que el Libro ya guarda. Sólo LEE; no hay tabla de movimientos
 * (fase 2 del ADR, si Brandon pide traslados a mano).
 *
 * Tenant-safe: `tenantId` va en el WHERE del `findFirst` — una troza de otro
 * negocio no existe para esta consulta (la ruta responde 404, no 403: no se
 * confirma que exista).
 */

/** Hasta cuántos apartados/despachos del producto de su corrida se traen. */
const MAX_DERIVADOS = 10;

const vivo = (e: { status: string; deletedAt: Date | null } | null | undefined): boolean =>
  !!e && e.status === "registrado" && !e.deletedAt;

export const ForestTrozaHistoriaDB = {
  /** Eventos ordenados por fecha, o `null` si la troza no es de este negocio. */
  async de(tenantId: string, trozaId: string): Promise<{ trozaId: string; codigo: string | null; eventos: EventoTroza[] } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const id = String(trozaId ?? "").trim();
    if (!id) return null;
    const t = await prisma.woodEntryTroza.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        codigoPlanta: true,
        codificacion: true,
        fechaRecepcion: true,
        noRecepcionada: true,
        reservadaMixtoEn: true,
        fechaConsumo: true,
        fechaDespacho: true,
        fechaRetrozo: true,
        descarte: true,
        entry: { select: { gtfNumber: true, entryDate: true, fechaRecepcion: true, status: true } },
        trozaOrigen: { select: { codigoPlanta: true, codificacion: true } },
        retrozos: {
          select: { codigoPlanta: true, codificacion: true, fechaRetrozo: true, descarte: true },
          orderBy: { orden: "asc" },
        },
        loteAserrio: {
          select: {
            code: true,
            fechaApertura: true,
            status: true,
            deletedAt: true,
            loteMixto: { select: { code: true, repartidoEn: true } },
          },
        },
        loteMixto: { select: { code: true, abiertoEn: true, repartidoEn: true, status: true, deletedAt: true } },
        consumidaEn: {
          select: {
            lineNo: true,
            entryDate: true,
            productType: true,
            status: true,
            deletedAt: true,
            apartados: {
              select: { creadoAt: true, para: true, liberadoAt: true, paquete: { select: { codigo: true } } },
              orderBy: { creadoAt: "asc" },
              take: MAX_DERIVADOS,
            },
            salidas: {
              where: { tenantId },
              select: {
                despacho: { select: { lineNo: true, entryDate: true, gtfNumber: true, status: true, deletedAt: true } },
              },
              orderBy: { createdAt: "asc" },
              take: MAX_DERIVADOS,
            },
          },
        },
        despachadaEn: {
          select: { lineNo: true, entryDate: true, gtfNumber: true, destino: true, status: true, deletedAt: true },
        },
      },
    });
    if (!t) return null;

    const cod = (x: { codigoPlanta: string | null; codificacion: string | null }) =>
      x.codigoPlanta?.trim() || x.codificacion?.trim() || null;
    const c = t.consumidaEn;
    const eventos = armarHistoriaTroza({
      id: t.id,
      codigo: cod(t),
      fechaRecepcion: t.fechaRecepcion,
      noRecepcionada: t.noRecepcionada,
      reservadaMixtoEn: t.reservadaMixtoEn,
      fechaConsumo: t.fechaConsumo,
      fechaDespacho: t.fechaDespacho,
      fechaRetrozo: t.fechaRetrozo,
      descarte: t.descarte,
      guia: {
        numero: t.entry.gtfNumber,
        entryDate: t.entry.entryDate,
        fechaRecepcion: t.entry.fechaRecepcion,
        status: t.entry.status,
      },
      madre: t.trozaOrigen ? { codigo: cod(t.trozaOrigen) } : null,
      pedazos: t.retrozos.map((p) => ({ codigo: cod(p), fechaRetrozo: p.fechaRetrozo, descarte: p.descarte })),
      loteAserrio: t.loteAserrio
        ? {
            code: t.loteAserrio.code,
            fechaApertura: t.loteAserrio.fechaApertura,
            status: t.loteAserrio.status,
            deletedAt: t.loteAserrio.deletedAt,
            mixto: t.loteAserrio.loteMixto,
          }
        : null,
      loteMixto: t.loteMixto,
      corrida: c
        ? {
            lineNo: c.lineNo,
            entryDate: c.entryDate,
            productType: c.productType,
            vigente: vivo(c),
            apartados: c.apartados.map((a) => ({
              creadoAt: a.creadoAt,
              para: a.para,
              paquete: a.paquete?.codigo ?? null,
              liberadoAt: a.liberadoAt,
            })),
            despachos: c.salidas.map((s) => ({
              lineNo: s.despacho.lineNo,
              entryDate: s.despacho.entryDate,
              gtfNumber: s.despacho.gtfNumber,
              vigente: vivo(s.despacho),
            })),
          }
        : null,
      despacho: t.despachadaEn
        ? {
            lineNo: t.despachadaEn.lineNo,
            entryDate: t.despachadaEn.entryDate,
            gtfNumber: t.despachadaEn.gtfNumber,
            destino: t.despachadaEn.destino,
            vigente: vivo(t.despachadaEn),
          }
        : null,
    });
    return { trozaId: t.id, codigo: cod(t), eventos };
  },
};
